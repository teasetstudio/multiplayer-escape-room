import { useState } from 'react';
import { Brand } from '../components/Brand';
import { PhaserCanvas } from '../components/PhaserCanvas';
import { StatusPill } from '../components/StatusPill';
import { connection, type ConnectionView } from '../game/network/GameConnection';
import { navigate } from '../hooks/useRoute';

async function enterFullscreen() {
  try {
    await document.documentElement.requestFullscreen?.();
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    /* Landscape layout works without either optional browser API. */
  }
}
export function GamePage({ view }: { view: ConnectionView }) {
  const host = view.role === 'host';
  const count = view.players.filter((player) => player.connected).length;
  const me = view.players.find((player) => player.id === view.playerId);
  const [fullAttempted, setFullAttempted] = useState(false);
  return (
    <main className={`play-page ${host ? 'host-game' : 'player-game'}`}>
      <header className="play-header">
        <Brand small />
        <div className="play-title">
          <strong>{host ? 'The whole picture.' : (me?.nickname ?? 'Your world.')}</strong>
          <span>{host ? 'LIVE OVERVIEW' : 'EXPLORE TOGETHER'}</span>
        </div>
        <div className="play-meta">
          <span className="connected-count">
            <b>{count}</b> <span>players</span>
          </span>
          <StatusPill phase={view.phase} />
          {!host && document.fullscreenEnabled && !fullAttempted && (
            <button
              className="small-button"
              onClick={() => {
                setFullAttempted(true);
                void enterFullscreen();
              }}
            >
              Expand
            </button>
          )}
          <button
            className="small-button"
            onClick={() => void connection.leave().finally(() => navigate('/'))}
          >
            {host ? 'End game' : 'Leave'}
          </button>
        </div>
      </header>
      <div className="game-stage">
        <PhaserCanvas overview={host} />
        <div className="map-badge">
          <i /> {host ? 'ALL PLAYERS · LIVE' : 'DRAG THE JOYSTICK TO MOVE'}
        </div>
        {!host && (
          <span className="you-badge">
            <i style={{ backgroundColor: me?.color }} /> YOU ARE {me?.nickname ?? 'HERE'}
          </span>
        )}
        {view.phase !== 'connected' && (
          <div className="connection-overlay" role="status">
            <div>
              <div className="connection-ring" />
              <h2>{view.phase === 'closed' ? 'Connection lost' : 'Finding your way back…'}</h2>
              <p>Your character is held for 60 seconds after a drop.</p>
              {view.phase === 'closed' && (
                <button
                  className="button button-primary"
                  onClick={() => void connection.retry()?.catch(() => undefined)}
                >
                  Try reconnecting
                </button>
              )}
              {view.error && <p className="error-notice">{view.error}</p>}
            </div>
          </div>
        )}
        {!host && (
          <div className="rotate-overlay">
            <svg viewBox="0 0 120 90" width="110" height="90" aria-hidden="true">
              <rect
                x="22"
                y="20"
                width="76"
                height="44"
                rx="8"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
              />
              <circle cx="87" cy="42" r="3" fill="currentColor" />
              <path
                d="M30 10c20-13 46-9 61 3m-1-10 3 12-12-1"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
            </svg>
            <h2>
              A wider world
              <br />
              is waiting.
            </h2>
            <p>
              Turn your phone sideways to play.
              <br />
              No fullscreen needed.
            </p>
          </div>
        )}
      </div>
      {host && (
        <footer className="overview-footer">
          <span>
            GAME <b>{view.code}</b>
          </span>
          <div className="legend">
            {view.players.map((player) => (
              <span key={player.id} style={{ opacity: player.connected ? 1 : 0.4 }}>
                <i style={{ backgroundColor: player.color }} />
                {player.nickname}
              </span>
            ))}
          </div>
          <span>
            LIVE EXPLORATION <i className="live-dot" />
          </span>
        </footer>
      )}
    </main>
  );
}
