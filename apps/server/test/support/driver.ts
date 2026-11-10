import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type { Room } from '@colyseus/sdk';
import {
  INTERACT_REACH,
  MESSAGE,
  SYMBOLS,
  fixtureId,
  type AreaMessage,
  type NoticeMessage,
  type PanelMessage,
  type Point,
  type PromptMessage,
  type Rectangle,
  type TeamId,
  type WorldState,
} from '@escape/shared';
import type { GameRoom } from '../../src/rooms/GameRoom.js';
import { distanceToRect, type Item } from '../../src/systems/placement.js';
import type {
  BalancePuzzle,
  LibraryPuzzle,
  MechanismPuzzle,
  MirrorPuzzle,
  SecretCodePuzzle,
} from '../../src/systems/puzzles.js';

export async function until(predicate: () => boolean, message: string, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(message);
    await delay(15);
  }
}

/** A real SDK client plus everything the server has privately told it. */
export interface Bot {
  room: Room<WorldState>;
  name: string;
  prompt: PromptMessage;
  panel?: PanelMessage;
  area: AreaMessage;
  discoveries: string[];
  notices: NoticeMessage[];
  playerId?: string;
}
export function attach(room: Room<WorldState>, name: string): Bot {
  const bot: Bot = { room, name, prompt: {}, area: {}, discoveries: [], notices: [] };
  room.onMessage(MESSAGE.prompt, (message: PromptMessage) => (bot.prompt = message));
  room.onMessage(MESSAGE.panel, (message: PanelMessage) => (bot.panel = message));
  room.onMessage(MESSAGE.area, (message: AreaMessage) => (bot.area = message));
  room.onMessage(
    MESSAGE.discoveries,
    (message: { ids: string[] }) => (bot.discoveries = message.ids),
  );
  room.onMessage(MESSAGE.notice, (message: NoticeMessage) => bot.notices.push(message));
  room.onMessage(
    MESSAGE.identity,
    (message: { playerId?: string }) => (bot.playerId = message.playerId),
  );
  room.onMessage(MESSAGE.error, () => undefined);
  // Tests drop connections seconds after joining; allow the SDK to reconnect immediately.
  room.reconnection.minUptime = 0;
  return bot;
}

/** Plays the game through genuine client messages. Only positions are set server-side
 * (a stand-in for walking); every rule is still enforced by the room. */
export class Driver {
  constructor(
    readonly server: GameRoom,
    readonly bots: Bot[],
  ) {}
  get state() {
    return this.server.state;
  }
  get inspection() {
    return this.server.inspection;
  }
  player(bot: Bot) {
    const player = [...this.state.players.values()].find((entry) => entry.nickname === bot.name);
    assert.ok(player, `No character for ${bot.name}`);
    return player;
  }
  team(teamId: TeamId) {
    return this.bots.filter((bot) => this.player(bot).teamId === teamId);
  }
  one(teamId: TeamId) {
    const bot = this.team(teamId)[0];
    assert.ok(bot, `Team ${teamId} has no bot`);
    return bot;
  }
  /** Puts the character on valid ground within reach of a rectangle, as if it had walked. */
  stand(bot: Bot, rect: Rectangle) {
    const player = this.player(bot);
    const runtime = this.inspection.runtime.get(player.id)!;
    const { level } = this.inspection;
    const chamber = runtime.area ? level.areas.get(runtime.area)! : undefined;
    const world = chamber?.world ?? level.world;
    const bounds = chamber?.bounds ?? level.definition.rooms[player.teamId!].bounds;
    const target: Point = chamber ? this.state.explorers.get(player.id)! : player;
    for (let radius = 0; radius <= 70; radius += 6)
      for (let angle = 0; angle < 360; angle += 20) {
        const point = {
          x:
            rect.x + rect.width / 2 + Math.cos((angle * Math.PI) / 180) * (radius + rect.width / 2),
          y:
            rect.y +
            rect.height / 2 +
            Math.sin((angle * Math.PI) / 180) * (radius + rect.height / 2),
        };
        if (world.isValid(point, bounds) && distanceToRect(point, rect) <= INTERACT_REACH - 8) {
          target.x = point.x;
          target.y = point.y;
          return point;
        }
      }
    assert.fail(`${bot.name} cannot stand near ${JSON.stringify(rect)}`);
  }
  target(bot: Bot, id: string) {
    const target = this.inspection.targets(this.player(bot).id).find((entry) => entry.id === id);
    assert.ok(target, `${bot.name} has no target ${id}`);
    return target;
  }
  async interact(bot: Bot, id: string) {
    this.stand(bot, this.target(bot, id).rect);
    bot.room.send(MESSAGE.interact, { id });
    await delay(60);
  }
  area(bot: Bot) {
    const player = this.player(bot);
    return this.inspection.level.secrets.areas[player.teamId!];
  }
  async enter(bot: Bot) {
    const area = this.area(bot);
    const runtime = this.inspection.runtime.get(this.player(bot).id)!;
    if (runtime.area) return;
    if (!runtime.discovered.has(area.entranceObjectId)) {
      await this.interact(bot, area.entranceObjectId);
      await until(() => bot.discoveries.includes(area.entranceObjectId), 'Entrance discovered');
    }
    await this.interact(bot, area.entranceObjectId);
    await until(() => bot.area.area?.key === area.id, `${bot.name} enters ${area.id}`);
  }
  async leave(bot: Bot) {
    const runtime = this.inspection.runtime.get(this.player(bot).id)!;
    if (!runtime.area) return;
    await this.interact(bot, this.area(bot).exitId);
    await until(() => !bot.area.area && !runtime.area, `${bot.name} leaves the chamber`);
  }
  /** Finds, opens and collects one item exactly as a phone would. */
  async collect(bot: Bot, item: Item) {
    if (item.area) await this.enter(bot);
    else await this.leave(bot);
    bot.panel = undefined;
    await this.interact(bot, item.container ?? item.id);
    if (item.type === 'verse' || item.container) {
      await until(() => bot.panel?.type === 'container', `${bot.name} sees a panel for ${item.id}`);
      bot.room.send(MESSAGE.collect, { id: item.id });
    }
    await until(() => Boolean(item.collectedBy), `${item.id} is collected`);
  }
  levelItems(type: Item['type'], teamId?: TeamId) {
    return this.inspection.items.filter(
      (item) =>
        item.level === this.state.level && item.type === type && (!teamId || item.team === teamId),
    );
  }
  async collectVerses(teamId?: TeamId) {
    for (const item of this.levelItems('verse', teamId)) {
      if (item.collectedBy) continue;
      const bot = this.one(item.team);
      await this.collect(bot, item);
    }
    for (const bot of this.bots) await this.leave(bot);
  }
  async solvePuzzle() {
    const level = this.state.level;
    const puzzle = this.inspection.level.puzzle;
    const a = this.one('A');
    const b = this.one('B');
    await this.leave(a);
    await this.leave(b);
    const act = async (bot: Bot, name: string, action: Record<string, unknown>) => {
      const id = fixtureId(level, this.player(bot).teamId!, name);
      this.stand(bot, this.target(bot, id).rect);
      bot.room.send(MESSAGE.puzzle, { id, ...action });
      await delay(60);
    };
    const tap = (bot: Bot, name: string) =>
      this.interact(bot, fixtureId(level, this.player(bot).teamId!, name));
    if (level === 1) await act(b, 'terminal', { code: (puzzle as SecretCodePuzzle).solution() });
    else if (level === 2) {
      for (const [index, on] of (puzzle as MirrorPuzzle).solution().entries())
        if (on) await tap(a, `switch-${index + 1}`);
    } else if (level === 3) {
      for (const symbol of (puzzle as LibraryPuzzle).solution())
        await tap(b, `pedestal-${SYMBOLS.indexOf(symbol) + 1}`);
    } else if (level === 4) {
      const solution = (puzzle as BalancePuzzle).solution();
      for (const bot of [a, b]) {
        const team = this.player(bot).teamId!;
        const view = puzzle.view(team, 0);
        assert.ok(view.kind === 'balance');
        for (const value of solution[team])
          await act(bot, 'scale', { weight: view.weights.findIndex((w) => w.value === value) });
      }
    } else {
      const solution = (puzzle as MechanismPuzzle).solution();
      for (const bot of [a, b])
        for (const [index, on] of solution[this.player(bot).teamId!].entries())
          if (on) await tap(bot, `switch-${index + 1}`);
      await tap(a, 'button');
      await tap(b, 'button');
    }
    await until(() => this.state.puzzleSolved, `Level ${level} puzzle is solved`);
  }
  /** Sends one player of a team into its exit alcove (reachable only through the open door). */
  toExit(teamId: TeamId) {
    const zone = this.inspection.level.definition.exits[teamId].zone;
    const player = this.player(this.one(teamId));
    player.x = zone.x + zone.width / 2;
    player.y = zone.y + zone.height / 2;
  }
  async completeLevel() {
    const level = this.state.level;
    await this.solvePuzzle();
    await this.collectVerses();
    await until(() => this.state.exitsUnlocked, `Level ${level} exits unlock`);
    this.toExit('A');
    this.toExit('B');
    await until(
      () => this.state.level !== level || this.state.status !== 'playing',
      `Level ${level} hands over to the next stage`,
    );
    await until(() => !this.state.transition, 'Transition ends');
  }
  /** Arranges the final board in canonical order through ordinary placement messages. */
  async arrange(bot: Bot, order: readonly string[]) {
    for (const [slot, card] of order.entries()) {
      if (this.state.boardSlots[slot] === card) continue;
      await delay(55); // stay under the per-client action rate limit
      bot.room.send(MESSAGE.board, {
        op: 'place',
        card,
        slot,
        expect: this.state.boardSlots[slot],
      });
      await until(() => this.state.boardSlots[slot] === card, `Card placed in slot ${slot + 1}`);
    }
  }
  canonical() {
    return this.inspection.items
      .filter((item) => item.type === 'verse')
      .sort((x, y) => x.verseNumber! - y.verseNumber!)
      .map((item) => item.id);
  }
}
