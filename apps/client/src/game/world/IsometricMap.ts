import Phaser from 'phaser';
import {
  ISOMETRIC,
  TEAM_STYLE,
  roomAt,
  type RoomId,
  worldToScreen,
  tileToWorld,
  type DoorSnapshot,
  type Fixture,
  type FixtureState,
  type LogicalMap,
  type MapObject,
  type PickupState,
  type Point,
  type Rectangle,
} from '@escape/shared';
import { FLOORS, MAP_ART, artKey, originOf } from './assets';

type Fadeable = Phaser.GameObjects.Graphics | Phaser.GameObjects.Image;
interface Surface {
  object: Fadeable;
  bounds: Rectangle;
  depth: number;
}
interface DoorView {
  id: string;
  closed: Phaser.GameObjects.Image;
  open: Phaser.GameObjects.Image;
  lamp: Phaser.GameObjects.Image;
}
export interface WorldDynamics {
  doors?: Map<string, DoorSnapshot>;
  /** Puzzle prop states for the viewer's own team. */
  states?: Record<string, FixtureState>;
  /** Secret entrances this player has uncovered. */
  discoveries?: readonly string[];
  /** Loose artifacts the viewer is allowed to see. */
  pickups?: Iterable<PickupState>;
}
const TINT = { A: 0x4f86c6, B: 0xc9773f, neutral: 0x5d6b5f };

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
const center = (rect: Rectangle) =>
  worldToScreen({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

/** Static geometry is constructed once; occlusion, doors, puzzle props and pickups update. */
export class IsometricMap {
  readonly bounds: Rectangle;
  private readonly surfaces: Surface[] = [];
  private readonly doors: DoorView[] = [];
  private readonly props = new Map<string, { image: Phaser.GameObjects.Image; fixture: Fixture }>();
  private readonly glows = new Map<string, Phaser.GameObjects.Image>();
  private readonly pickups = new Map<string, Phaser.GameObjects.Image>();
  private time = 0;
  constructor(
    private readonly scene: Phaser.Scene,
    map: LogicalMap,
    private readonly scope: 'overview' | RoomId,
    fixtures: readonly Fixture[],
  ) {
    const tint = scene.add.graphics().setDepth(-9_000);
    const allPoints: Point[] = [];
    map.ground.forEach((gid, index) => {
      if (!gid) return;
      const tile = tileToWorld({ x: index % map.columns, y: Math.floor(index / map.columns) });
      const room = roomAt(map.rooms, tile);
      if (!room || (scope !== 'overview' && scope !== room.id)) return;
      const points = corners({
        ...tile,
        width: ISOMETRIC.worldTileSize,
        height: ISOMETRIC.worldTileSize,
      });
      allPoints.push(...points);
      const middle = center({ ...tile, width: 64, height: 64 });
      scene.add
        .image(middle.x, middle.y, `art:environment/floors/${FLOORS[gid] ?? FLOORS[1]}`)
        .setDepth(-10_000);
      // A light wash keeps each team's room recognizable on the shared monitor.
      polygon(tint, points, TINT[room.startTeam ?? 'neutral'], room.startTeam ? 0.3 : 0.12);
    });
    for (const room of map.rooms) {
      if (scope !== 'overview' && room.id !== scope) continue;
      const color = room.startTeam ? TEAM_STYLE[room.startTeam].color : '#e8d9a8';
      const b = room.bounds;
      const anchor = worldToScreen({ x: b.x + b.width * 0.14, y: b.y + b.height * 0.05 });
      const plaque = scene.add
        .text(anchor.x, anchor.y - 52, room.name.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color,
          backgroundColor: '#172425',
          padding: { x: 9, y: 5 },
        })
        .setOrigin(0.5, 1)
        .setDepth(10000);
      allPoints.push({ x: plaque.x - plaque.width / 2, y: plaque.y - plaque.height });
    }
    for (const object of map.objects) {
      if (scope !== 'overview' && object.roomId !== scope) continue;
      if (object.kind === 'rug') {
        const points = corners(object);
        polygon(tint, points, 0xe8d9a8, 0.1);
        tint.lineStyle(2, 0xe8d9a8, 0.28).strokePoints(points, true);
        continue;
      }
      if (object.kind === 'door') {
        this.door(object);
        continue;
      }
      if (object.kind === 'crate' || object.kind === 'pillar') {
        const art = MAP_ART[object.kind];
        const at = center(object);
        const image = scene.add
          .image(at.x, at.y, `art:${art.path}`)
          .setOrigin(art.anchor[0] / art.size[0], art.anchor[1] / art.size[1])
          .setScale(0.5)
          .setDepth(at.y);
        this.track(image, at.y, allPoints);
        continue;
      }
      // Split long walls so a whole room wall never shares a single depth.
      const nx = Math.ceil(object.width / ISOMETRIC.worldTileSize);
      const ny = Math.ceil(object.height / ISOMETRIC.worldTileSize);
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const surface = this.block({
            ...object,
            x: object.x + (x * object.width) / nx,
            y: object.y + (y * object.height) / ny,
            width: object.width / nx,
            height: object.height / ny,
          });
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
    for (const fixture of fixtures) {
      if (scope !== 'overview' && fixture.roomId && fixture.roomId !== scope) continue;
      const at = center(fixture);
      const origin = originOf(fixture.kind);
      const image = scene.add
        .image(at.x, at.y, artKey(fixture.kind, undefined, fixture.detail))
        .setOrigin(origin.x, origin.y)
        .setScale(0.5)
        .setDepth(fixture.kind === 'plate' ? -8_000 : at.y);
      this.props.set(fixture.id, { image, fixture });
      if (fixture.solid) this.track(image, at.y, allPoints);
      if (fixture.kind === 'pedestal' && fixture.detail)
        scene.add
          .image(at.x, at.y - 62, `art:puzzles/symbol-${fixture.detail}`)
          .setScale(0.5)
          .setDepth(at.y + 1);
    }
    this.bounds = bounds(allPoints);
  }
  private track(image: Phaser.GameObjects.Image, depth: number, all: Point[]) {
    const b = image.getBounds();
    this.surfaces.push({ object: image, depth, bounds: b });
    all.push({ x: b.x, y: b.y }, { x: b.right, y: b.bottom });
  }
  private door(object: MapObject) {
    const art = MAP_ART.door;
    const at = center(object);
    const make = (state: 'closed' | 'open') =>
      this.scene.add
        .image(at.x, at.y, `art:${art.path}-${state}`)
        .setOrigin(art.anchor[0] / art.size[0], art.anchor[1] / art.size[1])
        .setScale(0.5)
        .setDepth(at.y);
    const lamp = this.scene.add
      .image(at.x, at.y - 58, 'art:puzzles/indicator-locked')
      .setScale(0.6)
      .setDepth(at.y + 2);
    this.doors.push({ id: object.id, closed: make('closed'), open: make('open'), lamp });
  }
  private block(object: MapObject): Surface {
    const base = corners(object);
    const top = base.map((point) => ({ x: point.x, y: point.y - object.elevation }));
    const graphics = this.scene.add.graphics();
    const colors = [0x9a8f7b, 0x4c463d, 0x6b6253];
    polygon(graphics, [top[1]!, top[2]!, base[2]!, base[1]!], colors[1]!);
    polygon(graphics, [top[2]!, top[3]!, base[3]!, base[2]!], colors[2]!);
    polygon(graphics, top, colors[0]!);
    graphics.lineStyle(1, 0xe8dcc0, 0.25).strokePoints(top, true);
    graphics.lineStyle(1, 0x1c1a17, 0.65).lineBetween(base[2]!.x, base[2]!.y, top[2]!.x, top[2]!.y);
    graphics.lineStyle(1, 0x2b2620, 0.45);
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
    const depth = worldToScreen({
      x: object.x + object.width / 2,
      y: object.y + object.height / 2,
    }).y;
    graphics.setDepth(depth);
    return { object: graphics, depth, bounds: bounds([...base, ...top]) };
  }
  update(local: Point | undefined, dynamics: WorldDynamics, delta: number) {
    this.time += delta;
    for (const door of this.doors) {
      const open = dynamics.doors?.get(door.id)?.state === 'open';
      door.closed.setVisible(!open);
      door.open.setVisible(open);
      door.lamp.setTexture(`art:puzzles/indicator-${open ? 'unlocked' : 'locked'}`);
    }
    for (const [id, { image, fixture }] of this.props) {
      const key = artKey(fixture.kind, dynamics.states?.[id], fixture.detail);
      if (image.texture.key !== key) image.setTexture(key);
      if (fixture.kind === 'scroll' || fixture.kind === 'artifact')
        image.y = center(fixture).y - 3 + Math.sin(this.time / 320) * 2.5;
    }
    // A discovered secret entrance becomes recognizable — for this player only.
    for (const id of dynamics.discoveries ?? []) {
      const prop = this.props.get(id);
      if (!prop || this.glows.has(id)) continue;
      const at = center(prop.fixture);
      this.glows.set(
        id,
        this.scene.add
          .image(at.x, at.y - 46, 'art:ui/icon-interaction')
          .setScale(0.34)
          .setDepth(at.y + 3),
      );
    }
    for (const glow of this.glows.values()) glow.setAlpha(0.7 + Math.sin(this.time / 260) * 0.3);
    const seen = new Set<string>();
    for (const pickup of dynamics.pickups ?? []) {
      if (this.scope !== 'overview' && pickup.roomId !== this.scope) continue;
      seen.add(pickup.id);
      const at = worldToScreen(pickup);
      let image = this.pickups.get(pickup.id);
      if (!image) {
        image = this.scene.add
          .image(at.x, at.y, artKey('artifact', undefined, pickup.art))
          .setOrigin(0.5, 0.6)
          .setScale(0.5)
          .setDepth(at.y);
        this.pickups.set(pickup.id, image);
      }
      image.y = at.y - 3 + Math.sin(this.time / 320) * 2.5;
    }
    for (const [id, image] of this.pickups)
      if (!seen.has(id)) {
        image.destroy();
        this.pickups.delete(id);
      }
    for (const surface of this.surfaces) {
      const b = surface.bounds;
      const obscures =
        local &&
        surface.depth > local.y &&
        local.x + 13 > b.x &&
        local.x - 13 < b.x + b.width &&
        local.y > b.y &&
        local.y - 46 < b.y + b.height;
      const alpha = obscures ? 0.3 : 1;
      surface.object.alpha += (alpha - surface.object.alpha) * (1 - Math.exp(-delta / 90));
    }
  }
}
