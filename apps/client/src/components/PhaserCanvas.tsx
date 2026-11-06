import type { RoomId } from '@escape/shared';
import { useEffect, useRef, useState } from 'react';
import { connection } from '../game/network/GameConnection';

export function PhaserCanvas({ scope }: { scope: 'overview' | RoomId }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let game: import('phaser').Game | undefined;
    let observer: ResizeObserver | undefined;
    void import('../game/createGame')
      .then(({ createGame }) => {
        if (cancelled || !container.current) return;
        game = createGame(container.current, connection, scope);
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
  }, [scope]);
  return (
    <div
      ref={container}
      className="phaser-container"
      aria-label={
        scope === 'overview'
          ? 'Live overview of all players'
          : 'Game world. Use the joystick to move.'
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
