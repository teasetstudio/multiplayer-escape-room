import { DEFAULT_MAP, TEAM_STYLE, type TeamState } from '@escape/shared';
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
function roomName(team: TeamState) {
  return DEFAULT_MAP.rooms.find((room) => room.id === team.roomId)?.name ?? team.roomId;
}

function TeamOverview({ view }: { view: ConnectionView }) {
  return (
    <footer className="overview-footer" aria-label="Team status">
      {view.teams.map((team) => {
        const players = view.players.filter((player) => player.teamId === team.id);
        const online = players.filter((player) => player.connected).length;
        return (
          <section className="team-status" key={team.id} aria-label={`Team ${team.id}`}>
            <div className="team-status-heading">
              <strong style={{ color: TEAM_STYLE[team.id].color }}>
                Team {team.id} · {TEAM_STYLE[team.id].name}
              </strong>
              <span>{roomName(team)}</span>
              <span>
                {online} / {players.length} online
              </span>
            </div>
            <div className="legend">
              {players.map((player) => (
                <span key={player.id} style={{ opacity: player.connected ? 1 : 0.55 }}>
                  <i style={{ backgroundColor: player.color }} />
                  {player.nickname}
                  {!player.connected && ' (offline)'}
                </span>
              ))}
            </div>
          </section>
        );
      })}
    </footer>
  );
}
export function GamePage({ view }: { view: ConnectionView }) {
  const host = view.role === 'host';
  const count = view.players.filter((player) => player.connected).length;
  const me = view.players.find((player) => player.id === view.playerId);
  const team = view.teams.find((entry) => entry.id === me?.teamId);
  const scope = host ? 'overview' : team?.roomId;
  const [fullAttempted, setFullAttempted] = useState(false);
  return (
    <main className={`play-page ${host ? 'host-game' : 'player-game'}`}>
      <header className="play-header">
        <Brand small />
        <div className="play-title">
          <strong>{host ? 'The whole picture.' : (me?.nickname ?? 'Your world.')}</strong>
          <span>{host ? 'LIVE OVERVIEW' : 'EXPLORE TOGETHER'}</span>
        </div>
        {!host && team && (
          <strong className="team-badge" style={{ color: TEAM_STYLE[team.id].color }}>
            Team {team.id} <span>· {roomName(team)}</span>
          </strong>
        )}
        <div className="play-meta">
          <span className="connected-count">
            <b>{count}</b> <span>{host ? 'players online' : 'on your team online'}</span>
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
        {scope ? (
          <PhaserCanvas scope={scope} />
        ) : (
          <p className="canvas-error" role="status">
            Joining your team…
          </p>
        )}
        <div className="map-badge">
          <i /> {host ? `THE TWIN VAULTS · ${view.code}` : 'DRAG THE JOYSTICK TO MOVE'}
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
      {host && <TeamOverview view={view} />}
    </main>
  );
}
