import { INPUT_TIMEOUT_MS, WORLD, normalizeDirection, type MovementInput } from '@escape/shared';
import type { Player } from '../state/GameState.js';
import type { CollisionWorld } from './CollisionWorld.js';

export interface TimedInput extends MovementInput {
  receivedAt: number;
}

export function validateInput(value: unknown): MovementInput | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (
    typeof data.x !== 'number' ||
    typeof data.y !== 'number' ||
    !Number.isFinite(data.x) ||
    !Number.isFinite(data.y) ||
    Math.abs(data.x) > 1 ||
    Math.abs(data.y) > 1 ||
    typeof data.seq !== 'number' ||
    !Number.isSafeInteger(data.seq) ||
    data.seq < 0
  )
    return;
  return { ...normalizeDirection({ x: data.x, y: data.y }), seq: data.seq };
}

export function movePlayer(
  player: Player,
  input: TimedInput | undefined,
  dt: number,
  now: number,
  world: CollisionWorld,
) {
  if (
    !player.connected ||
    !input ||
    now - input.receivedAt > INPUT_TIMEOUT_MS ||
    !Number.isFinite(dt) ||
    dt <= 0
  )
    return;
  const distance = WORLD.speed * dt;
  Object.assign(player, world.move(player, { x: input.x * distance, y: input.y * distance }));
}
