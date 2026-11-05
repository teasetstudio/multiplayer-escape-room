import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, INPUT_TIMEOUT_MS, MAX_PLAYERS } from '@escape/shared';
import { Player } from '../src/state/GameState.js';
import { movePlayer, spawnPosition, validateInput } from '../src/systems/movement.js';
import { nicknameKey, normalizeNickname, hashToken, validToken } from '../src/systems/identity.js';
import { RateLimiter } from '../src/systems/RateLimiter.js';

test('untrusted movement rejects invalid values and normalizes diagonals', () => {
  for (const payload of [
    null,
    {},
    { x: Infinity, y: 0, seq: 1 },
    { x: 99, y: 0, seq: 1 },
    { x: 0, y: 0, seq: -1 },
    { x: '1', y: 0, seq: 1 },
    { x: 0, y: NaN, seq: 1 },
  ])
    assert.equal(validateInput(payload), undefined);
  const diagonal = validateInput({ x: 1, y: 1, seq: 1 });
  assert.ok(diagonal);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 0.0001);
});

test('movement uses server time, clamps all edges, and expires stale input', () => {
  const player = new Player();
  player.x = WORLD.width - WORLD.playerRadius - 1;
  player.y = WORLD.playerRadius + 1;
  movePlayer(player, { x: 1, y: -1, seq: 1, receivedAt: 0 }, 1 / 30, 0);
  assert.equal(player.x, WORLD.width - WORLD.playerRadius);
  assert.equal(player.y, WORLD.playerRadius);
  player.x = WORLD.playerRadius + 1;
  player.y = WORLD.height - WORLD.playerRadius - 1;
  movePlayer(player, { x: -1, y: 1, seq: 2, receivedAt: 0 }, 1 / 30, 0);
  assert.equal(player.x, WORLD.playerRadius);
  assert.equal(player.y, WORLD.height - WORLD.playerRadius);
  player.x = 200;
  player.y = 200;
  movePlayer(player, { x: 1, y: 0, seq: 2, receivedAt: 0 }, 1, INPUT_TIMEOUT_MS + 1);
  assert.equal(player.x, 200);
  player.connected = false;
  movePlayer(player, { x: 1, y: 0, seq: 3, receivedAt: 0 }, 1, 0);
  assert.equal(player.x, 200);
});

test('every spawn is unique, inside the map, and separated from other players', () => {
  const positions = Array.from({ length: MAX_PLAYERS }, (_, index) => spawnPosition(index));
  for (const position of positions) {
    assert.ok(position.x >= WORLD.playerRadius && position.x <= WORLD.width - WORLD.playerRadius);
    assert.ok(position.y >= WORLD.playerRadius && position.y <= WORLD.height - WORLD.playerRadius);
    for (const other of positions)
      if (other !== position)
        assert.ok(Math.hypot(position.x - other.x, position.y - other.y) > WORLD.playerRadius * 2);
  }
});

test('nickname normalization detects case, whitespace, and Unicode-width duplicates', () => {
  assert.equal(
    nicknameKey(normalizeNickname('  Ｌｉｌｙ  ')),
    nicknameKey(normalizeNickname('LILY')),
  );
  assert.equal(normalizeNickname('  Jon   Doe '), 'Jon Doe');
  assert.equal(normalizeNickname('Ąžuolas'), 'Ąžuolas');
  assert.throws(() => normalizeNickname('<script>'));
  assert.throws(() => normalizeNickname('a'));
  assert.throws(() => normalizeNickname('a'.repeat(19)));
});

test('host token comparison and bounded rate limiting', () => {
  const digest = hashToken('private-token');
  assert.equal(validToken('private-token', digest), true);
  assert.equal(validToken('incorrect-token', digest), false);
  assert.equal(validToken({}, digest), false);
  const limiter = new RateLimiter(2, 1000);
  assert.equal(limiter.allow('a', 0), true);
  assert.equal(limiter.allow('a', 1), true);
  assert.equal(limiter.allow('a', 2), false);
  assert.equal(limiter.allow('b', 2), true);
  assert.equal(limiter.allow('a', 1000), true);
});
