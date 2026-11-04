// ---------------------------------------------------------------------------
// Track geometry: closed circuit built from control points via centripetal
// Catmull-Rom, resampled by arc length. Provides projection (nearest point,
// distance along track, lateral offset), checkpoints and grid slots.
// ---------------------------------------------------------------------------

export interface Vec { x: number; y: number }

export interface BoostPad { s: number; d: number; len: number; wid: number }

export interface Decoration { kind: 'tree' | 'pine' | 'bush' | 'rock' | 'tires' | 'flag' | 'stand' | 'pond' | 'sign'; x: number; y: number; r: number; a: number; v: number }

export interface Track {
  name: string;
  n: number;
  px: Float64Array; py: Float64Array;   // centerline samples
  tx: Float64Array; ty: Float64Array;   // unit tangent
  nx: Float64Array; ny: Float64Array;   // unit normal (tangent rotated +90°)
  hw: Float64Array;                     // half road width
  cum: Float64Array;                    // arc length at sample
  length: number;
  checkpoints: number;                  // number of sequential regions
  runoff: number;                       // grass between road edge and barrier
  pads: BoostPad[];
  width: number; height: number;        // world bounds
  decorations: Decoration[];
}

// Control points: [x, y, halfWidth]. Original layout — "Prism Park".
const CONTROL: [number, number, number][] = [
  [700, 2250, 165],
  [1600, 2300, 170],
  [2500, 2250, 160],
  [3150, 2000, 140],
  [3330, 1450, 130],
  [3080, 960, 125],
  [2560, 860, 120],
  [2180, 1230, 130],
  [1720, 1440, 135],
  [1330, 1150, 125],
  [1500, 640, 130],
  [1200, 360, 140],
  [650, 400, 145],
  [360, 820, 135],
  [400, 1500, 150],
  [470, 2000, 160],
];

const START_NEAR: Vec = { x: 1250, y: 2290 };
const SAMPLE_SPACING = 10;
const PADDING = 450;

function catmull(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  // centripetal Catmull–Rom (alpha 0.5)
  const a = 0.5;
  const d01 = Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), a) || 1e-4;
  const d12 = Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), a) || 1e-4;
  const d23 = Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), a) || 1e-4;
  const t0 = 0, t1 = d01, t2 = t1 + d12, t3 = t2 + d23;
  const tt = t1 + (t2 - t1) * t;
  const lerp = (A: Vec, B: Vec, ta: number, tb: number): Vec => {
    const k = (tt - ta) / (tb - ta);
    return { x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k };
  };
  const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
  const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
  return lerp(B1, B2, t1, t2);
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTrack(): Track {
  const m = CONTROL.length;
  const dense: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i < m; i++) {
    const c0 = CONTROL[(i - 1 + m) % m], c1 = CONTROL[i], c2 = CONTROL[(i + 1) % m], c3 = CONTROL[(i + 2) % m];
    const p0 = { x: c0[0], y: c0[1] }, p1 = { x: c1[0], y: c1[1] }, p2 = { x: c2[0], y: c2[1] }, p3 = { x: c3[0], y: c3[1] };
    const steps = 200;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const p = catmull(p0, p1, p2, p3, t);
      const st = t * t * (3 - 2 * t); // smooth width blend
      dense.push({ x: p.x, y: p.y, w: c1[2] + (c2[2] - c1[2]) * st });
    }
  }
  // arc-length resample
  const dl: number[] = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    dl.push(dl[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = dl[dense.length];
  const n = Math.round(total / SAMPLE_SPACING);
  const rs: { x: number; y: number; w: number }[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (dl[j + 1] < target) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const f = (target - dl[j]) / (dl[j + 1] - dl[j] || 1);
    rs.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f });
  }
  // rotate so sample 0 is the start/finish line
  let best = 0, bestD = Infinity;
  rs.forEach((p, i) => { const d = Math.hypot(p.x - START_NEAR.x, p.y - START_NEAR.y); if (d < bestD) { bestD = d; best = i; } });
  const pts = rs.slice(best).concat(rs.slice(0, best));

  // normalise into positive world coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x - p.w); minY = Math.min(minY, p.y - p.w); maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.w); }
  const ox = PADDING - minX, oy = PADDING - minY;

  const px = new Float64Array(n), py = new Float64Array(n), hw = new Float64Array(n);
  pts.forEach((p, i) => { px[i] = Math.round((p.x + ox) * 1000) / 1000; py[i] = Math.round((p.y + oy) * 1000) / 1000; hw[i] = p.w; });
  const tx = new Float64Array(n), ty = new Float64Array(n), nx = new Float64Array(n), ny = new Float64Array(n), cum = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const dx = px[b] - px[a], dy = py[b] - py[a];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l; nx[i] = -ty[i]; ny[i] = tx[i];
    cum[i] = acc;
    acc += Math.hypot(px[b] - px[i], py[b] - py[i]);
  }
  const length = acc;

  const track: Track = {
    name: 'Prism Park', n, px, py, tx, ty, nx, ny, hw, cum, length,
    checkpoints: 16, runoff: 60,
    pads: [],
    width: Math.ceil(maxX - minX + PADDING * 2), height: Math.ceil(maxY - minY + PADDING * 2),
    decorations: [],
  };
  track.pads = [
    { s: length * 0.17, d: -55, len: 110, wid: 70 },
    { s: length * 0.17, d: 55, len: 110, wid: 70 },
    { s: length * 0.47, d: 0, len: 110, wid: 70 },
    { s: length * 0.76, d: -40, len: 110, wid: 70 },
  ];
  track.decorations = makeDecorations(track);
  return track;
}

/** Deterministic scenery placed outside the barrier. */
function makeDecorations(t: Track): Decoration[] {
  const rnd = mulberry32(1337);
  const out: Decoration[] = [];
  const clear = (x: number, y: number, r: number) => {
    const pr = project(t, x, y, -1);
    return Math.abs(pr.d) > pr.hw + t.runoff + 40 + r;
  };
  const clearance = (x: number, y: number) => { const pr = project(t, x, y, -1); return Math.abs(pr.d) - pr.hw - t.runoff; };
  // ponds in the roomiest infield spots
  const spots: { x: number; y: number; c: number }[] = [];
  for (let y = 380; y < t.height - 380; y += 60) for (let x = 380; x < t.width - 380; x += 60) {
    const c = clearance(x, y); if (c > 230 && c < 420) spots.push({ x, y, c });
  }
  spots.sort((a, b) => b.c - a.c);
  for (const sp of spots) {
    if (out.filter((o) => o.kind === 'pond').length >= 3) break;
    if (out.some((o) => Math.hypot(o.x - sp.x, o.y - sp.y) < o.r + 260)) continue;
    const r = Math.min(240, sp.c - 110);
    if (r < 100) continue;
    out.push({ kind: 'pond', x: sp.x, y: sp.y, r, a: rnd() * Math.PI, v: rnd() });
  }
  // billboards facing the track along the straights
  for (let i = 40; i < t.n; i += 110) {
    const a = (i - 8 + t.n) % t.n, b = (i + 8) % t.n;
    const turn = Math.abs(Math.atan2(t.tx[a] * t.ty[b] - t.ty[a] * t.tx[b], t.tx[a] * t.tx[b] + t.ty[a] * t.ty[b]));
    if (turn > 0.18) continue;
    const side = (i / 110) % 2 < 1 ? 1 : -1;
    const off = t.hw[i] + t.runoff + 85;
    const x = t.px[i] + t.nx[i] * off * side, y = t.py[i] + t.ny[i] * off * side;
    if (clearance(x, y) < 50 || out.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 80)) continue;
    out.push({ kind: 'sign', x, y, r: 70, a: Math.atan2(t.ty[i], t.tx[i]), v: rnd() });
  }
  // tire stacks along barriers on the outside of some corners
  for (let i = 0; i < t.n; i += 38) {
    const side = i % 76 === 0 ? 1 : -1;
    const off = t.hw[i] + t.runoff + 34;
    out.push({ kind: 'tires', x: t.px[i] + t.nx[i] * off * side, y: t.py[i] + t.ny[i] * off * side, r: 30, a: 0, v: rnd() });
  }
  // grandstands by the start straight
  for (let k = -2; k <= 2; k++) {
    const i = (t.n + Math.round(k * 19)) % t.n;
    const off = t.hw[i] + t.runoff + 95;
    out.push({ kind: 'stand', x: t.px[i] - t.nx[i] * off, y: t.py[i] - t.ny[i] * off, r: 90, a: Math.atan2(t.ty[i], t.tx[i]), v: (k + 2) / 4 });
  }
  let tries = 0;
  while (out.length < 440 && tries < 9000) {
    tries++;
    const x = rnd() * t.width, y = rnd() * t.height;
    const kRoll = rnd();
    const kind: Decoration['kind'] = kRoll < 0.35 ? 'pine' : kRoll < 0.55 ? 'tree' : kRoll < 0.8 ? 'bush' : 'rock';
    const r = kind === 'pine' ? 24 + rnd() * 18 : kind === 'tree' ? 26 + rnd() * 24 : kind === 'bush' ? 14 + rnd() * 12 : 10 + rnd() * 14;
    if (!clear(x, y, r)) continue;
    // tall scenery must not visually cover the road when seen from the 3/4 camera
    if ((kind === 'pine' || kind === 'tree') && !clear(x, y - r * 1.6, r)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 6)) continue;
    out.push({ kind, x, y, r, a: rnd() * Math.PI * 2, v: rnd() });
  }
  return out;
}

export interface Projection { i: number; s: number; d: number; hw: number; nx: number; ny: number; tx: number; ty: number }

/**
 * Nearest point on the centerline. `hint` (previous sample index, or -1) lets
 * us search a local window; falls back to a global search when the result is
 * at the window edge so results stay identical on client and server.
 */
export function project(t: Track, x: number, y: number, hint: number): Projection {
  const n = t.n;
  let bestI = -1, bestD2 = Infinity;
  const scan = (from: number, count: number) => {
    for (let k = 0; k < count; k++) {
      const i = ((from + k) % n + n) % n;
      const dx = x - t.px[i], dy = y - t.py[i];
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestI = i; }
    }
  };
  const W = 40;
  if (hint >= 0) {
    scan(hint - W, W * 2 + 1);
    const off = ((bestI - hint) % n + n + n / 2) % n - n / 2;
    if (Math.abs(off) >= W - 1) { bestD2 = Infinity; scan(0, n); }
  } else {
    scan(0, n);
  }
  // refine on the two adjacent segments
  const i = bestI;
  const segProj = (a: number) => {
    const b = (a + 1) % n;
    const ax = t.px[a], ay = t.py[a];
    const sx = t.px[b] - ax, sy = t.py[b] - ay;
    const L2 = sx * sx + sy * sy || 1;
    let u = ((x - ax) * sx + (y - ay) * sy) / L2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = ax + sx * u, qy = ay + sy * u;
    return { a, u, d2: (x - qx) ** 2 + (y - qy) ** 2 };
  };
  const p1 = segProj(i), p2 = segProj((i - 1 + n) % n);
  const best = p1.d2 <= p2.d2 ? p1 : p2;
  const a = best.a, b = (a + 1) % n, u = best.u;
  const segLen = Math.hypot(t.px[b] - t.px[a], t.py[b] - t.py[a]);
  let s = t.cum[a] + segLen * u;
  if (s >= t.length) s -= t.length;
  const tX = t.tx[a] + (t.tx[b] - t.tx[a]) * u, tY = t.ty[a] + (t.ty[b] - t.ty[a]) * u;
  const tl = Math.hypot(tX, tY) || 1;
  const ux = tX / tl, uy = tY / tl;
  const nX = -uy, nY = ux;
  const cx = t.px[a] + (t.px[b] - t.px[a]) * u, cy = t.py[a] + (t.py[b] - t.py[a]) * u;
  const d = (x - cx) * nX + (y - cy) * nY;
  const hw = t.hw[a] + (t.hw[b] - t.hw[a]) * u;
  return { i, s, d, hw, nx: nX, ny: nY, tx: ux, ty: uy };
}

/** World position for a distance along the track and lateral offset. */
export function pointAt(t: Track, s: number, d: number): { x: number; y: number; angle: number } {
  s = ((s % t.length) + t.length) % t.length;
  // binary search cum
  let lo = 0, hi = t.n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (t.cum[mid] <= s) lo = mid; else hi = mid - 1; }
  const a = lo, b = (a + 1) % t.n;
  const segEnd = b === 0 ? t.length : t.cum[b];
  const u = (s - t.cum[a]) / (segEnd - t.cum[a] || 1);
  const x = t.px[a] + (t.px[b] - t.px[a]) * u + t.nx[a] * d;
  const y = t.py[a] + (t.py[b] - t.py[a]) * u + t.ny[a] * d;
  return { x, y, angle: Math.atan2(t.ty[a], t.tx[a]) };
}

/** Starting grid: two staggered columns behind the start line. */
export function gridSlot(t: Track, slot: number): { x: number; y: number; angle: number } {
  const row = Math.floor(slot / 2), col = slot % 2;
  const s = -70 - row * 72 - col * 34;
  const d = col === 0 ? -52 : 52;
  return pointAt(t, s, d);
}

let cached: Track | null = null;
export function getTrack(): Track {
  if (!cached) cached = buildTrack();
  return cached;
}
