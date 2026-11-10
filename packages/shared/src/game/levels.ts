import { LEVEL_MAPS } from '../maps/index.js';
import type { TeamId } from '../types/index.js';
import type { LogicalMap, LogicalRoom, Rectangle, RoomId } from '../world/types.js';
import type { Fixture, FixtureKind } from './types.js';

/** Logical footprints. Wall-mounted pieces are thin and never block movement. */
export const FIXTURE_SIZE: Record<FixtureKind, { width: number; height: number; solid: boolean }> =
  {
    bookshelf: { width: 68, height: 28, solid: true },
    chest: { width: 48, height: 40, solid: true },
    cabinet: { width: 42, height: 32, solid: true },
    barrel: { width: 36, height: 36, solid: true },
    table: { width: 80, height: 44, solid: true },
    pottery: { width: 44, height: 36, solid: true },
    sack: { width: 40, height: 40, solid: true },
    pedestal: { width: 36, height: 36, solid: true },
    'panel-x': { width: 80, height: 4, solid: false },
    'panel-y': { width: 4, height: 80, solid: false },
    'terminal-x': { width: 80, height: 4, solid: false },
    'switch-x': { width: 44, height: 4, solid: false },
    'button-x': { width: 44, height: 4, solid: false },
    'carving-x': { width: 50, height: 4, solid: false },
    'archway-x': { width: 86, height: 10, solid: false },
    plate: { width: 48, height: 48, solid: false },
    torch: { width: 8, height: 8, solid: false },
    candle: { width: 22, height: 22, solid: false },
    scroll: { width: 36, height: 24, solid: false },
    artifact: { width: 24, height: 24, solid: false },
  };

export function fixture(id: string, kind: FixtureKind, x: number, y: number, detail?: string) {
  return { id, kind, x, y, ...FIXTURE_SIZE[kind], ...(detail ? { detail } : {}) } satisfies Fixture;
}

export interface LevelDefinition {
  level: number;
  name: string;
  map: LogicalMap;
  rooms: Record<TeamId, LogicalRoom>;
  /** PUBLIC props only. Which of them hide something is known to the server alone. */
  fixtures: readonly Fixture[];
  exits: Record<TeamId, { doorId: string; zone: Rectangle }>;
}

type Spec = [id: string, kind: FixtureKind, x: number, y: number, detail?: string];
/** Room-local coordinates (origin = the room's north-west corner). */
const PUBLIC: { name: string; alcove: 'nw' | 'ne'; A: Spec[]; B: Spec[] }[] = [
  {
    name: 'The Secret Code',
    alcove: 'nw',
    A: [
      ['clue', 'panel-x', 300, 8],
      ['shelf', 'bookshelf', 450, 8],
      ['chest', 'chest', 12, 520],
      ['barrel', 'barrel', 12, 430],
      ['table', 'table', 440, 590],
      ['pottery', 'pottery', 12, 300],
    ],
    B: [
      ['terminal', 'terminal-x', 300, 8],
      ['carving', 'carving-x', 470, 8],
      ['cabinet', 'cabinet', 12, 540],
      ['barrel', 'barrel', 12, 430],
      ['sack', 'sack', 12, 300],
      ['table', 'table', 440, 590],
    ],
  },
  {
    name: 'The Mirror Chamber',
    alcove: 'ne',
    A: [
      ['switch-1', 'switch-x', 110, 8],
      ['switch-2', 'switch-x', 180, 8],
      ['switch-3', 'switch-x', 250, 8],
      ['switch-4', 'switch-x', 320, 8],
      ['wardrobe', 'cabinet', 430, 8],
      ['shelf', 'bookshelf', 520, 8],
      ['barrel', 'barrel', 12, 250],
      ['pottery', 'pottery', 12, 480],
    ],
    B: [
      ['lamps', 'panel-x', 150, 8],
      ['torch', 'torch', 300, 8],
      ['shelf', 'bookshelf', 420, 8],
      ['chest', 'chest', 12, 440],
      ['sack', 'sack', 12, 300],
    ],
  },
  {
    name: 'The Ancient Library',
    alcove: 'nw',
    A: [
      ['tablet-1', 'panel-x', 215, 8],
      ['tablet-2', 'panel-y', 8, 400],
      ['shelf-1', 'bookshelf', 330, 8],
      ['shelf-2', 'bookshelf', 420, 8],
      ['shelf-3', 'bookshelf', 510, 8],
      ['cabinet', 'cabinet', 12, 540],
      ['table', 'table', 330, 600],
    ],
    B: [
      ['pedestal-1', 'pedestal', 250, 170, 'triangle'],
      ['pedestal-2', 'pedestal', 350, 170, 'circle'],
      ['pedestal-3', 'pedestal', 450, 170, 'square'],
      ['pedestal-4', 'pedestal', 550, 170, 'diamond'],
      ['carving', 'carving-x', 300, 8],
      ['shelf-1', 'bookshelf', 480, 8],
      ['shelf-2', 'bookshelf', 580, 8],
      ['barrel', 'barrel', 12, 500],
    ],
  },
  {
    name: 'The Balance Chamber',
    alcove: 'ne',
    A: [
      ['scale', 'plate', 300, 130],
      ['torch', 'torch', 480, 8],
      ['shelf', 'bookshelf', 580, 8],
      ['chest', 'chest', 12, 400],
      ['sack', 'sack', 12, 540],
    ],
    B: [
      ['scale', 'plate', 300, 130],
      ['shelf', 'bookshelf', 450, 8],
      ['cabinet', 'cabinet', 12, 420],
      ['barrel', 'barrel', 12, 300],
      ['pottery', 'pottery', 12, 520],
    ],
  },
  {
    name: 'The Final Mechanism',
    alcove: 'nw',
    A: [
      ['switch-1', 'switch-x', 215, 8],
      ['switch-2', 'switch-x', 285, 8],
      ['switch-3', 'switch-x', 355, 8],
      ['button', 'button-x', 440, 8],
      ['plan', 'panel-y', 8, 300],
      ['carving', 'carving-x', 530, 8],
      ['shelf', 'bookshelf', 700, 8],
      ['barrel', 'barrel', 12, 460],
    ],
    B: [
      ['switch-1', 'switch-x', 215, 8],
      ['switch-2', 'switch-x', 285, 8],
      ['switch-3', 'switch-x', 355, 8],
      ['button', 'button-x', 440, 8],
      ['plan', 'panel-y', 8, 300],
      ['wardrobe', 'cabinet', 540, 8],
      ['chest', 'chest', 12, 440],
      ['pottery', 'pottery', 12, 600],
    ],
  },
];

export const fixtureId = (level: number, team: TeamId, name: string) =>
  `l${level}-${team.toLowerCase()}-${name}`;

function define(index: number): LevelDefinition {
  const map = LEVEL_MAPS[index]!;
  const spec = PUBLIC[index]!;
  const level = index + 1;
  const room = (team: TeamId) => {
    const found = map.rooms.find((entry) => entry.startTeam === team);
    if (!found) throw new Error(`Level ${level} has no room for team ${team}.`);
    return found;
  };
  const rooms = { A: room('A'), B: room('B') };
  const fixtures: Fixture[] = [];
  const exits = {} as LevelDefinition['exits'];
  for (const team of ['A', 'B'] as const) {
    const { bounds, id } = rooms[team];
    for (const [name, kind, x, y, detail] of spec[team])
      fixtures.push({
        ...fixture(fixtureId(level, team, name), kind, bounds.x + x, bounds.y + y, detail),
        roomId: id,
      });
    const door = map.objects.find((object) => object.kind === 'door' && object.roomId === id);
    if (!door) throw new Error(`Level ${level} room ${id} has no exit door.`);
    // The exit alcove lies behind the gate, in the north corner chosen by the template.
    exits[team] = {
      doorId: door.id,
      zone: {
        x: spec.alcove === 'nw' ? bounds.x + 8 : bounds.x + bounds.width - 178,
        y: bounds.y + 8,
        width: 170,
        height: 125,
      },
    };
  }
  return { level, name: spec.name, map, rooms, fixtures, exits };
}

export const LEVELS: readonly LevelDefinition[] = PUBLIC.map((_, index) => define(index));
export function levelByMapId(mapId: string) {
  return LEVELS.find((entry) => entry.map.id === mapId);
}
export type { RoomId };
