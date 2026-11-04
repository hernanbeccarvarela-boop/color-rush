// ---------------------------------------------------------------------------
// COLOR RUSH game server: Express (static client + health) + Socket.IO.
// One fixed 60 Hz loop simulates every active room.
// ---------------------------------------------------------------------------
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import {
  DEFAULT_MIN_PLAYERS, DEFAULT_RACE_DURATION_MS, EMPTY_ROOM_TTL_MS, MAX_MSGS_PER_SEC, MAX_PLAYERS, TICK_HZ,
} from '../shared/constants';
import type { Ack, JoinResult, PeekResult, Session } from '../shared/protocol';
import { Room } from './Room';
import { cleanCode, cleanColor, cleanInput, cleanName, makeCode, RateLimiter } from './validation';

const PORT = Number(process.env.PORT ?? 3001);
const RACE_MS = process.env.RACE_DURATION_SEC ? Math.max(10, Number(process.env.RACE_DURATION_SEC)) * 1000 : DEFAULT_RACE_DURATION_MS;
const MIN_PLAYERS = process.env.MIN_PLAYERS ? Math.max(1, Math.min(MAX_PLAYERS, Number(process.env.MIN_PLAYERS))) : DEFAULT_MIN_PLAYERS;
const CORS_ORIGIN = process.env.CORS_ORIGIN; // only needed when the client is hosted on another origin
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 500);

const app = express();
const http = createServer(app);
const io = new Server(http, {
  maxHttpBufferSize: 16 * 1024,
  pingInterval: 10_000,
  pingTimeout: 8_000,
  cors: CORS_ORIGIN ? { origin: CORS_ORIGIN.split(',') } : undefined,
});

const rooms = new Map<string, Room>();
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

const hooks = {
  emitState: (room: Room) => io.to(room.code).emit('room:state', room.publicState()),
  emitSnapshot: (room: Room, snap: unknown) => io.to(room.code).volatile.emit('snap', snap),
  emitResults: (room: Room, results: unknown) => io.to(room.code).emit('race:results', results),
  log,
};

interface Conn { roomCode: string | null; playerId: string | null; limiter: RateLimiter }

function getRoomPlayer(c: Conn) {
  if (!c.roomCode || !c.playerId) return null;
  const room = rooms.get(c.roomCode);
  const player = room?.players.get(c.playerId);
  return room && player ? { room, player } : null;
}

const fail = (ack: unknown, error: string, extra: object = {}) => { if (typeof ack === 'function') ack({ ok: false, error, ...extra }); };

io.on('connection', (socket: Socket) => {
  const conn: Conn = { roomCode: null, playerId: null, limiter: new RateLimiter(MAX_MSGS_PER_SEC) };

  const guard = (): boolean => {
    if (conn.limiter.allow(Date.now())) return true;
    if (conn.limiter.violations > 200) { log(`kicking flooding socket ${socket.id}`); socket.disconnect(true); }
    return false;
  };

  const leaveCurrent = (reason: string) => {
    const rp = getRoomPlayer(conn);
    if (rp) { socket.leave(rp.room.code); rp.room.removePlayer(rp.player.id, reason); }
    conn.roomCode = null; conn.playerId = null;
  };

  const bind = (room: Room, playerId: string) => {
    conn.roomCode = room.code; conn.playerId = playerId;
    socket.join(room.code);
  };

  socket.on('time:ping', (ack: unknown) => { if (guard() && typeof ack === 'function') ack(Date.now()); });

  socket.on('room:peek', (code: unknown, ack: Ack<PeekResult>) => {
    if (!guard() || typeof ack !== 'function') return;
    const c = cleanCode(code);
    const room = c ? rooms.get(c) : undefined;
    if (!room) return ack({ ok: false, error: 'Room not found. Check the code.' });
    ack({ ok: true, phase: room.phase, count: room.size, max: MAX_PLAYERS, takenColors: room.takenColors() });
  });

  socket.on('room:create', (data: { name?: unknown; color?: unknown }, ack: Ack<JoinResult>) => {
    if (!guard() || typeof ack !== 'function') return;
    const name = cleanName(data?.name);
    const color = cleanColor(data?.color);
    if (!name) return ack({ ok: false, error: 'Name must be 2–16 letters, numbers or simple symbols.' });
    if (!color) return ack({ ok: false, error: 'Pick a valid color.' });
    if (rooms.size >= MAX_ROOMS) return ack({ ok: false, error: 'Server is full, try again later.' });
    leaveCurrent('created another room');
    const room = new Room(makeCode((c) => rooms.has(c)), hooks, RACE_MS, MIN_PLAYERS);
    rooms.set(room.code, room);
    bind(room, '');
    const p = room.addPlayer(name, color, socket.id);
    conn.playerId = p.id;
    ack({ ok: true, session: { roomCode: room.code, playerId: p.id, token: p.token }, room: room.publicState() });
  });

  socket.on('room:join', (data: { code?: unknown; name?: unknown; color?: unknown }, ack: Ack<JoinResult>) => {
    if (!guard() || typeof ack !== 'function') return;
    const code = cleanCode(data?.code);
    const name = cleanName(data?.name);
    const color = cleanColor(data?.color);
    if (!code) return ack({ ok: false, error: 'Room codes are 5 characters.' });
    if (!name) return ack({ ok: false, error: 'Name must be 2–16 letters, numbers or simple symbols.' });
    if (!color) return ack({ ok: false, error: 'Pick a valid color.' });
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: 'Room not found. Check the code.' });
    if (room.size >= MAX_PLAYERS) return ack({ ok: false, error: `Room is full (${MAX_PLAYERS}/${MAX_PLAYERS}).` });
    if (!room.isColorFree(color)) return ack({ ok: false, error: 'That color was just taken — pick another one.', takenColors: room.takenColors() });
    if (conn.roomCode === code && conn.playerId && room.players.has(conn.playerId)) return ack({ ok: false, error: 'Already in this room.' });
    leaveCurrent('joined another room');
    bind(room, '');
    const p = room.addPlayer(name, color, socket.id);
    conn.playerId = p.id;
    ack({ ok: true, session: { roomCode: room.code, playerId: p.id, token: p.token }, room: room.publicState() });
  });

  socket.on('session:resume', (data: Partial<Session>, ack: Ack<JoinResult>) => {
    if (!guard() || typeof ack !== 'function') return;
    const code = cleanCode(data?.roomCode);
    const room = code ? rooms.get(code) : undefined;
    const p = room && typeof data?.playerId === 'string' ? room.players.get(data.playerId) : undefined;
    if (!room || !p || typeof data?.token !== 'string' || data.token !== p.token) return ack({ ok: false, error: 'Session expired.' });
    if (p.connected && p.socketId && p.socketId !== socket.id) io.sockets.sockets.get(p.socketId)?.disconnect(true);
    leaveCurrent('resumed elsewhere');
    bind(room, p.id);
    room.reconnect(p, socket.id);
    log(`room ${room.code}: ${p.name} reconnected`);
    ack({ ok: true, session: { roomCode: room.code, playerId: p.id, token: p.token }, room: room.publicState() });
  });

  socket.on('player:ready', (ready: unknown) => {
    if (!guard()) return;
    const rp = getRoomPlayer(conn);
    if (rp) rp.room.setReady(rp.player.id, ready === true);
  });

  socket.on('player:color', (color: unknown, ack: Ack<object>) => {
    if (!guard() || typeof ack !== 'function') return;
    const rp = getRoomPlayer(conn);
    const c = cleanColor(color);
    if (!rp || !c) return ack({ ok: false, error: 'Invalid color.' });
    if (!rp.room.setColor(rp.player.id, c)) return ack({ ok: false, error: 'Color unavailable.', takenColors: rp.room.takenColors() });
    ack({ ok: true });
  });

  socket.on('room:start', (ack: Ack<object>) => {
    if (!guard()) return;
    const rp = getRoomPlayer(conn);
    if (!rp) return fail(ack, 'Not in a room.');
    const err = rp.room.start(rp.player.id);
    if (typeof ack === 'function') ack(err ? { ok: false, error: err } : { ok: true });
  });

  socket.on('room:rematch', (ack: Ack<object>) => {
    if (!guard()) return;
    const rp = getRoomPlayer(conn);
    if (!rp) return fail(ack, 'Not in a room.');
    const err = rp.room.rematch(rp.player.id);
    if (typeof ack === 'function') ack(err ? { ok: false, error: err } : { ok: true });
  });

  socket.on('room:toLobby', (ack: Ack<object>) => {
    if (!guard()) return;
    const rp = getRoomPlayer(conn);
    if (!rp) return fail(ack, 'Not in a room.');
    const err = rp.room.toLobby(rp.player.id);
    if (typeof ack === 'function') ack(err ? { ok: false, error: err } : { ok: true });
  });

  socket.on('room:leave', (ack: unknown) => {
    leaveCurrent('left');
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('input', (raw: unknown) => {
    if (!guard()) return;
    const msg = cleanInput(raw);
    const rp = getRoomPlayer(conn);
    if (!msg || !rp) return;
    rp.room.queueInputs(rp.player, msg.s, msg.m);
  });

  socket.on('disconnect', () => {
    const rp = getRoomPlayer(conn);
    if (rp && rp.player.socketId === socket.id) {
      log(`room ${rp.room.code}: ${rp.player.name} disconnected`);
      rp.room.markDisconnected(rp.player.id);
    }
  });
});

// ---------------------------------------------------------------- game loop
const TICK_MS = 1000 / TICK_HZ;
let acc = 0;
let last = performance.now();
setInterval(() => {
  const nowPerf = performance.now();
  acc += nowPerf - last;
  last = nowPerf;
  if (acc > 250) acc = 250; // avoid spiral of death after a stall
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    const now = Date.now();
    for (const room of rooms.values()) {
      try { room.tick(now); } catch (e) { log(`room ${room.code} tick error: ${(e as Error).stack}`); }
    }
  }
}, 4);

// abandoned-room cleanup
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.size === 0 || (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS)) {
      rooms.delete(code);
      log(`room ${code}: cleaned up`);
    }
  }
}, 5_000);

// ------------------------------------------------------------------- http
app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((a, r) => a + r.size, 0), raceMs: RACE_MS, minPlayers: MIN_PLAYERS });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = [path.resolve(here, 'client'), path.resolve(here, '../dist/client')].find((d) => existsSync(path.join(d, 'index.html')));
if (clientDir) {
  app.use(express.static(clientDir, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  log(`serving client from ${clientDir}`);
}

http.listen(PORT, () => log(`COLOR RUSH server on :${PORT} (race ${RACE_MS / 1000}s, min players ${MIN_PLAYERS})`));
