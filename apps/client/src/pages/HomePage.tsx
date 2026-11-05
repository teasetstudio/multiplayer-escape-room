import { useState, type FormEvent } from 'react';
import { Brand, Arrow } from '../components/Brand';
import { MapPreview } from '../components/MapPreview';
import { connection, connectionError } from '../game/network/GameConnection';
import { navigate } from '../hooks/useRoute';

export function HomePage() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      navigate(`/host/${await connection.create()}`);
    } catch (error) {
      setError(connectionError(error));
    } finally {
      setBusy(false);
    }
  };
  const join = (event: FormEvent) => {
    event.preventDefault();
    if (/^[A-Z2-9]{8}$/.test(code)) navigate(`/join/${code}`);
    else setError('Enter the 8-character code shown on the big screen.');
  };
  return (
    <div className="site-shell">
      <header className="site-header">
        <Brand />
        <span className="edition">
          MULTIPLAYER LAB <span>02</span>
        </span>
      </header>
      <main className="home-main">
        <section className="home-copy">
          <p className="eyebrow">
            <span /> SAME ROOM. SHARED WORLD.
          </p>
          <h1>
            One room.
            <br />
            Everyone <em>in.</em>
          </h1>
          <p className="home-description">
            Grab your phones. Find your people.
            <br />A little world to explore, together.
          </p>
          <button
            className="button button-primary create-button"
            disabled={busy}
            onClick={() => void create()}
          >
            {busy ? 'Creating your game…' : 'Create Game'}
            <Arrow />
          </button>
          <p className="host-hint">Hosting? Open this page on the big screen.</p>
          {error && (
            <p className="error-notice" role="alert">
              {error}
            </p>
          )}
          <form className="join-code-form" onSubmit={join}>
            <label htmlFor="game-code">Already have a game code?</label>
            <div>
              <input
                id="game-code"
                placeholder="GAME CODE"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase().replace(/\s/g, '').slice(0, 8))
                }
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={8}
              />
              <button type="submit" aria-label="Join with game code">
                <Arrow />
              </button>
            </div>
          </form>
        </section>
        <section className="home-visual">
          <div className="visual-caption">
            <span>YOUR GROUP. ONE SHARED MAP.</span>
            <span>↙ SCAN & PLAY</span>
          </div>
          <MapPreview />
          <div className="feature-strip">
            <span>
              <b>01</b> Create a room
            </span>
            <span>
              <b>02</b> Scan to join
            </span>
            <span>
              <b>03</b> Move together
            </span>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>No downloads. No accounts. Just your group.</span>
        <span>
          2–20 PLAYERS <i /> PHONES + ONE BIG SCREEN
        </span>
      </footer>
    </div>
  );
}
