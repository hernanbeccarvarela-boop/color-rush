import { useEffect, useState } from 'react';
import { colorById } from '../../../shared/constants';
import { FLAG_DISCONNECTED } from '../../../shared/protocol';
import { hud } from '../game/RaceScene';
import { game, rtt, serverNow } from '../net/net';
import { me, useApp } from '../store';
import { ColorDot, fmtClock, ordinal } from './common';
import { Minimap } from './Minimap';

function useTicker(ms: number) {
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(id); }, [ms]);
}

export function Hud() {
  useTicker(100);
  const room = useApp((s) => s.room)!;
  const self = useApp((s) => me(s));
  const connected = useApp((s) => s.connected);
  const now = serverNow();
  const beforeStart = room.startAt - now;
  const remaining = room.phase === 'countdown' ? room.raceDurationMs : room.endAt - now;
  const color = self ? colorById(self.color) : null;
  const rows = game.latest?.k ?? [];
  const byNum = new Map(room.players.map((p) => [p.num, p]));
  const speedKmh = Math.round(hud.speed * 0.36);
  const lapFlash = performance.now() - hud.lapFlashAt < 1800;
  const turboFlash = performance.now() - hud.turboAt < 1100;
  const countdownNum = Math.ceil(beforeStart / 1000);

  return (
    <div className="hud" aria-live="off">
      {/* top center: timer */}
      <div className={`hud-timer ${remaining < 30_000 && room.phase === 'racing' ? 'urgent' : ''}`} data-testid="race-timer">
        <span className="label">Time left</span>
        <span className="time">{fmtClock(remaining)}</span>
        <div className="timer-bar"><div style={{ width: `${Math.max(0, Math.min(1, remaining / room.raceDurationMs)) * 100}%` }} /></div>
      </div>

      {/* top left: position, name, lap */}
      {!hud.spectating && self && color && (
        <div className="hud-pos" style={{ ['--kart' as string]: color.css }}>
          <div className="pos-big" data-testid="race-position">
            <span className="n">{hud.rank ? ordinal(hud.rank) : '—'}</span>
            <span className="of">/ {hud.total || '—'}</span>
          </div>
          <div className="pos-name"><ColorDot color={self.color} /> {self.name}</div>
          <div className="pos-lap">
            <span>LAP {Math.max(1, hud.lap)}</span>
            <div className="lap-bar"><div style={{ width: `${hud.lapPct * 100}%` }} /></div>
          </div>
        </div>
      )}

      {/* top right: leaderboard */}
      <div className="hud-board">
        <div className="board-title">Live standings</div>
        <ol>
          {rows.map((r) => {
            const p = byNum.get(r[0]);
            if (!p) return null;
            const isMe = p.id === self?.id;
            return (
              <li key={r[0]} className={`${isMe ? 'me' : ''} ${(r[12] & FLAG_DISCONNECTED) ? 'offline' : ''}`}>
                <span className="rk">{r[9]}</span>
                <ColorDot color={p.color} size={12} />
                <span className="nm">{p.name}</span>
                <span className="lp">L{Math.max(1, r[10])}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* bottom left: minimap */}
      <div className="hud-map"><Minimap /></div>

      {/* bottom right: speed */}
      {!hud.spectating && (
        <div className={`hud-speed ${hud.boost ? 'boost' : ''}`}>
          <span className="v">{speedKmh}</span><span className="u">km/h</span>
          <div className="speed-bar"><div style={{ width: `${Math.min(1, hud.speed / 650) * 100}%` }} /></div>
          <div className={`drift-meter lvl${hud.driftLevel}`} aria-label="Drift charge">
            <span>DRIFT</span><i /><i /><i />
          </div>
        </div>
      )}

      {/* center overlays */}
      {beforeStart > 0 && beforeStart <= 3000 && (
        <div className="big-count" key={countdownNum}>{countdownNum}</div>
      )}
      {beforeStart > 3000 && <div className="big-count get-ready">Get ready!</div>}
      {beforeStart <= 0 && beforeStart > -900 && <div className="big-count go">GO!</div>}
      {room.phase === 'racing' && remaining <= 10_000 && remaining > 0 && (
        <div className="final-count" key={Math.ceil(remaining / 1000)}>{Math.ceil(remaining / 1000)}</div>
      )}
      {lapFlash && <div className="toast lap-toast">LAP {hud.lap}!</div>}
      {turboFlash && !lapFlash && <div className="toast turbo-toast" key={hud.turboAt}>{hud.turboText}</div>}
      {hud.offroad && !hud.spectating && beforeStart <= 0 && <div className="toast warn">Off track — get back on the asphalt!</div>}
      {hud.spectating && (
        <div className="spectate-banner">
          Race in progress — you&rsquo;ll join the next race.{hud.followName && <> Watching the leader: <b>{hud.followName}</b></>}
        </div>
      )}
      {beforeStart > 0 && !hud.spectating && (
        <div className="controls-hint">
          <kbd>SPACE</kbd> accelerate · <kbd>←</kbd><kbd>→</kbd> steer · <kbd>↓</kbd> brake · <kbd>ESC</kbd> menu
          <div className="tip">Tip: press SPACE right before GO for a rocket start!</div>
        </div>
      )}
      {!connected && <div className="net-banner">Connection lost — reconnecting…</div>}
      <div className="net-stats">{Math.round(rtt)} ms</div>
    </div>
  );
}
