import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { RaceScene } from './RaceScene';

/** Mounts the Phaser game for the duration of a race view. */
export function GameView() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      backgroundColor: '#4fbd66',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      render: { antialias: true, powerPreference: 'high-performance' },
      fps: { target: 60 },
      input: { keyboard: false, mouse: false, touch: false },
      audio: { noAudio: true },
      banner: false,
      scene: [RaceScene],
    });
    return () => { game.destroy(true); };
  }, []);
  return <div ref={host} className="game-host" />;
}
