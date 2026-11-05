import { INPUT_TIMEOUT_MS, WORLD, type MovementInput } from '@escape/shared';
import type { Player } from '../state/GameState.js';

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
  const length = Math.max(1, Math.hypot(data.x, data.y));
  return { x: data.x / length, y: data.y / length, seq: data.seq };
}

export function movePlayer(player: Player, input: TimedInput | undefined, dt: number, now: number) {
  if (!player.connected || !input || now - input.receivedAt > INPUT_TIMEOUT_MS) return;
  const distance = WORLD.speed * dt;
  player.x = Math.max(
    WORLD.playerRadius,
    Math.min(WORLD.width - WORLD.playerRadius, player.x + input.x * distance),
  );
  player.y = Math.max(
    WORLD.playerRadius,
    Math.min(WORLD.height - WORLD.playerRadius, player.y + input.y * distance),
  );
}

export function spawnPosition(index: number) {
  return {
    x: WORLD.width / 2 + ((index % 5) - 2) * 100,
    y: WORLD.height / 2 + (Math.floor(index / 5) - 1.5) * 100,
  };
}
