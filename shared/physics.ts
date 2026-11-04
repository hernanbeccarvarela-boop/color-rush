// ---------------------------------------------------------------------------
// Deterministic arcade kart physics. Runs identically on the server
// (authoritative) and on the client (prediction of the local kart).
// ---------------------------------------------------------------------------
import { DT, IN_BRAKE, IN_LEFT, IN_RIGHT, IN_THROTTLE } from './constants';
import { project, type Track } from './track';

export interface KartState {
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  steer: number;       // smoothed steering (-1..1)
  boost: number;       // seconds of boost remaining
  drift: number;       // seconds spent in the current drift (mini-turbo charge)
  startCharge: number; // seconds throttle has been held during the countdown (rocket start)
  hint: number;        // last nearest track sample (search hint)
  offroad: boolean;
  // per-step events (not synced, used for FX/sound)
  wallHit: number;     // >0 when a barrier impact happened this step (impact speed)
  drifting: boolean;
  turbo: number;       // 0 none, 1/2 = mini-turbo level released this step, 3 = rocket start
}

export const PHYS = {
  accel: 720,          // launch acceleration (falls off towards top speed)
  accelFalloff: 0.6,
  maxSpeed: 450,
  boostSpeed: 650,
  boostAccel: 1300,
  boostTime: 1.0,
  offroadMax: 220,
  offroadDrag: 2.2,
  brake: 1250,
  reverseAccel: 420,
  reverseMax: 170,
  coast: 240,
  steerRate: 3.1,
  driftSteerBonus: 1.2, // extra rotation while drifting: tighter lines through hairpins
  steerFullSpeed: 130,
  steerRampIn: 9,       // steering smoothing (1/s)
  steerRampOut: 12,
  grip: 11,
  driftGrip: 3.2,
  offroadGrip: 6,
  driftMinSpeed: 260,
  miniTurbo1: 0.6,      // drift seconds for a blue mini-turbo
  miniTurbo2: 1.4,      // drift seconds for an orange mini-turbo
  rocketWindow: 0.6,    // press throttle during the last 0.6 s of the countdown
  wallBounce: 0.35,
  wallSpeedLoss: 0.5,
  kartRadius: 18,
};

export function newKart(x: number, y: number, angle: number): KartState {
  return { x, y, vx: 0, vy: 0, angle, steer: 0, boost: 0, drift: 0, startCharge: 0, hint: -1, offroad: false, wallHit: 0, drifting: false, turbo: 0 };
}

export function forwardSpeed(k: KartState): number {
  return k.vx * Math.cos(k.angle) + k.vy * Math.sin(k.angle);
}

/** Mini-turbo charge level of the current drift: 0, 1 (blue) or 2 (orange). */
export function driftLevel(drift: number): number {
  return drift >= PHYS.miniTurbo2 ? 2 : drift >= PHYS.miniTurbo1 ? 1 : 0;
}

/** Advance one fixed step. `frozen` = countdown (no motion). */
export function stepKart(k: KartState, input: number, track: Track, frozen: boolean): void {
  k.wallHit = 0;
  k.turbo = 0;
  const throttle = (input & IN_THROTTLE) !== 0, brake = (input & IN_BRAKE) !== 0;
  if (frozen) {
    k.vx = 0; k.vy = 0; k.drifting = false; k.drift = 0; k.steer = 0;
    // rocket start: hold throttle only for the final moments before GO
    k.startCharge = throttle ? k.startCharge + DT : 0;
    return;
  }
  if (k.startCharge > 0) {
    if (throttle && k.startCharge <= PHYS.rocketWindow) { k.boost = Math.max(k.boost, 0.8); k.turbo = 3; }
    k.startCharge = 0;
  }
  const dt = DT;
  const left = (input & IN_LEFT) !== 0, right = (input & IN_RIGHT) !== 0;
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  // smoothed steering: quick but not twitchy
  const rate = target === 0 || Math.sign(target) !== Math.sign(k.steer) ? PHYS.steerRampOut : PHYS.steerRampIn;
  if (k.steer < target) k.steer = Math.min(target, k.steer + rate * dt);
  else if (k.steer > target) k.steer = Math.max(target, k.steer - rate * dt);
  const steer = k.steer;

  const ca = Math.cos(k.angle), sa = Math.sin(k.angle);
  let f = k.vx * ca + k.vy * sa;          // forward component
  let l = -k.vx * sa + k.vy * ca;         // lateral component

  const boosting = k.boost > 0;
  const maxF = boosting ? PHYS.boostSpeed : k.offroad ? PHYS.offroadMax : PHYS.maxSpeed;

  // longitudinal
  if (boosting) {
    if (f < maxF) f = Math.min(maxF, f + PHYS.boostAccel * dt);
  } else if (throttle && !brake) {
    if (f < 0) f += PHYS.brake * dt;
    else if (f < maxF) {
      const r = f / PHYS.maxSpeed;
      f = Math.min(maxF, f + PHYS.accel * (1 - PHYS.accelFalloff * r * r) * dt);
    }
  } else if (brake) {
    if (f > 5) f -= PHYS.brake * dt;
    else f = Math.max(f - PHYS.reverseAccel * dt, -PHYS.reverseMax);
  } else {
    const c = PHYS.coast * dt;
    f = Math.abs(f) <= c ? 0 : f - Math.sign(f) * c;
  }
  if (k.offroad) f -= f * PHYS.offroadDrag * dt;
  if (f > maxF) f = maxF + (f - maxF) * Math.exp(-3 * dt); // bleed off excess (after boost / entering sand)
  if (f < -PHYS.reverseMax) f = -PHYS.reverseMax;

  // drift state: committed steering at speed on asphalt
  const wasDrifting = k.drift > 0;
  const drifting = Math.abs(steer) > 0.6 && f > PHYS.driftMinSpeed && !k.offroad && !brake;
  if (drifting) k.drift += dt;
  else if (wasDrifting) {
    // releasing a charged drift fires a mini-turbo
    const lvl = k.offroad ? 0 : driftLevel(k.drift);
    if (lvl) { k.boost = Math.max(k.boost, lvl === 2 ? 0.9 : 0.45); k.turbo = lvl; }
    k.drift = 0;
  }
  k.drifting = drifting;

  // steering (needs speed; reversed when going backwards)
  const speedFactor = Math.min(1, Math.abs(f) / PHYS.steerFullSpeed);
  const highSpeedDamp = 1 - 0.22 * Math.min(1, Math.abs(f) / PHYS.maxSpeed);
  const dir = f >= 0 ? 1 : -1;
  const bonus = drifting ? PHYS.driftSteerBonus : 1;
  k.angle += steer * PHYS.steerRate * speedFactor * highSpeedDamp * bonus * dir * dt;
  if (k.angle > Math.PI) k.angle -= Math.PI * 2;
  else if (k.angle < -Math.PI) k.angle += Math.PI * 2;

  // lateral grip (lower while drifting so the kart slides)
  // Arcade grip: most of the scrubbed sideways speed is redirected forward,
  // so drifting keeps momentum instead of bleeding it into friction.
  const grip = k.offroad ? PHYS.offroadGrip : drifting ? PHYS.driftGrip : PHYS.grip;
  const keepL = l * Math.exp(-grip * dt);
  const scrub = Math.abs(l - keepL);
  l = keepL;
  if (f > 0 && f < maxF) f = Math.min(maxF, f + scrub * (k.offroad ? 0.2 : drifting ? 0.85 : 0.6));

  // recompose using the OLD heading so the kart slides after turning
  k.vx = f * ca - l * sa;
  k.vy = f * sa + l * ca;
  k.x += k.vx * dt;
  k.y += k.vy * dt;
  if (k.boost > 0) k.boost = Math.max(0, k.boost - dt);

  // track interaction
  const p = project(track, k.x, k.y, k.hint);
  k.hint = p.i;
  const ad = Math.abs(p.d);
  k.offroad = ad > p.hw;
  const limit = p.hw + track.runoff;
  if (ad > limit) {
    const side = Math.sign(p.d);
    const push = ad - limit;
    k.x -= p.nx * push * side;
    k.y -= p.ny * push * side;
    const vn = (k.vx * p.nx + k.vy * p.ny) * side; // outward speed
    if (vn > 0) {
      k.vx -= p.nx * side * vn * (1 + PHYS.wallBounce);
      k.vy -= p.ny * side * vn * (1 + PHYS.wallBounce);
      const keep = 1 - PHYS.wallSpeedLoss * Math.min(1, vn / 300);
      k.vx *= keep; k.vy *= keep;
      k.wallHit = vn;
      k.drift = 0; // hitting the wall cancels the mini-turbo
    }
  }
  // boost pads
  for (const pad of track.pads) {
    let ds = p.s - pad.s;
    if (ds > track.length / 2) ds -= track.length; else if (ds < -track.length / 2) ds += track.length;
    if (Math.abs(ds) < pad.len / 2 && Math.abs(p.d - pad.d) < pad.wid / 2) { k.boost = Math.max(k.boost, PHYS.boostTime); break; }
  }
}

/** Server-only kart-vs-kart collision (circle push-apart + impulse). */
export function collideKarts(a: KartState, b: KartState): boolean {
  const r = PHYS.kartRadius * 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r || d2 === 0) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  const overlap = (r - d) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = -(1 + 0.6) * rv / 2;
    a.vx -= j * nx; a.vy -= j * ny;
    b.vx += j * nx; b.vy += j * ny;
  }
  return true;
}
