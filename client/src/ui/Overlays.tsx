import { net } from '../net/net';
import { store, useApp } from '../store';

function Controls() {
  return (
    <ul className="controls-list">
      <li><kbd className="wide">SPACE</kbd><span>Accelerate (main control)</span></li>
      <li><kbd>←</kbd><kbd>→</kbd><span>Steer left / right</span></li>
      <li><kbd>↑</kbd><span>Also accelerates</span></li>
      <li><kbd>↓</kbd><span>Brake, then reverse</span></li>
      <li><kbd>ESC</kbd><span>Menu (the race keeps going!)</span></li>
    </ul>
  );
}

export function Tutorial() {
  const show = useApp((s) => s.showTutorial);
  if (!show) return null;
  const close = () => { try { localStorage.setItem('colorrush.tutorial', '1'); } catch { /* ignore */ } store.set({ showTutorial: false }); };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tut-title" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="tut-title">How to race</h2>
        <Controls />
        <ul className="tips">
          <li><b>5-minute race.</b> Whoever covers the most distance when the clock hits zero wins.</li>
          <li><b>Stay on the asphalt.</b> Sand slows you down; barriers bounce you back.</li>
          <li><b>Cyan pads</b> give a short speed boost.</li>
          <li><b>Drift:</b> hold <kbd>←</kbd> or <kbd>→</kbd> through a corner at speed. Sparks turn <span style={{ color: '#45c8ff' }}>blue</span> then <span style={{ color: '#ff9a1f' }}>orange</span> — let go for a <b>mini-turbo</b>.</li>
          <li><b>Rocket start:</b> press SPACE in the last half-second before GO.</li>
          <li>Follow the arrows — <b>checkpoints</b> block shortcuts and wrong-way laps.</li>
        </ul>
        <button className="btn primary big" onClick={close} autoFocus>Got it!</button>
      </div>
    </div>
  );
}

export function PauseOverlay() {
  const paused = useApp((s) => s.paused);
  const muted = useApp((s) => s.muted);
  if (!paused) return null;
  const toggleMute = () => {
    const m = !muted;
    try { localStorage.setItem('colorrush.muted', m ? '1' : '0'); } catch { /* ignore */ }
    store.set({ muted: m });
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="modal">
        <h2 id="pause-title">Menu</h2>
        <p className="muted">The race keeps running for everyone else — your kart coasts while this is open.</p>
        <Controls />
        <div className="modal-actions">
          <button className="btn primary" onClick={() => store.set({ paused: false })} autoFocus>Resume (ESC)</button>
          <button className="btn ghost" onClick={toggleMute}>{muted ? 'Sound: off' : 'Sound: on'}</button>
          <button className="btn danger" onClick={() => { store.set({ paused: false }); void net.leave(); }}>Leave race</button>
        </div>
      </div>
    </div>
  );
}
