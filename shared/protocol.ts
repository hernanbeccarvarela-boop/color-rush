// ---------------------------------------------------------------------------
// Network protocol (Socket.IO event payloads)
// ---------------------------------------------------------------------------

export type Phase = 'lobby' | 'countdown' | 'racing' | 'results';

export interface PublicPlayer {
  id: string;
  num: number;          // short per-room number used in snapshots
  name: string;
  color: string;
  ready: boolean;
  connected: boolean;
  inRace: boolean;      // participant of the current/last race
  isHost: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  raceId: number;
  startAt: number;      // server ms — GO moment
  endAt: number;        // server ms — official end
  raceDurationMs: number;
  maxPlayers: number;
  minPlayers: number;
  players: PublicPlayer[];
  results: RaceResult[] | null;
}

export interface RaceResult {
  rank: number;
  playerId: string;
  name: string;
  color: string;
  laps: number;
  lapPct: number;       // progress through the unfinished lap (0..1)
  bestLapMs: number;
  connected: boolean;
}

export interface Session { roomCode: string; playerId: string; token: string }

export type Ack<T> = (res: ({ ok: true } & T) | { ok: false; error: string; takenColors?: string[] }) => void;

export interface PeekResult { phase: Phase; count: number; max: number; takenColors: string[] }
export interface JoinResult { session: Session; room: RoomState }

/** Kart row in a snapshot:
 *  [0 num, 1 x, 2 y, 3 angle, 4 vx, 5 vy, 6 boost, 7 hint, 8 ack, 9 rank, 10 lap, 11 lapPct*1000, 12 flags,
 *   13 steer, 14 drift, 15 startCharge] */
export type SnapRow = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
export const FLAG_OFFROAD = 1, FLAG_DISCONNECTED = 2, FLAG_DRIFT = 4;

export interface Snapshot {
  t: number;            // server time of this state
  ph: Phase;
  k: SnapRow[];
}

/** Batched inputs: first sequence number + one bitmask per simulated tick. */
export interface InputMsg { s: number; m: number[] }
