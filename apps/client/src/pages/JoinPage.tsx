import { useEffect, useState, type FormEvent } from 'react';
import { NICKNAME_MAX_LENGTH, type SessionInfo } from '@escape/shared';
import { Brand, Arrow } from '../components/Brand';
import { api } from '../game/network/config';
import { connection, connectionError } from '../game/network/GameConnection';
import { navigate } from '../hooks/useRoute';

export function JoinPage({ code, initialError }: { code: string; initialError?: string }) {
  const [nickname, setNickname] = useState('');
  const [info, setInfo] = useState<SessionInfo>();
  const [error, setError] = useState(initialError ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void api<SessionInfo>(`/api/sessions/${code}`)
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch((error) => {
        if (!cancelled) setError(connectionError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);
  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await connection.join(code, nickname);
    } catch (error) {
      setError(connectionError(error));
    } finally {
      setBusy(false);
    }
  };
  const unavailable = info && (info.status === 'playing' || info.playerCount >= info.maxPlayers);
  return (
    <div className="mobile-shell">
      <header>
        <Brand small />
        <span className="edition">PLAYER ENTRY</span>
      </header>
      <main className="join-card">
        <p className="eyebrow">YOU’RE INVITED</p>
        <h1>
          Make yourself
          <br />
          <em>known.</em>
        </h1>
        <p className="muted">Pick a nickname your friends will recognize.</p>
        <div className="session-tag">
          GAME <strong>{code}</strong>
          <span>
            {info ? `${info.playerCount} / ${info.maxPlayers} players` : 'Checking room…'}
          </span>
        </div>
        <form onSubmit={(event) => void join(event)}>
          <label htmlFor="nickname">Your nickname</label>
          <input
            id="nickname"
            autoComplete="nickname"
            autoCapitalize="words"
            placeholder="e.g. Lily"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            minLength={2}
            maxLength={NICKNAME_MAX_LENGTH}
            required
            disabled={busy || Boolean(unavailable)}
          />
          <p className="input-hint">2–18 characters. Make it yours.</p>
          {error && (
            <p role="alert" className="error-notice">
              {error}
            </p>
          )}
          {unavailable && (
            <p className="error-notice">
              {info.status === 'playing' ? 'This game has already started.' : 'This game is full.'}{' '}
              Ask the host for a new game.
            </p>
          )}
          <button
            className="button button-primary w-full"
            type="submit"
            disabled={busy || Boolean(unavailable) || !info}
          >
            {busy ? 'Joining…' : 'Join Game'}
            <Arrow />
          </button>
        </form>
        <button className="text-button" onClick={() => navigate('/')}>
          ← Use a different game code
        </button>
      </main>
      <footer>No sign-up. Your nickname stays in this game.</footer>
    </div>
  );
}
