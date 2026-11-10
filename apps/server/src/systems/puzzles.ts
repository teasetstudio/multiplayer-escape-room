import {
  SYMBOLS,
  fixtureId,
  type FixtureState,
  type PuzzleView,
  type SymbolId,
  type TeamId,
} from '@escape/shared';
import { pick, shuffled, type Rng } from './rng.js';

export interface PuzzleResult {
  /** The synchronized team views must be rebuilt. */
  changed?: boolean;
  /** Open the puzzle panel on the acting player's phone. */
  panel?: { part?: number };
  /** Feedback for the acting team (or both teams). */
  notice?: { text: string; tone: 'info' | 'good' | 'warn'; teams?: TeamId[] };
}
type TeamView = PuzzleView extends infer V
  ? V extends unknown
    ? Omit<V, 'solved' | 'fixtures'>
    : never
  : never;

/** Server-owned puzzle logic. Solutions never leave this module except as the asymmetric,
 * team-specific views each side needs to talk the other through the solution. */
export abstract class Puzzle {
  solved = false;
  constructor(protected readonly level: number) {}
  protected id(team: TeamId, name: string) {
    return fixtureId(this.level, team, name);
  }
  /** Usable props for a team → action-button label. */
  abstract prompts(team: TeamId): Map<string, string>;
  /** A tap on a prop: either an immediate action or a request to open a panel. */
  abstract interact(team: TeamId, fixture: string, now: number): PuzzleResult;
  /** A panel action. Unknown or malformed actions are ignored. */
  act(
    _team: TeamId,
    _fixture: string,
    _action: Record<string, unknown>,
    _now: number,
  ): PuzzleResult {
    return {};
  }
  tick(_now: number): boolean {
    return false;
  }
  protected abstract teamView(team: TeamId, now: number): TeamView;
  protected abstract states(team: TeamId, now: number): Record<string, FixtureState>;
  view(team: TeamId, now: number): PuzzleView {
    const fixtures = this.states(team, now);
    if (this.solved) for (const key of Object.keys(fixtures)) fixtures[key] = 'completed';
    return { ...this.teamView(team, now), solved: this.solved, fixtures } as PuzzleView;
  }
  /** Test and audit hook; never serialized to a client. */
  abstract solution(): unknown;
}

/** Level 1 — Team A reads which digit each symbol stands for; Team B enters the code. */
export class SecretCodePuzzle extends Puzzle {
  private readonly mapping: { symbol: SymbolId; digit: number }[];
  private readonly symbols: SymbolId[];
  private attempts = 0;
  constructor(level: number, rng: Rng) {
    super(level);
    const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
    this.mapping = shuffled(SYMBOLS, rng).map((symbol, index) => ({
      symbol,
      digit: digits[index]!,
    }));
    this.symbols = shuffled(SYMBOLS, rng);
  }
  solution() {
    return this.symbols
      .map((symbol) => this.mapping.find((m) => m.symbol === symbol)!.digit)
      .join('');
  }
  prompts(team: TeamId) {
    return new Map(
      team === 'A'
        ? [[this.id('A', 'clue'), 'Study the carved tablet']]
        : [[this.id('B', 'terminal'), 'Use the code lock']],
    );
  }
  interact() {
    return { panel: {} };
  }
  override act(team: TeamId, _fixture: string, action: Record<string, unknown>): PuzzleResult {
    if (
      team !== 'B' ||
      this.solved ||
      typeof action.code !== 'string' ||
      !/^\d{4}$/.test(action.code)
    )
      return {};
    if (action.code === this.solution()) {
      this.solved = true;
      return { changed: true };
    }
    this.attempts++;
    return {
      changed: true,
      notice: { text: 'The lock stays shut. That is not the code.', tone: 'warn' },
    };
  }
  protected teamView(team: TeamId): TeamView {
    return team === 'A'
      ? { kind: 'code', role: 'clue', mapping: this.mapping }
      : { kind: 'code', role: 'entry', symbols: this.symbols, attempts: this.attempts };
  }
  protected states(team: TeamId) {
    return { [this.id(team, team === 'A' ? 'clue' : 'terminal')]: 'active' as FixtureState };
  }
}

/** Level 2 — Team A's levers move lamps that only Team B can see, next to the target pattern. */
export class MirrorPuzzle extends Puzzle {
  private readonly switches = [false, false, false, false];
  /** links[s] = lamps toggled by switch s. Unitriangular after a permutation → always solvable. */
  private readonly links: number[][];
  private readonly target: boolean[];
  private readonly answer: boolean[];
  constructor(level: number, rng: Rng) {
    super(level);
    const lamps = shuffled([0, 1, 2, 3], rng);
    this.links = lamps.map((lamp, index) =>
      index > 0 && rng() < 0.6 ? [lamp, lamps[pick(rng, index)]!] : [lamp],
    );
    do this.answer = this.switches.map(() => rng() < 0.5);
    while (!this.answer.some(Boolean));
    this.target = this.lampsFor(this.answer);
  }
  private lampsFor(switches: boolean[]) {
    const lamps = [false, false, false, false];
    switches.forEach((on, index) => {
      if (on) for (const lamp of this.links[index]!) lamps[lamp] = !lamps[lamp];
    });
    return lamps;
  }
  solution() {
    return [...this.answer];
  }
  prompts(team: TeamId) {
    return new Map(
      team === 'A'
        ? this.switches.map(
            (_, i) => [this.id('A', `switch-${i + 1}`), `Pull lever ${i + 1}`] as const,
          )
        : [[this.id('B', 'lamps'), 'Watch the mirror lamps']],
    );
  }
  interact(team: TeamId, fixture: string): PuzzleResult {
    if (team === 'B') return { panel: {} };
    const index = this.switches.findIndex((_, i) => this.id('A', `switch-${i + 1}`) === fixture);
    if (index < 0 || this.solved) return {};
    this.switches[index] = !this.switches[index];
    this.solved = this.lampsFor(this.switches).every((lamp, i) => lamp === this.target[i]);
    return { changed: true };
  }
  protected teamView(team: TeamId): TeamView {
    return team === 'A'
      ? { kind: 'mirror', role: 'switches', switches: [...this.switches] }
      : { kind: 'mirror', role: 'lamps', lamps: this.lampsFor(this.switches), target: this.target };
  }
  protected states(team: TeamId): Record<string, FixtureState> {
    if (team === 'B') return { [this.id('B', 'lamps')]: 'active' };
    return Object.fromEntries(
      this.switches.map((on, i) => [this.id('A', `switch-${i + 1}`), on ? 'active' : 'inactive']),
    );
  }
}

/** Level 3 — Team A finds the order on two tablets; Team B presses the pedestals in that order. */
export class LibraryPuzzle extends Puzzle {
  private readonly sequence: SymbolId[] = [];
  private progress = 0;
  constructor(level: number, rng: Rng) {
    super(level);
    while (this.sequence.length < 6) {
      const symbol = SYMBOLS[pick(rng, SYMBOLS.length)]!;
      if (symbol !== this.sequence.at(-1)) this.sequence.push(symbol);
    }
  }
  solution() {
    return [...this.sequence];
  }
  prompts(team: TeamId) {
    return new Map(
      team === 'A'
        ? [
            [this.id('A', 'tablet-1'), 'Read the first tablet'],
            [this.id('A', 'tablet-2'), 'Read the second tablet'],
          ]
        : SYMBOLS.map(
            (symbol, i) =>
              [this.id('B', `pedestal-${i + 1}`), `Press the ${symbol} pedestal`] as const,
          ),
    );
  }
  interact(team: TeamId, fixture: string): PuzzleResult {
    if (team === 'A') return { panel: { part: fixture === this.id('A', 'tablet-2') ? 1 : 0 } };
    const index = SYMBOLS.findIndex((_, i) => this.id('B', `pedestal-${i + 1}`) === fixture);
    if (index < 0 || this.solved) return {};
    const symbol = SYMBOLS[index]!;
    if (symbol === this.sequence[this.progress]) {
      this.progress++;
      this.solved = this.progress === this.sequence.length;
      return {
        changed: true,
        notice: this.solved
          ? undefined
          : {
              text: `The pedestal hums. ${this.progress} of ${this.sequence.length} in order.`,
              tone: 'info',
            },
      };
    }
    this.progress = symbol === this.sequence[0] ? 1 : 0;
    return {
      changed: true,
      notice: { text: 'The pedestals sink back. Start the order again.', tone: 'warn' },
    };
  }
  protected teamView(team: TeamId): TeamView {
    return team === 'A'
      ? {
          kind: 'library',
          role: 'clue',
          parts: [this.sequence.slice(0, 3), this.sequence.slice(3)],
        }
      : {
          kind: 'library',
          role: 'pedestals',
          progress: this.progress,
          length: this.sequence.length,
        };
  }
  protected states(team: TeamId): Record<string, FixtureState> {
    return Object.fromEntries(
      [...this.prompts(team).keys()].map((id) => [
        id,
        team === 'A' || this.progress ? 'active' : 'inactive',
      ]),
    );
  }
}

/** Level 4 — each team loads its own pan; the beam must be level AND carry the shared target. */
export class BalancePuzzle extends Puzzle {
  private readonly weights: Record<TeamId, { value: number; placed: boolean }[]>;
  private readonly target: number;
  private readonly answer: Record<TeamId, number[]>;
  constructor(level: number, rng: Rng) {
    super(level);
    for (;;) {
      const deal = () => shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rng).slice(0, 5);
      const values = { A: deal(), B: deal() };
      const choose = (list: number[]) => list.filter(() => rng() < 0.5);
      const a = choose(values.A);
      const sum = a.reduce((total, value) => total + value, 0);
      const b = subsetWithSum(values.B, sum);
      if (a.length < 2 || !b || b.length < 2) continue;
      this.weights = {
        A: values.A.map((value) => ({ value, placed: false })),
        B: values.B.map((value) => ({ value, placed: false })),
      };
      this.target = sum * 2;
      this.answer = { A: a, B: b };
      return;
    }
  }
  private sum(team: TeamId) {
    return this.weights[team].reduce(
      (total, weight) => total + (weight.placed ? weight.value : 0),
      0,
    );
  }
  solution() {
    return { ...this.answer, target: this.target };
  }
  prompts(team: TeamId) {
    return new Map([[this.id(team, 'scale'), 'Use the great scale']]);
  }
  interact() {
    return { panel: {} };
  }
  override act(team: TeamId, _fixture: string, action: Record<string, unknown>): PuzzleResult {
    const weight =
      typeof action.weight === 'number' ? this.weights[team][action.weight] : undefined;
    if (!weight || this.solved) return {};
    weight.placed = !weight.placed;
    this.solved = this.sum('A') === this.sum('B') && this.sum('A') + this.sum('B') === this.target;
    return { changed: true };
  }
  protected teamView(team: TeamId): TeamView {
    const a = this.sum('A');
    const b = this.sum('B');
    return {
      kind: 'balance',
      role: 'scale',
      weights: this.weights[team].map((weight) => ({ ...weight })),
      own: team === 'A' ? a : b,
      target: this.target,
      tilt: a === b ? 'level' : a > b ? 'A' : 'B',
      total: a + b === this.target ? 'exact' : a + b < this.target ? 'low' : 'high',
    };
  }
  protected states(team: TeamId): Record<string, FixtureState> {
    return { [this.id(team, 'scale')]: this.sum(team) ? 'pressed' : 'active' };
  }
}
function subsetWithSum(values: number[], sum: number) {
  for (let mask = 1; mask < 1 << values.length; mask++) {
    const subset = values.filter((_, index) => mask & (1 << index));
    if (subset.reduce((total, value) => total + value, 0) === sum) return subset;
  }
}

export const MECHANISM_WINDOW_MS = 6000;
/** Level 5 — each team sets the pattern only the OTHER team can read, then both press their
 * buttons within a forgiving window measured with server timestamps. */
export class MechanismPuzzle extends Puzzle {
  private readonly switches: Record<TeamId, boolean[]> = {
    A: [false, false, false],
    B: [false, false, false],
  };
  private readonly pattern: Record<TeamId, boolean[]>;
  private readonly armedAt: Partial<Record<TeamId, number>> = {};
  constructor(level: number, rng: Rng) {
    super(level);
    const deal = () => {
      let pattern: boolean[];
      do pattern = [rng() < 0.5, rng() < 0.5, rng() < 0.5];
      while (!pattern.some(Boolean));
      return pattern;
    };
    this.pattern = { A: deal(), B: deal() };
  }
  solution() {
    return { A: [...this.pattern.A], B: [...this.pattern.B] };
  }
  private armed(team: TeamId, now: number) {
    const at = this.armedAt[team];
    return at !== undefined && now - at <= MECHANISM_WINDOW_MS;
  }
  prompts(team: TeamId) {
    return new Map([
      ...this.switches[team].map(
        (_, i) => [this.id(team, `switch-${i + 1}`), `Flip switch ${i + 1}`] as const,
      ),
      [this.id(team, 'button'), 'Press the great button'],
      [this.id(team, 'plan'), 'Study the mechanism plan'],
    ]);
  }
  interact(team: TeamId, fixture: string, now: number): PuzzleResult {
    if (fixture === this.id(team, 'plan')) return { panel: {} };
    if (this.solved) return {};
    const index = this.switches[team].findIndex(
      (_, i) => this.id(team, `switch-${i + 1}`) === fixture,
    );
    if (index >= 0) {
      this.switches[team][index] = !this.switches[team][index];
      return { changed: true };
    }
    if (fixture !== this.id(team, 'button')) return {};
    this.armedAt[team] = now;
    const other: TeamId = team === 'A' ? 'B' : 'A';
    if (!this.armed(other, now))
      return {
        changed: true,
        notice: {
          text: `Button held! The other team has ${MECHANISM_WINDOW_MS / 1000} seconds to press theirs.`,
          tone: 'info',
          teams: ['A', 'B'],
        },
      };
    const correct = (['A', 'B'] as const).every((id) =>
      this.switches[id].every((on, i) => on === this.pattern[id][i]),
    );
    if (correct) {
      this.solved = true;
      return { changed: true };
    }
    delete this.armedAt.A;
    delete this.armedAt.B;
    return {
      changed: true,
      notice: {
        text: 'The mechanism grinds and jams. Compare the switch patterns and try again.',
        tone: 'warn',
        teams: ['A', 'B'],
      },
    };
  }
  override tick(now: number) {
    let changed = false;
    for (const team of ['A', 'B'] as const)
      if (this.armedAt[team] !== undefined && !this.armed(team, now)) {
        delete this.armedAt[team];
        changed = true;
      }
    return changed;
  }
  protected teamView(team: TeamId, now: number): TeamView {
    const other: TeamId = team === 'A' ? 'B' : 'A';
    return {
      kind: 'mechanism',
      role: 'mechanism',
      switches: [...this.switches[team]],
      partnerPattern: this.pattern[other],
      armed: this.armed(team, now),
      partnerArmed: this.armed(other, now),
      windowSeconds: MECHANISM_WINDOW_MS / 1000,
    };
  }
  protected states(team: TeamId, now: number): Record<string, FixtureState> {
    return {
      ...Object.fromEntries(
        this.switches[team].map((on, i) => [
          this.id(team, `switch-${i + 1}`),
          on ? 'active' : 'inactive',
        ]),
      ),
      [this.id(team, 'button')]: this.armed(team, now) ? 'pressed' : 'active',
      [this.id(team, 'plan')]: 'active',
    };
  }
}

export function createPuzzle(level: number, rng: Rng): Puzzle {
  switch (level) {
    case 1:
      return new SecretCodePuzzle(level, rng);
    case 2:
      return new MirrorPuzzle(level, rng);
    case 3:
      return new LibraryPuzzle(level, rng);
    case 4:
      return new BalancePuzzle(level, rng);
    case 5:
      return new MechanismPuzzle(level, rng);
    default:
      throw new Error(`No puzzle for level ${level}.`);
  }
}
