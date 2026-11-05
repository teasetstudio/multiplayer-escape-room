import type { Point } from './types.js';

export const ISOMETRIC = { tileWidth: 64, tileHeight: 32, worldTileSize: 64 } as const;

// Logical units are independent of screen pixels. A tile is a 64 × 64 logical square.
export function worldToScreen({ x, y }: Point): Point {
  return {
    x: ((x - y) * ISOMETRIC.tileWidth) / (2 * ISOMETRIC.worldTileSize),
    y: ((x + y) * ISOMETRIC.tileHeight) / (2 * ISOMETRIC.worldTileSize),
  };
}
export function screenToWorld({ x, y }: Point): Point {
  return {
    x: (x / ISOMETRIC.tileWidth + y / ISOMETRIC.tileHeight) * ISOMETRIC.worldTileSize,
    y: (y / ISOMETRIC.tileHeight - x / ISOMETRIC.tileWidth) * ISOMETRIC.worldTileSize,
  };
}
export function tileToWorld({ x, y }: Point): Point {
  return { x: x * ISOMETRIC.worldTileSize, y: y * ISOMETRIC.worldTileSize };
}
export function worldToTile({ x, y }: Point): Point {
  return {
    x: Math.floor(x / ISOMETRIC.worldTileSize),
    y: Math.floor(y / ISOMETRIC.worldTileSize),
  };
}
export function normalizeDirection({ x, y }: Point): Point {
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length };
}
// Invert the projection, then restore the joystick's magnitude (including its dead zone).
// This preserves logical speed while making screen-right actually travel screen-right.
export function screenInputToWorld(input: Point): Point {
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) return { x: 0, y: 0 };
  const strength = Math.min(1, Math.hypot(input.x, input.y));
  const world = screenToWorld(input);
  const length = Math.hypot(world.x, world.y);
  if (!length) return { x: 0, y: 0 };
  return { x: (world.x / length) * strength, y: (world.y / length) * strength };
}
