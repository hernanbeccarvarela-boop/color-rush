import { useEffect } from 'react';
import { GameView } from './game/GameView';
import { me, store, useApp } from './store';
import { Home } from './ui/Home';
import { Hud } from './ui/Hud';
import { Lobby } from './ui/Lobby';
import { PauseOverlay, Tutorial } from './ui/Overlays';
import { Results } from './ui/Results';

export function App() {
  const session = useApp((s) => s.session);
  const room = useApp((s) => s.room);
  const connected = useApp((s) => s.connected);
  const inRace = useApp((s) => me(s)?.inRace ?? false);
  const phase = room?.phase;
  const racing = phase === 'countdown' || phase === 'racing';

  // ESC opens the local menu during a race (never pauses the shared race)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = store.get();
      if (s.showTutorial) { store.set({ showTutorial: false }); return; }
      if (s.room && (s.room.phase === 'racing' || s.room.phase === 'countdown')) store.set({ paused: !s.paused });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (!racing) store.set({ paused: false }); }, [racing]);

  let content;
  if (!session || !room) content = <Home />;
  else if (phase === 'lobby') content = <Lobby />;
  else if (phase === 'results') content = <Results />;
  else content = (
    <div className={`screen race ${inRace ? '' : 'spectator'}`}>
      <GameView />
      <Hud />
      <PauseOverlay />
    </div>
  );

  return (
    <>
      {content}
      <Tutorial />
      {session && !connected && !racing && <div className="net-banner">Connection lost — reconnecting…</div>}
    </>
  );
}
