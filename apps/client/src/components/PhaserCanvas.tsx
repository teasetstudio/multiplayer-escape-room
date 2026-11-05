import { useEffect, useRef, useState } from 'react';
import { connection } from '../game/network/GameConnection';

export function PhaserCanvas({ overview }: { overview: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let game: import('phaser').Game | undefined;
    let observer: ResizeObserver | undefined;
    void import('../game/createGame')
      .then(({ createGame }) => {
        if (cancelled || !container.current) return;
        game = createGame(container.current, connection, overview);
        observer = new ResizeObserver(() => {
          if (container.current && game && !cancelled)
            game.scale.resize(container.current.clientWidth, container.current.clientHeight);
        });
        observer.observe(container.current);
      })
      .catch(() => {
        if (!cancelled) setError('The map could not load. Refresh this page to reconnect.');
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      game?.destroy(true);
    };
  }, [overview]);
  return (
    <div
      ref={container}
      className="phaser-container"
      aria-label={
        overview ? 'Live overview of all players' : 'Game world. Use the joystick to move.'
      }
    >
      {error && (
        <p className="canvas-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
