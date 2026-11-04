// Offline driving-feel benchmark: runs autopilot drivers with different styles
// on the real track + physics and reports lap times, wall hits and mini-turbos.
//   npx tsx tests/drive-feel.ts
import { IN_BRAKE, IN_LEFT, IN_RIGHT, IN_THROTTLE, TICK_HZ } from '../shared/constants';
import { forwardSpeed, newKart, stepKart } from '../shared/physics';
import { newProgress, updateProgress } from '../shared/progress';
import { getTrack, gridSlot, pointAt, project } from '../shared/track';

const t = getTrack();
// Human-like keyboard driver: presses an arrow when the heading error exceeds `on`
// and keeps holding it until the error drops below `off` (digital keys, reaction lag).
type Style = { name: string; look: number; on: number; off: number; brakeAngle: number; lagTicks: number };
const styles: Style[] = [
  { name: 'novice (late, long key presses)', look: 180, on: 0.25, off: 0.0, brakeAngle: 9, lagTicks: 12 },
  { name: 'casual (holds full throttle)', look: 230, on: 0.14, off: 0.03, brakeAngle: 9, lagTicks: 8 },
  { name: 'drifter (early, commits to drifts)', look: 300, on: 0.08, off: -0.02, brakeAngle: 9, lagTicks: 6 },
  { name: 'careful (brakes on hairpins)', look: 240, on: 0.12, off: 0.03, brakeAngle: 0.6, lagTicks: 8 },
];
for (const st of styles) {
  const g = gridSlot(t, 0);
  const k = newKart(g.x, g.y, g.angle);
  const pr = newProgress(t);
  let walls = 0, turbos = 0, offroadTicks = 0, speedSum = 0, lapStartTick = 0;
  const laps: number[] = [];
  const hist: number[] = []; let held = 0;
  const SECS = 120;
  for (let i = 0; i < SECS * TICK_HZ; i++) {
    const p = project(t, k.x, k.y, k.hint);
    const tgt = pointAt(t, p.s + st.look, 0);
    let da = Math.atan2(tgt.y - k.y, tgt.x - k.x) - k.angle;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    hist.push(da); const seen = hist.length > st.lagTicks ? hist.shift()! : 0;
    if (held === 0 && Math.abs(seen) > st.on) held = Math.sign(seen);
    else if (held !== 0 && seen * held < st.off) held = 0;
    let m = IN_THROTTLE;
    if (held > 0) m |= IN_RIGHT; else if (held < 0) m |= IN_LEFT;
    if (Math.abs(da) > st.brakeAngle && forwardSpeed(k) > 250) m = (m & ~IN_THROTTLE) | IN_BRAKE;
    stepKart(k, m, t, false);
    if (k.wallHit > 60) walls++;
    if (k.turbo) turbos++;
    if (k.offroad) offroadTicks++;
    speedSum += Math.abs(forwardSpeed(k));
    const before = pr.lap;
    updateProgress(pr, t, project(t, k.x, k.y, k.hint).s, i);
    if (pr.lap > before && pr.lap >= 2) { laps.push((i - lapStartTick) / TICK_HZ); }
    if (pr.lap > before) lapStartTick = i;
  }
  console.log(`${st.name.padEnd(40)} laps/2min ${String(laps.length).padStart(2)} | lap ${laps.length ? Math.min(...laps).toFixed(1) : '-'}s | avg ${(speedSum / (SECS * TICK_HZ)).toFixed(0)} px/s | walls ${walls} | turbos ${turbos} | sand ${(offroadTicks / (SECS * TICK_HZ) * 100).toFixed(0)}%`);
}
