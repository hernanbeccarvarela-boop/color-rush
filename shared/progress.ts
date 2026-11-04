// ---------------------------------------------------------------------------
// Race progress: sequential checkpoint regions + laps. Rankings are derived
// from this (never from screen position). Server-authoritative.
// ---------------------------------------------------------------------------
import type { Track } from './track';

export interface Progress {
  lap: number;          // 0 on the grid, 1 after first crossing of the start line
  region: number;       // last validated checkpoint region
  score: number;        // monotonic-ish ranking metric (distance along valid route)
  scoreAt: number;      // time the current region was reached (tie-break)
  lapStart: number;     // server time current lap started
  bestLapMs: number;    // 0 = none
  lastLapMs: number;
}

export function newProgress(track: Track): Progress {
  return { lap: 0, region: track.checkpoints - 1, score: 0, scoreAt: 0, lapStart: 0, bestLapMs: 0, lastLapMs: 0 };
}

/** Returns true when a lap was just completed. */
export function updateProgress(p: Progress, track: Track, s: number, now: number): boolean {
  const N = track.checkpoints;
  const regionLen = track.length / N;
  const r = Math.min(N - 1, Math.floor(s / regionLen));
  let lapDone = false;
  if (r !== p.region) {
    if (r === (p.region + 1) % N) {
      if (r === 0) {
        p.lap++;
        if (p.lap >= 2 && p.lapStart > 0) {
          p.lastLapMs = now - p.lapStart;
          if (!p.bestLapMs || p.lastLapMs < p.bestLapMs) p.bestLapMs = p.lastLapMs;
          lapDone = true;
        }
        p.lapStart = now;
      }
      p.region = r;
      p.scoreAt = now;
    } else if (r === (p.region - 1 + N) % N) {
      if (p.region === 0) p.lap--; // drove back over the line
      p.region = r;
      p.scoreAt = now;
    }
    // any other jump = skipped section: ignored (no progress credited)
  }
  // clamp position inside the validated region
  const lo = p.region * regionLen, hi = lo + regionLen;
  const sEff = s < lo ? lo : s > hi ? hi : s;
  p.score = p.lap * track.length + sEff;
  return lapDone;
}

export function lapsCompleted(p: Progress): number { return Math.max(0, p.lap - 1); }

/** Fraction (0..1) of the current lap. */
export function lapFraction(p: Progress, track: Track): number {
  if (p.lap < 1) return 0;
  return Math.max(0, Math.min(1, (p.score - p.lap * track.length) / track.length));
}

export function compareProgress(a: { progress: Progress; id: string }, b: { progress: Progress; id: string }): number {
  if (b.progress.score !== a.progress.score) return b.progress.score - a.progress.score;
  if (a.progress.scoreAt !== b.progress.scoreAt) return a.progress.scoreAt - b.progress.scoreAt;
  return a.id < b.id ? -1 : 1;
}
