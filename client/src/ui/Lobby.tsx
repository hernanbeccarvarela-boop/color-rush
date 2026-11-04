import { useEffect, useState } from 'react';
import { colorById } from '../../../shared/constants';
import { sfx } from '../audio';
import { net } from '../net/net';
import { me, store, useApp } from '../store';
import { ColorPicker, KartPreview, Logo } from './common';
import { TrackThumb } from './Minimap';

export function Lobby() {
  const room = useApp((s) => s.room)!;
  const connected = useApp((s) => s.connected);
  const self = useApp((s) => me(s));
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem('colorrush.tutorial')) store.set({ showTutorial: true }); } catch { /* ignore */ }
  }, []);

  if (!self) return null;
  const isHost = self.isHost;
  const conn = room.players.filter((p) => p.connected);
  const notReady = conn.filter((p) => !p.ready);
  const startBlock = conn.length < room.minPlayers
    ? `Need at least ${room.minPlayers} connected racers`
    : notReady.length ? `Waiting for ${notReady.map((p) => p.name).join(', ')}` : '';
  const inviteUrl = `${location.origin}${location.pathname}?room=${room.code}`;

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    setCopied(what); setTimeout(() => setCopied(''), 1600);
  }

  async function start() {
    sfx.unlock();
    setBusy(true); setError('');
    const r = await net.start();
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  async function changeColor(c: string) {
    const r = await net.setColor(c);
    if (!r.ok) setError(r.error);
  }

  const slots = Array.from({ length: room.maxPlayers }, (_, i) => room.players[i] ?? null);

  return (
    <div className="screen lobby">
      <header className="lobby-header">
        <Logo small />
        <div className="room-code-box">
          <span className="label">Room code</span>
          <span className="room-code" data-testid="room-code">{room.code}</span>
          <button className="btn ghost sm" onClick={() => copy(room.code, 'code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
          <button className="btn ghost sm" onClick={() => copy(inviteUrl, 'link')}>{copied === 'link' ? 'Copied!' : 'Copy invite link'}</button>
        </div>
        <button className="btn ghost" onClick={() => void net.leave()}>Leave room</button>
      </header>

      <div className="lobby-body">
        <section className="panel players-panel">
          <div className="panel-title">
            <h2>Racers</h2>
            <span className="count" data-testid="player-count">{room.players.length}/{room.maxPlayers}</span>
          </div>
          <ul className="player-grid">
            {slots.map((p, i) => p ? (
              <li key={p.id} className={`player-card ${p.id === self.id ? 'me' : ''} ${p.connected ? '' : 'offline'}`} style={{ ['--kart' as string]: colorById(p.color).css }}>
                <KartPreview color={p.color} size={64} />
                <div className="pc-info">
                  <div className="pc-name">
                    {p.isHost && <span className="crown" title="Host" aria-label="Host">♛</span>}
                    {p.name}{p.id === self.id && <span className="you">you</span>}
                  </div>
                  <div className="pc-status">
                    <span className={`conn ${p.connected ? 'on' : 'off'}`} />
                    {!p.connected ? 'Reconnecting…' : p.isHost ? 'Host' : p.ready ? 'Ready' : 'Not ready'}
                  </div>
                </div>
                <span className={`ready-badge ${p.ready ? 'yes' : 'no'}`}>{p.ready ? '✓' : '…'}</span>
              </li>
            ) : (
              <li key={`empty-${i}`} className="player-card empty"><span>Open slot</span></li>
            ))}
          </ul>
        </section>

        <aside className="lobby-side">
          <section className="panel start-panel">
            {isHost ? (
              <>
                <button className="btn primary big" data-testid="start-race" disabled={!!startBlock || busy || !connected} onClick={start}>
                  {busy ? 'Starting…' : 'Start race'}
                </button>
                <div className="hint">{startBlock || 'Everyone is ready — let’s go!'}</div>
              </>
            ) : (
              <>
                <button
                  className={`btn big ${self.ready ? 'ready-on' : 'primary'}`}
                  data-testid="ready-toggle"
                  onClick={() => { sfx.unlock(); net.setReady(!self.ready); }}
                >
                  {self.ready ? '✓ Ready — click to cancel' : 'I’m ready'}
                </button>
                <div className="hint">{self.ready ? 'Waiting for the host to start the race…' : 'Mark yourself ready so the host can start.'}</div>
              </>
            )}
            {error && <div className="error" role="alert">{error}</div>}
          </section>
          <section className="panel">
            <h3>Your kart</h3>
            <div className="my-kart">
              <KartPreview color={self.color} size={120} />
              <div>
                <div className="pc-name big">{self.name}</div>
                <div className="muted">{colorById(self.color).name}</div>
              </div>
            </div>
            <ColorPicker value={self.color} taken={room.players.map((p) => p.color)} onChange={changeColor} />
          </section>

          <section className="panel">
            <h3>Prism Park · 5:00 race</h3>
            <TrackThumb />
            <p className="muted small">Drive as many laps as you can in 5 minutes. Ranking = laps + distance through the current lap. Checkpoints stop shortcuts. Hit cyan pads for a boost!</p>
            <button className="btn ghost sm" onClick={() => store.set({ showTutorial: true })}>How to play</button>
          </section>

        </aside>
      </div>
    </div>
  );
}
