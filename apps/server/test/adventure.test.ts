import { after, before, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import {
  LEVELS,
  MESSAGE,
  VERSE_PLAN,
  type ChapterReveal,
  type CreateSessionResponse,
  type PacingStats,
  type TeamId,
  type WorldState,
} from '@escape/shared';
import { createGameServer } from '../src/app.js';
import { sessions } from '../src/rooms/GameRoom.js';
import { Driver, attach, until, type Bot } from './support/driver.js';

// The engine is exercised with the labelled placeholder deck and a reproducible seed.
process.env.SCRIPTURE_DATASET = 'fixture';
process.env.GAME_SEED = 'adventure-test-seed';
process.env.TRANSITION_MS = '80';

const { gameServer, httpServer } = createGameServer();
let httpUrl: string;
let sdk: Client;
before(async () => {
  await gameServer.listen(0, '127.0.0.1');
  httpUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  sdk = new Client(httpUrl.replace('http:', 'ws:'));
});
after(async () => {
  await gameServer.gracefullyShutdown(false);
});

function incomingFrames(room: Room<WorldState>) {
  const frames: Buffer[] = [];
  const decode = room.connection.events.onmessage!;
  room.connection.events.onmessage = (event: { data: ArrayBuffer }) => {
    frames.push(Buffer.from(event.data));
    decode(event);
  };
  return frames;
}
const floatBytes = (value: number) => {
  const bytes = Buffer.alloc(4);
  bytes.writeFloatLE(value);
  return bytes;
};
const mentions = (frames: Buffer[], text: string) =>
  frames.some((frame) => frame.includes(Buffer.from(text, 'utf8')));

async function game(t: TestContext, names = ['Amber', 'Cobalt', 'Jade', 'Sable']) {
  const response = await fetch(`${httpUrl}/api/sessions`, { method: 'POST' });
  const created = (await response.json()) as CreateSessionResponse;
  const host = await sdk.joinById<WorldState>(created.code, {
    role: 'host',
    hostToken: created.hostToken,
  });
  const hostBot = attach(host, 'host');
  const hostFrames = incomingFrames(host);
  const bots: Bot[] = [];
  const frames = new Map<Bot, Buffer[]>();
  for (const name of names) {
    const room = await sdk.joinById<WorldState>(created.code, { role: 'player', nickname: name });
    const bot = attach(room, name);
    bots.push(bot);
    frames.set(bot, incomingFrames(room));
  }
  t.after(async () => {
    for (const room of [...bots.map((bot) => bot.room), host])
      if (room.connection.isOpen) await room.leave();
  });
  await until(() => host.state?.players?.size === names.length, 'Everyone is in the lobby');
  host.send(MESSAGE.start);
  await until(
    () =>
      host.state.status === 'playing' && bots.every((bot) => bot.room.state.status === 'playing'),
    'The game starts',
  );
  const server = sessions.get(created.code)!;
  const driver = new Driver(server, bots);
  assert.equal(driver.team('A').length, 2);
  assert.equal(driver.team('B').length, 2);
  return { host, hostBot, hostFrames, bots, frames, server, driver };
}
function reconnecting(bot: Bot, server: Driver['server']) {
  const client = server.clients.getById(bot.room.sessionId);
  assert.ok(client);
  client.leave(1001);
}

test('hidden chambers stay off the wire until entered; cabinets, atomic collection and reconnection', async (t) => {
  const { host, hostFrames, frames, server, driver } = await game(t);
  const [a1, a2] = driver.team('A') as [Bot, Bot];
  const b1 = driver.one('B');
  const area = driver.area(a1);
  const items = driver.levelItems('verse', 'A');
  const chestVerse = items.find((item) => item.area && item.container)!;
  const looseVerse = items.find((item) => item.area && item.point)!;
  const publicVerse = items.find((item) => !item.area)!;
  const artifact = driver.levelItems('artifact', 'A').find((item) => item.area && item.point)!;
  assert.ok(chestVerse && looseVerse && publicVerse && artifact);

  // Approaching the disguised entrance offers a contextual clue, not an obvious door.
  driver.stand(a1, driver.target(a1, area.entranceObjectId).rect);
  await until(() => a1.prompt.id === area.entranceObjectId, 'A subtle prompt appears');
  assert.equal(a1.prompt.label, 'Take a closer look');
  assert.ok(a1.prompt.hint);
  // The other team cannot use this room's entrance, and nobody can collect what they never saw.
  b1.room.send(MESSAGE.interact, { id: area.entranceObjectId });
  a1.room.send(MESSAGE.collect, { id: chestVerse.id });
  a2.room.send(MESSAGE.collect, { id: publicVerse.id });
  await delay(120);
  assert.deepEqual(b1.discoveries, []);
  assert.ok(!chestVerse.collectedBy && !publicVerse.collectedBy);
  assert.equal(a1.area.area, undefined, 'Geometry is not sent before the player goes in');

  await driver.enter(a1);
  assert.deepEqual(a2.discoveries, [], 'Discovery is personal');
  assert.equal(a1.area.area!.name, area.name);
  assert.ok(
    a1.area.area!.fixtures.some((entry) => entry.id === looseVerse.id && entry.kind === 'scroll'),
  );
  const self = driver.player(a1);
  await until(
    () => host.state.players.get(self.id)?.exploring === true,
    'Host roster shows exploring',
  );
  assert.equal(host.state.explorers?.size ?? 0, 0);
  assert.equal(a2.room.state.explorers?.size ?? 0, 0);
  assert.equal(b1.room.state.explorers?.size ?? 0, 0);
  await until(() => a1.room.state.explorers?.size === 1, 'The explorer sees itself');

  // Movement inside the chamber never changes the public marker the host can see.
  const publicSpot = { x: self.x, y: self.y };
  assert.deepEqual(publicSpot, area.returnTo);
  const explorer = server.state.explorers.get(self.id)!;
  const before = { x: explorer.x, y: explorer.y };
  for (let seq = 1; seq <= 6; seq++) {
    a1.room.send(MESSAGE.input, { x: 0, y: -1, seq });
    await delay(40);
  }
  assert.ok(explorer.y < before.y, 'The explorer walks inside the chamber');
  assert.deepEqual({ x: self.x, y: self.y }, publicSpot);
  const marker = 101.625;
  explorer.x = marker;
  await until(
    () => a1.room.state.explorers.get(self.id)?.x === marker,
    'Own view receives position',
  );
  for (const [bot, captured] of frames)
    assert.equal(
      captured.some((frame) => frame.includes(floatBytes(marker))),
      bot === a1,
      bot.name,
    );
  assert.ok(
    !hostFrames.some((frame) => frame.includes(floatBytes(marker))),
    'Host gets no coordinates',
  );
  for (const captured of [hostFrames, frames.get(a2)!, frames.get(b1)!]) {
    assert.ok(!mentions(captured, area.name), 'Chamber name leaked');
    assert.ok(!mentions(captured, area.exitId), 'Chamber fixtures leaked');
    for (const item of driver.inspection.items)
      if (item.type === 'verse')
        assert.ok(!mentions(captured, item.text!), 'Undiscovered verse text leaked');
  }
  assert.ok(!mentions(frames.get(a1)!, chestVerse.text!), 'Unopened cabinet contents are not sent');

  // A cabinet reveals its contents only after a valid, nearby inspection.
  a1.room.send(MESSAGE.collect, { id: chestVerse.id });
  await delay(100);
  assert.ok(!chestVerse.collectedBy, 'Cannot collect from an unopened container');
  await driver.interact(a1, chestVerse.container!);
  await until(() => a1.panel?.type === 'container', 'Container opens');
  assert.ok(a1.panel?.type === 'container');
  assert.deepEqual(a1.panel.items, [{ id: chestVerse.id, kind: 'verse', text: chestVerse.text }]);
  assert.ok(
    !/verseNumber|reference|Sample \d/.test(JSON.stringify(a1.panel)),
    'No verse number on a card',
  );
  // Walking away revokes reach: the open panel alone is not a licence to collect.
  driver.stand(a1, { ...area.spawn, width: 0, height: 0 });
  a1.room.send(MESSAGE.collect, { id: chestVerse.id });
  await delay(100);
  assert.ok(!chestVerse.collectedBy, 'Server validates interaction distance');

  // A teammate independently enters; both grab the same card in the same instant.
  await driver.enter(a2);
  await until(() => a2.room.state.explorers?.size === 2, 'Teammates in one chamber see each other');
  await driver.interact(a1, chestVerse.container!);
  await driver.interact(a2, chestVerse.container!);
  a1.room.send(MESSAGE.collect, { id: chestVerse.id });
  a2.room.send(MESSAGE.collect, { id: chestVerse.id });
  await until(() => Boolean(chestVerse.collectedBy), 'One of them collects it');
  await delay(150);
  assert.equal(server.state.versesA, 1);
  assert.equal(server.state.versesFound, 1);
  assert.equal(server.state.cards.size, 1);
  const finders = [a1, a2].map((bot) => driver.player(bot).verses);
  assert.deepEqual([...finders].sort(), [0, 1]);
  assert.ok([a1, a2].some((bot) => bot.notices.some((n) => /already collected/.test(n.text))));
  a1.room.send(MESSAGE.collect, { id: chestVerse.id });
  await delay(80);
  assert.equal(server.state.versesFound, 1, 'Duplicate collection is rejected');
  // Shared collection: every player may read the card; the host only gets the counters.
  await until(
    () => b1.room.state.cards?.size === 1 && host.state.versesFound === 1,
    'Shared state',
  );
  assert.equal(b1.room.state.cards.get(chestVerse.id)?.text, chestVerse.text);
  assert.deepEqual(
    Object.keys(
      (b1.room.state.cards.get(chestVerse.id) as unknown as { toJSON(): object }).toJSON(),
    ).sort(),
    ['finder', 'id', 'text'],
  );
  assert.equal(host.state.cards?.size ?? 0, 0);
  assert.ok(
    !mentions(hostFrames, chestVerse.text!),
    'Host never receives verse text during levels',
  );

  // The loose scroll disappears for everyone inside once collected.
  await driver.collect(a2, looseVerse);
  await until(
    () => !a1.area.area?.fixtures.some((entry) => entry.id === looseVerse.id),
    'Teammate sees the collected state',
  );
  // Personal, optional artifact: owned by the collector, counted, not a verse.
  await driver.collect(a1, artifact);
  assert.equal(driver.player(a1).artifacts, artifact.artifact);
  assert.equal(driver.player(a2).artifacts, '');
  assert.equal(server.state.artifactsFound, 1);
  assert.equal(server.state.versesFound, 2);

  // Reconnecting inside the chamber restores it and the way out still works.
  const token = a2.room.reconnectionToken;
  a2.area = {};
  reconnecting(a2, server);
  await until(() => a2.room.reconnectionToken !== token && a2.room.connection.isOpen, 'Reconnects');
  a2.room.send(MESSAGE.identify);
  await until(() => a2.area.area?.key === area.id, 'Chamber is restored after reconnect');
  await until(() => a2.room.state.explorers?.size === 2, 'Explorers are restored');
  assert.deepEqual(a2.discoveries, [area.entranceObjectId]);
  assert.equal(a2.room.state.cards.size, 2);
  await driver.leave(a2);
  assert.equal(driver.player(a2).exploring, false);
  await driver.leave(a1);
  await until(() => host.state.players.get(self.id)?.exploring === false, 'Host sees the return');
  assert.equal(server.state.explorers.size, 0);
  // Back in the public room the player stands on valid ground in their own room.
  const room = LEVELS[0]!.rooms.A.bounds;
  assert.ok(self.x > room.x && self.x < room.x + room.width && self.y > room.y);
  // An artifact lying in the public room is known to its team, never to the host or rivals.
  const floor = driver.levelItems('artifact', 'A').find((item) => !item.area && item.point)!;
  assert.ok(a1.room.state.pickups.has(floor.id));
  assert.ok(!host.state.pickups?.has(floor.id) && !b1.room.state.pickups?.has(floor.id));
  await driver.collect(a2, floor);
  await until(() => !a1.room.state.pickups.has(floor.id), 'Pickup disappears for the team');
  assert.equal(driver.player(a2).artifacts, floor.artifact);
});

test('both quests gate every exit; five levels, the Hall of Wisdom and a single victory', async (t) => {
  const { host, hostBot, hostFrames, bots, frames, server, driver } = await game(t);
  const state = server.state;
  const a = driver.one('A');
  const b = driver.one('B');
  const doorsOpen = () => [...state.doors.values()].every((door) => door.state === 'open');
  const forge = async () => {
    // Nothing a client (or the host) can send sets progress flags directly.
    for (const room of [host, a.room, b.room]) {
      room.send(MESSAGE.board, { op: 'submit' });
      room.send(MESSAGE.puzzle, { id: 'l1-b-terminal', solved: true, puzzleSolved: true });
      room.send(MESSAGE.collect, { id: 'everything', versesFound: 27 });
      room.send(MESSAGE.start);
    }
    await delay(120);
  };

  // Level 1: the puzzle alone is not enough.
  await driver.solvePuzzle();
  await forge();
  driver.toExit('A');
  driver.toExit('B');
  await delay(250);
  assert.equal(state.puzzleSolved, true);
  assert.equal(state.exitsUnlocked, false);
  assert.equal(doorsOpen(), false);
  assert.equal(state.level, 1);
  assert.ok(a.notices.some((n) => /Find 5 more Wisdom fragments/.test(n.text)));
  // One team's verses are still not enough.
  await driver.collectVerses('A');
  assert.equal(state.versesA, 3);
  assert.equal(state.exitsUnlocked, false);
  await driver.collectVerses('B');
  await until(() => state.exitsUnlocked && doorsOpen(), 'Puzzle + all verses unlock both exits');
  assert.equal(state.puzzleSolved, true, 'The solved puzzle is preserved while exploring');
  await until(
    () => host.state.exitsUnlocked && host.state.versesA === 3 && host.state.versesB === 2,
    'Host counters',
  );
  // Both teams must reach their own exits; one is not enough.
  for (const bot of bots)
    Object.assign(driver.player(bot), LEVELS[0]!.rooms[driver.player(bot).teamId!].bounds).x += 300;
  for (const bot of bots) driver.player(bot).y += 400;
  driver.toExit('A');
  await until(() => state.exitA, 'Team A waits at its exit');
  await delay(250);
  assert.equal(state.level, 1);
  assert.equal(state.exitB, false);
  driver.toExit('B');
  await until(() => state.level === 2 && !state.transition, 'Synchronized transition to level 2');
  assert.equal(state.mapId, LEVELS[1]!.map.id);
  for (const bot of bots) {
    const player = driver.player(bot);
    const room = LEVELS[1]!.rooms[player.teamId!];
    assert.equal(state.teams.get(player.teamId!)!.roomId, room.id);
    assert.ok(driver.inspection.level.world.isValid(player, room.bounds), 'Valid team spawn');
    await until(
      () => bot.room.state.level === 2 && bot.room.state.cards.size === 5,
      'Phones follow',
    );
    assert.equal(bot.area.area, undefined);
  }
  assert.equal(state.versesFound, 5);
  assert.deepEqual([state.versesA, state.versesB, state.requiredA, state.requiredB], [0, 0, 2, 3]);
  assert.equal(state.puzzleSolved, false);
  assert.equal(doorsOpen(), false);

  // Level 2: all verses alone do not unlock either.
  await driver.collectVerses();
  await forge();
  assert.deepEqual([state.versesA, state.versesB], [2, 3]);
  assert.equal(state.exitsUnlocked, false);
  assert.equal(doorsOpen(), false);
  await driver.solvePuzzle();
  await until(() => state.exitsUnlocked, 'Then the puzzle opens the exits');
  driver.toExit('A');
  driver.toExit('B');
  await until(() => state.level === 3 && !state.transition, 'Level 3');

  // Level 3: a phone drops during the transition and comes back on the authoritative level.
  await driver.solvePuzzle();
  await driver.collectVerses();
  await until(() => state.exitsUnlocked, 'Level 3 exits');
  driver.toExit('A');
  driver.toExit('B');
  await until(() => state.transition, 'Transition begins');
  const token = b.room.reconnectionToken;
  reconnecting(b, server);
  await until(() => state.level === 4 && !state.transition, 'Level 4');
  await until(() => b.room.reconnectionToken !== token && b.room.connection.isOpen, 'Reconnect');
  b.room.send(MESSAGE.identify);
  await until(
    () => b.room.state.level === 4 && b.room.state.mapId === LEVELS[3]!.map.id,
    'Restored level',
  );
  assert.equal(b.room.state.cards.size, 15);
  assert.equal(driver.player(b).connected, true);

  await driver.completeLevel();
  assert.equal(state.level, 5);
  assert.equal(state.status, 'playing');
  // Completing level 5 leads to the final challenge, not to victory.
  await driver.completeLevel();
  assert.equal(state.status, 'final');
  assert.equal(state.chapter, '');
  assert.equal(state.versesFound, 27);
  const pacing = JSON.parse(state.stats) as PacingStats;
  assert.deepEqual(
    pacing.levels.map((entry) => entry.level),
    [1, 2, 3, 4, 5],
  );
  assert.equal(pacing.finalSeconds, undefined);

  const canonical = driver.canonical();
  const tray = [...state.boardTray];
  assert.equal(tray.length, 27);
  assert.deepEqual([...tray].sort(), [...canonical].sort());
  assert.notDeepEqual(tray, canonical, 'Cards are presented shuffled');
  assert.ok([...state.boardSlots].every((id) => id === ''));
  await until(
    () => host.state.status === 'final' && host.state.cards?.size === 27,
    'Host shows the cards',
  );
  for (const bot of bots) {
    await until(
      () => bot.room.state.status === 'final' && bot.room.state.players.size === 4,
      'One shared hall',
    );
    assert.equal(bot.room.state.cards.size, 27);
  }
  // Until the board is solved no frame to anyone carries verse numbers or the ordered chapter.
  for (const captured of [hostFrames, ...frames.values()]) {
    assert.ok(!mentions(captured, 'Sample 1'), 'Canonical references leaked');
    assert.ok(!mentions(captured, '"number"'));
  }
  const verseNumbers = new Map(driver.inspection.items.map((item) => [item.id, item.verseNumber]));
  assert.ok(tray.some((id, index) => verseNumbers.get(id) !== index + 1));

  // Concurrent edits: two phones claim the same empty slot in the same tick.
  a.notices.length = b.notices.length = 0;
  a.room.send(MESSAGE.board, { op: 'place', card: tray[0], slot: 4, expect: '' });
  b.room.send(MESSAGE.board, { op: 'place', card: tray[1], slot: 4, expect: '' });
  await until(() => state.boardSlots[4] !== '', 'One placement wins');
  await delay(120);
  const winner = state.boardSlots[4]!;
  assert.ok(winner === tray[0] || winner === tray[1]);
  assert.equal(
    [...state.boardSlots].filter(Boolean).length,
    1,
    'The losing card is still in the tray',
  );
  assert.ok([a, b].some((bot) => bot.notices.some((n) => /just moved a card/.test(n.text))));
  // Swap, move and remove are atomic and broadcast to every screen.
  const loser = winner === tray[0] ? tray[1]! : tray[0]!;
  a.room.send(MESSAGE.board, { op: 'place', card: loser, slot: 9, expect: '' });
  await until(() => state.boardSlots[9] === loser, 'Second card placed');
  b.room.send(MESSAGE.board, { op: 'place', card: loser, slot: 4, expect: winner });
  await until(() => state.boardSlots[4] === loser && state.boardSlots[9] === winner, 'Swapped');
  await until(
    () => host.state.boardSlots[4] === loser && a.room.state.boardSlots[9] === winner,
    'Synchronized',
  );
  a.room.send(MESSAGE.board, { op: 'remove', card: winner });
  await until(() => state.boardSlots[9] === '', 'Removed');
  host.send(MESSAGE.board, { op: 'place', card: winner, slot: 0, expect: '' });
  a.room.send(MESSAGE.board, { op: 'submit' });
  await until(() => a.notices.some((n) => /Place all 27 cards/.test(n.text)), 'Incomplete board');
  assert.equal(state.boardSlots[0], '', 'The host display cannot edit the board');
  assert.equal(state.boardAttempts, 0);

  // A complete but wrong sequence is rejected, keeps the board and reveals only a count.
  const wrong = [...canonical];
  [wrong[2], wrong[20]] = [wrong[20]!, wrong[2]!];
  await driver.arrange(a, wrong);
  a.room.send(MESSAGE.board, { op: 'submit' });
  await until(() => state.boardAttempts === 1, 'Wrong attempt counted');
  assert.equal(state.status, 'final');
  assert.equal(state.boardCorrect, 25);
  assert.deepEqual([...state.boardSlots], wrong);
  assert.equal(state.chapter, '');
  // A phone reconnecting mid-puzzle gets the same authoritative board back.
  const finalToken = a.room.reconnectionToken;
  reconnecting(a, server);
  await until(
    () => a.room.reconnectionToken !== finalToken && a.room.connection.isOpen,
    'Reconnect',
  );
  await until(
    () => a.room.state.boardSlots?.length === 27 && a.room.state.boardSlots[2] === wrong[2],
    'Board restored',
  );
  assert.deepEqual([...a.room.state.boardSlots], wrong);
  assert.equal(a.room.state.cards.size, 27);

  await driver.arrange(b, canonical);
  await delay(1600); // the submission cooldown
  b.room.send(MESSAGE.board, { op: 'submit' });
  await until(() => state.status === 'won', 'The correct order wins the game');
  const chapter = JSON.parse(state.chapter) as ChapterReveal;
  assert.deepEqual(
    chapter.verses.map((verse) => verse.number),
    Array.from({ length: 27 }, (_, i) => i + 1),
  );
  chapter.verses.forEach((verse, index) =>
    assert.equal(verse.text, state.cards.get(canonical[index]!)!.text),
  );
  assert.ok(chapter.attribution && chapter.license && chapter.translation);
  await until(
    () => host.state.status === 'won' && host.state.chapter.length > 0,
    'Host victory screen',
  );
  await until(
    () => hostBot.notices.some((n) => /escaped together/.test(n.text)),
    'Shared celebration',
  );
  const final = JSON.parse(state.stats) as PacingStats;
  assert.ok(final.finalSeconds! >= 0 && final.totalSeconds! > 0);
  // Victory is idempotent: further submissions and edits change nothing.
  const snapshot = JSON.stringify(state.toJSON());
  a.room.send(MESSAGE.board, { op: 'submit' });
  b.room.send(MESSAGE.board, { op: 'remove', card: canonical[0] });
  await delay(200);
  assert.equal(JSON.stringify(state.toJSON()), snapshot);
  // Personal results survive to the victory screen.
  assert.equal(
    [...state.players.values()].reduce((sum, player) => sum + player.verses, 0),
    27,
  );
  assert.equal(
    VERSE_PLAN.reduce((sum, plan) => sum + plan.A + plan.B, 0),
    27,
  );
});

test('a session cannot start without an installed Scripture dataset', async (t) => {
  process.env.SCRIPTURE_DATASET = 'not-installed';
  t.after(() => (process.env.SCRIPTURE_DATASET = 'fixture'));
  const response = await fetch(`${httpUrl}/api/sessions`, { method: 'POST' });
  const created = (await response.json()) as CreateSessionResponse;
  const host = await sdk.joinById<WorldState>(created.code, {
    role: 'host',
    hostToken: created.hostToken,
  });
  const errors: string[] = [];
  host.onMessage(MESSAGE.error, (error: { message: string }) => errors.push(error.message));
  const phone = await sdk.joinById<WorldState>(created.code, { role: 'player', nickname: 'Solo' });
  t.after(async () => {
    await phone.leave();
    await host.leave();
  });
  await until(() => host.state?.players?.size === 1, 'Player joins');
  host.send(MESSAGE.start);
  await until(() => errors.length === 1, 'The host is told why');
  assert.match(errors[0]!, /not installed/);
  assert.equal(host.state.status, 'lobby');
});

test('team rooms stay separate on every level', () => {
  for (const level of LEVELS) {
    const { A, B } = level.rooms;
    assert.ok(A.bounds.x + A.bounds.width <= B.bounds.x, 'Rooms never overlap');
    for (const team of ['A', 'B'] as TeamId[]) {
      const zone = level.exits[team].zone;
      const b = level.rooms[team].bounds;
      assert.ok(zone.x >= b.x && zone.x + zone.width <= b.x + b.width, 'Exit inside its own room');
      assert.ok(level.fixtures.filter((f) => f.roomId === level.rooms[team].id).length >= 4);
    }
  }
});
