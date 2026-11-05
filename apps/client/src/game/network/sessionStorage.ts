import type { ClientRole } from '@escape/shared';

export interface SavedSession {
  code: string;
  role: ClientRole;
  endpoint: string;
  token?: string;
  hostToken?: string;
  playerId?: string;
}
const key = 'common-ground-session-v1';
export function readSession(): SavedSession | undefined {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      value &&
      typeof value === 'object' &&
      'code' in value &&
      typeof value.code === 'string' &&
      'role' in value &&
      (value.role === 'host' || value.role === 'player') &&
      'endpoint' in value &&
      typeof value.endpoint === 'string'
    )
      return value as SavedSession;
  } catch {
    /* Storage is optional; the live connection still works in restricted browser modes. */
  }
}
export function saveSession(value: SavedSession) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* See readSession. */
  }
}
export function clearSession() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}
