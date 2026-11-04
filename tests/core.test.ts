// Unit checks for the shared game core: determinism, laps, anti-shortcut.
import assert from 'node:assert/strict';
import { IN_LEFT, IN_RIGHT, IN_THROTTLE, TICK_HZ } from '../shared/constants';
import { newKart, stepKart } from '../shared/physics';
import { lapsCompleted, newProgress, updateProgress } from '../shared/progress';
import { getTrack, gridSlot, project } from '../shared/track';

const t = getTrack();
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ✓', name); };

test('physics is deterministic for identical input streams', () => {
  const g = gridSlot(t, 0);
  const a = newKart(g.x, g.y, g.angle), b = newKart(g.x, g.y, g.angle);
  for (let i = 0; i < 600; i++) {
    const m = IN_THROTTLE | (i % 90 < 30 ? IN_LEFT : 0);
    stepKart(a, m, t, false); stepKart(b, m, t, false);
  }
  assert.equal(a.x, b.x); assert.equal(a.y, b.y); assert.equal(a.angle, b.angle);
});

test('barrier keeps karts within the runoff', () => {
  const g = gridSlot(t, 0);
  const k = newKart(g.x, g.y, g.angle + Math.PI / 2); // aim straight at the barrier
  for (let i = 0; i < 400; i++) stepKart(k, IN_THROTTLE, t, false);
  const p = project(t, k.x, k.y, -1);
  assert.ok(Math.abs(p.d) <= p.hw + t.runoff + 1, `lateral ${p.d}`);
});

test('countdown freeze keeps karts still', () => {
  const g = gridSlot(t, 3);
  const k = newKart(g.x, g.y, g.angle);
  for (let i = 0; i < 120; i++) stepKart(k, IN_THROTTLE, t, true);
  assert.equal(k.x, g.x); assert.equal(k.y, g.y);
});

test('driving the full route counts laps', () => {
  const pr = newProgress(t);
  let now = 1000;
  updateProgress(pr, t, t.length - 100, now);
  for (let lap = 0; lap < 3; lap++) for (let s = 0; s < t.length; s += 40) updateProgress(pr, t, s, (now += 50));
  updateProgress(pr, t, 10, (now += 50));
  assert.equal(pr.lap, 4); assert.equal(lapsCompleted(pr), 3);
  assert.ok(pr.bestLapMs > 0);
});

test('skipping sections gives no progress', () => {
  const pr = newProgress(t);
  updateProgress(pr, t, t.length - 100, 0);
  updateProgress(pr, t, 50, 1);              // crossed the line: lap 1
  const before = pr.score;
  updateProgress(pr, t, t.length * 0.6, 2);  // teleport/shortcut across the infield
  assert.equal(pr.lap, 1);
  assert.ok(pr.score - before < t.length / t.checkpoints, 'progress clamped to validated region');
});

test('reversing across the line removes the lap', () => {
  const pr = newProgress(t);
  updateProgress(pr, t, t.length - 100, 0);
  updateProgress(pr, t, 50, 1);
  assert.equal(pr.lap, 1);
  updateProgress(pr, t, t.length - 50, 2);
  assert.equal(pr.lap, 0);
});

test('rocket start: throttle in the last moments of the countdown gives a boost', () => {
  const g = gridSlot(t, 0);
  const good = newKart(g.x, g.y, g.angle), early = newKart(g.x, g.y, g.angle);
  for (let i = 0; i < 3 * TICK_HZ; i++) {
    stepKart(good, i > 3 * TICK_HZ - 20 ? IN_THROTTLE : 0, t, true);
    stepKart(early, IN_THROTTLE, t, true);
  }
  stepKart(good, IN_THROTTLE, t, false); stepKart(early, IN_THROTTLE, t, false);
  assert.equal(good.turbo, 3); assert.ok(good.boost > 0);
  assert.equal(early.turbo, 0); assert.equal(early.boost, 0);
});

test('holding a drift charges and fires a mini-turbo', () => {
  const g = gridSlot(t, 0);
  const k = newKart(g.x, g.y, g.angle);
  for (let i = 0; i < 90; i++) stepKart(k, IN_THROTTLE, t, false);       // get up to speed
  let fired = 0;
  for (let i = 0; i < 44; i++) stepKart(k, IN_THROTTLE | IN_RIGHT, t, false); // ~0.73 s drift
  for (let i = 0; i < 10; i++) { stepKart(k, IN_THROTTLE, t, false); if (k.turbo) fired = k.turbo; }
  assert.equal(fired, 1); assert.ok(k.boost > 0);
});

console.log(`core: ${passed} tests passed`);
