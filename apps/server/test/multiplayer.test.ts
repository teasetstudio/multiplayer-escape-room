import { after, before, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import {
  DEFAULT_MAP,
  MESSAGE,
  MAX_PLAYERS,
  WORLD,
  type CreateSessionResponse,
  type WorldState,
} from '@escape/shared';
import { createGameServer } from '../src/app.js';
import { sessions } from '../src/rooms/GameRoom.js';
import { CollisionWorld } from '../src/systems/CollisionWorld.js';

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

async function until(predicate: () => boolean, message: string, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(message);
    await delay(20);
  }
}
async function session(t: TestContext) {
  const response = await fetch(`${httpUrl}/api/sessions`, { method: 'POST' });
  assert.equal(response.status, 201);
  const created = (await response.json()) as CreateSessionResponse;
  assert.match(created.code, /^[A-Z2-9]{8}$/);
  assert.ok(created.hostToken.length >= 40);
  const host = await sdk.joinById<WorldState>(created.code, {
    role: 'host',
    hostToken: created.hostToken,
  });
  host.onMessage(MESSAGE.error, () => undefined);
  t.after(async () => {
    if (host.connection.isOpen) await host.leave();
  });
  await until(() => Boolean(host.state?.hostConnected), 'Host should receive state');
  assert.equal(host.state.mapId, DEFAULT_MAP.id);
  assert.equal(host.state.mapVersion, DEFAULT_MAP.version);
  assert.equal(host.state.doors.size, 2);
  assert.ok([...host.state.doors.values()].every((door) => door.state === 'closed'));
  return { ...created, host };
}
async function player(t: TestContext, code: string, nickname: string) {
  const room = await sdk.joinById<WorldState>(code, { role: 'player', nickname });
  room.onMessage(MESSAGE.error, () => undefined);
  t.after(async () => {
    if (room.connection.isOpen) await room.leave();
  });
  return room;
}
function drop(room: Room<WorldState>) {
  const serverClient = sessions.get(room.roomId)?.clients.getById(room.sessionId);
  assert.ok(serverClient);
  serverClient.leave(1001);
}
function getPlayer(room: Room<WorldState>, name: string) {
  return [...room.state.players.values()].find((entry) => entry.nickname === name);
}

test('five concurrent clients join, host alone starts, movement is authoritative, and late joins fail', async (t) => {
  const { code, host, hostToken } = await session(t);
  await assert.rejects(sdk.joinById(code, { role: 'host', hostToken: 'forged' }));
  const players = await Promise.all(
    Array.from({ length: 5 }, (_, index) => player(t, code, `Player ${index + 1}`)),
  );
  await until(() => host.state.players.size === 5, 'Five players should be visible');
  assert.equal(new Set([...host.state.players.values()].map((entry) => entry.color)).size, 5);
  assert.equal(new Set([...host.state.players.values()].map((entry) => entry.id)).size, 5);
  await assert.rejects(sdk.joinById(code, { role: 'player', nickname: '  PLAYER 1  ' }));
  await assert.rejects(sdk.joinById(code, { role: 'host', hostToken }));
  const first = players[0]!;
  first.send(MESSAGE.start);
  await delay(150);
  assert.equal(host.state.status, 'lobby');
  const publicInfo = await (await fetch(`${httpUrl}/api/sessions/${code}`)).text();
  assert.ok(!publicInfo.includes(hostToken));
  host.send(MESSAGE.start);
  await until(
    () =>
      players.every((room) => room.state?.status === 'playing') && host.state.status === 'playing',
    'Everyone should start',
  );
  await assert.rejects(sdk.joinById(code, { role: 'player', nickname: 'Late player' }));
  const initial = getPlayer(host, 'Player 1')!;
  const x = initial.x;
  const otherX = getPlayer(host, 'Player 2')!.x;
  first.send(MESSAGE.input, { x: 9999, y: 0, seq: 1, playerId: getPlayer(host, 'Player 2')!.id });
  await delay(150);
  assert.equal(initial.x, x);
  first.send(MESSAGE.input, { x: 1, y: 0, seq: 2, playerId: getPlayer(host, 'Player 2')!.id });
  await until(() => getPlayer(host, 'Player 1')!.x > x, 'Host should see validated movement');
  const teammate = players.slice(1).find((room) => getPlayer(room, 'Player 1'));
  assert.ok(teammate);
  await until(() => getPlayer(teammate, 'Player 1')!.x > x, 'Teammates should see movement');
  assert.equal(getPlayer(host, 'Player 2')!.x, otherX);
  await delay(450);
  const stopped = getPlayer(host, 'Player 1')!.x;
  assert.ok(stopped - x <= WORLD.speed * 0.34, 'Expired input cannot move forever');
  await delay(150);
  assert.equal(getPlayer(host, 'Player 1')!.x, stopped);
  // Replayed sequence numbers cannot change direction or renew the input lease.
  first.send(MESSAGE.input, { x: -1, y: 0, seq: 1 });
  await delay(150);
  assert.equal(getPlayer(host, 'Player 1')!.x, stopped);
  await players[4]!.leave();
  await until(
    () => host.state.players.size === 4,
    'A deliberate departure should remove only its character',
  );
});

test('player and host reconnect tokens reclaim their original roles after a dropped connection', async (t) => {
  const { code, host } = await session(t);
  const original = await player(t, code, 'Lily');
  await Promise.all(['Olive', 'Violet', 'Rose'].map((name) => player(t, code, name)));
  await until(() => host.state.players.size === 4, 'Player should appear');
  host.send(MESSAGE.start);
  await until(() => host.state.status === 'playing', 'Game should start');
  const startX = getPlayer(host, 'Lily')!.x;
  original.send(MESSAGE.input, { x: 1, y: 0, seq: 1 });
  await until(() => getPlayer(host, 'Lily')!.x > startX, 'Move before reconnecting');
  original.send(MESSAGE.input, { x: 0, y: 0, seq: 2 });
  await delay(120);
  const beforeDrop = { ...getPlayer(host, 'Lily')! };
  const teamBefore = beforeDrop.teamId!;
  const roomBefore = host.state.teams.get(teamBefore)!.roomId;
  const token = original.reconnectionToken;
  original.reconnection.enabled = false;
  drop(original);
  await until(
    () => getPlayer(host, 'Lily')?.connected === false,
    'Dropped player should be marked offline',
  );
  await assert.rejects(sdk.reconnect(`${code}:invalid-token`));
  const resumed = await sdk.reconnect<WorldState>(token);
  t.after(async () => {
    if (resumed.connection.isOpen) await resumed.leave();
  });
  await until(
    () => Boolean(resumed.state?.players && getPlayer(resumed, 'Lily')?.connected),
    'Token should reclaim character',
  );
  const returned = getPlayer(resumed, 'Lily')!;
  assert.equal(returned.id, beforeDrop.id);
  assert.equal(returned.color, beforeDrop.color);
  assert.equal(returned.x, beforeDrop.x);
  assert.equal(returned.y, beforeDrop.y);
  assert.equal(returned.nickname, beforeDrop.nickname);
  assert.equal(returned.teamId, teamBefore);
  assert.equal(resumed.state.teams.size, 1);
  assert.equal(resumed.state.teams.get(teamBefore)?.roomId, roomBefore);
  assert.equal(resumed.state.players.size, 2);
  assert.ok([...resumed.state.players.values()].every((p) => p.teamId === teamBefore));
  assert.equal(resumed.state.doors.size, 1);
  assert.equal(resumed.state.mapVersion, DEFAULT_MAP.version);
  assert.ok(new CollisionWorld(DEFAULT_MAP).isValid(returned));
  const hostToken = host.reconnectionToken;
  host.reconnection.enabled = false;
  drop(host);
  await until(() => resumed.state.hostConnected === false, 'Host drop should be visible');
  const resumedHost = await sdk.reconnect<WorldState>(hostToken);
  await until(() => resumedHost.state?.hostConnected === true, 'Host should reclaim overview');
  assert.equal(resumedHost.state.players.size, 4, 'The host must not create a character');
  assert.equal(resumedHost.state.teams.size, 2);
  assert.equal(resumedHost.state.doors.size, 2);
  assert.equal(getPlayer(resumedHost, 'Lily')!.teamId, teamBefore);
  await resumedHost.leave();
  await until(() => !sessions.has(code), 'Ending the host session should dispose the room');
});

test('automatic SDK reconnection works without replacing the client room', async (t) => {
  const { code, host } = await session(t);
  const room = await player(t, code, 'Nick');
  await until(() => host.state.players.size === 1, 'Player should join');
  const id = getPlayer(host, 'Nick')!.id;
  room.reconnection.minUptime = 0;
  room.reconnection.delay = 100;
  let reconnected = false;
  room.onReconnect(() => {
    reconnected = true;
  });
  drop(room);
  await until(() => reconnected, 'Automatic reconnect should recover');
  await until(() => getPlayer(host, 'Nick')?.connected === true, 'Host should see recovery');
  assert.equal(getPlayer(host, 'Nick')!.id, id);
});

test('automatic reconnect across a missed start discards the old cross-team lobby roster', async (t) => {
  const { code, host } = await session(t);
  const phones = await Promise.all(['Owl', 'Heron', 'Ibis', 'Tern'].map((n) => player(t, code, n)));
  const phone = phones[0]!;
  await until(() => phone.state?.players?.size === 4, 'The phone knows the lobby roster');
  phone.reconnection.minUptime = 0;
  phone.reconnection.delay = 800;
  let resumed = false;
  phone.onReconnect(() => {
    resumed = true;
  });
  drop(phone);
  await until(() => getPlayer(host, 'Owl')?.connected === false, 'Seat drops before start');
  host.send(MESSAGE.start);
  await until(() => resumed && phone.state.status === 'playing', 'Automatic reconnect after start');
  const team = getPlayer(host, 'Owl')!.teamId!;
  const expected = [...host.state.players.values()].filter((p) => p.teamId === team);
  assert.deepEqual(new Set(phone.state.players.keys()), new Set(expected.map((p) => p.id)));
  const owl = getPlayer(host, 'Owl')!;
  const buddyIndex = phones.findIndex((room, i) => i > 0 && room.state.players.has(owl.id));
  assert.ok(buddyIndex > 0);
  resumed = false;
  drop(phone);
  await until(() => getPlayer(host, 'Owl')?.connected === false, 'Second temporary drop');
  await phones[buddyIndex]!.leave();
  await until(() => host.state.players.size === 3, 'Teammate departs during the drop');
  await until(
    () => resumed && getPlayer(phone, 'Owl')?.connected === true,
    'Same SDK room resumes',
  );
  assert.deepEqual([...phone.state.players.keys()], [owl.id], 'Departed teammates are removed too');
});

test('capacity is twenty players plus the host and public room creation is disabled', async (t) => {
  await assert.rejects(sdk.create('escape', { role: 'host' }));
  const { code, host } = await session(t);
  const phones = await Promise.all(
    Array.from({ length: MAX_PLAYERS }, (_, index) => player(t, code, `Crew ${index}`)),
  );
  await until(() => host.state.players.size === MAX_PLAYERS, '20 players should fit');
  assert.equal(new Set([...host.state.players.values()].map((entry) => entry.color)).size, 20);
  await assert.rejects(sdk.joinById(code, { role: 'player', nickname: 'Overflow' }));
  host.send(MESSAGE.start);
  await until(() => host.state.status === 'playing', 'Full games should still start');
  await until(
    () => phones.every((phone) => phone.state.status === 'playing'),
    'All 20 clients start',
  );
  const world = new CollisionWorld(DEFAULT_MAP);
  for (const [i, phone] of phones.entries()) {
    const me = getPlayer(phone, `Crew ${i}`)!;
    const team = phone.state.teams.get(me.teamId!)!;
    const room = DEFAULT_MAP.rooms.find((room) => room.id === team.roomId)!;
    assert.equal(room.startTeam, me.teamId);
    assert.equal(phone.state.teams.size, 1);
    assert.equal(phone.state.doors.size, 1);
    assert.equal(phone.state.players.size, 10);
    const expected = [...host.state.players.values()].filter((p) => p.teamId === me.teamId);
    assert.deepEqual(new Set(phone.state.players.keys()), new Set(expected.map((p) => p.id)));
    assert.equal(new Set(expected.map((p) => `${p.x},${p.y}`)).size, 10);
    assert.ok(expected.every((p) => world.isValid(p, room.bounds)));
    assert.ok([...phone.state.doors.values()].every((door) => door.roomId === team.roomId));
  }
});

test('simultaneous clients collide with walls, crates and closed doors in the same authoritative map', async (t) => {
  const { code, host } = await session(t);
  const clients = await Promise.all(
    ['Wall tester', 'Crate tester', 'Door tester', 'Free walker', 'Other walker'].map((name) =>
      player(t, code, name),
    ),
  );
  await until(() => host.state.players.size === 5, 'Everyone joins');
  host.send(MESSAGE.start);
  await until(() => clients.every((room) => room.state?.status === 'playing'), 'Everyone starts');
  const server = sessions.get(code)!;
  const world = new CollisionWorld(DEFAULT_MAP);
  const cases = [
    { name: 'Wall tester', x: 320, y: 50, dx: 0, dy: -1, finalX: 320, finalY: 22 },
    { name: 'Crate tester', x: 50, y: 650, dx: 1, dy: 0, finalX: 66, finalY: 650 },
    { name: 'Door tester', x: 145, y: 180, dx: 0, dy: -1, finalX: 145, finalY: 157 },
    { name: 'Free walker', x: 300, y: 400, dx: 1, dy: 0 },
    { name: 'Other walker', x: 675, y: 410, dx: 0, dy: 1 },
  ];
  // Same local fixtures in either randomly assigned chamber. Only the server can place avatars.
  for (const entry of cases) {
    const avatar = getPlayer(host, entry.name)!;
    const roomId = host.state.teams.get(avatar.teamId!)!.roomId;
    const { bounds } = DEFAULT_MAP.rooms.find((room) => room.id === roomId)!;
    entry.x += bounds.x;
    entry.y += bounds.y;
    if (entry.finalX !== undefined) entry.finalX += bounds.x;
    if (entry.finalY !== undefined) entry.finalY += bounds.y;
    assert.ok(world.isValid(entry, bounds));
    Object.assign(server.state.players.get(avatar.id)!, { x: entry.x, y: entry.y });
  }
  for (let seq = 1; seq <= 12; seq++) {
    cases.forEach((entry, index) =>
      clients[index]!.send(MESSAGE.input, {
        x: entry.dx,
        y: entry.dy,
        seq,
        position: { x: 9999, y: 9999 },
        doorState: 'open',
      }),
    );
    await delay(50);
  }
  clients.forEach((room) => room.send(MESSAGE.input, { x: 0, y: 0, seq: 13 }));
  await delay(150);
  for (const entry of cases) {
    const avatar = getPlayer(host, entry.name)!;
    assert.ok(world.isValid(avatar));
    if (entry.finalX !== undefined) {
      assert.equal(avatar.x, entry.finalX);
      assert.equal(avatar.y, entry.finalY);
    } else assert.ok(Math.hypot(avatar.x - entry.x, avatar.y - entry.y) > 70);
    for (const room of clients) {
      const copy = getPlayer(room, entry.name);
      if (!room.state.teams.has(avatar.teamId!)) assert.equal(copy, undefined);
      else {
        assert.equal(copy?.x, avatar.x);
        assert.equal(copy?.y, avatar.y);
      }
    }
  }
  assert.ok([...host.state.doors.values()].every((door) => door.state === 'closed'));
});

/** Capture bytes arriving on the SDK socket, before the schema decoder or any rendering code. */
function incomingFrames(room: Room<WorldState>) {
  const frames: Buffer[] = [];
  const decode = room.connection.events.onmessage!;
  room.connection.events.onmessage = (event: { data: ArrayBuffer }) => {
    frames.push(Buffer.from(event.data));
    decode(event);
  };
  return frames;
}
function floatBytes(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeFloatLE(value);
  return bytes;
}

test('the start patch and live WebSocket frames disclose only authorized objects and coordinates', async (t) => {
  const { code, host } = await session(t);
  const names = ['Amber', 'Cobalt', 'Jade', 'Sable'];
  const phones = await Promise.all(names.map((name) => player(t, code, name)));
  await until(
    () => phones.every((p) => p.state?.players?.size === names.length),
    'Shared lobby roster',
  );
  const snapshots: string[][][] = phones.map(() => []);
  const captures = phones.map((phone, i) => {
    assert.ok([...phone.state.players.values()].every((p) => !p.teamId && p.x === 0 && p.y === 0));
    assert.equal(phone.state.doors?.size ?? 0, 0);
    phone.onStateChange((s) => {
      if (s.status === 'playing') snapshots[i]!.push([...s.players.keys()]);
    });
    return incomingFrames(phone);
  });
  const hostFrames = incomingFrames(host);
  host.send(MESSAGE.start);
  await until(
    () => phones.every((p) => p.state.status === 'playing') && host.state.status === 'playing',
    'Atomic start',
  );
  for (const [i, phone] of phones.entries()) {
    const teamId = getPlayer(phone, names[i]!)!.teamId!;
    const expected = [...host.state.players.values()].filter((p) => p.teamId === teamId);
    assert.equal(expected.length, 2);
    assert.deepEqual(new Set(snapshots[i]![0]), new Set(expected.map((p) => p.id)));
    assert.equal(phone.state.teams.get(teamId)?.roomId, host.state.teams.get(teamId)?.roomId);
    for (const other of host.state.players.values()) {
      if (other.teamId === teamId) continue;
      assert.ok(
        !captures[i]!.some((f) => f.includes(floatBytes(other.x))),
        'Opponent spawn X leaked',
      );
    }
  }

  const target = getPlayer(host, names[0]!)!;
  const roomId = host.state.teams.get(target.teamId!)!.roomId;
  const bounds = DEFAULT_MAP.rooms.find((r) => r.id === roomId)!.bounds;
  const marker = bounds.x + 357.125;
  const server = sessions.get(code)!;
  const avatar = server.state.players.get(target.id)!;
  captures.forEach((frames) => {
    frames.length = 0;
  });
  hostFrames.length = 0;
  Object.assign(avatar, { x: marker, y: bounds.y + 387.625 });
  const door = [...server.state.doors.values()].find((entry) => entry.roomId === roomId)!;
  door.state = 'open'; // Server-only fixture exercises private room-object patches.
  await until(
    () =>
      host.state.doors.get(door.id)?.state === 'open' &&
      phones
        .filter((p) => p.state.teams.has(target.teamId!))
        .every((p) => p.state.players.get(target.id)?.x === marker),
    'Authorized peers receive the marker',
  );
  assert.ok(hostFrames.some((frame) => frame.includes(floatBytes(marker))));
  for (const [i, phone] of phones.entries()) {
    const allowed = phone.state.teams.has(target.teamId!);
    assert.equal(
      captures[i]!.some((frame) => frame.includes(floatBytes(marker))),
      allowed,
    );
    assert.equal(phone.state.doors.get(door.id)?.state, allowed ? 'open' : undefined);
    assert.equal(phone.state.players.has(target.id), allowed);
  }

  // Drive towards the divider from both sides, including forged room, team and coordinates.
  for (const p of server.state.players.values()) {
    const b = DEFAULT_MAP.rooms.find(
      (r) => r.id === server.state.teams.get(p.teamId!)!.roomId,
    )!.bounds;
    Object.assign(p, { x: p.teamId === 'A' ? b.x + b.width - 48 : b.x + 48, y: b.y + 384 });
  }
  for (let seq = 1; seq <= 8; seq++) {
    phones.forEach((phone, i) => {
      const fromA = getPlayer(host, names[i]!)!.teamId === 'A';
      phone.send(MESSAGE.input, {
        seq,
        x: fromA ? 1 : -1,
        y: 0,
        teamId: fromA ? 'B' : 'A',
        roomId: fromA ? 'room-b' : 'room-a',
        position: { x: 832, y: 448 },
      });
    });
    await delay(50);
  }
  const split = DEFAULT_MAP.rooms.find((r) => r.startTeam === 'B')!.bounds.x;
  for (const p of host.state.players.values()) {
    assert.equal(
      p.x,
      p.teamId === 'A' ? split - 8 - WORLD.playerRadius : split + 8 + WORLD.playerRadius,
    );
  }
});

test('a reserved lobby seat gets its team on reconnect and departures or repeat starts never rebalance', async (t) => {
  const { code, host } = await session(t);
  const phones = await Promise.all(
    ['Wren', 'Lark', 'Finch', 'Pipit', 'Swift'].map((n) => player(t, code, n)),
  );
  await until(() => phones.every((p) => p.state?.players?.size === 5), 'Full lobby received');
  const original = phones[0]!;
  const id = getPlayer(host, 'Wren')!.id;
  original.reconnection.enabled = false;
  const token = original.reconnectionToken;
  drop(original);
  await until(() => !host.state.players.get(id)!.connected, 'Reserved during start');
  host.send(MESSAGE.start);
  await until(() => host.state.status === 'playing', 'Game starts with a reserved seat');
  const roster = new Map(
    [...host.state.players].map(([key, p]) => [key, { teamId: p.teamId, x: p.x, y: p.y }]),
  );
  const initial = roster.get(id)!;
  const resumed = await sdk.reconnect<WorldState>(token);
  t.after(async () => {
    if (resumed.connection.isOpen) await resumed.leave();
  });
  await until(() => resumed.state?.players?.get(id)?.connected === true, 'Missed start restored');
  assert.equal(resumed.state.teams.size, 1);
  assert.equal(
    resumed.state.teams.get(initial.teamId!)?.roomId,
    host.state.teams.get(initial.teamId!)?.roomId,
  );
  assert.deepEqual(
    new Set(resumed.state.players.keys()),
    new Set([...roster].filter(([, p]) => p.teamId === initial.teamId).map(([key]) => key)),
  );
  await phones[1]!.leave();
  await until(() => host.state.players.size === 4, 'Only the departing seat is removed');
  host.send(MESSAGE.start);
  await delay(100);
  for (const [key, p] of host.state.players)
    assert.deepEqual({ teamId: p.teamId, x: p.x, y: p.y }, roster.get(key));
});
