// ---------------------------------------------------------------------------
// Client networking: Socket.IO connection, clock sync, session resume,
// lobby actions, and the snapshot buffer consumed by the race scene.
// ---------------------------------------------------------------------------
import { io, type Socket } from 'socket.io-client';
import type {
  InputMsg, JoinResult, PeekResult, RaceResult, RoomState, Session, Snapshot,
} from '../../../shared/protocol';
import { store } from '../store';

const SESSION_KEY = 'colorrush.session';

const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
export const socket: Socket = io(serverUrl ?? '/', {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

// ------------------------------------------------------------------ clock
let clockOffset = 0;   // serverTime ≈ Date.now() + clockOffset
let bestRtt = Infinity;
export let rtt = 0;
export function serverNow(): number { return Date.now() + clockOffset; }

function ping() {
  const t0 = Date.now();
  socket.timeout(3000).emit('time:ping', (err: unknown, serverTime: number) => {
    if (err || typeof serverTime !== 'number') return;
    const t1 = Date.now();
    const r = t1 - t0;
    rtt = rtt ? rtt * 0.7 + r * 0.3 : r;
    // keep the lowest-RTT sample (least asymmetric), but let it age slowly
    bestRtt *= 1.02;
    if (r <= bestRtt) { bestRtt = r; clockOffset = serverTime - (t0 + r / 2); }
  });
}
setInterval(() => { if (socket.connected) ping(); }, 2000);

// --------------------------------------------------------- race game data
/** Mutable buffers read directly by the Phaser scene (not React state). */
export const game = {
  snaps: [] as Snapshot[],
  latest: null as Snapshot | null,
  pendingReconcile: null as Snapshot | null,
  resetCounter: 0,          // bumps when the local input sequence must restart
};

// ---------------------------------------------------------------- session
function saveSession(s: Session | null) {
  try { if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
function loadSession(): Session | null {
  try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) as Session : null; } catch { return null; }
}

function applyJoin(res: JoinResult) {
  saveSession(res.session);
  game.snaps = []; game.latest = null; game.pendingReconcile = null; game.resetCounter++;
  store.set({ session: res.session, room: res.room, results: res.room.results, error: null });
}

socket.on('connect', () => {
  store.set({ connected: true });
  bestRtt = Infinity;
  for (let i = 0; i < 4; i++) setTimeout(ping, i * 150);
  const s = loadSession();
  if (s) {
    socket.timeout(5000).emit('session:resume', s, (err: unknown, res: { ok: boolean; error?: string } & Partial<JoinResult>) => {
      if (err) return;
      if (res.ok && res.session && res.room) applyJoin(res as JoinResult);
      else { saveSession(null); store.set({ session: null, room: null, results: null }); }
    });
  }
});
socket.on('disconnect', () => store.set({ connected: false }));

socket.on('room:state', (room: RoomState) => {
  const prev = store.get().room;
  if (!prev || prev.raceId !== room.raceId) {
    game.snaps = []; game.latest = null; game.pendingReconcile = null; game.resetCounter++;
  }
  const patch: Partial<ReturnType<typeof store.get>> = { room };
  if (room.phase !== 'results') patch.results = null;
  else if (room.results) patch.results = room.results;
  store.set(patch);
});

socket.on('snap', (snap: Snapshot) => {
  game.snaps.push(snap);
  if (game.snaps.length > 40) game.snaps.shift();
  game.latest = snap;
  game.pendingReconcile = snap;
});

socket.on('race:results', (results: RaceResult[]) => store.set({ results }));

// ---------------------------------------------------------------- actions
type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string; takenColors?: string[] };

function call<T>(event: string, ...args: unknown[]): Promise<Res<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, error: 'Not connected to the game server.' });
    socket.timeout(6000).emit(event, ...args, (err: unknown, res: Res<T>) => {
      if (err) resolve({ ok: false, error: 'Server did not respond. Try again.' });
      else resolve(res);
    });
  });
}

export const net = {
  peek: (code: string) => call<PeekResult>('room:peek', code),
  async create(name: string, color: string) {
    const res = await call<JoinResult>('room:create', { name, color });
    if (res.ok) applyJoin(res);
    return res;
  },
  async join(code: string, name: string, color: string) {
    const res = await call<JoinResult>('room:join', { code, name, color });
    if (res.ok) applyJoin(res);
    return res;
  },
  setReady: (ready: boolean) => socket.emit('player:ready', ready),
  setColor: (color: string) => call('player:color', color),
  start: () => call('room:start'),
  rematch: () => call('room:rematch'),
  toLobby: () => call('room:toLobby'),
  async leave() {
    await call('room:leave');
    saveSession(null);
    game.snaps = []; game.latest = null;
    store.set({ session: null, room: null, results: null });
  },
  sendInputs(msg: InputMsg) { if (socket.connected) socket.emit('input', msg); },
};
