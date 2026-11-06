import type { LogicalRoom, Point, Rectangle } from './types.js';

export function containsRect(outer: Rectangle, inner: Rectangle) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function roomAt(rooms: readonly LogicalRoom[], point: Point) {
  return rooms.find(
    ({ bounds: b }) =>
      point.x >= b.x && point.x < b.x + b.width && point.y >= b.y && point.y < b.y + b.height,
  );
}
