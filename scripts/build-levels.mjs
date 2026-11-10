// Generates the Tiled-compatible maps for levels 2–5 from compact room templates.
// Level 1 reuses the hand-authored twin-vaults.json. Run: node scripts/build-levels.mjs
// The output files are ordinary Tiled JSON maps and may be opened and inspected in Tiled.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TILE = 64;
const out = (name) =>
  fileURLToPath(new URL(`../packages/shared/src/maps/${name}`, import.meta.url));

/** Room-local logical units. Both team rooms share one template, shifted along X. */
const LEVELS = [
  {
    file: 'level-2.json',
    mapId: 'mirror-chamber',
    displayName: 'The Mirror Chamber',
    cols: 13,
    rows: 11,
    alcove: 'ne',
    pillars: [
      [150, 420, 50],
      [560, 250, 52],
    ],
    crates: [[70, 560]],
    rug: [300, 300, 200, 150],
  },
  {
    file: 'level-3.json',
    mapId: 'ancient-library',
    displayName: 'The Ancient Library',
    cols: 12,
    rows: 13,
    alcove: 'nw',
    pillars: [
      [620, 330, 52],
      [130, 640, 50],
    ],
    crates: [[660, 730]],
    rug: [280, 360, 220, 160],
  },
  {
    file: 'level-4.json',
    mapId: 'balance-chamber',
    displayName: 'The Balance Chamber',
    cols: 14,
    rows: 12,
    alcove: 'ne',
    pillars: [
      [200, 200, 52],
      [660, 560, 50],
    ],
    crates: [[60, 660]],
    rug: [340, 330, 220, 150],
  },
  {
    file: 'level-5.json',
    mapId: 'final-mechanism',
    displayName: 'The Final Mechanism',
    cols: 13,
    rows: 13,
    alcove: 'nw',
    pillars: [
      [640, 200, 52],
      [180, 560, 50],
      [600, 640, 50],
    ],
    crates: [],
    rug: [300, 380, 230, 170],
  },
];

function build(level) {
  const W = level.cols * TILE;
  const H = level.rows * TILE;
  const columns = level.cols * 2 + 2;
  const rows = level.rows + 2;
  let nextId = 1;
  const t = (value) => value / 2; // Tiled isometric object units are half a logical unit.
  const object = (name, type, x, y, width, height, properties) => ({
    id: nextId++,
    name,
    type,
    x: t(x),
    y: t(y),
    width: t(width),
    height: t(height),
    rotation: 0,
    visible: true,
    ...(properties
      ? {
          properties: Object.entries(properties).map(([key, value]) => ({
            name: key,
            type: typeof value === 'number' ? 'int' : 'string',
            value,
          })),
        }
      : {}),
  });
  const layers = { rooms: [], walls: [], decorations: [], objects: [], collision: [], spawns: [] };
  const ground = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++)
      ground.push(
        x === 0 || y === 0 || x === columns - 1 || y === rows - 1
          ? 0
          : y % 3 === 0
            ? 1
            : ((x + (y % 3 === 2 ? 1 : 0)) % 3) + 1,
      );
  for (const [index, team] of ['a', 'b'].entries()) {
    const ox = TILE + index * W;
    const oy = TILE;
    const mirror = level.alcove === 'ne';
    // Mirror a room-local rectangle for a north-east alcove.
    const place = (x, width) => ox + (mirror ? W - x - width : x);
    const id = `room-${team}`;
    layers.rooms.push(
      object(id, 'room', ox, oy, W, H, {
        displayName: `Room ${team.toUpperCase()}`,
        startTeam: team.toUpperCase(),
      }),
    );
    const wall = (name, x, y, width, height, elevation) => {
      layers.walls.push(object(`${id}-${name}`, 'wall', x, y, width, height, { elevation }));
      layers.collision.push(object(`${id}-${name}-solid`, 'wall', x, y, width, height));
    };
    wall('north', ox, oy, W, 8, 38);
    wall('west', ox, oy + 8, 8, H - 16, 38);
    wall('south', ox, oy + H - 8, W, 8, 24);
    wall('east', ox + W - 8, oy + 8, 8, H - 16, index === 0 ? 38 : 24);
    wall('alcove', place(8, 100), oy + 133, 100, 10, 32);
    wall('return', place(178, 10), oy + 8, 10, 135, 32);
    const gate = [place(108, 70), oy + 133, 70, 10];
    layers.objects.push(object(`${id}-gate`, 'door', ...gate, { elevation: 34 }));
    layers.collision.push(object(`${id}-gate-solid`, 'door', ...gate, { doorId: `${id}-gate` }));
    const solid = (name, kind, x, y, size, elevation) => {
      layers.objects.push(object(`${id}-${name}`, kind, ox + x, oy + y, size, size, { elevation }));
      layers.collision.push(object(`${id}-${name}-solid`, 'obstacle', ox + x, oy + y, size, size));
    };
    level.pillars.forEach(([x, y, elevation], i) =>
      solid(`pillar-${i + 1}`, 'pillar', x, y, 36, elevation),
    );
    level.crates.forEach(([x, y], i) => solid(`crate-${i + 1}`, 'crate', x, y, 46, 26));
    const [rx, ry, rw, rh] = level.rug;
    layers.decorations.push(
      object(`${id}-inlay`, 'rug', ox + rx, oy + ry, rw, rh, { elevation: 0 }),
    );
    // Ten starts on a loose grid in the open centre, clear of pillars and crates.
    const blocked = [
      ...level.pillars.map(([x, y]) => [x, y, 36]),
      ...level.crates.map(([x, y]) => [x, y, 46]),
    ];
    let count = 0;
    for (let gy = 250; gy < H - 110 && count < 10; gy += 86)
      for (let gx = 210; gx < W - 190 && count < 10; gx += 96) {
        const x = gx + ((gy / 86) % 2 ? 22 : 0);
        if (
          blocked.some(
            ([bx, by, size]) =>
              x > bx - 34 && x < bx + size + 34 && gy > by - 34 && gy < by + size + 34,
          )
        )
          continue;
        layers.spawns.push({
          id: nextId++,
          name: `${id}-spawn-${++count}`,
          type: 'spawn',
          x: t(ox + x),
          y: t(oy + gy),
          width: 0,
          height: 0,
          rotation: 0,
          visible: true,
          point: true,
        });
      }
    if (count < 10) throw new Error(`${level.file}: ${id} only fits ${count} spawn points.`);
  }
  const mapWidth = columns * TILE;
  const mapHeight = rows * TILE;
  for (const [name, x, y, width, height] of [
    ['outside-1', 0, 0, mapWidth, TILE],
    ['outside-2', 0, mapHeight - TILE, mapWidth, TILE],
    ['outside-3', 0, TILE, TILE, mapHeight - 2 * TILE],
    ['outside-4', mapWidth - TILE, TILE, TILE, mapHeight - 2 * TILE],
  ])
    layers.collision.push(object(name, 'boundary', x, y, width, height));
  let layerId = 1;
  const group = (name, objects, visible = true) => ({
    id: layerId++,
    name,
    type: 'objectgroup',
    draworder: 'topdown',
    visible,
    opacity: 1,
    x: 0,
    y: 0,
    objects,
  });
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.2',
    orientation: 'isometric',
    renderorder: 'right-down',
    infinite: false,
    width: columns,
    height: rows,
    tilewidth: 64,
    tileheight: 32,
    backgroundcolor: '#101a1c',
    properties: [
      { name: 'mapId', type: 'string', value: level.mapId },
      { name: 'revision', type: 'string', value: '1' },
      { name: 'displayName', type: 'string', value: level.displayName },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'Stone',
        tilewidth: 64,
        tileheight: 32,
        tilecount: 3,
        columns: 3,
        spacing: 0,
        margin: 0,
        image: 'assets/stone-tiles.svg',
        imagewidth: 192,
        imageheight: 32,
      },
    ],
    layers: [
      {
        id: layerId++,
        name: 'Ground',
        type: 'tilelayer',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: columns,
        height: rows,
        data: ground,
      },
      group('Rooms', layers.rooms, false),
      group('Walls', layers.walls),
      group('Decorations', layers.decorations),
      group('Objects', layers.objects),
      group('Collision', layers.collision, false),
      group('SpawnPoints', layers.spawns, false),
    ],
    nextlayerid: layerId,
    nextobjectid: nextId,
  };
}

for (const level of LEVELS) {
  writeFileSync(out(level.file), `${JSON.stringify(build(level), null, 2)}\n`);
  console.log(`wrote ${level.file}`);
}
