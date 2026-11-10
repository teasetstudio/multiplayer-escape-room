import { ARTIFACT_NAMES, LEVEL_COUNT, TEAM_STYLE, VERSE_TOTAL } from '@escape/shared';
import { useState } from 'react';
import type { ConnectionView } from '../../game/network/GameConnection';
import { artifactsOf } from './QuestUi';

function Chapter({ view }: { view: ConnectionView }) {
  const chapter = view.chapter;
  if (!chapter) return null;
  return (
    <section className="chapter" aria-label={chapter.reference}>
      <h2>{chapter.reference}</h2>
      <ol>
        {chapter.verses.map((verse) => (
          <li key={verse.number} value={verse.number}>
            {verse.text}
          </li>
        ))}
      </ol>
      <footer>
        <p>{chapter.translation}</p>
        <p>{chapter.attribution}</p>
        <p>
          {chapter.license} · {chapter.sourceUrl}
        </p>
      </footer>
    </section>
  );
}

const minutes = (seconds: number | undefined) =>
  seconds === undefined
    ? '–'
    : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** Shown only after the server has validated the final sequence. Celebrates the whole group. */
export function Victory({ view }: { view: ConnectionView }) {
  const host = view.role === 'host';
  const [reading, setReading] = useState(false);
  const me = view.players.find((player) => player.id === view.playerId);
  const artifacts = artifactsOf(me?.artifacts);
  const totalArtifacts = view.players.reduce(
    (sum, player) => sum + artifactsOf(player.artifacts).length,
    0,
  );
  const finders = [...view.players]
    .filter((player) => (player.verses ?? 0) > 0)
    .sort((a, b) => (b.verses ?? 0) - (a.verses ?? 0));
  return (
    <section className={`victory ${host ? 'victory-host' : 'victory-phone'}`} aria-label="Victory">
      <div className="victory-scroll">
        <p className="victory-brand">COMMON GROUND</p>
        <h1>YOU ESCAPED TOGETHER!</h1>
        {!host && me?.teamId && (
          <p className="victory-team" style={{ color: TEAM_STYLE[me.teamId].color }}>
            Team {me.teamId} · {TEAM_STYLE[me.teamId].name} — with the whole group
          </p>
        )}
        <ul className="victory-facts">
          <li>
            <b>{LEVEL_COUNT}</b> levels completed
          </li>
          <li>
            <b>{VERSE_TOTAL}</b> Scripture verses recovered
          </li>
          <li>Proverbs chapter 4 reconstructed in order</li>
          {host ? (
            <>
              <li>
                <b>{view.players.length}</b> players · Team A{' '}
                {view.players.filter((player) => player.teamId === 'A').length} · Team B{' '}
                {view.players.filter((player) => player.teamId === 'B').length}
              </li>
              <li>
                <b>{totalArtifacts}</b> artifacts collected
              </li>
              <li>
                Time: {minutes(view.stats?.totalSeconds)} (final puzzle{' '}
                {minutes(view.stats?.finalSeconds)})
              </li>
            </>
          ) : (
            <li>
              You discovered <b>{me?.verses ?? 0}</b> of the {VERSE_TOTAL} verses yourself
            </li>
          )}
        </ul>
        {host ? (
          <div className="victory-finders">
            <h2>Discoveries</h2>
            {finders.map((player) => (
              <span key={player.id} style={{ borderColor: player.color }}>
                {player.nickname} · {player.verses} {player.verses === 1 ? 'verse' : 'verses'}
                {artifactsOf(player.artifacts).length > 0 &&
                  ` · ${artifactsOf(player.artifacts).length} artifacts`}
              </span>
            ))}
          </div>
        ) : (
          <div className="inventory" aria-label="Your artifacts">
            {artifacts.length === 0 && <span className="panel-empty">No artifacts this time.</span>}
            {artifacts.map((kind, index) => (
              <span key={index} title={ARTIFACT_NAMES[kind]}>
                <img src={`/assets/artifacts/${kind}-icon.png`} alt={ARTIFACT_NAMES[kind]} />
              </span>
            ))}
          </div>
        )}
        <button className="parchment-button" onClick={() => setReading((value) => !value)}>
          {reading ? 'Hide the chapter' : `Read ${view.chapter?.reference ?? 'the chapter'}`}
        </button>
        {(reading || host) && <Chapter view={view} />}
      </div>
    </section>
  );
}
