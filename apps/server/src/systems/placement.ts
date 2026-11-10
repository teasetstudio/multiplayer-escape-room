import {
  INTERACT_REACH,
  LEVELS,
  VERSE_PLAN,
  VERSE_TOTAL,
  WORLD,
  type ArtifactKind,
  type Fixture,
  type LogicalMap,
  type Point,
  type Rectangle,
  type TeamId,
} from '@escape/shared';
import type { ScriptureDataset } from '../content/scripture.js';
import { SECRETS, type Content, type HiddenAreaDefinition } from '../content/secrets.js';
import { CollisionWorld } from './CollisionWorld.js';
import { opaqueId, shuffled, type Rng } from './rng.js';

export interface ItemLocation {
  level: number;
  team: TeamId;
  /** Hidden chamber ID; absent for the public room. */
  area?: string;
  /** Container fixture ID; absent for loose items. */
  container?: string;
  /** Position of a loose item. */
  point?: Point;
}
/** One collectible of this session. `verseNumber` is canonical metadata and stays server-side. */
export interface Item extends ItemLocation {
  id: string;
  type: 'verse' | 'artifact';
  verseNumber?: number;
  text?: string;
  artifact?: ArtifactKind;
  collectedBy?: string;
  collectedAt?: number;
}
export type Slot = ItemLocation & { content: Content };

/** Every authored hiding place, in authoring order. */
export function hidingPlaces(): Slot[] {
  const slots: Slot[] = [];
  for (const secrets of SECRETS)
    for (const team of ['A', 'B'] as const) {
      const base = { level: secrets.level, team };
      for (const entry of secrets.publicContainers[team])
        slots.push({ ...base, container: entry.fixtureId, content: entry.content });
      for (const entry of secrets.publicLoose[team])
        slots.push({ ...base, point: entry.point, content: entry.content });
      const area = secrets.areas[team];
      for (const entry of area.containers)
        if (entry.content)
          slots.push({
            ...base,
            area: area.id,
            container: entry.fixtureId,
            content: entry.content,
          });
      for (const entry of area.loose)
        slots.push({ ...base, area: area.id, point: entry.point, content: entry.content });
    }
  return slots;
}

/** Deals the 27 verses onto the 27 verse hiding places. The seed fixes the whole manifest. */
export function createPlacement(scripture: ScriptureDataset, rng: Rng): Item[] {
  const slots = hidingPlaces();
  const verseSlots = slots.filter((slot) => slot.content === 'verse');
  if (verseSlots.length !== VERSE_TOTAL || scripture.verses.length !== VERSE_TOTAL)
    throw new Error(`Expected ${VERSE_TOTAL} verse hiding places and verses.`);
  let order = shuffled(scripture.verses, rng);
  // A shuffle that happens to keep the biblical order would give the final puzzle away.
  while (order.every((verse, index) => verse.verseNumber === index + 1))
    order = shuffled(scripture.verses, rng);
  const used = new Set<string>();
  const nextId = (prefix: string) => {
    let id = opaqueId(rng, prefix);
    while (used.has(id)) id = opaqueId(rng, prefix);
    used.add(id);
    return id;
  };
  let dealt = 0;
  return slots.map(({ content, ...location }) => {
    if (content !== 'verse')
      return { ...location, id: nextId('a'), type: 'artifact' as const, artifact: content };
    const verse = order[dealt++]!;
    // The ID is random: neither it nor any client-visible ordering encodes the verse number.
    return {
      ...location,
      id: nextId('c'),
      type: 'verse' as const,
      verseNumber: verse.verseNumber,
      text: verse.text,
    };
  });
}

/** Static collision for a public level (map + solid props) or a hidden chamber. */
export function levelWorld(level: number, doorState: (id: string) => 'open' | 'closed') {
  const definition = LEVELS[level - 1]!;
  const map: LogicalMap = {
    ...definition.map,
    collisions: [
      ...definition.map.collisions,
      ...definition.fixtures.filter((entry) => entry.solid).map(solidShape),
    ],
  };
  return new CollisionWorld(map, doorState);
}
const solidShape = ({ id, x, y, width, height }: Fixture) =>
  ({ id: `${id}-solid`, kind: 'obstacle', x, y, width, height }) as const;
export const AREA_WALL = 8;
export function areaWorld(area: HiddenAreaDefinition) {
  const width = area.columns * 64;
  const height = area.rows * 64;
  const map: LogicalMap = {
    id: area.id,
    version: '1',
    name: area.name,
    columns: area.columns,
    rows: area.rows,
    width,
    height,
    ground: [],
    objects: [],
    rooms: [],
    spawns: [area.spawn],
    collisions: area.fixtures.filter((entry) => entry.solid).map(solidShape),
  };
  const bounds: Rectangle = {
    x: AREA_WALL,
    y: AREA_WALL,
    width: width - 2 * AREA_WALL,
    height: height - 2 * AREA_WALL,
  };
  return { world: new CollisionWorld(map), bounds };
}

export function distanceToRect(point: Point, rect: Rectangle) {
  const dx = Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width);
  const dy = Math.max(rect.y - point.y, 0, point.y - rect.y - rect.height);
  return Math.hypot(dx, dy);
}
export const pointRect = (point: Point): Rectangle => ({ ...point, width: 0, height: 0 });

/** Every position a player's feet can walk to from `start` (flood fill on a fine grid). */
export function walkable(world: CollisionWorld, bounds: Rectangle, start: Point, step = 12) {
  const visited = new Map<string, Point>();
  const queue = [start];
  if (!world.isValid(start, bounds)) return [];
  visited.set(`0,0`, start);
  const keys = new Map<Point, [number, number]>([[start, [0, 0]]]);
  while (queue.length) {
    const point = queue.pop()!;
    const [cx, cy] = keys.get(point)!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const key = `${cx + dx},${cy + dy}`;
      if (visited.has(key)) continue;
      // Use the real mover so a grid step can never cross a wall the simulation would block.
      const next = world.move(point, { x: dx * step, y: dy * step }, bounds);
      if (
        Math.abs(next.x - point.x - dx * step) > 1e-6 ||
        Math.abs(next.y - point.y - dy * step) > 1e-6
      )
        continue;
      visited.set(key, next);
      keys.set(next, [cx + dx, cy + dy]);
      queue.push(next);
    }
  }
  return [...visited.values()];
}
const canReach = (points: Point[], target: Rectangle) =>
  points.some((point) => distanceToRect(point, target) <= INTERACT_REACH - 4);

/** Team start positions: authored spawn points first, then a grid scan, never in the exit. */
export function levelSpawns(level: number, team: TeamId, count: number): Point[] {
  const definition = LEVELS[level - 1]!;
  const world = levelWorld(level, () => 'closed');
  const room = definition.rooms[team];
  const exit = definition.exits[team].zone;
  const result: Point[] = [];
  const accept = (point: Point) => {
    if (
      result.length < count &&
      world.isValid(point, room.bounds) &&
      distanceToRect(point, exit) > WORLD.playerRadius * 2 &&
      result.every(
        (other) =>
          Math.max(Math.abs(point.x - other.x), Math.abs(point.y - other.y)) >
          WORLD.playerRadius * 2,
      )
    )
      result.push({ ...point });
  };
  definition.map.spawns.forEach(accept);
  const b = room.bounds;
  for (let y = b.y + b.height / 2; y < b.y + b.height - 60 && result.length < count; y += 44)
    for (let x = b.x + 90; x < b.x + b.width - 90 && result.length < count; x += 44)
      accept({ x, y });
  if (result.length < count)
    throw new Error(`Level ${level} room ${room.id} needs ${count} spawns.`);
  return result;
}

export interface PlacementReport {
  errors: string[];
  verseCount: number;
  perLevel: number[];
  perTeam: Record<TeamId, number>;
}
const worlds = new Map<string, Point[]>();
/** The "ready" gate: counts, uniqueness and real reachability of every collectible, door,
 * secret entrance and way back. A session refuses to start when this reports an error. */
export function validatePlacement(items: readonly Item[]): PlacementReport {
  const errors: string[] = [];
  const verses = items.filter((item) => item.type === 'verse');
  const perLevel = LEVELS.map(({ level }) => verses.filter((item) => item.level === level).length);
  const perTeam = {
    A: verses.filter((item) => item.team === 'A').length,
    B: verses.filter((item) => item.team === 'B').length,
  };
  const numbers = new Set(verses.map((item) => item.verseNumber));
  if (verses.length !== VERSE_TOTAL || numbers.size !== VERSE_TOTAL)
    errors.push('Every verse must be placed exactly once.');
  for (let n = 1; n <= VERSE_TOTAL; n++)
    if (!numbers.has(n)) errors.push(`Verse ${n} is not placed.`);
  if (new Set(items.map((item) => item.id)).size !== items.length)
    errors.push('Duplicate item ID.');
  VERSE_PLAN.forEach((plan, index) => {
    for (const team of ['A', 'B'] as const) {
      const count = verses.filter((item) => item.level === index + 1 && item.team === team).length;
      if (count !== plan[team])
        errors.push(`Level ${index + 1} team ${team} has ${count} verses, expected ${plan[team]}.`);
    }
  });
  const places = new Set<string>();
  for (const item of items) {
    const key = `${item.level}/${item.team}/${item.area ?? ''}/${item.container ?? `${item.point?.x},${item.point?.y}`}`;
    if (places.has(key)) errors.push(`Two items share the hiding place ${key}.`);
    places.add(key);
  }
  for (const definition of LEVELS) {
    const secrets = SECRETS[definition.level - 1]!;
    for (const team of ['A', 'B'] as const) {
      const room = definition.rooms[team];
      const start = levelSpawns(definition.level, team, 10)[0]!;
      const key = `${definition.level}${team}`;
      let reach = worlds.get(key);
      if (!reach)
        worlds.set(
          key,
          (reach = walkable(
            levelWorld(definition.level, () => 'open'),
            room.bounds,
            start,
          )),
        );
      let closed = worlds.get(`${key}-closed`);
      if (!closed)
        worlds.set(
          `${key}-closed`,
          (closed = walkable(
            levelWorld(definition.level, () => 'closed'),
            room.bounds,
            start,
          )),
        );
      const area = secrets.areas[team];
      const { world, bounds } = areaWorld(area);
      let inside = worlds.get(area.id);
      if (!inside) worlds.set(area.id, (inside = walkable(world, bounds, area.spawn)));
      const label = `Level ${definition.level} team ${team}`;
      const exitZone = definition.exits[team].zone;
      if (!reach.some((point) => distanceToRect(point, exitZone) === 0))
        errors.push(`${label}: the exit cannot be reached through the open door.`);
      if (closed.some((point) => distanceToRect(point, exitZone) === 0))
        errors.push(`${label}: the exit is reachable while the door is closed.`);
      const fixtureRect = (id: string, pool: readonly Fixture[]) =>
        pool.find((entry) => entry.id === id);
      const entrance = fixtureRect(area.entranceObjectId, definition.fixtures);
      if (!entrance || entrance.roomId !== room.id || !canReach(closed, entrance))
        errors.push(`${label}: the secret entrance is unreachable.`);
      if (!levelWorld(definition.level, () => 'closed').isValid(area.returnTo, room.bounds))
        errors.push(`${label}: leaving the hidden chamber lands inside an obstacle.`);
      const exit = fixtureRect(area.exitId, area.fixtures);
      if (!exit || !canReach(inside, exit))
        errors.push(`${label}: the hidden chamber has no way out.`);
      for (const item of items.filter(
        (entry) => entry.level === definition.level && entry.team === team,
      )) {
        const points = item.area ? inside : closed;
        if (item.area && item.area !== area.id) errors.push(`${label}: item in a foreign chamber.`);
        const target = item.container
          ? fixtureRect(item.container, item.area ? area.fixtures : definition.fixtures)
          : item.point && pointRect(item.point);
        if (!target || !canReach(points, target))
          errors.push(
            `${label}: ${item.type} at ${item.container ?? 'a loose spot'} is unreachable.`,
          );
        else if (!item.container) {
          const w = item.area ? world : levelWorld(definition.level, () => 'closed');
          const b = item.area ? bounds : room.bounds;
          // Loose items lie on open floor, never inside collision geometry.
          if (!w.isValid(item.point!, b, 6))
            errors.push(`${label}: a loose item is inside an obstacle.`);
        }
      }
    }
  }
  return { errors, verseCount: verses.length, perLevel, perTeam };
}
