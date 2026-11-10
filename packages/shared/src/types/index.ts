import type { DoorSnapshot, RoomId } from '../world/types.js';

export type SessionStatus = 'lobby' | 'playing' | 'final' | 'won';
export type TeamId = 'A' | 'B';
export interface TeamState {
  id: TeamId;
  roomId: RoomId;
}
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
  teamId?: TeamId; // Absent until the server commits the game start.
  character?: string;
  /** True while inside a hidden chamber; x/y then hold the last PUBLIC position. */
  exploring?: boolean;
  verses?: number;
  /** Comma-separated personal artifact kinds. */
  artifacts?: string;
}
export interface ExplorerState {
  id: string;
  area: string;
  x: number;
  y: number;
}
export interface PickupState {
  id: string;
  roomId: RoomId;
  art: string;
  x: number;
  y: number;
}
export interface CardState {
  id: string;
  text: string;
  finder: string;
}
export interface TeamPuzzleState {
  id: TeamId;
  view: string;
}
// A renderer-independent world contract. Coordinates are world units, never screen pixels.
export interface WorldState {
  mapId: string;
  mapVersion: string;
  status: SessionStatus;
  hostConnected: boolean;
  players: Map<string, PlayerState>;
  doors: Map<string, DoorSnapshot>;
  teams: Map<TeamId, TeamState>;
  level: number;
  puzzleSolved: boolean;
  exitsUnlocked: boolean;
  transition: boolean;
  versesFound: number;
  /** Scripture cards found / required per team room on the current level. */
  versesA: number;
  versesB: number;
  requiredA: number;
  requiredB: number;
  exitA: boolean;
  exitB: boolean;
  artifactsFound: number;
  explorers: Map<string, ExplorerState>;
  pickups: Map<string, PickupState>;
  cards: Map<string, CardState>;
  puzzles: Map<TeamId, TeamPuzzleState>;
  boardSlots: string[];
  boardTray: string[];
  boardRevision: number;
  boardAttempts: number;
  boardCorrect: number;
  chapter: string;
  stats: string;
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
