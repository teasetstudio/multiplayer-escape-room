import type { DoorSnapshot } from '../world/types.js';

export type SessionStatus = 'lobby' | 'playing';
export type ClientRole = 'host' | 'player';
export interface MovementInput {
  x: number;
  y: number;
  seq: number;
}
export interface PlayerState {
  id: string;
  nickname: string;
  color: string;
  x: number;
  y: number;
  connected: boolean;
}
// A renderer-independent world contract. Coordinates are world units, never screen pixels.
export interface WorldState {
  mapId: string;
  mapVersion: string;
  status: SessionStatus;
  hostConnected: boolean;
  players: Map<string, PlayerState>;
  doors: Map<string, DoorSnapshot>;
}
export interface CreateSessionResponse {
  code: string;
  hostToken: string;
}
export interface SessionInfo {
  code: string;
  status: SessionStatus;
  playerCount: number;
  maxPlayers: number;
}
export interface GameError {
  message: string;
}
export interface JoinOptions {
  role: ClientRole;
  nickname?: string;
  hostToken?: string;
}
