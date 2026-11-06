import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_MAP,
  ISOMETRIC,
  MAX_PLAYERS,
  WORLD,
  loadTiledMap,
  normalizeDirection,
  screenInputToWorld,
  screenToWorld,
  tileToWorld,
  worldToScreen,
  worldToTile,
  type CollisionShape,
  type LogicalMap,
  type Point,
} from '@escape/shared';
import { CollisionWorld, selectSpawnPoints } from '../src/systems/CollisionWorld.js';
import { Player } from '../src/state/GameState.js';
import { movePlayer, validateInput } from '../src/systems/movement.js';

function near(a: number, b: number, epsilon = 1e-6) {
  assert.ok(Math.abs(a - b) < epsilon, `${a} should equal ${b}`);
}
function mapWith(collisions: CollisionShape[] = []): LogicalMap {
  return { ...DEFAULT_MAP, width: 1000, height: 1000, collisions };
}
const wall: CollisionShape = { id: 'wall', kind: 'wall', x: 200, y: 0, width: 8, height: 800 };

test('2:1 projection has known anchors and round-trips fractional and negative coordinates', () => {
  assert.deepEqual(worldToScreen({ x: 64, y: 0 }), { x: 32, y: 16 });
  assert.deepEqual(worldToScreen({ x: 0, y: 64 }), { x: -32, y: 16 });
  assert.deepEqual(worldToScreen({ x: 64, y: 64 }), { x: 0, y: 32 });
  for (const point of [
    { x: 0, y: 0 },
    { x: 123.45, y: 789.12 },
    { x: -90, y: 127 },
    { x: 2048, y: 1536 },
  ]) {
    const result = screenToWorld(worldToScreen(point));
    near(result.x, point.x);
    near(result.y, point.y);
  }
});

test('logical tiles use square world units and floor negative coordinates correctly', () => {
  assert.deepEqual(tileToWorld({ x: 3, y: 2 }), { x: 192, y: 128 });
  assert.deepEqual(worldToTile({ x: 191.99, y: 128 }), { x: 2, y: 2 });
  assert.deepEqual(worldToTile({ x: -0.1, y: -64 }), { x: -1, y: -1 });
});

test('all eight joystick directions project back in the requested screen direction at equal logical speed', () => {
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    for (const magnitude of [0.25, 1]) {
      const input = { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
      const logical = screenInputToWorld(input);
      near(Math.hypot(logical.x, logical.y), magnitude);
      const projected = worldToScreen(logical);
      near(projected.x * input.y - projected.y * input.x, 0);
      assert.ok(projected.x * input.x + projected.y * input.y > 0);
    }
  }
  assert.deepEqual(screenInputToWorld({ x: 0, y: 0 }), { x: 0, y: 0 });
  assert.deepEqual(screenInputToWorld({ x: NaN, y: 1 }), { x: 0, y: 0 });
  near(Math.hypot(...Object.values(normalizeDirection({ x: 1, y: 1 }))), 1);
  near(Math.hypot(...Object.values(screenInputToWorld({ x: 1, y: 1 }))), 1);
});

test('Tiled map loads the same named layers, logical object coordinates, doors and stable version', () => {
  const source = JSON.parse(
    readFileSync(
      new URL('../../../packages/shared/src/maps/stone-hall.json', import.meta.url),
      'utf8',
    ),
  ) as unknown;
  const loaded = loadTiledMap(source);
  assert.equal(loaded.version, loadTiledMap(structuredClone(source)).version);
  assert.equal(loaded.width, 30 * ISOMETRIC.worldTileSize);
  assert.equal(loaded.height, 26 * ISOMETRIC.worldTileSize);
  assert.deepEqual(loaded.spawns[0], { x: 288, y: 320 });
  assert.equal(loaded.objects.filter((entry) => entry.kind === 'door').length, 2);
  assert.ok(loaded.collisions.some((entry) => entry.kind === 'boundary'));
  // Hiding a visual object does not remove its explicit collision geometry.
  const changed = structuredClone(source) as {
    layers: { name: string; objects?: { x: number; visible: boolean }[] }[];
  };
  changed.layers.find((entry) => entry.name === 'Walls')!.objects![0]!.visible = false;
  assert.deepEqual(loadTiledMap(changed).collisions, loaded.collisions);
  assert.notEqual(loadTiledMap(changed).version, loaded.version);
});

test('loader rejects unsupported map formats and broken door/collision references', () => {
  const raw = readFileSync(
    new URL('../../../packages/shared/src/maps/stone-hall.json', import.meta.url),
    'utf8',
  );
  const source = JSON.parse(raw) as Record<string, unknown>;
  assert.throws(() => loadTiledMap({ ...source, orientation: 'orthogonal' }), /isometric/);
  assert.throws(() => loadTiledMap({ ...source, infinite: true }), /finite/);
  assert.throws(() => loadTiledMap({ ...source, layers: [] }), /Ground/);
  assert.throws(
    () => loadTiledMap(JSON.parse(raw.replace('"doorId"', '"missingDoorId"')) as unknown),
    /doorId/,
  );
  assert.throws(
    () => loadTiledMap(JSON.parse(raw.replace('"rotation": 0', '"rotation": 45')) as unknown),
    /unrotated/,
  );
});

test('walls block in both directions while preserving movement along the wall', () => {
  const world = new CollisionWorld(mapWith([wall]));
  const position = world.move({ x: 100, y: 200 }, { x: 400, y: 180 });
  near(position.x, wall.x - WORLD.playerRadius);
  near(position.y, 380);
  assert.ok(world.isValid(position));
  const reverse = world.move({ x: 300, y: 200 }, { x: -400, y: -180 });
  near(reverse.x, wall.x + wall.width + WORLD.playerRadius);
  near(reverse.y, 20);
});

test('static obstacles block all four sides and corners without penetration', () => {
  const obstacle: CollisionShape = {
    id: 'crate',
    kind: 'obstacle',
    x: 300,
    y: 300,
    width: 80,
    height: 60,
  };
  const world = new CollisionWorld(mapWith([obstacle]));
  for (const [start, delta, expected] of [
    [
      { x: 200, y: 330 },
      { x: 200, y: 0 },
      { x: 286, y: 330 },
    ],
    [
      { x: 450, y: 330 },
      { x: -200, y: 0 },
      { x: 394, y: 330 },
    ],
    [
      { x: 340, y: 200 },
      { x: 0, y: 200 },
      { x: 340, y: 286 },
    ],
    [
      { x: 340, y: 450 },
      { x: 0, y: -200 },
      { x: 340, y: 374 },
    ],
  ] as [Point, Point, Point][]) {
    const actual = world.move(start, delta);
    near(actual.x, expected.x);
    near(actual.y, expected.y);
    assert.ok(world.isValid(actual));
  }
  const corner = world.move({ x: 280, y: 280 }, { x: 60, y: 60 });
  assert.ok(world.isValid(corner));
});

test('map boundaries, void regions, non-finite input and thin-wall tunneling are blocked', () => {
  const empty = new CollisionWorld(mapWith());
  assert.deepEqual(empty.move({ x: 500, y: 500 }, { x: -1000, y: 1000 }), { x: 14, y: 986 });
  assert.deepEqual(empty.move({ x: 500, y: 500 }, { x: 1000, y: -1000 }), { x: 986, y: 14 });
  assert.equal(empty.isValid({ x: 0, y: 500 }), false);
  assert.equal(empty.isValid({ x: NaN, y: 500 }), false);
  assert.deepEqual(empty.move({ x: 500, y: 500 }, { x: Infinity, y: 0 }), { x: 500, y: 500 });
  const thin = new CollisionWorld(mapWith([{ ...wall, width: 1 }]));
  near(thin.move({ x: 100, y: 100 }, { x: 800, y: 0 }).x, 186);
  assert.equal(new CollisionWorld(DEFAULT_MAP).isValid({ x: 32, y: 32 }), false);
});

test('closed doors block; changing server-owned door state opens exactly that collision', () => {
  let open = false;
  const world = new CollisionWorld(
    mapWith([{ ...wall, id: 'door-shape', kind: 'door', doorId: 'door-a' }]),
    () => (open ? 'open' : 'closed'),
  );
  near(world.move({ x: 100, y: 100 }, { x: 300, y: 0 }).x, 186);
  open = true;
  near(world.move({ x: 100, y: 100 }, { x: 300, y: 0 }).x, 400);
});

test('normalized diagonal and axial movement use equal speed across fixed ticks', () => {
  const world = new CollisionWorld(mapWith());
  for (const direction of [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ]) {
    const player = new Player();
    player.x = 300;
    player.y = 300;
    const input = validateInput({ ...direction, seq: 1 })!;
    for (let i = 0; i < 30; i++)
      movePlayer(
        player,
        { ...input, receivedAt: (i * 1000) / 30 },
        1 / 30,
        (i * 1000) / 30,
        world,
        world.bounds,
      );
    near(Math.hypot(player.x - 300, player.y - 300), WORLD.speed);
    const oneStep = world.move(
      { x: 300, y: 300 },
      { x: input.x * WORLD.speed, y: input.y * WORLD.speed },
    );
    near(oneStep.x, player.x);
    near(oneStep.y, player.y);
  }
});

test('spawn selection skips blocked/duplicate points and fails if a map cannot fit capacity', () => {
  const world = new CollisionWorld(DEFAULT_MAP);
  const spawns = selectSpawnPoints(world, MAX_PLAYERS);
  assert.equal(spawns.length, MAX_PLAYERS);
  assert.ok(spawns.every((point) => world.isValid(point)));
  const filtered = new CollisionWorld({
    ...mapWith([wall]),
    spawns: [
      { x: 204, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 120, y: 120 },
      { x: 160, y: 100 },
    ],
  });
  assert.deepEqual(selectSpawnPoints(filtered, 2), [
    { x: 100, y: 100 },
    { x: 160, y: 100 },
  ]);
  assert.throws(() => selectSpawnPoints(filtered, 3), /valid, separated/);
});

test('the original Stone Hall remains loadable with its corridors and closed doors', () => {
  const world = new CollisionWorld(
    loadTiledMap(
      JSON.parse(
        readFileSync(
          new URL('../../../packages/shared/src/maps/stone-hall.json', import.meta.url),
          'utf8',
        ),
      ) as unknown,
    ),
  );
  const size = ISOMETRIC.worldTileSize;
  const queue: Point[] = [{ x: 4, y: 5 }];
  const visited = new Set(['4,5']);
  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index]!;
    const from = tileToWorld({ x: tile.x + 0.5, y: tile.y + 0.5 });
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: tile.x + dx, y: tile.y + dy };
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      const target = { x: from.x + dx * size, y: from.y + dy * size };
      if (!world.isValid(target)) continue;
      const reached = world.move(from, { x: dx * size, y: dy * size });
      if (Math.hypot(reached.x - target.x, reached.y - target.y) > 0.01) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  assert.ok(visited.has('22,8'), 'Archive entrance is reachable');
  assert.ok(visited.has('22,18'), 'Southern room is reachable');
  assert.ok(visited.has('8,18'), 'Lower hall has an open route around the closed door');
});
