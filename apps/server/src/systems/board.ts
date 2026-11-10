import { VERSE_TOTAL, type BoardOp } from '@escape/shared';

export type BoardRejection = 'invalid' | 'stale' | 'incomplete' | 'closed';
export type BoardResult =
  | { ok: true; changed: boolean; solved?: boolean; wrong?: boolean }
  | { ok: false; reason: BoardRejection };

/** The shared, server-authoritative ordering board of the Hall of Wisdom.
 * Invariant: every card is in exactly one place — one slot, or the (implicit) tray. */
export class WisdomBoard {
  readonly slots: string[] = Array.from({ length: VERSE_TOTAL }, () => '');
  revision = 0;
  attempts = 0;
  /** Cards in the right position at the last failed submission; -1 before any attempt. */
  correct = -1;
  solved = false;
  private readonly cards: Set<string>;
  /**
   * @param tray every card ID in the shuffled order phones present the unplaced cards
   * @param canonical the card IDs in biblical order — never sent to any client
   */
  constructor(
    readonly tray: readonly string[],
    private readonly canonical: readonly string[],
  ) {
    this.cards = new Set(tray);
    if (
      tray.length !== VERSE_TOTAL ||
      this.cards.size !== VERSE_TOTAL ||
      canonical.length !== VERSE_TOTAL ||
      canonical.some((id) => !this.cards.has(id))
    )
      throw new Error('The final board needs all 27 distinct cards.');
  }
  unplaced() {
    return this.tray.filter((id) => !this.slots.includes(id));
  }
  apply(raw: unknown): BoardResult {
    if (this.solved) return { ok: false, reason: 'closed' };
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'invalid' };
    const op = raw as Partial<BoardOp> & Record<string, unknown>;
    if (op.op === 'submit') {
      if (this.slots.includes('')) return { ok: false, reason: 'incomplete' };
      if (this.slots.every((id, index) => id === this.canonical[index])) {
        this.solved = true;
        this.revision++;
        return { ok: true, changed: true, solved: true };
      }
      this.attempts++;
      this.correct = this.slots.filter((id, index) => id === this.canonical[index]).length;
      this.revision++;
      return { ok: true, changed: true, wrong: true };
    }
    if (typeof op.card !== 'string' || !this.cards.has(op.card))
      return { ok: false, reason: 'invalid' };
    const from = this.slots.indexOf(op.card);
    if (op.op === 'remove') {
      if (from < 0) return { ok: true, changed: false };
      this.slots[from] = '';
      this.revision++;
      return { ok: true, changed: true };
    }
    if (op.op !== 'place') return { ok: false, reason: 'invalid' };
    const slot = op.slot;
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= VERSE_TOTAL)
      return { ok: false, reason: 'invalid' };
    const occupant = this.slots[slot]!;
    // The mover states which card it saw in the destination. If another player changed that
    // slot in the meantime the move is rejected instead of silently displacing their card.
    if (typeof op.expect !== 'string' || op.expect !== occupant)
      return { ok: false, reason: 'stale' };
    if (from === slot) return { ok: true, changed: false };
    // One atomic step: a card coming from a slot swaps with the occupant; a card coming from
    // the tray sends the occupant back to the tray. Nothing can be duplicated or lost.
    if (from >= 0) this.slots[from] = occupant;
    this.slots[slot] = op.card;
    this.revision++;
    return { ok: true, changed: true };
  }
  /** Card conservation check used by tests and after every operation in development. */
  consistent() {
    const placed = this.slots.filter(Boolean);
    return (
      this.slots.length === VERSE_TOTAL &&
      new Set(placed).size === placed.length &&
      placed.every((id) => this.cards.has(id)) &&
      placed.length + this.unplaced().length === VERSE_TOTAL
    );
  }
}
