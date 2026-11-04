// ---------------------------------------------------------------------------
// Client-side prediction of the local kart with server reconciliation.
// The client simulates its own inputs immediately (zero perceived latency),
// the server re-simulates them authoritatively and acknowledges the last
// applied sequence; on every snapshot we rewind to the server state and
// replay unacknowledged inputs. Visual error is smoothed out over ~150 ms.
// ---------------------------------------------------------------------------
import { INPUT_SEND_EVERY_TICKS } from '../../../shared/constants';
import { newKart, stepKart, type KartState } from '../../../shared/physics';
import { FLAG_OFFROAD, type SnapRow } from '../../../shared/protocol';
import type { Track } from '../../../shared/track';
import { net } from '../net/net';

export class Predictor {
  state: KartState;
  seq = 0;
  private pending: { seq: number; mask: number; frozen: boolean }[] = [];
  private outbox: number[] = [];
  private outboxStart = 1;
  offX = 0; offY = 0; offA = 0;
  initialised = false;
  lastCorrection = 0;

  constructor(private track: Track) {
    this.state = newKart(0, 0, 0);
  }

  initFrom(row: SnapRow) {
    this.copyRow(row);
    this.initialised = true;
  }

  private copyRow(row: SnapRow) {
    const s = this.state;
    s.x = row[1]; s.y = row[2]; s.angle = row[3]; s.vx = row[4]; s.vy = row[5]; s.boost = row[6]; s.hint = row[7];
    s.offroad = (row[12] & FLAG_OFFROAD) !== 0;
    s.steer = row[13]; s.drift = row[14]; s.startCharge = row[15];
  }

  /** Simulate one local tick and queue the input for sending. */
  tick(mask: number, frozen: boolean) {
    this.seq++;
    this.pending.push({ seq: this.seq, mask, frozen });
    if (this.pending.length > 240) this.pending.shift();
    stepKart(this.state, mask, this.track, frozen);
    if (this.outbox.length === 0) this.outboxStart = this.seq;
    this.outbox.push(mask);
    if (this.outbox.length >= INPUT_SEND_EVERY_TICKS) this.flush();
    // decay visual correction offset
    this.offX *= 0.88; this.offY *= 0.88; this.offA *= 0.85;
  }

  flush() {
    if (!this.outbox.length) return;
    net.sendInputs({ s: this.outboxStart, m: this.outbox });
    this.outbox = [];
  }

  reconcile(row: SnapRow) {
    const ack = row[8];
    if (ack > this.seq) return; // stale snapshot from a previous sequence
    while (this.pending.length && this.pending[0].seq <= ack) this.pending.shift();
    const beforeX = this.state.x, beforeY = this.state.y, beforeA = this.state.angle;
    this.copyRow(row);
    for (const p of this.pending) stepKart(this.state, p.mask, this.track, p.frozen);
    const dx = beforeX - this.state.x, dy = beforeY - this.state.y;
    let da = beforeA - this.state.angle;
    if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
    const err = Math.hypot(dx, dy);
    this.lastCorrection = err;
    if (err > 160) { this.offX = 0; this.offY = 0; this.offA = 0; return; } // teleport-size error: snap
    this.offX += dx; this.offY += dy; this.offA += da;
  }
}
