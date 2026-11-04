// Verifies that client-side prediction replays match the server exactly
// (reconciliation error should be ~0 when the network is healthy).
import { io } from 'socket.io-client';
import { IN_THROTTLE, IN_LEFT } from '../shared/constants';
import { newKart, stepKart } from '../shared/physics';
import type { JoinResult, RoomState, Snapshot } from '../shared/protocol';
import { getTrack } from '../shared/track';

const URL = process.env.URL ?? 'http://localhost:3002';
const t = getTrack();
const sock = io(URL, { transports: ['websocket'] });
let room: RoomState | null = null; let myNum = 0; let seq = 0; let init = false;
const k = newKart(0, 0, 0); const pending: { seq: number; m: number; f: boolean }[] = [];
const errs: number[] = [];
sock.on('room:state', (r: RoomState) => { room = r; });
sock.on('snap', (s: Snapshot) => {
  const row = s.k.find((r) => r[0] === myNum); if (!row) return;
  const set = () => { k.x = row[1]; k.y = row[2]; k.angle = row[3]; k.vx = row[4]; k.vy = row[5]; k.boost = row[6]; k.hint = row[7]; k.offroad = (row[12] & 1) !== 0; k.steer = row[13]; k.drift = row[14]; k.startCharge = row[15]; };
  if (!init) { set(); init = true; return; }
  while (pending.length && pending[0].seq <= row[8]) pending.shift();
  const bx = k.x, by = k.y; set();
  for (const p of pending) stepKart(k, p.m, t, p.f);
  if (s.ph === 'racing') errs.push(Math.hypot(bx - k.x, by - k.y));
});
sock.on('connect', () => {
  sock.emit('room:create', { name: 'Probe', color: 'red' }, (r: { ok: true } & JoinResult) => {
    myNum = r.room.players[0].num;
    sock.emit('room:start', () => {});
    let buf: number[] = []; let start = 1; let n = 0;
    const iv = setInterval(() => {
      if (!init || !room) return;
      n++;
      const m = IN_THROTTLE | (n % 120 < 25 ? IN_LEFT : 0);
      const f = Date.now() < room.startAt - 30;
      seq++; pending.push({ seq, m, f }); stepKart(k, m, t, f);
      if (!buf.length) start = seq; buf.push(m);
      if (buf.length >= 2) { sock.emit('input', { s: start, m: buf }); buf = []; }
    }, 1000 / 60);
    setTimeout(() => {
      clearInterval(iv);
      const big = errs.filter((e) => e > 1).length;
      console.log(`snapshots ${errs.length}, max err ${Math.max(...errs).toFixed(2)} px, >1px: ${big}`);
      process.exit(0);
    }, 14000);
  });
});
