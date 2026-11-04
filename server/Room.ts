// ---------------------------------------------------------------------------
// Room: lobby + authoritative race simulation for up to 10 players.
// ---------------------------------------------------------------------------
import { randomBytes, randomUUID } from 'node:crypto';
import {
  COLOR_IDS, COUNTDOWN_MS, LOBBY_RECONNECT_GRACE_MS, MAX_INPUT_QUEUE, MAX_PLAYERS, RESULTS_AUTO_LOBBY_MS,
  SNAPSHOT_EVERY_TICKS,
} from '../shared/constants';
import { collideKarts, newKart, stepKart, type KartState } from '../shared/physics';
import {
  compareProgress, lapFraction, lapsCompleted, newProgress, updateProgress, type Progress,
} from '../shared/progress';
import {
  FLAG_DISCONNECTED, FLAG_DRIFT, FLAG_OFFROAD, type Phase, type PublicPlayer, type RaceResult, type RoomState,
  type Snapshot, type SnapRow,
} from '../shared/protocol';
import { getTrack, gridSlot, project } from '../shared/track';

export interface ServerPlayer {
  id: string;
  token: string;
  num: number;
  name: string;
  color: string;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
  inRace: boolean;
  disconnectedAt: number;
  kart: KartState;
  progress: Progress;
  queue: { seq: number; mask: number }[];
  lastMask: number;
  ackSeq: number;        // last input sequence applied (sent back for reconciliation)
  lastQueuedSeq: number;
  starved: number;
  credit: number;        // simulation-step budget: +1 per tick, -1 per applied input (anti speed-hack)
}

export interface RoomHooks {
  emitState(room: Room): void;
  emitSnapshot(room: Room, snap: Snapshot): void;
  emitResults(room: Room, results: RaceResult[]): void;
  log(msg: string): void;
}

const MAX_CREDIT = 12;      // tolerate ~200 ms of client frame jank without diverging
const STARVE_COAST_TICKS = 30; // after 0.5 s without inputs, release the controls
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export class Room {
  readonly track = getTrack();
  players = new Map<string, ServerPlayer>();
  hostId = '';
  phase: Phase = 'lobby';
  raceId = 0;
  startAt = 0;
  endAt = 0;
  results: RaceResult[] | null = null;
  resultsAt = 0;
  emptySince = 0;
  private tickCount = 0;
  private nextNum = 1;
  private lastOrder: string[] = [];

  constructor(
    readonly code: string,
    private hooks: RoomHooks,
    readonly raceDurationMs: number,
    readonly minPlayers: number,
  ) {}

  // ---------------------------------------------------------------- players
  get size() { return this.players.size; }
  connectedPlayers() { return [...this.players.values()].filter((p) => p.connected); }
  takenColors() { return [...this.players.values()].map((p) => p.color); }
  isColorFree(color: string, exceptId?: string) {
    return ![...this.players.values()].some((p) => p.color === color && p.id !== exceptId);
  }
  firstFreeColor(): string | null { return COLOR_IDS.find((c) => this.isColorFree(c)) ?? null; }

  addPlayer(name: string, color: string, socketId: string): ServerPlayer {
    const track = this.track;
    const p: ServerPlayer = {
      id: randomUUID(), token: randomBytes(18).toString('base64url'), num: this.nextNum++,
      name, color, ready: false, connected: true, socketId, inRace: false, disconnectedAt: 0,
      kart: newKart(0, 0, 0), progress: newProgress(track), queue: [], lastMask: 0, ackSeq: 0, lastQueuedSeq: 0, credit: 0, starved: 0,
    };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    this.emptySince = 0;
    this.hooks.log(`room ${this.code}: + ${name} (${this.players.size}/${MAX_PLAYERS}) phase=${this.phase}`);
    this.hooks.emitState(this);
    return p;
  }

  removePlayer(id: string, reason: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.hooks.log(`room ${this.code}: - ${p.name} (${reason})`);
    this.ensureHost();
    if ((this.phase === 'countdown' || this.phase === 'racing') && this.racers().length === 0) this.finishRace(Date.now());
    if (this.connectedPlayers().length === 0 && !this.emptySince) this.emptySince = Date.now();
    this.hooks.emitState(this);
  }

  markDisconnected(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    p.socketId = null;
    p.disconnectedAt = Date.now();
    p.queue.length = 0;
    p.lastMask = 0;
    this.ensureHost();
    if (this.connectedPlayers().length === 0) this.emptySince = Date.now();
    this.hooks.emitState(this);
  }

  reconnect(p: ServerPlayer, socketId: string) {
    p.connected = true;
    p.socketId = socketId;
    p.disconnectedAt = 0;
    p.ackSeq = 0; p.lastQueuedSeq = 0; p.queue.length = 0; p.credit = 0; // client restarts its input sequence
    this.emptySince = 0;
    this.ensureHost();
    this.hooks.emitState(this);
  }

  setReady(id: string, ready: boolean) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'lobby') return;
    p.ready = !!ready;
    this.hooks.emitState(this);
  }

  setColor(id: string, color: string): boolean {
    const p = this.players.get(id);
    if (!p || this.phase === 'countdown' || this.phase === 'racing') return false;
    if (!this.isColorFree(color, id)) return false;
    p.color = color;
    this.hooks.emitState(this);
    return true;
  }

  private ensureHost() {
    const host = this.players.get(this.hostId);
    if (host && host.connected) return;
    const next = [...this.players.values()].filter((p) => p.connected).sort((a, b) => a.num - b.num)[0];
    if (next) this.hostId = next.id;
    else if (!host) this.hostId = [...this.players.values()][0]?.id ?? '';
  }

  // ------------------------------------------------------------- lifecycle
  canStart(): string | null {
    if (this.phase !== 'lobby') return 'Race already in progress';
    const conn = this.connectedPlayers();
    if (conn.length < this.minPlayers) return `Need at least ${this.minPlayers} connected players`;
    const notReady = conn.filter((p) => !p.ready && p.id !== this.hostId);
    if (notReady.length) return `Waiting for ${notReady.map((p) => p.name).join(', ')} to be ready`;
    return null;
  }

  start(byId: string): string | null {
    if (byId !== this.hostId) return 'Only the host can start the race';
    const err = this.canStart();
    if (err) return err;
    this.beginCountdown();
    return null;
  }

  rematch(byId: string): string | null {
    if (byId !== this.hostId) return 'Only the host can start a rematch';
    if (this.phase !== 'results') return 'Rematch is only available after a race';
    if (this.connectedPlayers().length < this.minPlayers) return `Need at least ${this.minPlayers} connected players`;
    this.beginCountdown();
    return null;
  }

  toLobby(byId: string | null): string | null {
    if (byId !== null && byId !== this.hostId) return 'Only the host can return the room to the lobby';
    if (this.phase !== 'results') return 'Not in results';
    this.phase = 'lobby';
    this.results = null;
    for (const p of this.players.values()) { p.ready = false; p.inRace = false; }
    this.pruneDisconnected(Date.now(), true);
    this.hooks.emitState(this);
    return null;
  }

  private beginCountdown() {
    const now = Date.now();
    this.raceId++;
    this.phase = 'countdown';
    this.startAt = now + COUNTDOWN_MS;
    this.endAt = this.startAt + this.raceDurationMs;
    this.results = null;
    this.pruneDisconnected(now, true);
    // grid order: reverse of the previous race result (winner starts at the back), newcomers in front
    const racers = this.connectedPlayers().slice(0, MAX_PLAYERS);
    const prev = this.lastOrder;
    racers.sort((a, b) => {
      const ia = prev.indexOf(a.id), ib = prev.indexOf(b.id);
      if (ia === -1 && ib === -1) return a.num - b.num;
      if (ia === -1) return -1;
      if (ib === -1) return 1;
      return ib - ia;
    });
    for (const p of this.players.values()) { p.inRace = false; p.ready = false; }
    racers.forEach((p, slot) => {
      const g = gridSlot(this.track, slot);
      p.inRace = true;
      p.kart = newKart(g.x, g.y, g.angle);
      p.kart.hint = project(this.track, g.x, g.y, -1).i;
      p.progress = newProgress(this.track);
      updateProgress(p.progress, this.track, project(this.track, g.x, g.y, p.kart.hint).s, now);
      p.queue.length = 0;
      p.lastMask = 0;
      p.ackSeq = 0; p.lastQueuedSeq = 0; p.credit = 0; // client restarts its input sequence each race
    });
    this.hooks.log(`room ${this.code}: race #${this.raceId} countdown with ${racers.length} racers`);
    this.hooks.emitState(this);
  }

  private finishRace(now: number) {
    if (this.phase !== 'racing' && this.phase !== 'countdown') return; // never finish twice
    const standings = this.standings();
    this.results = standings.map((p, i) => ({
      rank: i + 1, playerId: p.id, name: p.name, color: p.color,
      laps: lapsCompleted(p.progress), lapPct: r2(lapFraction(p.progress, this.track)),
      bestLapMs: p.progress.bestLapMs, connected: p.connected,
    }));
    this.lastOrder = standings.map((p) => p.id);
    this.phase = 'results';
    this.resultsAt = now;
    this.hooks.log(`room ${this.code}: race #${this.raceId} finished — winner ${this.results[0]?.name ?? 'n/a'}`);
    this.hooks.emitResults(this, this.results);
    this.hooks.emitState(this);
  }

  racers() { return [...this.players.values()].filter((p) => p.inRace); }
  standings() { return this.racers().sort(compareProgress); }

  private pruneDisconnected(now: number, force = false) {
    for (const p of [...this.players.values()]) {
      if (!p.connected && (force || now - p.disconnectedAt > LOBBY_RECONNECT_GRACE_MS)) {
        if (force && now - p.disconnectedAt < 5_000) continue; // give very recent drops a chance
        this.players.delete(p.id);
        this.hooks.log(`room ${this.code}: pruned ${p.name}`);
      }
    }
    this.ensureHost();
  }

  // ------------------------------------------------------------------ input
  queueInputs(p: ServerPlayer, s: number, masks: number[]) {
    if (!p.inRace || (this.phase !== 'countdown' && this.phase !== 'racing')) {
      // outside a race we still acknowledge so client sequence stays in sync
      p.ackSeq = Math.max(p.ackSeq, s + masks.length - 1);
      p.lastQueuedSeq = p.ackSeq;
      return;
    }
    for (let i = 0; i < masks.length; i++) {
      const seq = s + i;
      if (seq <= p.lastQueuedSeq) continue;
      p.queue.push({ seq, mask: masks[i] });
      p.lastQueuedSeq = seq;
    }
    while (p.queue.length > MAX_INPUT_QUEUE) {
      const dropped = p.queue.shift()!;
      p.ackSeq = dropped.seq;
      p.lastMask = dropped.mask;
    }
  }

  // ------------------------------------------------------------------- tick
  tick(now: number) {
    if (this.phase === 'lobby') {
      if (this.tickCount++ % 60 === 0 && [...this.players.values()].some((p) => !p.connected)) {
        const before = this.players.size;
        this.pruneDisconnected(now);
        if (this.players.size !== before) this.hooks.emitState(this);
      }
      return;
    }
    if (this.phase === 'results') {
      if (now - this.resultsAt > RESULTS_AUTO_LOBBY_MS) this.toLobby(null);
      return;
    }
    if (this.phase === 'countdown' && now >= this.startAt) {
      this.phase = 'racing';
      this.hooks.emitState(this);
    }
    if (this.phase === 'racing' && now >= this.endAt) {
      this.finishRace(now);
      return;
    }
    const frozen = this.phase !== 'racing';
    const racers = this.racers();
    for (const p of racers) {
      // Each kart advances exactly once per *applied input*, so the server state
      // always matches the acknowledged sequence (clean client reconciliation).
      // Credits cap the input rate at the tick rate: sending more inputs can't make you faster.
      p.credit = Math.min(MAX_CREDIT, p.credit + 1);
      if (!p.connected) { stepKart(p.kart, 0, this.track, frozen); continue; }
      let applied = 0;
      while (p.queue.length && p.credit >= 1 && applied < 4) {
        const next = p.queue.shift()!;
        p.lastMask = next.mask; p.ackSeq = next.seq; p.credit--; applied++;
        stepKart(p.kart, next.mask, this.track, frozen);
      }
      // starving client (lag spike): extrapolate with the last input so the kart doesn't freeze
      if (applied) p.starved = 0;
      else if (p.credit >= MAX_CREDIT) {
        p.starved++;
        stepKart(p.kart, p.starved > STARVE_COAST_TICKS ? 0 : p.lastMask, this.track, frozen);
      }
    }
    if (!frozen) {
      for (let i = 0; i < racers.length; i++)
        for (let j = i + 1; j < racers.length; j++) collideKarts(racers[i].kart, racers[j].kart);
      for (const p of racers) {
        const pr = project(this.track, p.kart.x, p.kart.y, p.kart.hint);
        updateProgress(p.progress, this.track, pr.s, now);
      }
    }
    if (++this.tickCount % SNAPSHOT_EVERY_TICKS === 0) this.hooks.emitSnapshot(this, this.snapshot(now));
  }

  snapshot(now: number): Snapshot {
    const standings = this.standings();
    const rows: SnapRow[] = standings.map((p, idx) => {
      const k = p.kart;
      const flags = (k.offroad ? FLAG_OFFROAD : 0) | (p.connected ? 0 : FLAG_DISCONNECTED) | (k.drifting ? FLAG_DRIFT : 0);
      return [p.num, r2(k.x), r2(k.y), r4(k.angle), r2(k.vx), r2(k.vy), r2(k.boost), k.hint, p.ackSeq, idx + 1,
        p.progress.lap, Math.round(lapFraction(p.progress, this.track) * 1000), flags, r4(k.steer), r4(k.drift), r4(k.startCharge)];
    });
    return { t: now, ph: this.phase, k: rows };
  }

  publicState(): RoomState {
    const players: PublicPlayer[] = [...this.players.values()].sort((a, b) => a.num - b.num).map((p) => ({
      id: p.id, num: p.num, name: p.name, color: p.color, ready: p.ready || p.id === this.hostId,
      connected: p.connected, inRace: p.inRace, isHost: p.id === this.hostId,
    }));
    return {
      code: this.code, hostId: this.hostId, phase: this.phase, raceId: this.raceId,
      startAt: this.startAt, endAt: this.endAt, raceDurationMs: this.raceDurationMs,
      maxPlayers: MAX_PLAYERS, minPlayers: this.minPlayers, players, results: this.results,
    };
  }
}
