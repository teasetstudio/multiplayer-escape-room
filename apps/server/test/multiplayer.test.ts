import { after, before, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import {
  MESSAGE,
  MAX_PLAYERS,
  WORLD,
  type CreateSessionResponse,
  type WorldState,
} from '@escape/shared';
import { createGameServer } from '../src/app.js';
import { sessions } from '../src/rooms/GameRoom.js';

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
  await until(() => getPlayer(players[1]!, 'Player 1')!.x > x, 'Other phones should see movement');
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
  await until(() => host.state.players.size === 1, 'Player should appear');
  host.send(MESSAGE.start);
  await until(() => host.state.status === 'playing', 'Game should start');
  const beforeDrop = { ...getPlayer(host, 'Lily')! };
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
  assert.equal(resumed.state.players.size, 1);
  const hostToken = host.reconnectionToken;
  host.reconnection.enabled = false;
  drop(host);
  await until(() => resumed.state.hostConnected === false, 'Host drop should be visible');
  const resumedHost = await sdk.reconnect<WorldState>(hostToken);
  await until(() => resumedHost.state?.hostConnected === true, 'Host should reclaim overview');
  assert.equal(resumedHost.state.players.size, 1, 'The host must not create a character');
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

test('capacity is twenty players plus the host and public room creation is disabled', async (t) => {
  await assert.rejects(sdk.create('escape', { role: 'host' }));
  const { code, host } = await session(t);
  await Promise.all(
    Array.from({ length: MAX_PLAYERS }, (_, index) => player(t, code, `Crew ${index}`)),
  );
  await until(() => host.state.players.size === MAX_PLAYERS, '20 players should fit');
  assert.equal(new Set([...host.state.players.values()].map((entry) => entry.color)).size, 20);
  await assert.rejects(sdk.joinById(code, { role: 'player', nickname: 'Overflow' }));
  host.send(MESSAGE.start);
  await until(() => host.state.status === 'playing', 'Full games should still start');
});
