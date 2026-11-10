import { CHARACTERS, type Fixture, type FixtureState, type LogicalMap } from '@escape/shared';
import type Phaser from 'phaser';

/** Reviewed Adventure Comic art (see docs/art/INTEGRATION.md). Origins are anchor / size. */
interface Art {
  path: string;
  size: [number, number];
  anchor: [number, number];
  /** Art that exists once per puzzle state. */
  states?: readonly FixtureState[];
}
const STATES = ['inactive', 'active', 'completed'] as const;
const wall = (name: string, states = STATES as readonly FixtureState[]): Art => ({
  path: `puzzles/${name}`,
  size: [144, 160],
  anchor: [72, 128],
  states,
});
export const FIXTURE_ART: Record<Fixture['kind'], Art> = {
  bookshelf: { path: 'props/bookshelf', size: [192, 176], anchor: [96, 144] },
  chest: { path: 'props/chest', size: [96, 96], anchor: [48, 72] },
  cabinet: { path: 'props/storage-container', size: [144, 144], anchor: [72, 108] },
  barrel: { path: 'props/barrel', size: [80, 112], anchor: [40, 90] },
  table: { path: 'props/table', size: [192, 160], anchor: [96, 120] },
  pottery: { path: 'props/pottery', size: [112, 96], anchor: [56, 73] },
  sack: { path: 'props/sack', size: [96, 96], anchor: [48, 74] },
  pedestal: { path: 'environment/structures/column-short', size: [144, 176], anchor: [72, 144] },
  'panel-x': wall('panel-x'),
  'panel-y': wall('panel-y'),
  'terminal-x': wall('terminal-x'),
  'switch-x': wall('switch-x'),
  'button-x': wall('push-button-x', [...STATES, 'pressed']),
  plate: {
    path: 'puzzles/pressure-plate',
    size: [128, 96],
    anchor: [64, 60],
    states: [...STATES, 'pressed'],
  },
  'carving-x': {
    path: 'environment/structures/stone-carving-x',
    size: [128, 144],
    anchor: [64, 116],
  },
  torch: { path: 'environment/structures/wall-torch', size: [96, 144], anchor: [48, 136] },
  'archway-x': { path: 'environment/structures/archway-x', size: [160, 160], anchor: [80, 128] },
  candle: { path: 'props/candle', size: [80, 96], anchor: [40, 76] },
  scroll: { path: 'props/scroll', size: [96, 80], anchor: [48, 54] },
  artifact: { path: 'artifacts/coin-world', size: [80, 80], anchor: [40, 46] },
};
export const MAP_ART = {
  crate: { path: 'props/crate', size: [144, 144], anchor: [72, 108] },
  pillar: { path: 'environment/structures/column', size: [144, 176], anchor: [72, 144] },
  door: { path: 'environment/doors/door-stone-x', size: [256, 192], anchor: [128, 136] },
} satisfies Record<string, Art>;
export const FLOORS = ['', 'floor-regular', 'floor-cracked', 'floor-worn'] as const;
export const ARTIFACTS = ['key', 'medallion', 'crystal', 'coin', 'parchment'] as const;
export const SYMBOL_ART = ['triangle', 'circle', 'square', 'diamond'] as const;

export function artKey(kind: Fixture['kind'], state?: FixtureState, detail?: string) {
  if (kind === 'artifact') return `art:artifacts/${detail ?? 'coin'}-world`;
  const art = FIXTURE_ART[kind];
  if (!art.states) return `art:${art.path}`;
  return `art:${art.path}-${state && art.states.includes(state) ? state : 'active'}`;
}
export function originOf(kind: Fixture['kind']) {
  const { size, anchor } = FIXTURE_ART[kind];
  return { x: anchor[0] / size[0], y: anchor[1] / size[1] };
}
export const characterKey = (character: string | undefined, team: string | undefined) =>
  `character:${(CHARACTERS as readonly string[]).includes(character ?? '') ? character : 'explorer'}-${team === 'B' ? 'orange' : 'blue'}`;
export const DIRECTIONS = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'] as const;

/** Queues every texture the world can show. Keys already in the cache are skipped. */
export function preloadArt(scene: Phaser.Scene) {
  const image = (path: string) => {
    const key = `art:${path}`;
    if (!scene.textures.exists(key)) scene.load.image(key, `/assets/${path}.png`);
  };
  for (const name of FLOORS) if (name) image(`environment/floors/${name}`);
  image('environment/floors/floor-dark');
  for (const art of Object.values(FIXTURE_ART)) {
    if (art.states) for (const state of art.states) image(`${art.path}-${state}`);
    else image(art.path);
  }
  image(MAP_ART.crate.path);
  image(MAP_ART.pillar.path);
  image(`${MAP_ART.door.path}-closed`);
  image(`${MAP_ART.door.path}-open`);
  for (const name of ARTIFACTS) image(`artifacts/${name}-world`);
  for (const name of SYMBOL_ART) image(`puzzles/symbol-${name}`);
  image('puzzles/indicator-locked');
  image('puzzles/indicator-unlocked');
  image('ui/icon-interaction');
  for (const character of CHARACTERS)
    for (const color of ['blue', 'orange']) {
      const key = `character:${character}-${color}`;
      if (!scene.textures.exists(key))
        scene.load.spritesheet(key, `/assets/characters/${character}-${color}.png`, {
          frameWidth: 96,
          frameHeight: 128,
        });
    }
}
/** Sheet rows are screen-space headings S, SE, E, NE, N, NW, W, SW; column 0 idle, 1–4 walk. */
export function createCharacterAnimations(scene: Phaser.Scene) {
  for (const character of CHARACTERS)
    for (const color of ['blue', 'orange']) {
      const texture = `character:${character}-${color}`;
      DIRECTIONS.forEach((direction, row) => {
        const key = `${texture}-walk-${direction}`;
        if (scene.anims.exists(key)) return;
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(texture, {
            start: row * 5 + 1,
            end: row * 5 + 4,
          }),
          frameRate: 7,
          repeat: -1,
        });
      });
    }
}

/** A hidden chamber arrives as plain data; give it walls so it renders like any other room. */
export function chamberMap(area: { key: string; name: string; columns: number; rows: number }) {
  const width = area.columns * 64;
  const height = area.rows * 64;
  const roomId = 'room-hidden' as const;
  const wallObject = (id: string, x: number, y: number, w: number, h: number, elevation: number) =>
    ({ id, kind: 'wall', x, y, width: w, height: h, elevation, roomId }) as const;
  return {
    id: area.key,
    version: '1',
    name: area.name,
    columns: area.columns,
    rows: area.rows,
    width,
    height,
    ground: Array.from({ length: area.columns * area.rows }, (_, index) => (index % 4) + 1).map(
      (gid) => (gid > 3 ? 1 : gid),
    ),
    objects: [
      wallObject('north', 0, 0, width, 8, 38),
      wallObject('west', 0, 8, 8, height - 16, 38),
      wallObject('south', 0, height - 8, width, 8, 20),
      wallObject('east', width - 8, 8, 8, height - 16, 20),
    ],
    collisions: [],
    rooms: [{ id: roomId, name: area.name, bounds: { x: 0, y: 0, width, height } }],
    spawns: [],
  } satisfies LogicalMap;
}
