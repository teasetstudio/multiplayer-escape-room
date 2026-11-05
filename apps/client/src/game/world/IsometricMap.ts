import Phaser from 'phaser';
import {
  ISOMETRIC,
  worldToScreen,
  tileToWorld,
  type DoorSnapshot,
  type LogicalMap,
  type MapObject,
  type Point,
  type Rectangle,
} from '@escape/shared';

interface Surface {
  graphics: Phaser.GameObjects.Graphics;
  bounds: Rectangle;
  depth: number;
  doorId?: string;
}
const FLOOR = [0, 0x455957, 0x4b605b, 0x4c595a];

function corners(rect: Rectangle): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map(worldToScreen);
}
function bounds(points: Point[]): Rectangle {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
function polygon(graphics: Phaser.GameObjects.Graphics, points: Point[], color: number, alpha = 1) {
  graphics.fillStyle(color, alpha).fillPoints(points, true);
}

/** Static geometry is constructed once; only local occlusion and door visibility change. */
export class IsometricMap {
  readonly bounds: Rectangle;
  private readonly surfaces: Surface[] = [];
  constructor(scene: Phaser.Scene, map: LogicalMap) {
    const floor = scene.add.graphics().setDepth(-10_000);
    const allPoints: Point[] = [];
    map.ground.forEach((gid, index) => {
      if (!gid) return;
      const tile = tileToWorld({ x: index % map.columns, y: Math.floor(index / map.columns) });
      const points = corners({
        ...tile,
        width: ISOMETRIC.worldTileSize,
        height: ISOMETRIC.worldTileSize,
      });
      allPoints.push(...points);
      polygon(floor, points, FLOOR[gid] ?? FLOOR[1]!);
      floor.lineStyle(1, 0x748d80, 0.24).strokePoints(points, true);
      const bottom = points[2]!;
      floor
        .lineStyle(1, 0x132e2d, 0.3)
        .lineBetween(bottom.x - 20, bottom.y - 10, bottom.x, bottom.y);
    });
    for (const object of map.objects) {
      if (object.kind === 'rug') {
        const points = corners(object);
        polygon(floor, points, 0xa2b880, 0.12);
        floor.lineStyle(2, 0xb3cb92, 0.3).strokePoints(points, true);
        const inset = corners({
          x: object.x + 12,
          y: object.y + 12,
          width: object.width - 24,
          height: object.height - 24,
        });
        floor.strokePoints(inset, true);
        continue;
      }
      // Split long walls so a whole room wall never shares a single depth.
      const nx = Math.ceil(object.width / ISOMETRIC.worldTileSize);
      const ny = Math.ceil(object.height / ISOMETRIC.worldTileSize);
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const piece = {
            ...object,
            x: object.x + (x * object.width) / nx,
            y: object.y + (y * object.height) / ny,
            width: object.width / nx,
            height: object.height / ny,
          };
          const surface = this.block(scene, piece);
          this.surfaces.push(surface);
          allPoints.push(
            { x: surface.bounds.x, y: surface.bounds.y },
            {
              x: surface.bounds.x + surface.bounds.width,
              y: surface.bounds.y + surface.bounds.height,
            },
          );
        }
    }
    this.bounds = bounds(allPoints);
  }
  private block(scene: Phaser.Scene, object: MapObject): Surface {
    const base = corners(object);
    const top = base.map((point) => ({ x: point.x, y: point.y - object.elevation }));
    const graphics = scene.add.graphics();
    const door = object.kind === 'door';
    const crate = object.kind === 'crate';
    const colors = door
      ? [0x6f9293, 0x344c54, 0x486b70]
      : crate
        ? [0x9d8766, 0x635741, 0x7b694d]
        : [0x8a9690, 0x4d5d5b, 0x63736e];
    polygon(graphics, [top[1]!, top[2]!, base[2]!, base[1]!], colors[1]!);
    polygon(graphics, [top[2]!, top[3]!, base[3]!, base[2]!], colors[2]!);
    polygon(graphics, top, colors[0]!);
    graphics.lineStyle(1, 0xd6ddd0, 0.22).strokePoints(top, true);
    graphics.lineStyle(1, 0x182d2d, 0.65).lineBetween(base[2]!.x, base[2]!.y, top[2]!.x, top[2]!.y);
    if (door || crate) {
      for (const [a, b] of [
        [1, 2],
        [2, 3],
      ] as const) {
        const left = top[a]!;
        const right = top[b]!;
        graphics
          .lineStyle(3, door ? 0xb6ceae : 0xc0a278, 0.7)
          .lineBetween(left.x, left.y + 10, right.x, right.y + 10);
        if (door)
          graphics.lineBetween(
            left.x,
            left.y + object.elevation - 8,
            right.x,
            right.y + object.elevation - 8,
          );
      }
    } else {
      graphics.lineStyle(1, 0x263d3b, 0.4);
      for (const [a, b] of [
        [1, 2],
        [2, 3],
      ] as const)
        graphics.lineBetween(
          top[a]!.x,
          top[a]!.y + object.elevation / 2,
          top[b]!.x,
          top[b]!.y + object.elevation / 2,
        );
    }
    const depth = worldToScreen({
      x: object.x + object.width / 2,
      y: object.y + object.height / 2,
    }).y;
    graphics.setDepth(depth);
    return {
      graphics,
      depth,
      bounds: bounds([...base, ...top]),
      doorId: door ? object.id : undefined,
    };
  }
  update(local: Point | undefined, doors: Map<string, DoorSnapshot> | undefined, delta: number) {
    for (const surface of this.surfaces) {
      surface.graphics.setVisible(!surface.doorId || doors?.get(surface.doorId)?.state !== 'open');
      const b = surface.bounds;
      const obscures =
        local &&
        surface.depth > local.y &&
        local.x + 13 > b.x &&
        local.x - 13 < b.x + b.width &&
        local.y > b.y &&
        local.y - 46 < b.y + b.height;
      const alpha = obscures ? 0.27 : 1;
      surface.graphics.alpha += (alpha - surface.graphics.alpha) * (1 - Math.exp(-delta / 90));
    }
  }
}
