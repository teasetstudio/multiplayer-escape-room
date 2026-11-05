export interface Point {
  x: number;
  y: number;
}
export interface Rectangle extends Point {
  width: number;
  height: number;
}
export type DoorState = 'open' | 'closed';
export interface DoorSnapshot {
  id: string;
  state: DoorState;
}
export interface CollisionShape extends Rectangle {
  id: string;
  kind: 'wall' | 'obstacle' | 'boundary' | 'door';
  doorId?: string;
}
export interface MapObject extends Rectangle {
  id: string;
  kind: 'wall' | 'crate' | 'pillar' | 'door' | 'rug';
  elevation: number;
}
export interface LogicalMap {
  id: string;
  version: string;
  name: string;
  columns: number;
  rows: number;
  width: number;
  height: number;
  ground: readonly number[];
  objects: readonly MapObject[];
  collisions: readonly CollisionShape[];
  spawns: readonly Point[];
}
