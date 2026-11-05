import type { RosterPlayer } from '../game/network/GameConnection';
export function PlayerList({ players, localId }: { players: RosterPlayer[]; localId?: string }) {
  return (
    <ul className="player-list">
      {players.map((player, index) => (
        <li key={player.id} className={!player.connected ? 'player-away' : ''}>
          <span className="player-number">{String(index + 1).padStart(2, '0')}</span>
          <span
            className="avatar"
            style={{ '--player-color': player.color } as React.CSSProperties}
          >
            {player.nickname.slice(0, 1).toUpperCase()}
          </span>
          <span className="player-name">
            {player.nickname}
            {localId === player.id && <small>you</small>}
          </span>
          <span className="player-state">
            {player.connected ? (
              <>
                <i />
                Ready
              </>
            ) : (
              'Reconnecting'
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
