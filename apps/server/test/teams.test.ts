import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MAP, TEAM_IDS, WORLD, type LogicalMap } from '@escape/shared';
import { assignTeams, startingRoom } from '../src/systems/teams.js';
import { CollisionWorld, selectSpawnPoints } from '../src/systems/CollisionWorld.js';
import { Encoder, StateView } from '@colyseus/schema';
import { GameState, Player, Team, Door } from '../src/state/GameState.js';
import { canSeePlayer, syncVisibility } from '../src/systems/visibility.js';

const roster = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `seat-${i}`, connected: true }));

for (const [n, expected] of [
  [20, 10],
  [15, 8],
  [9, 5],
  [1, 1],
  [0, 0],
] as const) {
  test(`${n} lobby seats are dealt ${expected} vs ${n - expected}`, () => {
    const input = roster(n);
    const assigned = assignTeams(input);
    assert.deepEqual(new Set(assigned.keys()), new Set(input.map((p) => p.id)));
    assert.equal([...assigned.values()].filter((t) => t === 'A').length, expected);
    assert.equal([...assigned.values()].filter((t) => t === 'B').length, n - expected);
  });
}

test('shuffling can change team composition without mutating the input or losing reserved seats', () => {
  const input = roster(15);
  for (const p of input.slice(9)) p.connected = false;
  const before = structuredClone(input);
  const a = assignTeams(input, () => 0);
  const b = assignTeams(input, (limit) => limit - 1);
  assert.deepEqual(input, before);
  assert.deepEqual(new Set(a.keys()), new Set(b.keys()));
  assert.equal(a.size, 15);
  assert.ok(input.some(({ id }) => a.get(id) !== b.get(id)));
  for (const deal of [a, b]) {
    assert.equal(input.filter((p) => p.connected && deal.get(p.id) === 'A').length, 5);
    assert.equal(input.filter((p) => !p.connected && deal.get(p.id) === 'B').length, 3);
  }
});

test('the Tiled rooms meet at the divider and each provides ten safe, distinct starts', () => {
  const world = new CollisionWorld(DEFAULT_MAP);
  const [a, b] = TEAM_IDS.map((team) => startingRoom(DEFAULT_MAP, team).bounds);
  assert.equal(a!.x + a!.width, b!.x);
  for (const team of TEAM_IDS) {
    const room = startingRoom(DEFAULT_MAP, team);
    assert.equal(room.id, team === 'A' ? 'room-a' : 'room-b');
    const door = DEFAULT_MAP.objects.find((o) => o.roomId === room.id && o.kind === 'door')!;
    const blocked = { x: door.x + door.width / 2, y: door.y + door.height / 2 };
    const spawns = selectSpawnPoints(world, 10, room.bounds);
    assert.equal(spawns.length, 10);
    assert.ok(spawns.every((p) => world.isValid(p, room.bounds)));
    assert.ok(!world.isValid(blocked, room.bounds));
    assert.throws(() => selectSpawnPoints(world, 11, room.bounds), /valid, separated/);
  }
  assert.throws(() => startingRoom({ ...DEFAULT_MAP, rooms: [] }, 'A'), /exactly one/);
  assert.throws(
    () =>
      startingRoom(
        { ...DEFAULT_MAP, rooms: [...DEFAULT_MAP.rooms, startingRoom(DEFAULT_MAP, 'A')] },
        'A',
      ),
    /exactly one/,
  );
});

test('the entire footprint stays inside an arbitrary authored room even without physical walls', () => {
  const emptyMap: LogicalMap = { ...DEFAULT_MAP, collisions: [] };
  const world = new CollisionWorld(emptyMap);
  // A third rectangle at a different origin exercises the same movement rule.
  for (const bounds of [
    ...DEFAULT_MAP.rooms.map((room) => room.bounds),
    { x: 196, y: 100, width: 260, height: 220 },
  ]) {
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const r = WORLD.playerRadius;
    assert.deepEqual(world.move(start, { x: 2000, y: -2000 }, bounds), {
      x: bounds.x + bounds.width - r,
      y: bounds.y + r,
    });
    assert.deepEqual(world.move(start, { x: -2000, y: 2000 }, bounds), {
      x: bounds.x + r,
      y: bounds.y + bounds.height - r,
    });
    assert.ok(!world.isValid({ x: bounds.x + r - 1, y: start.y }, bounds));
  }
});

test('only the host, a lobby observer of unassigned seats, or a matching team can see a player', () => {
  for (const team of TEAM_IDS) {
    assert.equal(canSeePlayer('host', team), true);
    assert.equal(canSeePlayer(team, team), true);
    assert.equal(canSeePlayer(team === 'A' ? 'B' : 'A', team), false);
    assert.equal(canSeePlayer('lobby', team), false);
    assert.equal(canSeePlayer(undefined, team), false);
  }
  assert.equal(canSeePlayer('lobby', undefined), true);
  assert.equal(canSeePlayer(undefined, undefined), false);
  assert.equal(canSeePlayer('B', undefined), false);
});

test('a fresh reconnect view derives membership, room and position from the retained character', () => {
  const state = new GameState();
  new Encoder(state); // Attach the change trees exactly as Colyseus does before granting a view.
  state.status = 'playing';
  const self = new Player().assign({
    id: 'original',
    teamId: 'A',
    nickname: 'Nick',
    x: 399,
    y: 413,
  });
  const opponent = new Player().assign({ id: 'other', teamId: 'B' });
  state.players.set(self.id, self);
  state.players.set(opponent.id, opponent);
  for (const id of TEAM_IDS) {
    const roomId = startingRoom(DEFAULT_MAP, id).id;
    state.teams.set(id, new Team().assign({ id, roomId }));
    state.doors.set(id, new Door().assign({ id, roomId }));
  }
  self.connected = false;
  const before = self.toJSON();
  self.connected = true;
  const restored = new StateView();
  syncVisibility(restored, state, self.teamId);
  assert.equal(restored.has(self), true);
  assert.equal(restored.has(opponent), false);
  assert.equal(restored.has(state.teams.get('A')!), true);
  assert.equal(restored.has(state.doors.get('A')!), true);
  assert.equal(restored.has(state.teams.get('B')!), false);
  assert.equal(restored.has(state.doors.get('B')!), false);
  assert.deepEqual(self.toJSON(), { ...before, connected: true });
});
