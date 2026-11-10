import { VERSE_TOTAL } from '@escape/shared';
import { useMemo, useState } from 'react';
import { connection, type ConnectionView } from '../../game/network/GameConnection';
import { Toasts } from './QuestUi';

const PAGES = [0, 9, 18];
const preview = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;

/** The Hall of Wisdom. One server-owned board; every tap is a small atomic request. */
export function WisdomBoard({ view }: { view: ConnectionView }) {
  const host = view.role === 'host';
  const { board } = view;
  const [selected, setSelected] = useState<string>();
  const [page, setPage] = useState(0);
  const texts = useMemo(
    () => new Map(view.cards.map((card) => [card.id, card.text])),
    [view.cards],
  );
  const placed = new Set(board.slots.filter(Boolean));
  const unplaced = board.tray.filter((id) => !placed.has(id));
  const online = view.players.filter((player) => player.connected).length;
  const complete = unplaced.length === 0 && board.slots.length === VERSE_TOTAL;
  const selectedSlot = selected ? board.slots.indexOf(selected) : -1;
  const status =
    board.attempts > 0
      ? `Last try: ${board.correct} of ${VERSE_TOTAL} cards in the right place. Attempts: ${board.attempts}`
      : 'Read the verses. Which comes first? Which follows?';

  const tapSlot = (slot: number) => {
    const occupant = board.slots[slot] ?? '';
    if (selected && selected !== occupant) {
      // `expect` tells the server which card we saw there; a stale view is rejected, not applied.
      connection.board({ op: 'place', card: selected, slot, expect: occupant });
      setSelected(undefined);
    } else setSelected(occupant && occupant !== selected ? occupant : undefined);
  };
  const slotTile = (slot: number, length: number) => {
    const id = board.slots[slot] ?? '';
    return (
      <button
        key={slot}
        className={`slot ${id ? 'slot-filled' : ''} ${id && id === selected ? 'slot-selected' : ''}`}
        onClick={host ? undefined : () => tapSlot(slot)}
        disabled={host}
        aria-label={`Position ${slot + 1}${id ? ', filled' : ', empty'}`}
      >
        <b>{slot + 1}</b>
        <span>{id ? preview(texts.get(id) ?? '', length) : host ? '' : 'Tap to place'}</span>
      </button>
    );
  };

  if (host)
    return (
      <section className="hall hall-host" aria-label="The Hall of Wisdom">
        <header className="hall-header">
          <div>
            <p className="quest-level">FINAL CHALLENGE</p>
            <h1>THE HALL OF WISDOM</h1>
          </div>
          <p>
            Arrange all {VERSE_TOTAL} verses in their true order. <b>{placed.size}</b> placed ·{' '}
            <b>{unplaced.length}</b> unplaced · <b>{online}</b> players taking part
          </p>
          <p className="hall-status">
            {complete ? 'All cards placed — submit when you agree!' : status}
          </p>
          <p className="scripture-credit">{view.credit}</p>
        </header>
        <div className="hall-columns">
          {PAGES.map((start) => (
            <div key={start} className="hall-column">
              {Array.from({ length: 9 }, (_, index) => slotTile(start + index, 150))}
            </div>
          ))}
        </div>
        <Toasts view={view} />
      </section>
    );

  return (
    <section className="hall hall-phone" aria-label="The Hall of Wisdom">
      <div className="hall-tray">
        <h2>
          Cards <small>{unplaced.length} unplaced</small>
        </h2>
        <div className="hall-scroll">
          {unplaced.map((id) => (
            <button
              key={id}
              className={`tray-card ${id === selected ? 'slot-selected' : ''}`}
              onClick={() => setSelected(id === selected ? undefined : id)}
            >
              {preview(texts.get(id) ?? '', 70)}
            </button>
          ))}
          {unplaced.length === 0 && <p className="panel-empty">Every card is on the board.</p>}
        </div>
      </div>
      <div className="hall-board">
        <div className="hall-tabs" role="tablist" aria-label="Positions">
          {PAGES.map((start, index) => (
            <button
              key={start}
              role="tab"
              aria-selected={page === index}
              className={page === index ? 'tab-active' : ''}
              onClick={() => setPage(index)}
            >
              {start + 1}–{start + 9}
            </button>
          ))}
          <button
            className="hall-submit"
            disabled={!complete}
            onClick={() => connection.board({ op: 'submit' })}
          >
            Submit order
          </button>
        </div>
        <div className="hall-slots">
          {Array.from({ length: 9 }, (_, index) => slotTile(PAGES[page]! + index, 44))}
        </div>
        <div className="hall-detail">
          {selected ? (
            <>
              <p className="hall-reading">{texts.get(selected)}</p>
              <div className="hall-actions">
                <span>
                  {selectedSlot >= 0 ? `In position ${selectedSlot + 1}. ` : ''}Tap a numbered
                  position to place it there.
                </span>
                {selectedSlot >= 0 && (
                  <button
                    onClick={() => {
                      connection.board({ op: 'remove', card: selected });
                      setSelected(undefined);
                    }}
                  >
                    Take off the board
                  </button>
                )}
                <button onClick={() => setSelected(undefined)}>Deselect</button>
              </div>
            </>
          ) : (
            <>
              <p className="hall-status">{status} Tap a card to read it.</p>
              <p className="scripture-credit">{view.credit}</p>
            </>
          )}
        </div>
      </div>
      <Toasts view={view} />
    </section>
  );
}
