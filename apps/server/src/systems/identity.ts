import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { NICKNAME_MAX_LENGTH } from '@escape/shared';

// This process-only secret prevents public /matchmake/create requests from constructing rooms.
export const creationKey = randomBytes(32).toString('hex');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function createCode() {
  return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
}
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function validToken(candidate: unknown, digest: string) {
  return (
    typeof candidate === 'string' &&
    candidate.length <= 128 &&
    timingSafeEqual(Buffer.from(hashToken(candidate), 'hex'), Buffer.from(digest, 'hex'))
  );
}
export function normalizeNickname(value: unknown) {
  if (typeof value !== 'string') throw new Error('Enter a nickname.');
  const nickname = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (
    nickname.length < 2 ||
    nickname.length > NICKNAME_MAX_LENGTH ||
    !/^[\p{L}\p{N} _-]+$/u.test(nickname)
  ) {
    throw new Error(`Use 2–${NICKNAME_MAX_LENGTH} letters, numbers, spaces, _ or -.`);
  }
  return nickname;
}
export function nicknameKey(nickname: string) {
  return nickname.toLocaleLowerCase('en-US');
}
