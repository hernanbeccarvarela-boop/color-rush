// ---------------------------------------------------------------------------
// Phaser race scene: renders the track and karts, runs local prediction at a
// fixed 60 Hz step, interpolates remote karts, drives the camera and FX.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import {
  DT, IN_BRAKE, IN_LEFT, IN_RIGHT, IN_THROTTLE, INTERP_DELAY_MS, colorById,
} from '../../../shared/constants';
import { driftLevel, forwardSpeed } from '../../../shared/physics';
import { FLAG_DISCONNECTED, FLAG_DRIFT, FLAG_OFFROAD, type SnapRow } from '../../../shared/protocol';
import { getTrack, gridSlot } from '../../../shared/track';
import { sfx } from '../audio';
import { game, serverNow } from '../net/net';
import { store } from '../store';
import { Predictor } from './predictor';
import { KART_LAYERS, LAYER_STEP, makeTextures } from './textures';
import { buildBoostPads, buildGantry, buildTrackLayer } from './trackArt';

/** Shared with the React HUD (polled ~10x per second). */
export const hud = {
  speed: 0,
  rank: 0,
  total: 0,
  lap: 0,
  lapPct: 0,
  boost: false,
  offroad: false,
  spectating: false,
  followName: '',
  lapFlashAt: 0,
  driftLevel: 0,
  turboText: '',
  turboAt: 0,
  lastCorrection: 0,
  positions: new Map<number, { x: number; y: number; color: string; me: boolean }>(),
};

interface KartView {
  shadow: Phaser.GameObjects.Image;
  layers: Phaser.GameObjects.Image[];
  flame: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  ring?: Phaser.GameObjects.Image;
  color: string;
  name: string;
  skidToggle: boolean;
  seenAt: number;
}

interface Pose { x: number; y: number; a: number; boost: number; flags: number; speed: number; steer: number; drift: number }

// debugging/testing hook (read-only inspection from devtools or automated tests)
(window as unknown as { __colorRush: unknown }).__colorRush = { hud, game };

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar']);

export class RaceScene extends Phaser.Scene {
  private track = getTrack();
  private karts = new Map<number, KartView>();
  private predictor = new Predictor(this.track);
  private resetSeen = -1;
  private acc = 0;
  private keys = new Set<string>();
  private skids: Phaser.GameObjects.Image[] = [];
  private skidIdx = 0;
  private puffs: { img: Phaser.GameObjects.Image; life: number }[] = [];
  private puffIdx = 0;
  private sparks: { img: Phaser.GameObjects.Image; life: number; vx: number; vy: number }[] = [];
  private sparkIdx = 0;
  private camX = 0; camY = 0;
  private camReady = false;
  private lastCount = 99;
  private lastLap = 0;
  private lastBoost = 0;
  private hudTimer = 0;
  private onKeyDown = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
    if (GAME_KEYS.has(e.key)) e.preventDefault();
    this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    sfx.unlock();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
  private onBlur = () => this.keys.clear();

  constructor() { super('race'); }

  create() {
    makeTextures(this);
    buildTrackLayer(this, this.track);
    buildBoostPads(this, this.track);
    buildGantry(this, this.track);
    for (let i = 0; i < 500; i++) this.skids.push(this.add.image(-100, -100, 'skid').setDepth(2).setAlpha(0).setVisible(false));
    for (let i = 0; i < 90; i++) this.puffs.push({ img: this.add.image(-100, -100, 'puff').setDepth(3).setVisible(false), life: 0 });
    for (let i = 0; i < 160; i++) this.sparks.push({ img: this.add.image(-100, -100, 'spark').setDepth(25).setVisible(false).setBlendMode(Phaser.BlendModes.ADD), life: 0, vx: 0, vy: 0 });
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.track.width, this.track.height);
    cam.setRoundPixels(false);
    const g0 = gridSlot(this.track, 0);
    this.camX = g0.x; this.camY = g0.y;
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  private cleanup() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    sfx.engineStop();
  }

  private readMask(): number {
    if (store.get().paused) return 0;
    const k = this.keys;
    let m = 0;
    if (k.has('ArrowLeft') || k.has('a')) m |= IN_LEFT;
    if (k.has('ArrowRight') || k.has('d')) m |= IN_RIGHT;
    if (k.has(' ') || k.has('Spacebar') || k.has('ArrowUp') || k.has('w')) m |= IN_THROTTLE;
    if (k.has('ArrowDown') || k.has('s')) m |= IN_BRAKE;
    return m;
  }

  private kartView(num: number): KartView | null {
    const room = store.get().room;
    const info = room?.players.find((p) => p.num === num);
    let v = this.karts.get(num);
    if (v && info && (v.color !== info.color || v.name !== info.name)) {
      v.layers.forEach((img, i) => img.setTexture(`kart-${info.color}-${i}`)); v.label.setText(info.name); v.color = info.color; v.name = info.name;
    }
    if (v || !info) return v ?? null;
    const isMe = info.id === store.get().session?.playerId;
    const col = colorById(info.color);
    v = {
      shadow: this.add.image(0, 0, 'shadow').setDepth(3).setScale(1.1),
      flame: this.add.image(0, 0, 'flame').setDepth(3.5).setOrigin(1, 0.5).setVisible(false),
      layers: Array.from({ length: KART_LAYERS }, (_, i) => this.add.image(0, 0, `kart-${info.color}-${i}`).setScale(1.1)),
      label: this.add.text(0, 0, info.name, {
        fontFamily: '"Baloo 2", "Nunito", system-ui, sans-serif', fontSize: '15px', fontStyle: '800',
        color: '#ffffff', stroke: col.id === 'white' ? '#22242e' : '#14151c', strokeThickness: 5,
      }).setOrigin(0.5, 1).setDepth(40).setResolution(2),
      ring: isMe ? this.add.image(0, 0, 'ring').setDepth(3.2).setAlpha(0.55) : undefined,
      color: info.color, name: info.name, skidToggle: false, seenAt: 0,
    };
    if (isMe) v.label.setText(`${info.name} ★`);
    this.karts.set(num, v);
    return v;
  }

  /** Interpolated pose for a remote kart at the given server time. */
  private remotePose(num: number, renderT: number): Pose | null {
    const snaps = game.snaps;
    let prev: SnapRow | null = null, prevT = 0, next: SnapRow | null = null, nextT = 0;
    for (let i = snaps.length - 1; i >= 0; i--) {
      const row = snaps[i].k.find((r) => r[0] === num);
      if (!row) continue;
      if (snaps[i].t <= renderT) { prev = row; prevT = snaps[i].t; break; }
      next = row; nextT = snaps[i].t;
    }
    if (prev && next) {
      const f = (renderT - prevT) / (nextT - prevT || 1);
      let da = next[3] - prev[3];
      if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
      return {
        x: prev[1] + (next[1] - prev[1]) * f, y: prev[2] + (next[2] - prev[2]) * f, a: prev[3] + da * f,
        boost: next[6], flags: next[12], speed: Math.hypot(next[4], next[5]), steer: next[13], drift: next[14],
      };
    }
    const r = prev ?? next;
    if (!r) return null;
    const ext = prev ? Math.min(0.12, Math.max(0, (renderT - prevT) / 1000)) : 0;
    return { x: r[1] + r[4] * ext, y: r[2] + r[5] * ext, a: r[3], boost: r[6], flags: r[12], speed: Math.hypot(r[4], r[5]), steer: r[13], drift: r[14] };
  }

  private lastFrameAt = 0;

  update(_time: number, _phaserDelta: number) {
    // Use the real wall clock (Phaser's delta is smoothed) so we simulate and send
    // exactly 60 inputs per real second — matching the server's tick budget.
    const nowPerf = performance.now();
    const deltaMs = this.lastFrameAt ? nowPerf - this.lastFrameAt : 16.67;
    this.lastFrameAt = nowPerf;
    const st = store.get();
    const room = st.room;
    if (!room) return;
    const myId = st.session?.playerId;
    const meP = room.players.find((p) => p.id === myId);
    const myNum = meP?.num ?? -1;
    const latest = game.latest;
    const myRow = latest?.k.find((r) => r[0] === myNum) ?? null;
    const racing = room.phase === 'countdown' || room.phase === 'racing';
    const participating = !!meP?.inRace && racing;
    const now = serverNow();

    // ---- prediction / reconciliation
    if (game.resetCounter !== this.resetSeen) {
      this.resetSeen = game.resetCounter;
      this.predictor = new Predictor(this.track);
    }
    if (participating && myRow) {
      if (!this.predictor.initialised) this.predictor.initFrom(myRow);
      else if (game.pendingReconcile) {
        const r = game.pendingReconcile.k.find((x) => x[0] === myNum);
        if (r) this.predictor.reconcile(r);
      }
    }
    game.pendingReconcile = null;

    this.acc += Math.min(deltaMs, 250);
    let steps = 0;
    while (this.acc >= DT * 1000 && steps < 8) {
      this.acc -= DT * 1000;
      steps++;
      if (participating && this.predictor.initialised) {
        const frozen = now < room.startAt;
        this.predictor.tick(this.readMask(), frozen);
        const k = this.predictor.state;
        if (k.wallHit > 140) { sfx.bump(); this.cameras.main.shake(120, 0.004); }
        if (k.turbo) {
          hud.turboText = k.turbo === 3 ? 'ROCKET START!' : k.turbo === 2 ? 'SUPER TURBO!' : 'MINI-TURBO!';
          hud.turboAt = performance.now();
          sfx.turbo(k.turbo);
          this.cameras.main.zoom *= 0.97;
        }
      }
    }
    if (this.acc > DT * 1000 * 8) this.acc = 0;

    // ---- countdown audio
    if (racing) {
      const c = Math.ceil((room.startAt - now) / 1000);
      if (c !== this.lastCount) {
        if (c >= 1 && c <= 3) sfx.beep();
        else if (c <= 0 && this.lastCount >= 1 && this.lastCount <= 3) sfx.go();
        this.lastCount = c;
      }
    }

    // ---- render karts
    const renderT = now - INTERP_DELAY_MS;
    const frameNow = this.time.now;
    hud.positions.clear();
    const seen = new Set<number>();
    let followPose: Pose | null = null;
    let leaderPose: Pose | null = null;
    let leaderName = '';
    const rows = latest?.k ?? [];
    for (const row of rows) {
      const num = row[0];
      const v = this.kartView(num);
      if (!v) continue;
      seen.add(num);
      let pose: Pose | null;
      const isMe = num === myNum && participating && this.predictor.initialised;
      if (isMe) {
        const k = this.predictor.state;
        pose = {
          x: k.x + this.predictor.offX, y: k.y + this.predictor.offY, a: k.angle + this.predictor.offA, boost: k.boost,
          flags: (k.offroad ? FLAG_OFFROAD : 0) | (k.drifting ? FLAG_DRIFT : 0), speed: Math.abs(forwardSpeed(k)),
          steer: k.steer, drift: k.drift,
        };
        followPose = pose;
      } else {
        pose = this.remotePose(num, renderT);
      }
      if (!pose) continue;
      if (row[9] === 1) { leaderPose = pose; leaderName = v.name; }
      this.placeKart(v, pose, frameNow, (row[12] & FLAG_DISCONNECTED) !== 0);
      hud.positions.set(num, { x: pose.x, y: pose.y, color: colorById(v.color).css, me: num === myNum });
    }
    for (const [num, v] of this.karts) {
      if (!seen.has(num)) {
        v.layers.forEach((l) => l.destroy()); v.shadow.destroy(); v.flame.destroy(); v.label.destroy(); v.ring?.destroy();
        this.karts.delete(num);
      }
    }

    // ---- FX decay
    for (const s of this.skids) if (s.visible) { s.alpha -= deltaMs / 4000; if (s.alpha <= 0) s.setVisible(false); }
    for (const p of this.puffs) if (p.life > 0) {
      p.life -= deltaMs / 500;
      if (p.life <= 0) p.img.setVisible(false);
      else p.img.setAlpha(p.life * 0.6).setScale(0.6 + (1 - p.life) * 1.4);
    }
    const dts = deltaMs / 1000;
    for (const p of this.sparks) if (p.life > 0) {
      p.life -= dts * 4;
      if (p.life <= 0) p.img.setVisible(false);
      else p.img.setPosition(p.img.x + p.vx * dts, p.img.y + p.vy * dts).setAlpha(p.life).setScale(0.4 + p.life * 0.8);
    }

    // ---- camera
    const target = followPose ?? leaderPose;
    const cam = this.cameras.main;
    if (target) {
      const look = 0.22;
      const tx = target.x + Math.cos(target.a) * target.speed * look;
      const ty = target.y + Math.sin(target.a) * target.speed * look;
      if (!this.camReady) { this.camX = tx; this.camY = ty; this.camReady = true; }
      const f = Math.min(1, (deltaMs / 1000) * 7);
      this.camX += (tx - this.camX) * f; this.camY += (ty - this.camY) * f;
      const base = Phaser.Math.Clamp(Math.min(cam.width, cam.height) / 660, 0.65, 1.3);
      const zTarget = base * (1.05 - 0.18 * Math.min(1, target.speed / 600));
      cam.setZoom(cam.zoom + (zTarget - cam.zoom) * Math.min(1, (deltaMs / 1000) * 2.5));
    }
    cam.centerOn(this.camX, this.camY);

    // ---- HUD + sounds for the local player
    const k = this.predictor.state;
    if (participating && this.predictor.initialised) {
      const spd = Math.abs(forwardSpeed(k));
      if (k.boost > 0 && this.lastBoost === 0) sfx.boost();
      this.lastBoost = k.boost;
      if (!st.paused) sfx.engine(spd); else sfx.engine(0);
    } else {
      sfx.engineStop();
    }
    this.hudTimer += deltaMs;
    if (this.hudTimer > 80) {
      this.hudTimer = 0;
      hud.total = rows.length;
      hud.spectating = !participating;
      hud.followName = leaderName;
      hud.lastCorrection = this.predictor.lastCorrection;
      if (participating && myRow) {
        hud.speed = Math.abs(forwardSpeed(k));
        hud.boost = k.boost > 0;
        hud.offroad = k.offroad;
        hud.driftLevel = k.drift > 0 ? driftLevel(k.drift) : -1;
        hud.rank = myRow[9];
        hud.lap = myRow[10];
        hud.lapPct = myRow[11] / 1000;
        if (myRow[10] > this.lastLap && myRow[10] >= 2) { hud.lapFlashAt = performance.now(); sfx.lap(); }
        this.lastLap = myRow[10];
      }
    }
  }

  private placeKart(v: KartView, p: Pose, frameNow: number, disconnected: boolean) {
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    // body roll: upper slices lean to the outside of the turn, plus a tiny engine wobble
    const lean = -p.steer * Math.min(1, p.speed / 300) * 0.32;
    const wob = Math.sin(frameNow / 45 + p.x * 0.01) * Math.min(1, p.speed / 450) * 0.25;
    const depth = 5 + p.y * 0.0001;
    const alpha = disconnected ? 0.45 : 1;
    for (let i = 0; i < v.layers.length; i++) {
      const lx = -sa * lean * i, ly = ca * lean * i;
      v.layers[i].setPosition(p.x + lx, p.y + ly - i * LAYER_STEP - (i > 2 ? wob : 0)).setRotation(p.a).setDepth(depth + i * 1e-6).setAlpha(alpha);
    }
    v.shadow.setPosition(p.x + 5, p.y + 5).setRotation(p.a);
    v.label.setPosition(p.x, p.y - 30 - KART_LAYERS * LAYER_STEP).setAlpha(disconnected ? 0.5 : 1);
    if (v.ring) v.ring.setPosition(p.x, p.y).setRotation(frameNow / 600);
    const boosting = p.boost > 0;
    v.flame.setVisible(boosting);
    if (boosting) {
      v.flame.setPosition(p.x - ca * 26, p.y - sa * 26 - 6).setRotation(p.a).setDepth(depth - 1e-5)
        .setScale(0.9 + Math.random() * 0.6, 0.8 + Math.random() * 0.4);
    }
    const drifting = (p.flags & FLAG_DRIFT) !== 0 && p.speed > 200;
    if (drifting) {
      // skid marks
      v.skidToggle = !v.skidToggle;
      if (v.skidToggle) {
        for (const side of [-1, 1]) {
          const s = this.skids[this.skidIdx++ % this.skids.length];
          s.setPosition(p.x - ca * 14 - sa * 13 * side, p.y - sa * 14 + ca * 13 * side).setRotation(p.a).setAlpha(0.5).setVisible(true);
        }
      }
      // mini-turbo sparks: white smoke -> blue -> orange as the drift charges
      const lvl = driftLevel(p.drift);
      const tint = lvl === 2 ? 0xff9a1f : lvl === 1 ? 0x45c8ff : 0xffffff;
      const n = lvl ? 2 : 1;
      for (let k = 0; k < n; k++) {
        for (const side of [-1, 1]) {
          const sp = this.sparks[this.sparkIdx++ % this.sparks.length];
          const bx = p.x - ca * 20 - sa * 13 * side, by = p.y - sa * 20 + ca * 13 * side;
          sp.life = lvl ? 1 : 0.6;
          sp.vx = -ca * 120 + (Math.random() - 0.5) * 160; sp.vy = -sa * 120 + (Math.random() - 0.5) * 160 - 40;
          sp.img.setPosition(bx, by).setTint(tint).setVisible(true).setAlpha(sp.life);
        }
      }
    }
    // sand dust while off-road
    if ((p.flags & FLAG_OFFROAD) && p.speed > 70 && Math.random() < 0.5) {
      const pf = this.puffs[this.puffIdx++ % this.puffs.length];
      pf.life = 1;
      pf.img.setPosition(p.x - ca * 20 + (Math.random() - 0.5) * 14, p.y - sa * 20 + (Math.random() - 0.5) * 14)
        .setTint(0xe7c77a).setVisible(true);
    }
  }
}
