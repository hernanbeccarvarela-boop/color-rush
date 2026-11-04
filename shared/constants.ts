// ---------------------------------------------------------------------------
// COLOR RUSH — shared constants (used by both client and server)
// ---------------------------------------------------------------------------

/** Fixed simulation step. Client prediction and server simulation MUST match. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

/** Server -> client snapshot rate (every 3rd tick = 20 Hz). */
export const SNAPSHOT_EVERY_TICKS = 3;
/** Client -> server input batching (every 2nd client tick = 30 msgs/s, 2 inputs each). */
export const INPUT_SEND_EVERY_TICKS = 2;
/** Remote karts are rendered this far in the past and interpolated between snapshots. */
export const INTERP_DELAY_MS = 110;

export const MAX_PLAYERS = 10;
export const DEFAULT_MIN_PLAYERS = 2;
export const DEFAULT_RACE_DURATION_MS = 300_000; // exactly 5 minutes
export const COUNTDOWN_MS = 4_000; // 3..2..1..GO
export const RESULTS_AUTO_LOBBY_MS = 120_000;

export const NAME_MIN = 2;
export const NAME_MAX = 16;
export const ROOM_CODE_LEN = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Disconnected players are removed from a lobby after this grace period. */
export const LOBBY_RECONNECT_GRACE_MS = 30_000;
/** Rooms with nobody connected are destroyed after this. */
export const EMPTY_ROOM_TTL_MS = 60_000;

/** Input validation limits. */
export const MAX_INPUTS_PER_MSG = 12;
export const MAX_INPUT_QUEUE = 20;
export const MAX_MSGS_PER_SEC = 90;

/** Input bitmask. */
export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_THROTTLE = 4;
export const IN_BRAKE = 8;
export const IN_MASK_ALL = 15;

export interface KartColor {
  id: string;
  name: string;
  fill: number;
  dark: number;
  outline: number;
  css: string;
}

export const KART_COLORS: KartColor[] = [
  { id: 'red', name: 'Red', fill: 0xff3b47, dark: 0xb3121f, outline: 0x2a0a10, css: '#ff3b47' },
  { id: 'blue', name: 'Blue', fill: 0x2f7bff, dark: 0x1446a8, outline: 0x08163a, css: '#2f7bff' },
  { id: 'green', name: 'Green', fill: 0x2fd35a, dark: 0x138a33, outline: 0x06290f, css: '#2fd35a' },
  { id: 'yellow', name: 'Yellow', fill: 0xffd31a, dark: 0xc79a00, outline: 0x3a2c00, css: '#ffd31a' },
  { id: 'orange', name: 'Orange', fill: 0xff8a1f, dark: 0xc2530a, outline: 0x3a1800, css: '#ff8a1f' },
  { id: 'purple', name: 'Purple', fill: 0x9b5cff, dark: 0x5f27c4, outline: 0x1d0a40, css: '#9b5cff' },
  { id: 'cyan', name: 'Cyan', fill: 0x1fe0f0, dark: 0x0a97a8, outline: 0x032d33, css: '#1fe0f0' },
  { id: 'pink', name: 'Pink', fill: 0xff5fc8, dark: 0xc41f8a, outline: 0x3a0629, css: '#ff5fc8' },
  { id: 'white', name: 'White', fill: 0xf7f7fb, dark: 0xb9bccb, outline: 0x22242e, css: '#f7f7fb' },
  { id: 'graphite', name: 'Graphite', fill: 0x2b2e38, dark: 0x15171d, outline: 0xffffff, css: '#2b2e38' },
];

export const COLOR_IDS = KART_COLORS.map((c) => c.id);
export function colorById(id: string): KartColor {
  return KART_COLORS.find((c) => c.id === id) ?? KART_COLORS[0];
}
