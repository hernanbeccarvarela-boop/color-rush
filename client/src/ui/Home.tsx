import { useEffect, useMemo, useState } from 'react';
import { KART_COLORS, NAME_MAX, NAME_MIN, ROOM_CODE_LEN, colorById } from '../../../shared/constants';
import type { PeekResult } from '../../../shared/protocol';
import { sfx } from '../audio';
import { net } from '../net/net';
import { useApp } from '../store';
import { ColorPicker, KartPreview, Logo } from './common';

function initialName() { try { return localStorage.getItem('colorrush.name') ?? ''; } catch { return ''; } }
function initialColor() {
  try { const c = localStorage.getItem('colorrush.color'); if (c && KART_COLORS.some((k) => k.id === c)) return c; } catch { /* ignore */ }
  return KART_COLORS[Math.floor(Math.random() * KART_COLORS.length)].id;
}

export function Home() {
  const connected = useApp((s) => s.connected);
  const urlCode = useMemo(() => new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, ROOM_CODE_LEN) ?? '', []);
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [mode, setMode] = useState<'create' | 'join'>(urlCode ? 'join' : 'create');
  const [code, setCode] = useState(urlCode);
  const [peek, setPeek] = useState<PeekResult | null>(null);
  const [peekErr, setPeekErr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const trimmed = name.replace(/\s+/g, ' ').trim();
  const nameLen = [...trimmed].length;
  const nameOk = nameLen >= NAME_MIN && nameLen <= NAME_MAX;
  const taken = mode === 'join' && peek ? peek.takenColors : [];
  const full = !!peek && peek.count >= peek.max;

  // look up the room as soon as a full code is typed
  useEffect(() => {
    setPeek(null); setPeekErr('');
    if (mode !== 'join' || code.length !== ROOM_CODE_LEN || !connected) return;
    let alive = true;
    void net.peek(code).then((r) => {
      if (!alive) return;
      if (r.ok) setPeek(r); else setPeekErr(r.error);
    });
    return () => { alive = false; };
  }, [code, mode, connected]);

  // if my color is taken in that room, move to the first free one
  useEffect(() => {
    if (taken.includes(color)) {
      const free = KART_COLORS.find((c) => !taken.includes(c.id));
      if (free) setColor(free.id);
    }
  }, [taken, color]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    sfx.unlock();
    setError('');
    if (!nameOk) { setError(`Name must be ${NAME_MIN}–${NAME_MAX} characters.`); return; }
    try { localStorage.setItem('colorrush.name', trimmed); localStorage.setItem('colorrush.color', color); } catch { /* ignore */ }
    setBusy(true);
    const res = mode === 'create' ? await net.create(trimmed, color) : await net.join(code, trimmed, color);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (res.takenColors && peek) setPeek({ ...peek, takenColors: res.takenColors });
    } else if (mode === 'join' && urlCode) {
      history.replaceState(null, '', location.pathname);
    }
  }

  const canSubmit = connected && nameOk && !busy && (mode === 'create' || (!!peek && !full && !taken.includes(color)));

  return (
    <div className="screen home">
      <div className="home-bg" aria-hidden />
      <div className="home-card">
        <Logo />
        <p className="tagline">Up to 10 racers. 5 minutes. Most distance wins.</p>
        <form onSubmit={submit} className="home-form">
          <div className="home-cols">
            <div className="home-left">
              <label className="field">
                <span>Your racer name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, NAME_MAX + 4))}
                  placeholder="e.g. Turbo Taco"
                  maxLength={NAME_MAX + 4}
                  autoFocus
                  aria-invalid={!!name && !nameOk}
                />
                <small className={name && !nameOk ? 'bad' : ''}>{nameLen}/{NAME_MAX} · at least {NAME_MIN}</small>
              </label>
              <div className="field">
                <span>Kart color</span>
                <ColorPicker value={color} taken={taken} onChange={setColor} />
              </div>
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create room</button>
                <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>Join with code</button>
              </div>
              {mode === 'join' && (
                <label className="field">
                  <span>Room code</span>
                  <input
                    className="code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN))}
                    placeholder="ABCDE"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <small className={peekErr || full ? 'bad' : ''}>
                    {peekErr || (peek
                      ? full ? `Room is full (${peek.count}/${peek.max})`
                        : `${peek.count}/${peek.max} racers · ${peek.phase === 'lobby' ? 'waiting in lobby' : 'race in progress — you’ll join the next race'}`
                      : code.length === ROOM_CODE_LEN ? 'Looking up room…' : 'Ask the host for the 5-character code')}
                  </small>
                </label>
              )}
            </div>
            <div className="home-right">
              <div className="preview-stage" style={{ ['--kart' as string]: colorById(color).css }}>
                <KartPreview color={color} size={220} spin />
                <div className="preview-name">{trimmed || 'Your name'}</div>
                <div className="preview-color">{colorById(color).name}</div>
              </div>
            </div>
          </div>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn primary big" disabled={!canSubmit}>
            {busy ? 'Connecting…' : mode === 'create' ? 'Create room & enter lobby' : 'Join room'}
          </button>
          {!connected && <div className="hint">Connecting to the game server…</div>}
        </form>
      </div>
    </div>
  );
}
