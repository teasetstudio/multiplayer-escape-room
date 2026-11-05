export const ROOM_NAME = 'escape';
export const MAX_PLAYERS = 20;
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
export const MESSAGE = { input: 'input', start: 'start', error: 'game-error' } as const;
