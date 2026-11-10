import { useEffect } from 'react';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { useConnection } from './hooks/useConnection';
import { navigate, useRoute } from './hooks/useRoute';
import { connection } from './game/network/GameConnection';
import { Brand } from './components/Brand';

export function App() {
  const route = useRoute();
  const view = useConnection();
  useEffect(() => {
    const active = connection.getSnapshot();
    if (active.code && (active.code !== route.code || active.role !== route.role))
      void connection.leave();
    if (route.code) void connection.restore(route.role, route.code)?.catch(() => undefined);
  }, [route.code, route.role]);
  if (route.path === '/') return <HomePage />;
  if (route.code) {
    const ownsRoute = view.code === route.code && view.role === route.role;
    if (ownsRoute && view.status !== 'lobby') return <GamePage view={view} />;
    if (
      ownsRoute &&
      (view.phase === 'connected' || (view.phase === 'reconnecting' && Boolean(connection.room)))
    )
      return <LobbyPage view={view} />;
    if (ownsRoute && (view.phase === 'connecting' || view.phase === 'reconnecting'))
      return (
        <div className="center-page">
          <Brand />
          <div className="connection-ring" />
          <h1>Connecting your room…</h1>
          <p className="muted">One moment. We’re getting everyone together.</p>
        </div>
      );
    if (route.role === 'player')
      return (
        <JoinPage
          key={route.code}
          code={route.code}
          initialError={ownsRoute ? view.error : undefined}
        />
      );
    return (
      <div className="center-page">
        <Brand />
        <h1>{ownsRoute ? 'Let’s reconnect.' : 'This is the host’s screen.'}</h1>
        <p className="muted">
          {view.error ??
            'Host access belongs to the browser tab that created the game. Open that tab, or create a new game.'}
        </p>
        {ownsRoute && (
          <button
            className="button button-primary"
            onClick={() => void connection.retry()?.catch(() => undefined)}
          >
            Reconnect
          </button>
        )}
        <button
          className="text-button"
          onClick={() => void connection.leave().finally(() => navigate('/'))}
        >
          Back to home
        </button>
      </div>
    );
  }
  return (
    <div className="center-page">
      <Brand />
      <h1>That room isn’t here.</h1>
      <button className="button button-primary" onClick={() => navigate('/')}>
        Back to home
      </button>
    </div>
  );
}
