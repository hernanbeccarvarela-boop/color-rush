// ---------------------------------------------------------------------------
// Static track art for the 3/4 top-down look. Everything with "height"
// (trees, fences, signs, stands) is drawn shifted upwards on screen with a
// shadow cast down-right, which reads as depth from a tilted camera.
// The whole static world is baked once into chunked RenderTextures.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { PHYS } from '../../../shared/physics';
import { gridSlot, pointAt, type Decoration, type Track } from '../../../shared/track';

type G = Phaser.GameObjects.Graphics;

const C = {
  grass1: 0x6aac57, grass2: 0x63a450, tuft: 0x548f43, tuftLight: 0x7dbd66,
  sand: 0xe9cb8c, sandEdge: 0xd2ad6c,
  asphalt: 0x57516f, asphaltEdge: 0x47425c, speckDark: 0x4b4563, speckLight: 0x65607d,
  edgeLine: 0xf3f0ff, curbA: 0xe8484f, curbB: 0xf6f3ee,
  post: 0x7a4c2c, rail: 0xa86f3e, railHi: 0xd29a5f,
  water: 0x5fb0da, waterDeep: 0x3f8fc0, waterHi: 0x9ad4f0,
};

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type OffsetFn = (i: number) => number;

function band(g: G, t: Track, inner: OffsetFn, outer: OffsetFn, color: (i: number) => number, step = 1, alpha = 1) {
  for (let i = 0; i < t.n; i += step) {
    const k = (i + step) % t.n;
    g.fillStyle(color(i), alpha);
    const ax = t.px[i] + t.nx[i] * inner(i), ay = t.py[i] + t.ny[i] * inner(i);
    const bx = t.px[i] + t.nx[i] * outer(i), by = t.py[i] + t.ny[i] * outer(i);
    const cx = t.px[k] + t.nx[k] * outer(k), cy = t.py[k] + t.ny[k] * outer(k);
    const dx = t.px[k] + t.nx[k] * inner(k), dy = t.py[k] + t.ny[k] * inner(k);
    g.fillTriangle(ax, ay, bx, by, cx, cy);
    g.fillTriangle(ax, ay, cx, cy, dx, dy);
  }
}

function quadAt(g: G, x: number, y: number, a: number, w: number, h: number) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const hx = w / 2, hy = h / 2;
  const pts = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([u, v]) => ({ x: x + ca * u - sa * v, y: y + sa * u + ca * v }));
  g.fillTriangle(pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
  g.fillTriangle(pts[0].x, pts[0].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
}

function chevron(g: G, p: { x: number; y: number; angle: number }, color: number, alpha: number) {
  const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
  const P = (u: number, v: number) => ({ x: p.x + ca * u - sa * v, y: p.y + sa * u + ca * v });
  g.fillStyle(color, alpha);
  const a = P(18, 0), b = P(-8, -20), c = P(0, 0), d = P(-8, 20);
  const b2 = P(-16, -20), d2 = P(-16, 20), c2 = P(-8, 0);
  g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y); g.fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y);
  g.fillTriangle(b.x, b.y, b2.x, b2.y, c2.x, c2.y); g.fillTriangle(b.x, b.y, c2.x, c2.y, c.x, c.y);
  g.fillTriangle(d.x, d.y, d2.x, d2.y, c2.x, c2.y); g.fillTriangle(d.x, d.y, c2.x, c2.y, c.x, c.y);
}

function poly(g: G, cx: number, cy: number, r: number, n: number, rot: number, jitter: number[], color: number, alpha = 1) {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = r * (jitter[i % jitter.length] ?? 1);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true);
}

// ------------------------------------------------------------------ scenery
function drawPond(g: G, d: Decoration) {
  const rnd = mulberry(Math.floor(d.v * 1e6));
  const jit = Array.from({ length: 16 }, () => 0.82 + rnd() * 0.22);
  poly(g, d.x, d.y, d.r + 18, 16, d.a, jit, C.sandEdge);
  poly(g, d.x, d.y, d.r + 10, 16, d.a, jit, C.sand);
  poly(g, d.x, d.y, d.r, 16, d.a, jit, C.waterDeep);
  poly(g, d.x - 4, d.y - 6, d.r - 14, 16, d.a, jit, C.water);
  poly(g, d.x - 20, d.y - 20, d.r * 0.45, 16, d.a, jit, C.waterHi, 0.35);
  // ripples
  g.lineStyle(2, 0xffffff, 0.35);
  for (let k = 0; k < 4; k++) {
    const x = d.x + (rnd() - 0.5) * d.r, y = d.y + (rnd() - 0.5) * d.r * 0.8;
    g.beginPath(); g.arc(x, y, 10 + rnd() * 10, Math.PI * 1.1, Math.PI * 1.9); g.strokePath();
  }
  // lily pads + flowers
  for (let k = 0; k < 9; k++) {
    const a = rnd() * Math.PI * 2, rr = d.r * (0.3 + rnd() * 0.5);
    const x = d.x + Math.cos(a) * rr, y = d.y + Math.sin(a) * rr * 0.85, s = 7 + rnd() * 6;
    g.fillStyle(0x3f8f45, 1); g.slice(x, y, s, a + 0.4, a + Math.PI * 2 - 0.1, false); g.fillPath();
    g.fillStyle(0x58a85a, 1); g.slice(x - 1, y - 1, s * 0.75, a + 0.4, a + Math.PI * 2 - 0.1, false); g.fillPath();
    if (k % 3 === 0) { g.fillStyle(0xff8fc8, 1); g.fillCircle(x + 2, y - 2, 3.5); g.fillStyle(0xffe680, 1); g.fillCircle(x + 2, y - 2, 1.4); }
  }
  // boulders on the shore
  for (let k = 0; k < 4; k++) {
    const a = d.a + k * 1.7 + rnd(), rr = d.r + 6;
    drawRock(g, d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr * 0.9, 14 + rnd() * 16, rnd());
  }
}

function drawRock(g: G, x: number, y: number, r: number, v: number) {
  const jit = [1, 0.85, 1.05, 0.9, 1.1, 0.8, 0.95];
  poly(g, x + r * 0.35, y + r * 0.3, r, 7, v * 6, jit, 0x000000, 0.16);    // shadow
  poly(g, x, y, r, 7, v * 6, jit, 0x8d93a3);                                // body
  poly(g, x - r * 0.15, y - r * 0.3, r * 0.75, 7, v * 6 + 0.3, jit, 0xb5bac7); // lit top facet
  poly(g, x - r * 0.3, y - r * 0.45, r * 0.35, 5, v * 6 + 0.8, jit, 0xd3d7e0); // highlight
}

function drawPine(g: G, d: Decoration) {
  const { x, y, r } = d;
  g.fillStyle(0x000000, 0.2); g.fillEllipse(x + r * 0.7, y + r * 0.25, r * 2.2, r * 1.1);           // cast shadow
  g.fillStyle(0x6b4428, 1); g.fillRect(x - 3, y - r * 0.45, 6, r * 0.5);                              // trunk
  const tiers = 3;
  for (let k = 0; k < tiers; k++) {
    const rr = r * (1 - k * 0.26), cy = y - r * 0.45 - k * r * 0.48;
    const jit = [1, 0.86, 1, 0.86, 1, 0.86, 1, 0.86, 1, 0.86];
    poly(g, x, cy, rr, 10, d.a, jit, k === 0 ? 0x2c6e43 : k === 1 ? 0x34804c : 0x3f9157);
    poly(g, x - rr * 0.2, cy - rr * 0.22, rr * 0.7, 10, d.a, jit, k === 0 ? 0x3b8a52 : k === 1 ? 0x479c5c : 0x5bb069);
  }
  g.fillStyle(0xffffff, 0.12); g.fillCircle(x - r * 0.2, y - r * 1.5, r * 0.2);
}

function drawTree(g: G, d: Decoration) {
  const { x, y, r } = d;
  g.fillStyle(0x000000, 0.2); g.fillEllipse(x + r * 0.6, y + r * 0.2, r * 2.1, r * 1.1);
  g.fillStyle(0x6b4428, 1); g.fillRect(x - 4, y - r * 0.7, 8, r * 0.75);
  const cy = y - r * 0.9;
  const leaf = d.v < 0.5 ? [0x3e8c4a, 0x52a85a, 0x6dc06d] : [0x5f9a3c, 0x78b447, 0x96cc5e];
  g.fillStyle(leaf[0], 1); g.fillCircle(x, cy, r);
  g.fillStyle(leaf[1], 1); g.fillCircle(x - r * 0.18, cy - r * 0.18, r * 0.78);
  g.fillStyle(leaf[2], 1); g.fillCircle(x - r * 0.35, cy - r * 0.35, r * 0.38);
}

function drawBush(g: G, d: Decoration) {
  const col = [0xff7eb9, 0xffd84d, 0xb59bff][Math.floor(d.v * 3)];
  g.fillStyle(0x000000, 0.16); g.fillEllipse(d.x + d.r * 0.4, d.y + d.r * 0.3, d.r * 2.2, d.r * 1.3);
  g.fillStyle(0x3f8d45, 1); g.fillCircle(d.x, d.y - d.r * 0.3, d.r);
  g.fillStyle(0x55a85a, 1); g.fillCircle(d.x - d.r * 0.25, d.y - d.r * 0.5, d.r * 0.65);
  g.fillStyle(col, 1);
  for (let k = 0; k < 5; k++) g.fillCircle(d.x + Math.cos(d.a + k * 1.3) * d.r * 0.55, d.y - d.r * 0.3 + Math.sin(d.a + k * 1.3) * d.r * 0.5, 2.6);
}

function drawSign(g: G, d: Decoration) {
  const ca = Math.cos(d.a), sa = Math.sin(d.a), W = 64, H = 34, LIFT = 26;
  const at = (u: number, h: number) => ({ x: d.x + ca * u, y: d.y + sa * u - h });
  g.fillStyle(0x000000, 0.18); quadAt(g, d.x + 14, d.y + 10, d.a, W * 2, 14);
  g.fillStyle(0x5d6274, 1);
  for (const u of [-W * 0.6, W * 0.6]) { const p = at(u, 0); g.fillRect(p.x - 2.5, p.y - LIFT, 5, LIFT); }
  const corners = [at(-W, LIFT), at(W, LIFT), at(W, LIFT + H), at(-W, LIFT + H)];
  g.fillStyle(0xf7f4ee, 1); g.fillPoints(corners, true);
  const palettes = [[0xff3b47, 0xffd31a, 0x2f7bff], [0x9b5cff, 0x1fe0f0, 0xff5fc8], [0x2fd35a, 0xff8a1f, 0x2f7bff]];
  const pal = palettes[Math.floor(d.v * palettes.length)];
  pal.forEach((col, k) => {
    const u0 = -W + 12 + k * 24, u1 = u0 + 16;
    g.fillStyle(col, 1);
    g.fillPoints([at(u0, LIFT + 6), at(u1, LIFT + 6), at(u1 + 10, LIFT + H - 6), at(u0 + 10, LIFT + H - 6)], true);
  });
  const c = at(W * 0.55, LIFT + H / 2);
  g.fillStyle(0x23263a, 1); g.fillCircle(c.x, c.y, 10);
  g.fillStyle(pal[0], 1); g.fillCircle(c.x, c.y, 5);
  g.lineStyle(3, 0x3b3f52, 1); g.strokePoints(corners, true);
}

function drawStand(g: G, d: Decoration) {
  const ca = Math.cos(d.a), sa = Math.sin(d.a);
  g.fillStyle(0x000000, 0.2); quadAt(g, d.x + 16, d.y + 14, d.a, 180, 80);
  g.fillStyle(0x3a3d55, 1); quadAt(g, d.x, d.y - 10, d.a, 172, 74);
  const seat = [0xff3b47, 0xffd31a, 0x2f7bff, 0x2fd35a, 0xff5fc8, 0x9b5cff, 0xffffff];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++) {
    g.fillStyle(seat[(r * 5 + c * 7 + Math.floor(d.v * 10)) % seat.length], 1);
    const lx = (c - 6) * 12.5, ly = (r - 1.5) * 15;
    const lift = 10 + (1.5 - r) * 4;
    g.fillCircle(d.x + ca * lx - sa * ly, d.y + sa * lx + ca * ly - lift, 4.2);
  }
  // roof stripe
  g.fillStyle(0xe8484f, 1); quadAt(g, d.x - (-sa) * 40, d.y - ca * 40 - 34, d.a, 176, 10);
}

function drawFence(g: G, t: Track, side: number) {
  const off = (i: number) => side * (t.hw[i] + t.runoff + PHYS.kartRadius + 8);
  const pt = (i: number, h: number) => ({ x: t.px[i] + t.nx[i] * off(i), y: t.py[i] + t.ny[i] * off(i) - h });
  const line = (h: number, w: number, col: number, alpha = 1, dx = 0, dy = 0) => {
    g.lineStyle(w, col, alpha);
    g.beginPath();
    for (let i = 0; i <= t.n; i += 2) { const p = pt(i % t.n, h); if (i === 0) g.moveTo(p.x + dx, p.y + dy); else g.lineTo(p.x + dx, p.y + dy); }
    g.closePath(); g.strokePath();
  };
  line(0, 6, 0x000000, 0.15, 6, 5);                       // shadow on the ground
  for (let i = 0; i < t.n; i += 4) {
    const b = pt(i, 0);
    g.fillStyle(C.post, 1); g.fillRect(b.x - 2.5, b.y - 17, 5, 17);
    g.fillStyle(C.railHi, 1); g.fillRect(b.x - 2.5, b.y - 18, 5, 2);
  }
  line(7, 3.5, C.rail);
  line(14, 3.5, C.rail);
  line(15, 1.5, C.railHi);
}

function drawStatic(g: G, t: Track) {
  const rnd = mulberry(4242);
  // mowed grass + tufts
  for (let y = 0, k = 0; y < t.height; y += 160, k++) { g.fillStyle(k % 2 ? C.grass1 : C.grass2, 1); g.fillRect(0, y, t.width, 160); }
  for (let k = 0; k < 1800; k++) {
    g.fillStyle(rnd() < 0.6 ? C.tuft : C.tuftLight, 0.55);
    g.fillEllipse(rnd() * t.width, rnd() * t.height, 6 + rnd() * 10, 3 + rnd() * 4);
  }
  const wall = (i: number) => t.hw[i] + t.runoff + PHYS.kartRadius;
  // sand runoff
  band(g, t, (i) => -wall(i) - 4, (i) => wall(i) + 4, () => C.sandEdge);
  band(g, t, (i) => -wall(i) + 2, (i) => wall(i) - 2, () => C.sand);
  // road
  band(g, t, (i) => -t.hw[i] - 4, (i) => t.hw[i] + 4, () => C.asphaltEdge);
  band(g, t, (i) => -t.hw[i] + 3, (i) => t.hw[i] - 3, () => C.asphalt);
  for (let i = 0; i < t.n; i++) for (let k = 0; k < 4; k++) {
    const d = (rnd() * 2 - 1) * (t.hw[i] - 8);
    g.fillStyle(rnd() < 0.5 ? C.speckDark : C.speckLight, 0.7);
    g.fillRect(t.px[i] + t.nx[i] * d, t.py[i] + t.ny[i] * d, 2 + rnd() * 3, 2 + rnd() * 2);
  }
  // white edge lines just inside the kerbs
  band(g, t, (i) => t.hw[i] - 15, (i) => t.hw[i] - 11, () => C.edgeLine, 1, 0.85);
  band(g, t, (i) => -t.hw[i] + 11, (i) => -t.hw[i] + 15, () => C.edgeLine, 1, 0.85);
  // kerbs (with a darker lip for thickness)
  const cc = (i: number) => (Math.floor(i / 3) % 2 ? C.curbA : C.curbB);
  band(g, t, (i) => t.hw[i] - 7, (i) => t.hw[i] + 11, () => 0x8c2a32);
  band(g, t, (i) => -t.hw[i] - 11, (i) => -t.hw[i] + 7, () => 0x8c2a32);
  band(g, t, (i) => t.hw[i] - 8, (i) => t.hw[i] + 8, cc);
  band(g, t, (i) => -t.hw[i] - 8, (i) => -t.hw[i] + 8, cc);
  // dashed centre line + direction chevrons
  for (let i = 0; i < t.n; i += 8) band1(g, t, i, 4, -2, 2, 0xffffff, 0.2);
  for (let s = 300; s < t.length - 200; s += 520) {
    for (const d of [-0.45, 0.45]) {
      const i = Math.min(t.n - 1, Math.round((s / t.length) * t.n));
      chevron(g, pointAt(t, s, d * t.hw[i]), 0xffffff, 0.16);
    }
  }
  // start/finish checkers
  const sq = 16, rows = 3, hw0 = t.hw[0];
  for (let r = 0; r < rows; r++) for (let c = -Math.ceil(hw0 / sq); c < Math.ceil(hw0 / sq); c++) {
    g.fillStyle((r + c) % 2 === 0 ? 0xffffff : 0x1b1a22, 1);
    const p = pointAt(t, (r - rows / 2) * sq, c * sq + sq / 2);
    quadAt(g, p.x, p.y, p.angle, sq, sq);
  }
  // grid boxes
  for (let s = 0; s < 10; s++) {
    const p = gridSlot(t, s);
    g.lineStyle(3, 0xffffff, 0.75);
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
    const fx = p.x + ca * 32, fy = p.y + sa * 32;
    g.beginPath();
    g.moveTo(fx - sa * 24, fy + ca * 24); g.lineTo(fx + sa * 24, fy - ca * 24);
    g.moveTo(fx - sa * 24, fy + ca * 24); g.lineTo(fx - sa * 24 - ca * 14, fy + ca * 24 - sa * 14);
    g.moveTo(fx + sa * 24, fy - ca * 24); g.lineTo(fx + sa * 24 - ca * 14, fy - ca * 24 - sa * 14);
    g.strokePath();
  }
  // ground-level scenery first, then everything with height sorted back-to-front
  for (const d of t.decorations) if (d.kind === 'pond') drawPond(g, d);
  drawFence(g, t, 1);
  drawFence(g, t, -1);
  const tall = t.decorations.filter((d) => d.kind !== 'pond').sort((a, b) => a.y - b.y);
  for (const d of tall) {
    switch (d.kind) {
      case 'pine': drawPine(g, d); break;
      case 'tree': drawTree(g, d); break;
      case 'bush': drawBush(g, d); break;
      case 'rock': drawRock(g, d.x, d.y, d.r, d.v); break;
      case 'sign': drawSign(g, d); break;
      case 'stand': drawStand(g, d); break;
      case 'tires':
        for (let k = 0; k < 3; k++) {
          const x = d.x + (k - 1) * 17;
          g.fillStyle(0x000000, 0.18); g.fillEllipse(x + 5, d.y + 5, 20, 12);
          for (let h = 0; h < 3; h++) { g.fillStyle(h === 2 ? 0x2c2b36 : 0x1a1a20, 1); g.fillEllipse(x, d.y - h * 5, 18, 11); }
          g.fillStyle(k % 2 ? C.curbA : 0xffffff, 1); g.fillEllipse(x, d.y - 10, 8, 4.5);
        }
        break;
      default: break;
    }
  }
}

function band1(g: G, t: Track, i: number, len: number, d0: number, d1: number, col: number, alpha: number) {
  const k = (i + len) % t.n;
  g.fillStyle(col, alpha);
  g.fillTriangle(t.px[i] + t.nx[i] * d0, t.py[i] + t.ny[i] * d0, t.px[i] + t.nx[i] * d1, t.py[i] + t.ny[i] * d1, t.px[k] + t.nx[k] * d1, t.py[k] + t.ny[k] * d1);
  g.fillTriangle(t.px[i] + t.nx[i] * d0, t.py[i] + t.ny[i] * d0, t.px[k] + t.nx[k] * d1, t.py[k] + t.ny[k] * d1, t.px[k] + t.nx[k] * d0, t.py[k] + t.ny[k] * d0);
}

/** Draws the static world into 1024px RenderTexture chunks (depth 0). */
export function buildTrackLayer(scene: Phaser.Scene, t: Track) {
  const g = scene.add.graphics();
  drawStatic(g, t);
  const CH = 1024;
  if (scene.game.renderer.type === Phaser.WEBGL) {
    for (let cy = 0; cy < t.height; cy += CH) {
      for (let cx = 0; cx < t.width; cx += CH) {
        // chunks overlap by a few px so linear filtering never shows seams
        const w = Math.min(CH + 4, t.width - cx), h = Math.min(CH + 4, t.height - cy);
        const rt = scene.add.renderTexture(cx, cy, w, h).setOrigin(0, 0).setDepth(0);
        rt.draw(g, -cx, -cy);
      }
    }
    g.destroy();
  } else {
    g.setDepth(0); // canvas renderer: keep the graphics object
  }
}

/** Animated boost pads (depth 1). */
export function buildBoostPads(scene: Phaser.Scene, t: Track) {
  const g = scene.add.graphics().setDepth(1);
  for (const pad of t.pads) {
    const p = pointAt(t, pad.s, pad.d);
    g.fillStyle(0xff5fc8, 0.95); quadAt(g, p.x, p.y, p.angle, pad.len + 8, pad.wid + 8);
    g.fillStyle(0x1fe0f0, 1); quadAt(g, p.x, p.y, p.angle, pad.len, pad.wid);
    for (let k = -1; k <= 1; k++) chevron(g, { x: p.x + Math.cos(p.angle) * k * 30, y: p.y + Math.sin(p.angle) * k * 30, angle: p.angle }, 0xffffff, 0.95);
  }
  scene.tweens.add({ targets: g, alpha: { from: 0.7, to: 1 }, duration: 380, yoyo: true, repeat: -1 });
}

/** Start/finish towers with checkered flags on both sides of the line (depth 30, above karts). */
export function buildGantry(scene: Phaser.Scene, t: Track) {
  const g = scene.add.graphics().setDepth(30);
  const H = 78;
  for (const side of [-1, 1]) {
    const p = pointAt(t, 0, side * (t.hw[0] + 34));
    g.fillStyle(0x000000, 0.2); g.fillEllipse(p.x + 16, p.y + 8, 34, 16);
    g.fillStyle(0x3a3d55, 1); g.fillRect(p.x - 6, p.y - H, 12, H);
    g.fillStyle(0x5b6088, 1); g.fillRect(p.x - 6, p.y - H, 4, H);
    g.fillStyle(0xffd31a, 1); g.fillCircle(p.x, p.y - H, 6);
    // checkered flag (4 x 3)
    const fx = p.x + 6, fy = p.y - H + 2, sq = 9;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      g.fillStyle((r + c) % 2 ? 0x1b1a22 : 0xffffff, 1);
      const wave = Math.sin(c * 0.9) * 3;
      g.fillRect(fx + c * sq, fy + r * sq + wave, sq, sq);
    }
  }
}
