import type { TeamId } from '../types/index.js';

export const ROOM_NAME = 'escape';
export const MAX_PLAYERS = 20;
export const TEAM_IDS = ['A', 'B'] as const satisfies readonly TeamId[];
export const TEAM_STYLE = {
  A: { name: 'Blue', color: '#82beff' },
  B: { name: 'Orange', color: '#ffad72' },
} as const satisfies Record<TeamId, { name: string; color: string }>;
export const NICKNAME_MAX_LENGTH = 18;
export const RECONNECT_SECONDS = 60;
export const SIMULATION_HZ = 30;
export const PATCH_HZ = 20;
export const INPUT_HZ = 20;
export const INPUT_TIMEOUT_MS = 300;
export const INTERPOLATION_MS = 100;
// Player footprint is a logical axis-aligned square; map dimensions live in map metadata.
export const WORLD = { playerRadius: 14, speed: 200 } as const;
export const PLAYER_COLORS = [
  '#c5f277',
  '#8bb8ff',
  '#ff9a8b',
  '#cf9cff',
  '#ffdc78',
  '#73e2d2',
  '#ff91cb',
  '#d9dded',
  '#ed7a51',
  '#5fc3ff',
  '#a7cc54',
  '#b49a7b',
  '#fa72a0',
  '#5cdb9c',
  '#aa91ff',
  '#f4b667',
  '#79aeb4',
  '#cebdff',
  '#f6e7a3',
  '#a0d3ff',
] as const;
export const MESSAGE = {
  input: 'input',
  start: 'start',
  error: 'game-error',
  identify: 'identify',
  identity: 'identity',
  interact: 'interact',
  collect: 'collect',
  puzzle: 'puzzle',
  board: 'board',
  prompt: 'prompt',
  panel: 'panel',
  area: 'area',
  discoveries: 'discoveries',
  notice: 'notice',
} as const;
/** How close (logical units) a player's feet must be to a prop's footprint to use it. */
export const INTERACT_REACH = 46;
export const TRANSITION_MS = 3500;
