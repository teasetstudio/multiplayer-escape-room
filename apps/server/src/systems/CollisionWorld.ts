import {
  ISOMETRIC,
  WORLD,
  type CollisionShape,
  type DoorState,
  type LogicalMap,
  type Point,
  type Rectangle,
} from '@escape/shared';

const EPSILON = 1e-7;
function overlaps(a: Rectangle, b: Rectangle) {
  return (
    a.x < b.x + b.width - EPSILON &&
    a.x + a.width > b.x + EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    a.y + a.height > b.y + EPSILON
  );
}
function footprint(point: Point, radius: number): Rectangle {
  return { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 };
}

/** Server-only simulation. A static uniform grid keeps queries local to each player's feet. */
export class CollisionWorld {
  private readonly cells = new Map<string, CollisionShape[]>();
  constructor(
    readonly map: LogicalMap,
    private readonly doorState: (id: string) => DoorState = () => 'closed',
  ) {
    for (const shape of map.collisions) {
      for (const key of this.keys(shape)) {
        const bucket = this.cells.get(key) ?? [];
        bucket.push(shape);
        this.cells.set(key, bucket);
      }
    }
  }
  private *keys(rect: Rectangle) {
    const size = ISOMETRIC.worldTileSize;
    for (let y = Math.floor(rect.y / size); y <= Math.floor((rect.y + rect.height) / size); y++)
      for (let x = Math.floor(rect.x / size); x <= Math.floor((rect.x + rect.width) / size); x++)
        yield `${x},${y}`;
  }
  private nearby(rect: Rectangle) {
    const found = new Set<CollisionShape>();
    for (const key of this.keys(rect))
      for (const shape of this.cells.get(key) ?? [])
        if (!shape.doorId || this.doorState(shape.doorId) === 'closed') found.add(shape);
    return found;
  }
  isValid(point: Point, radius: number = WORLD.playerRadius): boolean {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(radius) ||
      radius <= 0
    )
      return false;
    const box = footprint(point, radius);
    if (
      box.x < 0 ||
      box.y < 0 ||
      box.x + box.width > this.map.width ||
      box.y + box.height > this.map.height
    )
      return false;
    return ![...this.nearby(box)].some((shape) => overlaps(box, shape));
  }
  move(position: Point, delta: Point, radius: number = WORLD.playerRadius): Point {
    if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y) || !this.isValid(position, radius))
      return { ...position };
    const next = { ...position };
    // Each step is smaller than the footprint, so even a one-unit wall cannot be skipped.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / radius));
    const dx = delta.x / steps;
    const dy = delta.y / steps;
    for (let step = 0; step < steps; step++) {
      this.moveAxis(next, dx, 'x', radius);
      this.moveAxis(next, dy, 'y', radius);
    }
    return next;
  }
  private moveAxis(point: Point, distance: number, axis: 'x' | 'y', radius: number) {
    if (!distance) return;
    const limit = axis === 'x' ? this.map.width : this.map.height;
    let target = Math.max(radius, Math.min(limit - radius, point[axis] + distance));
    const candidate = { ...point, [axis]: target };
    const box = footprint(candidate, radius);
    for (const shape of this.nearby(box)) {
      if (!overlaps(box, shape)) continue;
      const edge =
        distance > 0
          ? shape[axis] - radius
          : shape[axis] + (axis === 'x' ? shape.width : shape.height) + radius;
      target = distance > 0 ? Math.min(target, edge) : Math.max(target, edge);
    }
    point[axis] = target;
  }
}

export function selectSpawnPoints(world: CollisionWorld, count: number): Point[] {
  const result: Point[] = [];
  for (const point of world.map.spawns) {
    if (
      world.isValid(point) &&
      result.every(
        (other) =>
          Math.max(Math.abs(point.x - other.x), Math.abs(point.y - other.y)) >
          WORLD.playerRadius * 2,
      )
    )
      result.push({ ...point });
    if (result.length === count) return result;
  }
  throw new Error(`Map ${world.map.id} needs ${count} valid, separated spawn points.`);
}
