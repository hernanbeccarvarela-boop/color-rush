import { useEffect, useRef, useState } from 'react';
import { KART_COLORS } from '../../../shared/constants';
import { sfx } from '../audio';
import { net } from '../net/net';
import { me, useApp } from '../store';
import { ColorDot, fmtLap, KartPreview, Logo, ordinal } from './common';

function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext('2d')!;
    const resize = () => { c.width = innerWidth; c.height = innerHeight; };
    resize(); addEventListener('resize', resize);
    const cols = KART_COLORS.slice(0, 8).map((k) => k.css);
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * innerWidth, y: -Math.random() * innerHeight, vy: 1.5 + Math.random() * 3, vx: (Math.random() - 0.5) * 1.5,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2, w: 6 + Math.random() * 8, c: cols[Math.floor(Math.random() * cols.length)],
    }));
    let raf = 0; const t0 = performance.now();
    const loop = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      const fade = Math.max(0, 1 - (performance.now() - t0 - 5000) / 2000);
      ctx.globalAlpha = fade;
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        if (p.y > c.height + 20 && fade > 0.9) { p.y = -20; p.x = Math.random() * c.width; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); ctx.restore();
      }
      if (fade > 0) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden />;
}

export function Results() {
  const room = useApp((s) => s.room)!;
  const results = useApp((s) => s.results) ?? [];
  const self = useApp((s) => me(s));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { sfx.finish(); }, []);

  const mine = results.find((r) => r.playerId === self?.id);
  const podium = [results[1], results[0], results[2]];
  const connectedCount = room.players.filter((p) => p.connected).length;

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError('');
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Something went wrong');
  }

  return (
    <div className="screen results">
      <Confetti />
      <div className="results-card">
        <Logo small />
        <h2 className="results-title">{results[0] ? <><span style={{ color: KART_COLORS.find((c) => c.id === results[0].color)?.css }}>{results[0].name}</span> wins!</> : 'Race over'}</h2>
        {mine && <p className="results-sub">You finished <b>{ordinal(mine.rank)}</b> of {results.length} · {mine.laps} lap{mine.laps === 1 ? '' : 's'} + {Math.round(mine.lapPct * 100)}%</p>}
        {!mine && <p className="results-sub">You joined mid-race — you&rsquo;re in the next one.</p>}

        <div className="podium">
          {podium.map((r, i) => r ? (
            <div key={r.playerId} className={`podium-step p${r.rank}`}>
              {r.rank === 1 && <div className="trophy" aria-hidden>🏆</div>}
              <KartPreview color={r.color} size={r.rank === 1 ? 110 : 84} />
              <div className="pd-name">{r.name}</div>
              <div className="pd-block"><span>{r.rank}</span></div>
            </div>
          ) : <div key={`e${i}`} className="podium-step empty" />)}
        </div>

        <table className="results-table" data-testid="results-table">
          <thead><tr><th>#</th><th>Racer</th><th>Laps</th><th>Progress</th><th>Best lap</th></tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.playerId} className={r.playerId === self?.id ? 'me' : ''}>
                <td className="rk">{ordinal(r.rank)}</td>
                <td><ColorDot color={r.color} /> {r.name}{!r.connected && <span className="muted small"> (disconnected)</span>}</td>
                <td>{r.laps}</td>
                <td><div className="mini-bar"><div style={{ width: `${r.lapPct * 100}%` }} /></div></td>
                <td>{fmtLap(r.bestLapMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="results-actions">
          {self?.isHost ? (
            <>
              <button className="btn primary big" data-testid="rematch" disabled={busy || connectedCount < room.minPlayers} onClick={() => act(net.rematch)}>Rematch</button>
              <button className="btn ghost" disabled={busy} onClick={() => act(net.toLobby)}>Back to lobby</button>
            </>
          ) : (
            <div className="hint">Waiting for the host to start a rematch or return to the lobby…</div>
          )}
          <button className="btn ghost" onClick={() => void net.leave()}>Leave room</button>
        </div>
        {self?.isHost && connectedCount < room.minPlayers && <div className="hint">Need at least {room.minPlayers} connected racers for a rematch.</div>}
        {error && <div className="error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
