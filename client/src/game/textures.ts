// ---------------------------------------------------------------------------
// Procedural, original kart art rendered with "sprite stacking": each kart is
// a pile of horizontal slices drawn on top of each other and offset upwards,
// which reads as a chunky 3D toy kart from a 3/4 top-down camera — and still
// rotates freely in any direction.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { KART_COLORS, type KartColor } from '../../../shared/constants';

export const KART_W = 56;
export const KART_H = 38;
export const KART_LAYERS = 11;
/** Vertical pixel offset between slices (world px). */
export const LAYER_STEP = 1.55;

function shade(c: number, f: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

const TIRE = 0x1d1c24, TIRE_HI = 0x3a3946, RIM = 0xd7d9e4, SUIT = 0xf2f2f7, SEAT = 0x23222c;

/** Draws one horizontal slice of the kart (kart faces +x, centred in the texture). */
function slice(g: Phaser.GameObjects.Graphics, layer: number, c: KartColor) {
  const H = KART_H, cy = H / 2;
  const body = c.fill, dark = c.dark, light = shade(c.fill, 1.25), out = c.outline;
  const tires = (col: number, inset = 0) => {
    g.fillStyle(col, 1);
    g.fillRoundedRect(6 + inset, 1 + inset, 15 - inset * 2, 8 - inset, 3);
    g.fillRoundedRect(6 + inset, H - 9, 15 - inset * 2, 8 - inset, 3);
    g.fillRoundedRect(38 + inset, 3 + inset, 12 - inset * 2, 7 - inset, 3);
    g.fillRoundedRect(38 + inset, H - 10, 12 - inset * 2, 7 - inset, 3);
  };
  switch (layer) {
    case 0: tires(TIRE); g.fillStyle(0x15141b, 1); g.fillRoundedRect(8, 9, 40, H - 18, 6); break;
    case 1: tires(TIRE); g.fillStyle(shade(dark, 0.7), 1); g.fillRoundedRect(7, 8, 44, H - 16, 7); break;
    case 2: tires(TIRE_HI); g.fillStyle(dark, 1); g.fillRoundedRect(5, 8, 47, H - 16, 8);
      g.fillTriangle(48, 11, 56, cy, 48, H - 11); break;
    case 3: tires(TIRE_HI); g.fillStyle(RIM, 1);
      g.fillCircle(13.5, 5, 2.2); g.fillCircle(13.5, H - 5, 2.2); g.fillCircle(44, 6.5, 2); g.fillCircle(44, H - 6.5, 2);
      g.fillStyle(body, 1); g.fillRoundedRect(5, 10, 46, H - 20, 8); g.fillTriangle(48, 12, 56, cy, 48, H - 12);
      g.fillStyle(dark, 1); g.fillRoundedRect(17, 7, 18, 5, 2); g.fillRoundedRect(17, H - 12, 18, 5, 2); break;
    case 4: tires(TIRE, 1);
      g.fillStyle(body, 1); g.fillRoundedRect(6, 10, 44, H - 20, 8); g.fillTriangle(46, 12, 55, cy, 46, H - 12);
      g.fillStyle(dark, 1); g.fillRoundedRect(17, 7, 18, 5, 2); g.fillRoundedRect(17, H - 12, 18, 5, 2);
      g.fillStyle(0xffffff, 0.9); g.fillRoundedRect(46, cy - 3, 6, 6, 2); break; // number plate
    case 5:
      g.fillStyle(light, 1); g.fillRoundedRect(8, 11, 40, H - 22, 7); g.fillTriangle(44, 13, 53, cy, 44, H - 13);
      g.fillStyle(0xffffff, 0.85); g.fillRoundedRect(12, cy - 2, 34, 4, 2);             // racing stripe
      g.fillStyle(SEAT, 1); g.fillRoundedRect(16, cy - 6, 14, 12, 4);                   // cockpit
      g.fillStyle(dark, 1); g.fillRect(3, 9, 4, H - 18); break;                          // spoiler struts
    case 6:
      g.fillStyle(SUIT, 1); g.fillRoundedRect(17, cy - 5, 11, 10, 4);                   // driver torso
      g.fillStyle(dark, 1); g.fillRoundedRect(25, cy - 7, 8, 3, 1); g.fillRoundedRect(25, cy + 4, 8, 3, 1); // arms
      g.fillStyle(0x222228, 1); g.fillRoundedRect(31, cy - 5, 3, 10, 1);                // steering wheel
      g.fillStyle(dark, 1); g.fillRect(3, 9, 4, H - 18); break;
    case 7:
      g.fillStyle(SUIT, 1); g.fillRoundedRect(18, cy - 5, 9, 10, 4);
      g.fillStyle(shade(dark, 0.85), 1); g.fillRoundedRect(1, 5, 7, H - 10, 3);          // rear wing
      g.lineStyle(1.5, out, 0.9); g.strokeRoundedRect(1, 5, 7, H - 10, 3); break;
    case 8:
      g.fillStyle(0xffffff, 1); g.fillCircle(22, cy, 7);                                 // helmet
      g.fillStyle(body, 1); g.fillRoundedRect(1, 5, 7, H - 10, 3);
      g.fillStyle(light, 1); g.fillRoundedRect(2, 6, 3, H - 12, 2); break;
    case 9:
      g.fillStyle(0xffffff, 1); g.fillCircle(22, cy, 6.6);
      g.fillStyle(body, 1); g.fillRoundedRect(17, cy - 1.5, 11, 3, 1.5);                  // helmet stripe
      g.fillStyle(0x1a2238, 1); g.fillRoundedRect(25, cy - 4.5, 4, 9, 2); break;         // visor
    case 10:
      g.fillStyle(0xffffff, 1); g.fillCircle(21.5, cy, 4.8);
      g.fillStyle(body, 1); g.fillRoundedRect(17.5, cy - 1.5, 8, 3, 1.5);
      g.fillStyle(0xffffff, 0.8); g.fillCircle(20, cy - 2, 1.6); break;                  // shine
    default: break;
  }
  // graphite needs a contrasting rim so it reads on dark asphalt
  if (c.id === 'graphite' && (layer === 3 || layer === 5)) {
    g.lineStyle(1.5, 0xffffff, 0.95);
    g.strokeRoundedRect(layer === 3 ? 5 : 8, layer === 3 ? 10 : 11, layer === 3 ? 46 : 40, layer === 3 ? H - 20 : H - 22, 8);
  }
}

export function makeTextures(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  for (const c of KART_COLORS) {
    for (let i = 0; i < KART_LAYERS; i++) {
      g.clear();
      slice(g, i, c);
      g.generateTexture(`kart-${c.id}-${i}`, KART_W, KART_H);
    }
  }
  // soft contact shadow
  g.clear();
  for (let i = 0; i < 6; i++) { g.fillStyle(0x000000, 0.07); g.fillEllipse(34, 24, 62 - i * 6, 40 - i * 4); }
  g.generateTexture('shadow', 68, 48);
  // skid mark
  g.clear(); g.fillStyle(0x1b1b22, 1); g.fillRoundedRect(0, 0, 8, 5, 2); g.generateTexture('skid', 8, 5);
  // dust puff / spark
  g.clear(); g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 8); g.generateTexture('puff', 16, 16);
  g.clear(); g.fillStyle(0xffffff, 1); g.fillCircle(3, 3, 3); g.generateTexture('spark', 6, 6);
  // boost flame
  g.clear();
  g.fillStyle(0xff7a00, 1); g.fillTriangle(0, 10, 30, 2, 30, 18);
  g.fillStyle(0xffe14d, 1); g.fillTriangle(10, 10, 30, 5, 30, 15);
  g.fillStyle(0xffffff, 1); g.fillTriangle(20, 10, 30, 7.5, 30, 12.5);
  g.generateTexture('flame', 30, 20);
  // local player ring
  g.clear(); g.lineStyle(3, 0xffffff, 0.9); g.strokeCircle(36, 36, 33); g.generateTexture('ring', 72, 72);
  g.destroy();
}
