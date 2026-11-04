import {
  COLOR_IDS, IN_MASK_ALL, MAX_INPUTS_PER_MSG, NAME_MAX, NAME_MIN, ROOM_CODE_ALPHABET, ROOM_CODE_LEN,
} from '../shared/constants';
import type { InputMsg } from '../shared/protocol';

const NAME_RE = /^[\p{L}\p{N} _.\-!?'#*]+$/u;

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  const len = [...name].length;
  if (len < NAME_MIN || len > NAME_MAX) return null;
  if (!NAME_RE.test(name)) return null;
  return name;
}

export function cleanColor(raw: unknown): string | null {
  return typeof raw === 'string' && COLOR_IDS.includes(raw) ? raw : null;
}

export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LEN) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function cleanInput(raw: unknown): InputMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const { s, m } = raw as { s: unknown; m: unknown };
  if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 2 ** 40) return null;
  if (!Array.isArray(m) || m.length < 1 || m.length > MAX_INPUTS_PER_MSG) return null;
  for (const v of m) if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > IN_MASK_ALL) return null;
  return { s, m: m as number[] };
}

export function makeCode(exists: (c: string) => boolean): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < ROOM_CODE_LEN; i++) c += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    if (!exists(c)) return c;
  }
}

/** Simple fixed-window per-socket message limiter. */
export class RateLimiter {
  private windowStart = 0;
  private count = 0;
  violations = 0;
  constructor(private maxPerSec: number) {}
  allow(now: number): boolean {
    if (now - this.windowStart >= 1000) { this.windowStart = now; this.count = 0; }
    this.count++;
    if (this.count > this.maxPerSec) { this.violations++; return false; }
    return true;
  }
}
