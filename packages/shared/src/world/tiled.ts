import { ISOMETRIC } from './projection.js';
import type { CollisionShape, LogicalMap, MapObject, Point, Rectangle } from './types.js';

type RecordValue = Record<string, unknown>;
function record(value: unknown, context: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid Tiled ${context}.`);
  return value as RecordValue;
}
function array(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Tiled ${context} must be an array.`);
  return value;
}
function number(value: unknown, context: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum)
    throw new Error(`Invalid Tiled ${context}.`);
  return value;
}
function text(value: unknown, context: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing Tiled ${context}.`);
  return value;
}
function properties(value: unknown): RecordValue {
  const result: RecordValue = {};
  for (const entry of array(value ?? [], 'properties')) {
    const property = record(entry, 'property');
    result[text(property.name, 'property name')] = property.value;
  }
  return result;
}
function fingerprint(value: unknown): string {
  // Stable across Node and the browser. Detects stale client geometry, not a security signature.
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) hash = Math.imul(hash ^ json.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Supported Tiled subset: finite 2:1 maps, uncompressed GID arrays, embedded tilesets,
 * zero-offset layers, unrotated rectangles and spawn points. Reject unsupported geometry
 * instead of silently letting rendering and collision diverge. */
export function loadTiledMap(source: unknown): LogicalMap {
  const data = record(source, 'map');
  if (
    data.orientation !== 'isometric' ||
    data.infinite !== false ||
    data.tilewidth !== ISOMETRIC.tileWidth ||
    data.tileheight !== ISOMETRIC.tileHeight
  )
    throw new Error('Use a finite isometric Tiled map with 64 × 32 tiles.');
  const columns = number(data.width, 'width', 1);
  const rows = number(data.height, 'height', 1);
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns * rows > 100_000)
    throw new Error('Invalid or excessive map dimensions.');
  const width = columns * ISOMETRIC.worldTileSize;
  const height = rows * ISOMETRIC.worldTileSize;
  const metadata = properties(data.properties);
  const layers = new Map<string, RecordValue>();
  for (const entry of array(data.layers, 'layers')) {
    const layer = record(entry, 'layer');
    const name = text(layer.name, 'layer name');
    if (layers.has(name)) throw new Error(`Duplicate layer ${name}.`);
    if ([layer.offsetx, layer.offsety, layer.x, layer.y].some((n) => n !== undefined && n !== 0))
      throw new Error(`Layer ${name} must have zero offsets.`);
    layers.set(name, layer);
  }
  const layer = (name: string, type: string) => {
    const value = layers.get(name);
    if (!value || value.type !== type) throw new Error(`Missing ${name} ${type} layer.`);
    return value;
  };
  const tilesets = array(data.tilesets, 'tilesets').map((value) => record(value, 'tileset'));
  if (
    tilesets.length !== 1 ||
    tilesets[0]?.firstgid !== 1 ||
    tilesets[0]?.source ||
    tilesets[0]?.tilecount !== 3
  )
    throw new Error('Embed the three-tile stone tileset (first GID 1).');
  const groundLayer = layer('Ground', 'tilelayer');
  const ground = array(groundLayer.data, 'Ground data').map((gid) => {
    const id = number(gid, 'tile GID');
    if (!Number.isInteger(id) || id > 3) throw new Error('Unsupported tile GID or tile flip.');
    return id;
  });
  if (
    ground.length !== columns * rows ||
    groundLayer.width !== columns ||
    groundLayer.height !== rows
  )
    throw new Error('Ground dimensions do not match the map.');
  // Tiled isometric object coordinates use tileheight units on BOTH axes, not screen pixels.
  const scale = ISOMETRIC.worldTileSize / ISOMETRIC.tileHeight;
  const rectangle = (object: RecordValue, point = false): Rectangle => {
    if (
      object.rotation ||
      object.polygon ||
      object.polyline ||
      object.ellipse ||
      object.gid ||
      object.template
    )
      throw new Error('Only unrotated rectangles and spawn points are supported.');
    const rect = {
      x: number(object.x, 'object x') * scale,
      y: number(object.y, 'object y') * scale,
      width: number(object.width ?? 0, 'object width', point ? 0 : 0.01) * scale,
      height: number(object.height ?? 0, 'object height', point ? 0 : 0.01) * scale,
    };
    if (rect.x + rect.width > width || rect.y + rect.height > height)
      throw new Error('Object extends outside the map.');
    return rect;
  };
  const objects: MapObject[] = [];
  const ids = new Set<string>();
  for (const name of ['Walls', 'Decorations', 'Objects']) {
    for (const entry of array(layer(name, 'objectgroup').objects, `${name} objects`)) {
      const object = record(entry, 'object');
      const id = text(object.name, 'object name');
      const kind = object.class || object.type;
      if (
        kind !== 'wall' &&
        kind !== 'crate' &&
        kind !== 'pillar' &&
        kind !== 'door' &&
        kind !== 'rug'
      )
        throw new Error(`Unsupported visual object ${id}.`);
      if (ids.has(id)) throw new Error(`Duplicate visual object ${id}.`);
      ids.add(id);
      const props = properties(object.properties);
      objects.push({
        ...rectangle(object),
        id,
        kind,
        elevation: number(props.elevation ?? 32, 'elevation'),
      });
    }
  }
  const collisions: CollisionShape[] = [];
  const collisionIds = new Set<string>();
  for (const entry of array(layer('Collision', 'objectgroup').objects, 'collisions')) {
    const object = record(entry, 'collision');
    const id = text(object.name, 'collision name');
    const kind = object.class || object.type;
    if (kind !== 'wall' && kind !== 'obstacle' && kind !== 'boundary' && kind !== 'door')
      throw new Error(`Unsupported collision kind ${id}.`);
    if (collisionIds.has(id)) throw new Error(`Duplicate collision ${id}.`);
    collisionIds.add(id);
    const shape: CollisionShape = { ...rectangle(object), id, kind };
    if (kind === 'door') shape.doorId = text(properties(object.properties).doorId, 'doorId');
    collisions.push(shape);
  }
  const doors = objects.filter((object) => object.kind === 'door');
  for (const door of doors) {
    const shapes = collisions.filter((shape) => shape.doorId === door.id);
    if (shapes.length !== 1) throw new Error(`Door ${door.id} needs exactly one collision shape.`);
    const shape = shapes[0]!;
    if (
      shape.x !== door.x ||
      shape.y !== door.y ||
      shape.width !== door.width ||
      shape.height !== door.height
    )
      throw new Error(`Door ${door.id} visual/collision footprints must match.`);
  }
  if (collisions.some((shape) => shape.doorId && !doors.some((door) => door.id === shape.doorId)))
    throw new Error('Collision references an unknown door.');
  const spawns: Point[] = array(layer('SpawnPoints', 'objectgroup').objects, 'spawn points').map(
    (entry) => {
      const object = record(entry, 'spawn');
      if (object.point !== true) throw new Error('SpawnPoints must contain Tiled point objects.');
      const { x, y } = rectangle(object, true);
      return { x, y };
    },
  );
  if (!spawns.length) throw new Error('Map needs spawn points.');
  return {
    id: text(metadata.mapId, 'mapId'),
    name: text(metadata.displayName, 'displayName'),
    version: `${text(metadata.revision, 'revision')}-${fingerprint(source)}`,
    columns,
    rows,
    width,
    height,
    ground,
    objects,
    collisions,
    spawns,
  };
}
