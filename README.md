# COLOR RUSH

A browser-based multiplayer arcade kart racer for up to **10 players per room**. Every race lasts **exactly 5 minutes**, and whoever has covered the most distance when the clock hits zero wins.

Built with React + TypeScript + Vite (UI), Phaser 3 (rendering), and Node.js + Socket.IO (an authoritative game server). All art, the track, the karts and the sounds are original and generated in code, so there are no external assets.

---

## Quick start (local)

Requires **Node.js 18+** (tested on 22).

```bash
npm install
npm run dev
```

- Game: http://localhost:5173 (Vite dev server; it proxies `/socket.io` to the game server)
- Game server: http://localhost:3001 (`/health` shows the room and player counts)

**Testing multiplayer on one machine:** open the game in two different browser windows or profiles, or in a normal window plus a private window. One player clicks **Create room**, and the other enters the 5-letter room code (or opens the invite link). Sessions live in `sessionStorage`, so each tab counts as a separate player.

**Testing from other devices on your LAN:** Vite prints a `Network:` URL. Open it on another computer or phone that is on the same Wi-Fi.

### Production build (one process)

```bash
npm run build      # typecheck + client bundle (dist/client) + server bundle (dist/server.mjs)
npm start          # serves the game AND the client on PORT (default 3001)
```

### Handy environment variables (server)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP + WebSocket port |
| `RACE_DURATION_SEC` | `300` | Race length. Leave at 300 for real races; lower it only for testing |
| `MIN_PLAYERS` | `2` | Minimum connected players needed to start. Set it to `1` to practise solo |
| `CORS_ORIGIN` | (none) | Comma-separated origins, only needed if the client is hosted on a different domain |
| `MAX_ROOMS` | `500` | Safety cap |

Client: `VITE_SERVER_URL` (build-time) points the client at a separately hosted server.

Example solo practice: `MIN_PLAYERS=1 npm run dev:server` in one terminal and `npm run dev:client` in another.

---

## Controls

| Key | Action |
|---|---|
| **SPACE** | Accelerate (primary) |
| ← / → | Steer |
| ↑ | Also accelerates |
| ↓ | Brake, then reverse |
| Hold ←/→ in a corner | Drift; release for a mini-turbo (blue → orange sparks) |
| SPACE just before GO | Rocket start |
| ESC | Local menu (sound, controls, leave). The shared race **does not** pause |

While racing, arrow keys and Space never scroll the page. A tutorial appears in the lobby the first time you play.

---

## Tests

```bash
npm run typecheck
npm run test:unit        # physics determinism, barrier, freeze, laps, anti-shortcut, reverse-lap, rocket start, mini-turbo
npm run test:feel        # offline driving benchmark: novice/casual/drifter/careful autopilots → lap times, wall hits, turbos
npm run test:bots        # starts a real server and runs 10 autopilot bots through a full race lifecycle
MIN_PLAYERS=1 RACE_DURATION_SEC=60 PORT=3002 npm start &   # then:
npm run test:prediction  # checks that client prediction matches the server (error ≈ 0 px)
```

`test:bots` checks name, color and input validation, duplicate-color rejection, a 10-player room, rejection of an 11th player, unique IDs, host-only and ready-gated start, no double start, the authoritative 300 s/override duration, late joiners waiting as spectators, real karts moving at speed, 20 Hz snapshots, disconnect handling, input-flood kicking, identical results for every client, results ordered by progress, rematch (late joiner included, identities and colors preserved), and host migration.

---

## Architecture

```
shared/        ← used by BOTH client and server
  constants.ts   tick rates, limits, 10 kart colors
  track.ts       "Prism Park" circuit: Catmull-Rom centerline, projection, grid, boost pads, scenery
  physics.ts     deterministic kart physics (accel, max speed, friction, steering, drift, sand, barriers)
  progress.ts    checkpoint regions, laps, ranking score
  protocol.ts    Socket.IO payload types
server/
  index.ts       Express + Socket.IO, handlers, 60 Hz fixed loop, room cleanup, static hosting
  Room.ts        lobby state, race lifecycle, authoritative simulation, snapshots, results
  validation.ts  name/color/code/input validation, rate limiter
client/src/
  net/net.ts     socket, clock sync, session resume, actions, snapshot buffer
  game/          Phaser scene, client prediction, track art, kart textures
  ui/            Home, Lobby, HUD, Minimap, Results, overlays (React)
```

### Networking model

| Item | Rate / approach |
|---|---|
| Server simulation | 60 Hz fixed step (`DT = 1/60`) for every room |
| Snapshots (server → clients) | 20 Hz, sent as volatile messages (a late snapshot is dropped, not queued) |
| Input (client → server) | 30 messages/s, each carrying 2 tick inputs as 4-bit masks |
| Remote karts | Interpolated 110 ms in the past between snapshots, with short extrapolation |
| Local kart | Client-side prediction plus server reconciliation (rewind to the server state, replay unacknowledged inputs, smooth out visual error) |
| Clock | Ping-based offset (lowest-RTT sample). Countdown, timer and race end come from **server timestamps** (`startAt`, `endAt`) |

**Fairness and anti-cheat:**

- Clients only ever send button states. Positions, laps, rankings and results are computed by the server.
- A per-player step credit (+1 per server tick, −1 per applied input) caps the simulation rate, so sending extra inputs cannot make a kart faster.
- Malformed payloads are dropped. Per-socket rate limiting kicks persistent flooders. Socket.IO payloads are capped at 16 KB.
- Lap counting uses **16 sequential checkpoint regions**. Skipping a region gives no credit, and driving backwards over the line removes the lap. Ranking = laps, then validated distance, then the time the position was reached (tie-break).
- Only the server ends the race (`now ≥ endAt`). After that it stops accepting progress and sends everyone the same results.

**Lifecycle:** `lobby → countdown (4 s) → racing (300 s) → results`. From results, the host can start a **Rematch** in the same room (the grid is the reverse of the last finishing order), or go **Back to lobby**. If the host does nothing, the room returns to the lobby automatically after 2 minutes.

**Connections:**

- Reconnect with a secret session token (works after a page reload).
- Disconnected racers keep their kart, which coasts to a stop, until the race ends.
- Disconnected players are removed from the lobby after 30 s.
- The host role migrates to the next connected player.
- Empty rooms are deleted after 60 s.
- Late joiners watch the race (the camera follows the leader) and join the next one.

---

## Deployment

The game needs a **persistent Node.js process with WebSocket support**. Serverless platforms that only run short functions (Vercel or Netlify functions, for example) are not suitable for the game server. Room state lives in memory in one process.

Step-by-step guide in Spanish: see **PUBLICAR.md**.

**Option A: single service (recommended).** One process serves the client and the game server.

- **Render:** push to GitHub, then *New → Blueprint* (uses `render.yaml`), or create a *Web Service* with the build command `npm ci --include=dev && npm run build` and the start command `npm start`.
- **Railway / Fly.io / any VPS / Docker:**
  ```bash
  docker build -t color-rush .
  docker run -p 3001:3001 color-rush
  ```

**Option B: split hosting.** Host `dist/client` on a static host and the server somewhere else.

1. Build the client with `VITE_SERVER_URL=https://your-server.example.com`.
2. Run the server with `CORS_ORIGIN=https://your-static-site.example.com`.

**Scaling note:** one Node process comfortably handles many rooms; the simulation is about 10 karts × 60 Hz per room. If you scale horizontally, use sticky sessions and route every member of a room to the same instance (for example by room code). The Socket.IO Redis adapter alone is not enough, because room simulation state is in memory.

---

## Status: what's in the MVP and what's next

**Implemented and tested:** every item in the acceptance criteria. That covers names and colors, rooms of up to 10, Space + arrow controls, near-real-time remote karts, the 300 s authoritative timer, live rankings, identical results for everyone, rematch, and a documented build and deploy.

**Known limitations / next steps:**

- Kart-to-kart collisions are resolved on the server only. The local client corrects smoothly after a bump instead of predicting it.
- One track ("Prism Park"). The track system is data-driven (control points + widths), so adding tracks is straightforward.
- No items or power-ups yet beyond boost pads. No touch/gamepad controls yet (keyboard only, as specified).
- Rooms are in memory, so they are lost if the server restarts. Use one instance per room shard (see the scaling note).
- Sounds are simple synthesized effects. The music slot is open.
