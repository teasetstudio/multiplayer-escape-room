import {
  ARTIFACT_NAMES,
  LEVELS,
  LEVEL_COUNT,
  TEAM_STYLE,
  VERSE_TOTAL,
  type ArtifactKind,
  type PanelMessage,
  type PuzzleView,
  type SymbolId,
} from '@escape/shared';
import { useState, type ReactNode } from 'react';
import { connection, type ConnectionView, type QuestView } from '../../game/network/GameConnection';

export const levelName = (level: number) => LEVELS[level - 1]?.name ?? '';
export function missingVerses(quest: QuestView) {
  return quest.requiredA + quest.requiredB - quest.versesA - quest.versesB;
}
/** One sentence that tells the group what still stands between them and the next level. */
export function exitMessage(quest: QuestView) {
  const missing = missingVerses(quest);
  if (quest.exitsUnlocked) return 'Exits open — each team sends someone through its door.';
  if (!quest.puzzleSolved && missing > 0)
    return `Solve the puzzle and find ${missing} more ${missing === 1 ? 'verse' : 'verses'}.`;
  if (!quest.puzzleSolved) return 'All verses found. Now solve the puzzle together.';
  return `Find ${missing} more ${missing === 1 ? 'verse' : 'verses'}.`;
}
export function artifactsOf(list: string | undefined) {
  return (list ? list.split(',') : []) as ArtifactKind[];
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="quest-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`parchment ${wide ? 'parchment-wide' : ''}`}>
        <header>
          <h2>{title}</h2>
          <button className="parchment-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="parchment-body">{children}</div>
      </div>
    </div>
  );
}

/** Phone HUD: both quest lines at a glance, in one compact strip. */
export function QuestStrip({
  view,
  onOpenCollection,
}: {
  view: ConnectionView;
  onOpenCollection: () => void;
}) {
  const { quest } = view;
  return (
    <aside className="quest-strip" aria-label="Quest progress">
      <strong>
        LEVEL {quest.level} / {LEVEL_COUNT} · {levelName(quest.level).toUpperCase()}
      </strong>
      <span className="quest-counts" aria-label="Wisdom fragments on this level">
        WISDOM FRAGMENTS: {quest.versesA + quest.versesB} / {quest.requiredA + quest.requiredB}
        <small>
          <b style={{ color: TEAM_STYLE.A.color }}>
            A {quest.versesA}/{quest.requiredA}
          </b>
          <b style={{ color: TEAM_STYLE.B.color }}>
            B {quest.versesB}/{quest.requiredB}
          </b>
        </small>
      </span>
      <span>
        Puzzle: <b>{quest.puzzleSolved ? 'SOLVED' : 'UNSOLVED'}</b> · Exit:{' '}
        <b>{quest.exitsUnlocked ? 'OPEN' : 'LOCKED'}</b>
      </span>
      <em>{exitMessage(quest)}</em>
      <button className="quest-collection" onClick={onOpenCollection}>
        <img src="/assets/artifacts/parchment-icon.png" alt="" /> {quest.versesFound} /{' '}
        {VERSE_TOTAL}
      </button>
    </aside>
  );
}

/** Host monitor: the same progress, larger, without any private information. */
export function QuestBoard({ view }: { view: ConnectionView }) {
  const { quest } = view;
  const missing = missingVerses(quest);
  const exploring = view.players.filter((player) => player.exploring);
  return (
    <aside className="quest-board" aria-label="Quest status">
      <p className="quest-level">
        LEVEL {quest.level} / {LEVEL_COUNT}
      </p>
      <h2>{levelName(quest.level).toUpperCase()}</h2>
      <h3>MAIN QUEST</h3>
      <p>
        Puzzle: <b>{quest.puzzleSolved ? 'Completed' : 'In progress'}</b>
      </p>
      <h3>WISDOM QUEST</h3>
      <p style={{ color: TEAM_STYLE.A.color }}>
        Team A: {quest.versesA} / {quest.requiredA} verses
      </p>
      <p style={{ color: TEAM_STYLE.B.color }}>
        Team B: {quest.versesB} / {quest.requiredB} verses
      </p>
      <p>
        Total: <b>{quest.versesA + quest.versesB}</b> / {quest.requiredA + quest.requiredB}
      </p>
      <p className="quest-total">
        Adventure total: {quest.versesFound} / {VERSE_TOTAL}
      </p>
      <h3>EXIT: {quest.exitsUnlocked ? 'OPEN' : 'LOCKED'}</h3>
      <p>
        {quest.exitsUnlocked
          ? `At the door — Team A: ${quest.exitA ? 'ready' : 'waiting'} · Team B: ${quest.exitB ? 'ready' : 'waiting'}`
          : missing > 0
            ? `Find ${missing} more Scripture ${missing === 1 ? 'fragment' : 'fragments'}.`
            : 'Solve the main puzzle to open the exits.'}
      </p>
      <p className="quest-minor">Artifacts collected: {quest.artifactsFound}</p>
      {exploring.length > 0 && (
        <p className="quest-minor">
          Exploring: {exploring.map((player) => player.nickname).join(', ')}
        </p>
      )}
    </aside>
  );
}

export function Toasts({ view }: { view: ConnectionView }) {
  return (
    <div className="quest-toasts" role="status" aria-live="polite">
      {view.notices.map((notice) => (
        <p key={notice.id} className={`toast toast-${notice.tone}`}>
          {notice.text}
        </p>
      ))}
    </div>
  );
}

/** The contextual action: appears only when the server says something nearby can be used. */
export function ActionButton({ view }: { view: ConnectionView }) {
  const { prompt } = view;
  if (!prompt.id || view.panel) return null;
  return (
    <div className="action-area">
      {prompt.hint && <p className="action-hint">{prompt.hint}</p>}
      <button className="action-button" onClick={() => connection.interact()}>
        <img src="/assets/ui/icon-interaction.png" alt="" />
        {prompt.label}
      </button>
    </div>
  );
}

export function VerseCard({ text, children }: { text: string; children?: ReactNode }) {
  // Deliberately no reference: the verse number is revealed only after the final puzzle.
  return (
    <article className="verse-card">
      <p>{text}</p>
      {children}
    </article>
  );
}

function ContainerPanel({ panel }: { panel: Extract<PanelMessage, { type: 'container' }> }) {
  return (
    <Modal title={panel.title} onClose={() => connection.closePanel()}>
      {panel.items.length === 0 && (
        <p className="panel-empty">Nothing left in here. It has already been searched.</p>
      )}
      {panel.items.map((item) =>
        item.kind === 'verse' ? (
          <VerseCard key={item.id} text={item.text ?? ''}>
            <button className="parchment-button" onClick={() => connection.collect(item.id)}>
              Collect this Wisdom fragment
            </button>
          </VerseCard>
        ) : (
          <article key={item.id} className="artifact-find">
            <img src={`/assets/artifacts/${item.artifact}-icon.png`} alt="" />
            <div>
              <strong>{item.artifact ? ARTIFACT_NAMES[item.artifact] : 'Artifact'}</strong>
              <span>An optional keepsake, yours to carry.</span>
            </div>
            <button className="parchment-button" onClick={() => connection.collect(item.id)}>
              Take it
            </button>
          </article>
        ),
      )}
    </Modal>
  );
}

const Glyph = ({ symbol }: { symbol: SymbolId }) => (
  <img className="glyph" src={`/assets/puzzles/symbol-${symbol}.png`} alt={symbol} />
);
const Lamp = ({ on, label }: { on: boolean; label?: string }) => (
  <span
    className={`lamp ${on ? 'lamp-on' : ''}`}
    aria-label={`${label ?? 'lamp'} ${on ? 'on' : 'off'}`}
  >
    {label}
  </span>
);
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

function CodeEntry({
  id,
  symbols,
  attempts,
}: {
  id: string;
  symbols: SymbolId[];
  attempts: number;
}) {
  const [code, setCode] = useState('');
  return (
    <>
      <p>The lock shows four symbols. Ask Team A which digit each one stands for.</p>
      <div className="glyph-row">
        {symbols.map((symbol, index) => (
          <span key={index} className="glyph-slot">
            <Glyph symbol={symbol} />
            <b>{code[index] ?? '·'}</b>
          </span>
        ))}
      </div>
      <div className="keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button key={digit} onClick={() => setCode((value) => (value + digit).slice(0, 4))}>
            {digit}
          </button>
        ))}
        <button onClick={() => setCode('')}>Clear</button>
        <button
          className="keypad-enter"
          disabled={code.length !== 4}
          onClick={() => {
            connection.puzzleAction(id, { code });
            setCode('');
          }}
        >
          Enter
        </button>
      </div>
      {attempts > 0 && <p className="panel-note">Wrong tries so far: {attempts}</p>}
    </>
  );
}

function PuzzleBody({ id, part, puzzle }: { id: string; part?: number; puzzle: PuzzleView }) {
  if (puzzle.solved)
    return <p className="panel-solved">Solved — this mechanism has done its work.</p>;
  switch (puzzle.kind) {
    case 'code':
      return puzzle.role === 'clue' ? (
        <>
          <p>Each symbol hides a digit. Team B needs these to open the lock — tell them!</p>
          <div className="glyph-row">
            {puzzle.mapping.map(({ symbol, digit }) => (
              <span key={symbol} className="glyph-slot">
                <Glyph symbol={symbol} />
                <b>{digit}</b>
              </span>
            ))}
          </div>
        </>
      ) : (
        <CodeEntry id={id} symbols={puzzle.symbols} attempts={puzzle.attempts} />
      );
    case 'mirror':
      return puzzle.role === 'lamps' ? (
        <>
          <p>
            Team A&apos;s levers change these lamps. Guide them until the lamps match the target.
          </p>
          <h3>Lamps now</h3>
          <div className="lamp-row">
            {puzzle.lamps.map((on, index) => (
              <Lamp key={index} on={on} label={String(index + 1)} />
            ))}
          </div>
          <h3>Target</h3>
          <div className="lamp-row">
            {puzzle.target.map((on, index) => (
              <Lamp key={index} on={on} label={String(index + 1)} />
            ))}
          </div>
        </>
      ) : (
        <p>Pull the levers on the wall. Only Team B can see what they change.</p>
      );
    case 'library':
      return puzzle.role === 'clue' ? (
        <>
          <p>Part of the order in which Team B must press the pedestals:</p>
          <div className="glyph-row">
            {(puzzle.parts[part ?? 0] ?? []).map((symbol, index) => (
              <span key={index} className="glyph-slot">
                <Glyph symbol={symbol} />
                <b>{ORDINALS[index + (part ?? 0) * 3]}</b>
              </span>
            ))}
          </div>
          <p className="panel-note">Another tablet in this room holds the other half.</p>
        </>
      ) : (
        <p>
          Press the pedestals in the order Team A reads to you. Progress: {puzzle.progress} /{' '}
          {puzzle.length}
        </p>
      );
    case 'balance':
      return (
        <>
          <p>
            Both pans must weigh the same, and together exactly <b>{puzzle.target}</b>. Talk to the
            other team!
          </p>
          <div className="weights">
            {puzzle.weights.map((weight, index) => (
              <button
                key={index}
                className={weight.placed ? 'weight weight-placed' : 'weight'}
                aria-pressed={weight.placed}
                onClick={() => connection.puzzleAction(id, { weight: index })}
              >
                {weight.value}
              </button>
            ))}
          </div>
          <p>
            Your pan: <b>{puzzle.own}</b> · Beam:{' '}
            <b>{puzzle.tilt === 'level' ? 'level' : `Team ${puzzle.tilt} side is heavier`}</b> ·
            Total:{' '}
            <b>
              {puzzle.total === 'exact'
                ? 'exactly right'
                : puzzle.total === 'low'
                  ? 'too light'
                  : 'too heavy'}
            </b>
          </p>
        </>
      );
    case 'mechanism':
      return (
        <>
          <p>This plan shows how the OTHER team must set its three switches. Tell them!</p>
          <div className="lamp-row">
            {puzzle.partnerPattern.map((on, index) => (
              <Lamp key={index} on={on} label={`${index + 1} ${on ? 'ON' : 'OFF'}`} />
            ))}
          </div>
          <h3>Your switches now</h3>
          <div className="lamp-row">
            {puzzle.switches.map((on, index) => (
              <Lamp key={index} on={on} label={`${index + 1} ${on ? 'ON' : 'OFF'}`} />
            ))}
          </div>
          <p className="panel-note">
            Then both teams press their great buttons within {puzzle.windowSeconds} seconds of each
            other. {puzzle.armed ? 'Your button is held!' : ''}{' '}
            {puzzle.partnerArmed ? 'The other team is holding theirs — press now!' : ''}
          </p>
        </>
      );
  }
}

export function PanelHost({ view }: { view: ConnectionView }) {
  const { panel, puzzle } = view;
  if (!panel) return null;
  if (panel.type === 'container') return <ContainerPanel panel={panel} />;
  if (panel.type === 'puzzle' && puzzle)
    return (
      <Modal title={levelName(view.quest.level)} onClose={() => connection.closePanel()}>
        <div className="puzzle-panel">
          <PuzzleBody id={panel.id} part={panel.part} puzzle={puzzle} />
        </div>
      </Modal>
    );
  return null;
}

/** The shared verse collection plus this player's personal artifacts — two separate things. */
export function Collection({ view, onClose }: { view: ConnectionView; onClose: () => void }) {
  const me = view.players.find((player) => player.id === view.playerId);
  const artifacts = artifactsOf(me?.artifacts);
  return (
    <Modal title="Wisdom collection" onClose={onClose} wide>
      <p className="panel-note">
        {view.quest.versesFound} / {VERSE_TOTAL} verses discovered by the whole group. Their order
        is still a mystery.
      </p>
      <div className="collection-grid">
        {view.cards.map((card) => (
          <VerseCard key={card.id} text={card.text}>
            <small>Found by {card.finder}</small>
          </VerseCard>
        ))}
        {view.cards.length === 0 && <p className="panel-empty">No verses found yet. Explore!</p>}
      </div>
      <h3>Your artifacts (optional keepsakes)</h3>
      <div className="inventory">
        {artifacts.length === 0 && <span className="panel-empty">None yet.</span>}
        {artifacts.map((kind, index) => (
          <span key={index} title={ARTIFACT_NAMES[kind]}>
            <img src={`/assets/artifacts/${kind}-icon.png`} alt={ARTIFACT_NAMES[kind]} />
          </span>
        ))}
      </div>
    </Modal>
  );
}
