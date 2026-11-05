import { MAX_PLAYERS } from '@escape/shared';
import { Brand, Arrow } from '../components/Brand';
import { PlayerList } from '../components/PlayerList';
import { QRCode } from '../components/QRCode';
import { StatusPill } from '../components/StatusPill';
import { connection, type ConnectionView } from '../game/network/GameConnection';
import { navigate } from '../hooks/useRoute';

export function LobbyPage({ view }: { view: ConnectionView }) {
  const count = view.players.filter((player) => player.connected).length;
  const host = view.role === 'host';
  const me = view.players.find((player) => player.id === view.playerId);
  const leave = () => {
    void connection.leave().finally(() => navigate('/'));
  };
  return (
    <div className={`site-shell lobby-shell ${host ? '' : 'player-lobby'}`}>
      <header className="site-header">
        <Brand small />
        <div className="header-actions">
          <span className="edition">{host ? 'HOST LOBBY' : 'PLAYER LOBBY'}</span>
          <StatusPill phase={view.phase} />
        </div>
      </header>
      <main className="lobby-main">
        <div className="lobby-heading">
          <div>
            <p className="eyebrow">
              {host ? 'BRING EVERYONE TOGETHER' : 'YOU’RE IN. GET COMFORTABLE.'}
            </p>
            <h1>
              {host ? (
                <>
                  The room is <em>yours.</em>
                </>
              ) : (
                <>
                  Hey, <em>{me?.nickname ?? 'friend'}.</em>
                </>
              )}
            </h1>
            <p className="muted">
              {host
                ? 'Get everyone connected, then start exploring.'
                : 'Waiting for the host to start. Keep this page open.'}
            </p>
          </div>
          <div className="lobby-code">
            <span>GAME CODE</span>
            <strong>{view.code}</strong>
          </div>
        </div>
        <div className="lobby-grid">
          {host ? (
            <section className="qr-panel">
              <div className="panel-label">
                <span>01 / SCAN TO JOIN</span>
                <span>↗</span>
              </div>
              <QRCode code={view.code} />
            </section>
          ) : (
            <section className="waiting-panel">
              <div className="waiting-avatar" style={{ backgroundColor: me?.color ?? '#c5f277' }}>
                {me?.nickname.slice(0, 1).toUpperCase() ?? '•'}
              </div>
              <span className="waiting-label">THIS IS YOU</span>
              <h2>
                Ready when
                <br />
                everyone is.
              </h2>
              <p>
                Your phone is your controller.
                <br />
                Turn it sideways when the game starts.
              </p>
              <div className="waiting-animation">
                <i />
                <i />
                <i />
              </div>
            </section>
          )}
          <section className="crew-panel">
            <div className="crew-heading">
              <h2>
                The crew <span>{String(count).padStart(2, '0')}</span>
              </h2>
              <span>{MAX_PLAYERS} SPOTS</span>
            </div>
            {view.players.length ? (
              <PlayerList players={view.players} localId={view.playerId} />
            ) : (
              <div className="empty-crew">
                <div>＋</div>
                <h3>Your crew starts here.</h3>
                <p>
                  Players will appear as they scan the code
                  <br />
                  and choose their nicknames.
                </p>
              </div>
            )}
            <div className="crew-footnote">
              <i />
              {count
                ? 'Everyone here shares the same map.'
                : 'The room is open. Invite your first player.'}
            </div>
          </section>
        </div>
        {view.error && (
          <p className="error-notice" role="alert">
            {view.error}
          </p>
        )}
        {!view.hostConnected && !host && (
          <p className="error-notice" role="status">
            The host is reconnecting. Hang tight.
          </p>
        )}
      </main>
      <footer className="lobby-footer">
        <button className="text-button" onClick={leave}>
          {host ? 'Close this game' : 'Leave lobby'}
        </button>
        {host ? (
          <div className="start-row">
            <span>
              {count
                ? `${count} ${count === 1 ? 'player' : 'players'} ready to explore`
                : 'Waiting for players'}
            </span>
            <button
              className="button button-primary"
              onClick={() => connection.start()}
              disabled={!count || view.phase !== 'connected'}
            >
              Start Game
              <Arrow />
            </button>
          </div>
        ) : (
          <span className="waiting-footer">
            <i /> Waiting for the host
          </span>
        )}
      </footer>
    </div>
  );
}
