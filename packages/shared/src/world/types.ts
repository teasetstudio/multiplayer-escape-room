import type { TeamId } from '../types/index.js';

export interface Point {
  x: number;
  y: number;
}
export interface Rectangle extends Point {
  width: number;
  height: number;
}
export type RoomId = `room-${string}`;
export interface LogicalRoom {
  id: RoomId;
  name: string;
  bounds: Rectangle;
  startTeam?: TeamId;
}
export type DoorState = 'open' | 'closed';
export interface DoorSnapshot {
  id: string;
  roomId: RoomId;
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
  roomId?: RoomId;
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
  rooms: readonly LogicalRoom[];
  spawns: readonly Point[];
}
