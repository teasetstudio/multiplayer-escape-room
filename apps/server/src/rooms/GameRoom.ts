import { randomBytes, randomUUID } from 'node:crypto';
import { ArraySchema, MapSchema, StateView, type Schema } from '@colyseus/schema';
import { Room, ServerError, type Client } from '@colyseus/core';
import {
  ARTIFACT_NAMES,
  CHARACTERS,
  INTERACT_REACH,
  LEVELS,
  LEVEL_COUNT,
  MAX_PLAYERS,
  MESSAGE,
  PATCH_HZ,
  PLAYER_COLORS,
  RECONNECT_SECONDS,
  SIMULATION_HZ,
  TEAM_IDS,
  TRANSITION_MS,
  VERSE_PLAN,
  VERSE_TOTAL,
  type AreaMessage,
  type ChapterReveal,
  type ClientRole,
  type Fixture,
  type LevelDefinition,
  type NoticeMessage,
  type PacingStats,
  type PanelItem,
  type PanelMessage,
  type Point,
  type PromptMessage,
  type Rectangle,
  type TeamId,
} from '@escape/shared';
import {
  Card,
  Door,
  Explorer,
  GameState,
  Pickup,
  Player,
  Team,
  TeamPuzzle,
} from '../state/GameState.js';
import {
  createCode,
  creationKey,
  nicknameKey,
  normalizeNickname,
  validToken,
} from '../systems/identity.js';
import { movePlayer, validateInput, type TimedInput } from '../systems/movement.js';
import { RateLimiter } from '../systems/RateLimiter.js';
import type { CollisionWorld } from '../systems/CollisionWorld.js';
import { assignTeams } from '../systems/teams.js';
import { syncVisibility, type Audience } from '../systems/visibility.js';
import {
  ScriptureUnavailable,
  loadScripture,
  type ScriptureDataset,
} from '../content/scripture.js';
import {
  CONTAINER_KINDS,
  SECRETS,
  type HiddenAreaDefinition,
  type LevelSecrets,
} from '../content/secrets.js';
import {
  areaWorld,
  createPlacement,
  distanceToRect,
  levelSpawns,
  levelWorld,
  pointRect,
  validatePlacement,
  type Item,
} from '../systems/placement.js';
import { createPuzzle, type Puzzle, type PuzzleResult } from '../systems/puzzles.js';
import { WisdomBoard } from '../systems/board.js';
import { createRng, shuffled } from '../systems/rng.js';

interface Auth {
  role: ClientRole;
  nickname?: string;
}
/** Per-player facts that are never part of the synchronized public state. */
interface PlayerRuntime {
  /** Current hidden chamber; undefined in a public room. */
  area?: string;
  /** Secret entrances this player has personally uncovered. */
  discovered: Set<string>;
  /** Containers and scrolls this player has opened and may therefore collect from. */
  opened: Set<string>;
  prompt: string;
}
interface Target {
  id: string;
  type: 'entrance' | 'exit' | 'container' | 'loose' | 'puzzle';
  rect: Rectangle;
  label: string;
  hint?: string;
  item?: Item;
  fixture?: Fixture;
}
interface AreaRuntime {
  definition: HiddenAreaDefinition;
  world: CollisionWorld;
  bounds: Rectangle;
}
interface LevelRuntime {
  definition: LevelDefinition;
  secrets: LevelSecrets;
  world: CollisionWorld;
  puzzle: Puzzle;
  areas: Map<string, AreaRuntime>;
  startedAt: number;
  puzzleAt?: number;
  versesAt?: number;
}
export const sessions = new Map<string, GameRoom>();

const CONTAINER_LABEL: Record<string, [prompt: string, title: string]> = {
  chest: ['Open the chest', 'Old storage chest'],
  cabinet: ['Open the cabinet', 'Ancient cabinet'],
  bookshelf: ['Search the bookshelf', 'Bookshelf compartment'],
};

export class GameRoom extends Room<{ state: GameState }> {
  private hostId = '';
  private hostDigest = '';
  private readonly playerIds = new Map<string, string>();
  private readonly inputs = new Map<string, TimedInput>();
  private readonly inputLimiter = new RateLimiter(40, 1000);
  private readonly actionLimiter = new RateLimiter(20, 1000);
  private readonly runtime = new Map<string, PlayerRuntime>();
  private accumulator = 0;
  private ticks = 0;
  private lastActivity = Date.now();
  private hostMissingSince = Date.now();
  private closing = false;
  private createdAt = Date.now();
  private seed = '';
  private scripture?: ScriptureDataset;
  private scriptureError = '';
  /** The session's placement manifest: every collectible and its hiding place. */
  private items: Item[] = [];
  private readonly itemsById = new Map<string, Item>();
  private level!: LevelRuntime;
  private board?: WisdomBoard;
  private lastSubmit = 0;
  private finalStartedAt = 0;
  private startedAt = 0;
  private readonly pacing: PacingStats = { levels: [] };
  private transitionMs = TRANSITION_MS;

  override onCreate(options: Record<string, unknown>) {
    if (options.creationKey !== creationKey || typeof options.hostDigest !== 'string') {
      throw new ServerError(403, 'Create games from the host page.');
    }
    if (sessions.size >= 100) throw new ServerError(503, 'The server is full. Try again later.');
    let code = createCode();
    while (sessions.has(code)) code = createCode();
    this.roomId = code;
    this.hostDigest = options.hostDigest;
    this.maxClients = MAX_PLAYERS + 1; // The host owns a connection, never a character.
    this.autoDispose = false;
    this.seed =
      typeof options.seed === 'string' && options.seed
        ? options.seed
        : randomBytes(12).toString('hex');
    const transition = Number(process.env.TRANSITION_MS);
    if (Number.isFinite(transition) && transition > 0) this.transitionMs = transition;
    this.setState(new GameState());
    try {
      this.scripture = loadScripture();
      this.items = createPlacement(this.scripture, createRng(`${this.seed}:placement`));
      // The game is only "ready" when all 27 cards are placed once and reachable.
      const report = validatePlacement(this.items);
      if (report.errors.length) throw new Error(`Invalid placement: ${report.errors.join(' ')}`);
      for (const item of this.items) this.itemsById.set(item.id, item);
    } catch (error) {
      if (!(error instanceof ScriptureUnavailable)) throw error;
      this.scriptureError = error.message;
    }
    this.loadLevel(1);
    void this.setPrivate(true);
    sessions.set(code, this);
    this.setPatchRate(1000 / PATCH_HZ);
    this.setSimulationInterval((elapsed) => this.simulate(elapsed), 1000 / SIMULATION_HZ);
    this.clock.setInterval(() => this.cleanupInactive(), 1000);
    this.onMessage(MESSAGE.identify, (client) => {
      const playerId = this.playerIds.get(client.sessionId);
      client.send(MESSAGE.identity, { playerId });
      const runtime = playerId && this.runtime.get(playerId);
      if (!runtime) return;
      // A fresh or reconnected phone gets back exactly what this player had already earned.
      runtime.prompt = '';
      this.sendDiscoveries(client, runtime);
      this.sendArea(client, runtime);
    });
    this.onMessage(MESSAGE.input, (client, raw: unknown) => {
      if (this.state.status !== 'playing' || !this.inputLimiter.allow(client.sessionId)) return;
      const id = this.playerIds.get(client.sessionId);
      const input = validateInput(raw);
      if (!id || !input || !this.state.players.get(id)?.connected) return;
      const previous = this.inputs.get(id);
      if (previous && input.seq <= previous.seq) return;
      this.inputs.set(id, { ...input, receivedAt: Date.now() });
      if (input.x || input.y) this.lastActivity = Date.now();
    });
    this.onMessage(MESSAGE.start, (client) => this.start(client));
    this.onMessage(MESSAGE.interact, (client, raw: unknown) => this.onInteract(client, raw));
    this.onMessage(MESSAGE.collect, (client, raw: unknown) => this.onCollect(client, raw));
    this.onMessage(MESSAGE.puzzle, (client, raw: unknown) => this.onPuzzle(client, raw));
    this.onMessage(MESSAGE.board, (client, raw: unknown) => this.onBoard(client, raw));
  }

  // ---------------------------------------------------------------- session lifecycle

  private start(client: Client) {
    if (client.sessionId !== this.hostId) {
      client.send(MESSAGE.error, { message: 'Only the host can start the game.' });
      return;
    }
    if (this.state.status !== 'lobby') return;
    if (![...this.state.players.values()].some((player) => player.connected)) {
      client.send(MESSAGE.error, { message: 'Wait for at least one player to join.' });
      return;
    }
    if (!this.scripture) {
      client.send(MESSAGE.error, { message: this.scriptureError });
      return;
    }
    const assignments = assignTeams(this.state.players.values());
    for (const teamId of TEAM_IDS) {
      const roomId = this.level.definition.rooms[teamId].id;
      this.state.teams.set(teamId, new Team().assign({ id: teamId, roomId }));
      this.state.puzzles.set(teamId, new TeamPuzzle().assign({ id: teamId }));
      let seat = 0;
      for (const [id, assigned] of assignments) {
        if (assigned !== teamId) continue;
        const player = this.state.players.get(id)!;
        player.teamId = teamId;
        player.character = CHARACTERS[seat++ % CHARACTERS.length]!;
      }
    }
    this.placePlayers();
    this.publishPuzzle();
    // One synchronous transition. Narrow every view before the next network patch.
    this.state.status = 'playing';
    this.startedAt = this.level.startedAt = Date.now();
    this.replacePlayerCollection();
    this.lastActivity = Date.now();
    void this.lock();
  }

  /** Swaps in a level: public map, doors, puzzle, hidden chambers and loose artifacts.
   * The Scripture collection and personal inventories are session state and never reset. */
  private loadLevel(number: number) {
    const definition = LEVELS[number - 1]!;
    const secrets = SECRETS[number - 1]!;
    const areas = new Map<string, AreaRuntime>();
    for (const teamId of TEAM_IDS) {
      const area = secrets.areas[teamId];
      areas.set(area.id, { definition: area, ...areaWorld(area) });
    }
    this.level = {
      definition,
      secrets,
      world: levelWorld(number, (id) => this.state.doors.get(id)?.state ?? 'closed'),
      puzzle: createPuzzle(number, createRng(`${this.seed}:puzzle:${number}`)),
      areas,
      startedAt: Date.now(),
    };
    const state = this.state;
    state.level = number;
    state.mapId = definition.map.id;
    state.mapVersion = definition.map.version;
    state.puzzleSolved = state.exitsUnlocked = state.exitA = state.exitB = false;
    state.versesA = state.versesB = 0;
    state.requiredA = VERSE_PLAN[number - 1]!.A;
    state.requiredB = VERSE_PLAN[number - 1]!.B;
    // New collection references: a reconnecting SDK replaces instead of merging stale entries.
    state.doors = new MapSchema<Door>();
    for (const object of definition.map.objects) {
      if (object.kind !== 'door') continue;
      if (!object.roomId) throw new Error(`Door ${object.id} needs a logical room.`);
      const door = new Door();
      door.roomId = object.roomId;
      door.id = object.id;
      state.doors.set(door.id, door);
    }
    state.explorers = new MapSchema<Explorer>();
    state.pickups = new MapSchema<Pickup>();
    for (const item of this.items) {
      if (item.level !== number || item.area || item.container || item.collectedBy || !item.point)
        continue;
      const pickup = new Pickup();
      pickup.id = item.id;
      pickup.roomId = definition.rooms[item.team].id;
      pickup.art = item.artifact ?? '';
      pickup.x = item.point.x;
      pickup.y = item.point.y;
      state.pickups.set(pickup.id, pickup);
    }
    for (const team of state.teams.values()) team.roomId = definition.rooms[team.id].id;
    this.inputs.clear();
    for (const runtime of this.runtime.values()) {
      runtime.area = undefined;
      runtime.prompt = '';
    }
    this.placePlayers();
    this.publishPuzzle();
    this.resetViews();
    for (const client of this.clients) {
      const runtime = this.runtimeOf(client);
      if (!runtime) continue;
      client.send(MESSAGE.area, {} satisfies AreaMessage);
      client.send(MESSAGE.panel, { type: 'none' } satisfies PanelMessage);
      client.send(MESSAGE.prompt, {} satisfies PromptMessage);
      this.sendDiscoveries(client, runtime);
    }
  }

  private placePlayers() {
    for (const teamId of TEAM_IDS) {
      const spawns = levelSpawns(
        this.state.level,
        teamId,
        Math.ceil(MAX_PLAYERS / TEAM_IDS.length),
      );
      let seat = 0;
      for (const player of this.state.players.values()) {
        if (player.teamId !== teamId) continue;
        Object.assign(player, spawns[seat++ % spawns.length]!);
        player.exploring = false;
      }
    }
  }

  private publishPuzzle() {
    const now = Date.now();
    for (const entry of this.state.puzzles.values())
      entry.view = JSON.stringify(this.level.puzzle.view(entry.id, now));
  }

  // ---------------------------------------------------------------- interaction

  private actor(client: Client) {
    if (this.state.status !== 'playing' || this.state.transition) return;
    if (!this.actionLimiter.allow(client.sessionId)) return;
    const id = this.playerIds.get(client.sessionId);
    const player = id ? this.state.players.get(id) : undefined;
    const runtime = id ? this.runtime.get(id) : undefined;
    if (!player?.connected || !player.teamId || !runtime) return;
    this.lastActivity = Date.now();
    return { player, runtime, teamId: player.teamId };
  }
  private position(player: Player, runtime: PlayerRuntime): Point {
    return (runtime.area && this.state.explorers.get(player.id)) || player;
  }

  /** Everything this player could use right now, given location, team and discoveries. */
  private targets(player: Player, runtime: PlayerRuntime): Target[] {
    const teamId = player.teamId;
    if (!teamId) return [];
    const { definition, secrets, puzzle, areas } = this.level;
    const result: Target[] = [];
    const loose = (item: Item): Target => ({
      id: item.id,
      type: 'loose',
      rect: pointRect(item.point!),
      label:
        item.type === 'verse'
          ? 'Read the old scroll'
          : `Pick up the ${ARTIFACT_NAMES[item.artifact!]}`,
      item,
    });
    const container = (fixture: Fixture): Target => ({
      id: fixture.id,
      type: 'container',
      rect: fixture,
      label: CONTAINER_LABEL[fixture.kind]![0],
      fixture,
    });
    if (runtime.area) {
      const area = areas.get(runtime.area)?.definition;
      if (!area) return [];
      for (const fixture of area.fixtures) {
        if (fixture.id === area.exitId)
          result.push({ id: fixture.id, type: 'exit', rect: fixture, label: 'Return to the room' });
        else if (CONTAINER_KINDS.includes(fixture.kind)) result.push(container(fixture));
      }
      for (const item of this.items)
        if (item.area === area.id && item.point && !item.collectedBy) result.push(loose(item));
      return result;
    }
    const byId = (id: string) => definition.fixtures.find((entry) => entry.id === id);
    for (const [id, label] of puzzle.prompts(teamId)) {
      const fixture = byId(id);
      if (fixture) result.push({ id, type: 'puzzle', rect: fixture, label, fixture });
    }
    const area = secrets.areas[teamId];
    const entrance = byId(area.entranceObjectId);
    if (entrance) {
      const found = runtime.discovered.has(entrance.id);
      result.push({
        id: entrance.id,
        type: 'entrance',
        rect: entrance,
        label: found ? 'Enter the hidden passage' : 'Take a closer look',
        hint: found ? undefined : area.hint,
        fixture: entrance,
      });
    }
    for (const entry of secrets.publicContainers[teamId]) {
      const fixture = byId(entry.fixtureId);
      if (fixture) result.push(container(fixture));
    }
    for (const item of this.items)
      if (
        item.level === this.state.level &&
        item.team === teamId &&
        !item.area &&
        item.point &&
        !item.collectedBy
      )
        result.push(loose(item));
    return result;
  }
  private nearest(player: Player, runtime: PlayerRuntime, slack = 0) {
    const at = this.position(player, runtime);
    let best: Target | undefined;
    let bestDistance = INTERACT_REACH + slack;
    for (const target of this.targets(player, runtime)) {
      const distance = distanceToRect(at, target.rect);
      if (distance <= bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    return best;
  }
  /** A named target, re-validated against the player's real position (never trusted). */
  private reachable(player: Player, runtime: PlayerRuntime, id: unknown) {
    if (typeof id !== 'string') return;
    const at = this.position(player, runtime);
    return this.targets(player, runtime).find(
      (target) => target.id === id && distanceToRect(at, target.rect) <= INTERACT_REACH + 12,
    );
  }

  private onInteract(client: Client, raw: unknown) {
    const actor = this.actor(client);
    const id = (raw as { id?: unknown } | undefined)?.id;
    const target = actor && this.reachable(actor.player, actor.runtime, id);
    if (!actor || !target) return;
    const { player, runtime, teamId } = actor;
    switch (target.type) {
      case 'entrance':
        if (!runtime.discovered.has(target.id)) {
          runtime.discovered.add(target.id);
          this.sendDiscoveries(client, runtime);
          this.notify({ text: 'You found a hidden passage!', tone: 'good' }, client);
        } else this.enterArea(client, player, runtime, this.level.secrets.areas[teamId]);
        break;
      case 'exit':
        this.leaveArea(client, player, runtime);
        break;
      case 'container':
        runtime.opened.add(target.id);
        this.sendContainer(client, target.fixture!);
        break;
      case 'loose':
        if (target.item!.type === 'artifact') this.collect(client, player, target.item!);
        else {
          runtime.opened.add(target.id);
          client.send(MESSAGE.panel, {
            type: 'container',
            id: target.id,
            title: 'Old scroll',
            kind: 'scroll',
            items: [this.panelItem(target.item!)],
          } satisfies PanelMessage);
        }
        break;
      case 'puzzle':
        this.applyPuzzle(
          client,
          teamId,
          this.level.puzzle.interact(teamId, target.id, Date.now()),
          target.id,
        );
        break;
    }
    runtime.prompt = '';
  }

  private panelItem(item: Item): PanelItem {
    // Text only: the verse number is canonical server metadata and is not part of the card.
    return item.type === 'verse'
      ? { id: item.id, kind: 'verse', text: item.text }
      : { id: item.id, kind: 'artifact', artifact: item.artifact };
  }
  private sendContainer(client: Client, fixture: Fixture) {
    client.send(MESSAGE.panel, {
      type: 'container',
      id: fixture.id,
      title: CONTAINER_LABEL[fixture.kind]![1],
      kind: fixture.kind,
      items: this.items
        .filter((item) => item.container === fixture.id && !item.collectedBy)
        .map((item) => this.panelItem(item)),
    } satisfies PanelMessage);
  }

  private onCollect(client: Client, raw: unknown) {
    const actor = this.actor(client);
    const id = (raw as { id?: unknown } | undefined)?.id;
    const item = typeof id === 'string' ? this.itemsById.get(id) : undefined;
    if (!actor || !item) return;
    const { player, runtime } = actor;
    // The holder must be within reach AND have been opened by this very player.
    const holder = this.reachable(player, runtime, item.container ?? item.id);
    if (!holder || !runtime.opened.has(holder.id) || item.level !== this.state.level) return;
    if (item.collectedBy) {
      this.notify({ text: 'Someone already collected this.', tone: 'warn' }, client);
      if (holder.fixture) this.sendContainer(client, holder.fixture);
      else client.send(MESSAGE.panel, { type: 'none' } satisfies PanelMessage);
      return;
    }
    this.collect(client, player, item);
    if (holder.fixture) this.sendContainer(client, holder.fixture);
    else client.send(MESSAGE.panel, { type: 'none' } satisfies PanelMessage);
  }

  /** The single place an item changes hands. Runs synchronously, so two simultaneous
   * attempts are serialized by the event loop and the second one finds `collectedBy` set. */
  private collect(client: Client, player: Player, item: Item) {
    if (item.collectedBy || item.level !== this.state.level || item.team !== player.teamId) return;
    item.collectedBy = player.id;
    item.collectedAt = Date.now();
    const state = this.state;
    if (item.type === 'artifact') {
      // Optional and personal: never counted towards any gate.
      player.artifacts = [
        ...(player.artifacts ? player.artifacts.split(',') : []),
        item.artifact,
      ].join(',');
      state.artifactsFound++;
      this.notify({ text: `You found a ${ARTIFACT_NAMES[item.artifact!]}!`, tone: 'good' }, client);
    } else {
      const card = new Card();
      card.id = item.id;
      card.text = item.text!;
      card.finder = player.nickname;
      state.cards.set(card.id, card);
      player.verses++;
      state.versesFound++;
      if (item.team === 'A') state.versesA++;
      else state.versesB++;
      const found = state.versesA + state.versesB;
      const required = state.requiredA + state.requiredB;
      this.notify({
        text: `${player.nickname} found a Wisdom fragment! Level ${state.level}: ${found} / ${required}`,
        tone: 'good',
      });
      if (found === required && !this.level.versesAt) this.level.versesAt = Date.now();
    }
    const pickup = state.pickups.get(item.id);
    if (pickup) {
      this.revoke(pickup);
      state.pickups.delete(item.id);
    }
    this.refreshViews();
    if (item.area && item.point)
      for (const other of this.clients)
        if (this.runtimeOf(other)?.area === item.area) this.sendArea(other, this.runtimeOf(other)!);
    this.updateExits();
  }

  private onPuzzle(client: Client, raw: unknown) {
    const actor = this.actor(client);
    if (!actor || !raw || typeof raw !== 'object') return;
    const action = raw as Record<string, unknown>;
    const target = this.reachable(actor.player, actor.runtime, action.id);
    if (target?.type !== 'puzzle') return;
    this.applyPuzzle(
      client,
      actor.teamId,
      this.level.puzzle.act(actor.teamId, target.id, action, Date.now()),
    );
  }
  private applyPuzzle(client: Client, teamId: TeamId, result: PuzzleResult, panelId?: string) {
    if (result.panel && panelId)
      client.send(MESSAGE.panel, {
        type: 'puzzle',
        id: panelId,
        part: result.panel.part,
      } satisfies PanelMessage);
    if (result.notice) {
      const { teams = [teamId], ...notice } = result.notice;
      for (const other of this.clients) {
        const team = this.playerOf(other)?.teamId;
        if (team && teams.includes(team)) other.send(MESSAGE.notice, notice);
      }
    }
    if (!result.changed) return;
    this.publishPuzzle();
    if (this.level.puzzle.solved && !this.state.puzzleSolved) {
      this.state.puzzleSolved = true;
      this.level.puzzleAt = Date.now();
      this.notify({ text: 'The mechanism clicks — the main puzzle is solved!', tone: 'good' });
      this.updateExits();
    }
  }

  /** The authoritative gate: puzzle solved AND every verse of this level collected. */
  private updateExits() {
    const state = this.state;
    const missing = state.requiredA + state.requiredB - state.versesA - state.versesB;
    if (state.exitsUnlocked || !this.level.puzzle.solved || !state.puzzleSolved) return;
    if (missing > 0) {
      this.notify({
        text: `The exits stay locked. Find ${missing} more Wisdom ${missing === 1 ? 'fragment' : 'fragments'}.`,
        tone: 'info',
      });
      return;
    }
    for (const door of state.doors.values()) door.state = 'open';
    state.exitsUnlocked = true;
    this.notify({
      text: 'The exits are open! Each team: send someone through your door.',
      tone: 'good',
    });
  }

  // ---------------------------------------------------------------- hidden chambers

  private enterArea(
    client: Client,
    player: Player,
    runtime: PlayerRuntime,
    area: HiddenAreaDefinition,
  ) {
    // Authorization: own team's room, on this level, entrance uncovered by this player.
    if (area.team !== player.teamId || area.levelId !== this.state.level || runtime.area) return;
    if (!runtime.discovered.has(area.entranceObjectId)) return;
    this.inputs.delete(player.id);
    runtime.area = area.id;
    // The public position freezes at the doorway; the host only ever sees this marker.
    Object.assign(player, area.returnTo);
    player.exploring = true;
    const explorer = new Explorer();
    explorer.id = player.id;
    explorer.area = area.id;
    explorer.x = area.spawn.x;
    explorer.y = area.spawn.y;
    this.state.explorers.set(player.id, explorer);
    this.refreshViews();
    this.sendArea(client, runtime);
  }
  private leaveArea(client: Client | undefined, player: Player, runtime: PlayerRuntime) {
    if (!runtime.area) return;
    this.inputs.delete(player.id);
    runtime.area = undefined;
    const explorer = this.state.explorers.get(player.id);
    if (explorer) {
      this.revoke(explorer);
      this.state.explorers.delete(player.id);
    }
    player.exploring = false;
    this.refreshViews();
    if (client) {
      client.send(MESSAGE.panel, { type: 'none' } satisfies PanelMessage);
      this.sendArea(client, runtime);
    }
  }
  /** Geometry of a hidden chamber goes ONLY to a player standing inside it. */
  private sendArea(client: Client, runtime: PlayerRuntime) {
    const area = runtime.area && this.level.areas.get(runtime.area)?.definition;
    if (!area) {
      client.send(MESSAGE.area, {} satisfies AreaMessage);
      return;
    }
    const loose = this.items
      .filter((item) => item.area === area.id && item.point && !item.collectedBy)
      .map((item): Fixture => ({
        id: item.id,
        kind: item.type === 'verse' ? 'scroll' : 'artifact',
        detail: item.artifact,
        solid: false,
        x: item.point!.x - 12,
        y: item.point!.y - 12,
        width: 24,
        height: 24,
      }));
    client.send(MESSAGE.area, {
      area: {
        key: area.id,
        name: area.name,
        columns: area.columns,
        rows: area.rows,
        fixtures: [...area.fixtures, ...loose],
      },
    } satisfies AreaMessage);
  }
  private sendDiscoveries(client: Client, runtime: PlayerRuntime) {
    client.send(MESSAGE.discoveries, { ids: [...runtime.discovered] });
  }

  // ---------------------------------------------------------------- progression

  private proximity() {
    const state = this.state;
    if (state.status !== 'playing' || state.transition) return;
    const now = Date.now();
    if (this.level.puzzle.tick(now)) this.publishPuzzle();
    const atExit: Record<TeamId, boolean> = { A: false, B: false };
    for (const client of this.clients) {
      const player = this.playerOf(client);
      const runtime = this.runtimeOf(client);
      if (!player?.teamId || !runtime || !player.connected) continue;
      if (
        state.exitsUnlocked &&
        !runtime.area &&
        distanceToRect(player, this.level.definition.exits[player.teamId].zone) === 0
      )
        atExit[player.teamId] = true;
      const target = this.nearest(player, runtime);
      const key = target ? `${target.id}|${target.label}` : '';
      if (key === runtime.prompt) continue;
      runtime.prompt = key;
      client.send(
        MESSAGE.prompt,
        (target
          ? { id: target.id, label: target.label, hint: target.hint }
          : {}) satisfies PromptMessage,
      );
    }
    state.exitA = atExit.A;
    state.exitB = atExit.B;
    // Each team needs one player standing in its own exit — not everyone at once.
    if (state.exitsUnlocked && atExit.A && atExit.B) this.beginTransition();
  }

  private beginTransition() {
    const state = this.state;
    if (state.transition || !state.exitsUnlocked || !state.puzzleSolved) return;
    if (state.versesA !== state.requiredA || state.versesB !== state.requiredB) return;
    state.transition = true;
    this.inputs.clear(); // Stale joystick input must not carry into the next level.
    const { startedAt, puzzleAt = Date.now(), versesAt = Date.now() } = this.level;
    const seconds = (from: number, to: number) => Math.round((to - from) / 100) / 10;
    this.pacing.levels.push({
      level: state.level,
      puzzleSeconds: seconds(startedAt, puzzleAt),
      versesSeconds: seconds(startedAt, versesAt),
      totalSeconds: seconds(startedAt, Date.now()),
    });
    state.stats = JSON.stringify(this.pacing);
    const completed = state.level;
    this.clock.setTimeout(() => {
      if (this.state.status !== 'playing' || this.state.level !== completed) return;
      if (completed < LEVEL_COUNT) this.loadLevel(completed + 1);
      else this.enterFinal();
      this.state.transition = false;
    }, this.transitionMs);
  }

  /** The Hall of Wisdom: reachable only through five completed levels and 27 collected cards. */
  private enterFinal() {
    const state = this.state;
    const verses = this.items.filter((item) => item.type === 'verse');
    if (
      this.pacing.levels.length !== LEVEL_COUNT ||
      state.versesFound !== VERSE_TOTAL ||
      verses.some((item) => !item.collectedBy)
    )
      throw new Error('The final challenge needs five completed levels and all 27 verses.');
    const canonical = [...verses]
      .sort((a, b) => a.verseNumber! - b.verseNumber!)
      .map((item) => item.id);
    const rng = createRng(`${this.seed}:final`);
    let tray = shuffled(canonical, rng);
    while (tray.every((id, index) => id === canonical[index])) tray = shuffled(canonical, rng);
    this.board = new WisdomBoard(tray, canonical);
    state.boardTray = new ArraySchema<string>(...tray);
    state.boardSlots = new ArraySchema<string>(...this.board.slots);
    state.boardRevision = 0;
    state.explorers = new MapSchema<Explorer>();
    state.pickups = new MapSchema<Pickup>();
    state.doors = new MapSchema<Door>();
    for (const player of state.players.values()) player.exploring = false;
    for (const runtime of this.runtime.values()) runtime.area = undefined;
    this.inputs.clear();
    this.finalStartedAt = Date.now();
    state.status = 'final';
    this.resetViews();
    for (const client of this.clients) {
      if (!this.runtimeOf(client)) continue;
      client.send(MESSAGE.area, {} satisfies AreaMessage);
      client.send(MESSAGE.panel, { type: 'none' } satisfies PanelMessage);
      client.send(MESSAGE.prompt, {} satisfies PromptMessage);
    }
  }

  private onBoard(client: Client, raw: unknown) {
    const player = this.playerOf(client);
    const board = this.board;
    if (this.state.status !== 'final' || !board || !player?.connected || !player.teamId) return;
    if (!this.actionLimiter.allow(client.sessionId)) return;
    this.lastActivity = Date.now();
    const submit = (raw as { op?: unknown } | undefined)?.op === 'submit';
    if (submit && Date.now() - this.lastSubmit < 1500) {
      this.notify({ text: 'The hall is still judging the last attempt…', tone: 'info' }, client);
      return;
    }
    const result = board.apply(raw);
    if (!result.ok) {
      const text =
        result.reason === 'stale'
          ? 'Someone just moved a card there. Look again and retry.'
          : result.reason === 'incomplete'
            ? `Place all ${VERSE_TOTAL} cards before you submit.`
            : undefined;
      if (text) this.notify({ text, tone: 'warn' }, client);
      return;
    }
    if (!result.changed) return;
    if (submit) this.lastSubmit = Date.now();
    const state = this.state;
    board.slots.forEach((id, index) => {
      if (state.boardSlots[index] !== id) state.boardSlots[index] = id;
    });
    state.boardRevision = board.revision;
    state.boardAttempts = board.attempts;
    state.boardCorrect = board.correct;
    if (result.wrong)
      this.notify({
        text: `Not yet in order — ${board.correct} of ${VERSE_TOTAL} cards are in the right place. Keep going!`,
        tone: 'warn',
      });
    if (result.solved) this.win();
  }

  /** Reached only from a correct, server-validated final sequence. Idempotent. */
  private win() {
    const state = this.state;
    const scripture = this.scripture;
    if (state.status !== 'final' || !this.board?.solved || !scripture) return;
    if (this.pacing.levels.length !== LEVEL_COUNT || state.versesFound !== VERSE_TOTAL) return;
    const now = Date.now();
    this.pacing.finalSeconds = Math.round((now - this.finalStartedAt) / 100) / 10;
    this.pacing.totalSeconds = Math.round((now - this.startedAt) / 100) / 10;
    state.stats = JSON.stringify(this.pacing);
    // The first and only moment the numbered chapter leaves the server.
    state.chapter = JSON.stringify({
      reference: scripture.reference,
      translation: scripture.translation,
      attribution: scripture.attribution,
      license: scripture.license,
      sourceUrl: scripture.sourceUrl,
      verses: scripture.verses.map((verse) => ({ number: verse.verseNumber, text: verse.text })),
    } satisfies ChapterReveal);
    state.status = 'won';
    if (process.env.NODE_ENV === 'production')
      console.log(`[pacing] ${this.roomId} ${state.stats}`);
    this.notify({ text: 'You escaped together!', tone: 'good' });
  }

  // ---------------------------------------------------------------- connections

  override onAuth(_client: Client, options: Record<string, unknown>): Auth {
    if (options.role === 'host') {
      if (this.hostId || !validToken(options.hostToken, this.hostDigest)) {
        throw new ServerError(403, 'Host access is invalid. Reconnect from the original host tab.');
      }
      return { role: 'host' };
    }
    if (options.role !== 'player') throw new ServerError(400, 'Invalid connection role.');
    if (this.state.status !== 'lobby') throw new ServerError(409, 'This game has already started.');
    if (this.state.players.size >= MAX_PLAYERS) throw new ServerError(409, 'This game is full.');
    let nickname: string;
    try {
      nickname = normalizeNickname(options.nickname);
    } catch (error) {
      throw new ServerError(400, error instanceof Error ? error.message : 'Invalid nickname.');
    }
    this.assertNicknameAvailable(nickname);
    return { role: 'player', nickname };
  }

  override onJoin(client: Client, _options: unknown, auth: Auth) {
    this.lastActivity = Date.now();
    if (auth.role === 'host') {
      if (this.hostId) throw new ServerError(409, 'A host is already connected.');
      this.hostId = client.sessionId;
      this.state.hostConnected = true;
      this.hostMissingSince = 0;
      this.refreshView(client);
      return;
    }
    // Recheck at commit time: concurrent seat reservations must not bypass admission rules.
    if (this.state.status !== 'lobby' || this.state.players.size >= MAX_PLAYERS || !auth.nickname) {
      throw new ServerError(409, 'This game is no longer accepting players.');
    }
    this.assertNicknameAvailable(auth.nickname);
    const usedColors = new Set([...this.state.players.values()].map((player) => player.color));
    const player = new Player();
    player.id = randomUUID();
    player.nickname = auth.nickname;
    player.color = PLAYER_COLORS.find((color) => !usedColors.has(color)) ?? PLAYER_COLORS[0];
    // Lobby entries carry identity only; gameplay positions are assigned on start.
    this.playerIds.set(client.sessionId, player.id);
    this.runtime.set(player.id, { discovered: new Set(), opened: new Set(), prompt: '' });
    this.state.players.set(player.id, player);
    for (const viewer of this.clients) this.refreshView(viewer);
  }

  override onDrop(client: Client) {
    const id = this.playerIds.get(client.sessionId);
    if (id) {
      const player = this.state.players.get(id);
      if (player) player.connected = false;
      this.inputs.delete(id);
    }
    if (client.sessionId === this.hostId) {
      this.state.hostConnected = false;
      this.hostMissingSince = Date.now();
    }
    // Return immediately. The framework invokes onReconnect or onLeave when the lease resolves.
    void this.allowReconnection(client, RECONNECT_SECONDS).catch(() => undefined);
  }

  override onReconnect(client: Client) {
    this.lastActivity = Date.now();
    if (client.sessionId === this.hostId) {
      this.state.hostConnected = true;
      this.hostMissingSince = 0;
    }
    const id = this.playerIds.get(client.sessionId);
    const player = id ? this.state.players.get(id) : undefined;
    if (player) {
      player.connected = true;
    }
    // A reserved player may have missed the whole start transition while offline.
    client.view = new StateView();
    this.refreshView(client);
  }

  override onLeave(client: Client) {
    const id = this.playerIds.get(client.sessionId);
    if (id) {
      const player = this.state.players.get(id);
      const runtime = this.runtime.get(id);
      // Collected verses belong to the group and stay; only the character departs.
      if (player && runtime) this.leaveArea(undefined, player, runtime);
      this.state.players.delete(id);
      this.inputs.delete(id);
      this.runtime.delete(id);
      this.replacePlayerCollection();
    }
    this.playerIds.delete(client.sessionId);
    this.inputLimiter.delete(client.sessionId);
    this.actionLimiter.delete(client.sessionId);
    if (client.sessionId === this.hostId) this.closeRoom();
  }

  override onDispose() {
    sessions.delete(this.roomId);
  }

  // ---------------------------------------------------------------- views and helpers

  private playerOf(client: Client) {
    const id = this.playerIds.get(client.sessionId);
    return id ? this.state.players.get(id) : undefined;
  }
  private runtimeOf(client: Client) {
    const id = this.playerIds.get(client.sessionId);
    return id ? this.runtime.get(id) : undefined;
  }
  private notify(notice: NoticeMessage, only?: Client) {
    if (only) only.send(MESSAGE.notice, notice);
    else for (const client of this.clients) client.send(MESSAGE.notice, notice);
  }
  /** Withdraw an object from every view before it is deleted from a filtered collection. */
  private revoke(object: Schema) {
    for (const client of this.clients) if (client.view?.has(object)) client.view.remove(object);
  }
  private replacePlayerCollection() {
    // The SDK merges a reconnect snapshot into its retained schema. A new collection reference
    // makes a missed start or departure replace the old roster, including revoked lobby seats.
    const players = new MapSchema<Player>();
    for (const [id, player] of this.state.players) players.set(id, player);
    this.state.players = players;
    this.resetViews();
  }
  private resetViews() {
    for (const client of this.clients) {
      client.view = new StateView();
      this.refreshView(client);
    }
  }
  private refreshViews() {
    for (const client of this.clients) this.refreshView(client);
  }
  private refreshView(client: Client) {
    const id = this.playerIds.get(client.sessionId);
    let audience: Audience;
    if (client.sessionId === this.hostId) audience = 'host';
    else if (id)
      audience = this.state.status === 'lobby' ? 'lobby' : this.state.players.get(id)?.teamId;
    syncVisibility((client.view ??= new StateView()), this.state, {
      audience,
      area: id ? this.runtime.get(id)?.area : undefined,
    });
  }

  private assertNicknameAvailable(nickname: string) {
    if (
      [...this.state.players.values()].some(
        (player) => nicknameKey(player.nickname) === nicknameKey(nickname),
      )
    ) {
      throw new ServerError(409, 'That nickname is already taken. Choose another.');
    }
  }
  private simulate(elapsed: number) {
    if (this.state.status !== 'playing') return;
    const step = 1000 / SIMULATION_HZ;
    this.accumulator += Math.min(elapsed, 250);
    while (this.accumulator >= step) {
      const now = Date.now();
      if (!this.state.transition)
        for (const [id, player] of this.state.players) {
          const input = this.inputs.get(id);
          const area = this.runtime.get(id)?.area;
          if (area) {
            // Inside a chamber only the private Explorer moves, on the chamber's own collision.
            const chamber = this.level.areas.get(area);
            const explorer = this.state.explorers.get(id);
            if (chamber && explorer)
              movePlayer(player, input, step / 1000, now, chamber.world, chamber.bounds, explorer);
            continue;
          }
          const room = player.teamId && this.level.definition.rooms[player.teamId];
          if (room) movePlayer(player, input, step / 1000, now, this.level.world, room.bounds);
        }
      this.accumulator -= step;
      if (++this.ticks % 3 === 0) this.proximity();
    }
  }
  private cleanupInactive() {
    const now = Date.now();
    if (
      (this.hostMissingSince && now - this.hostMissingSince > (RECONNECT_SECONDS + 5) * 1000) ||
      now - this.lastActivity > 30 * 60_000 ||
      now - this.createdAt > 4 * 60 * 60_000
    )
      this.closeRoom();
  }
  private closeRoom() {
    if (this.closing) return;
    this.closing = true;
    void this.disconnect().catch((error: unknown) => console.error('Room cleanup failed', error));
  }

  /** Server-side inspection for automated tests. Nothing here is reachable from a client. */
  get inspection() {
    return {
      seed: this.seed,
      items: this.items,
      level: this.level,
      runtime: this.runtime,
      board: this.board,
      scripture: this.scripture,
      targets: (playerId: string) => {
        const player = this.state.players.get(playerId);
        const runtime = this.runtime.get(playerId);
        return player && runtime ? this.targets(player, runtime) : [];
      },
    };
  }
}
