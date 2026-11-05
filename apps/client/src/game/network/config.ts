export function serverHttpUrl() {
  const url = new URL(import.meta.env.VITE_GAME_SERVER_URL || window.location.origin);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol))
    throw new Error('Invalid game server URL.');
  url.protocol =
    url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
  if (window.location.protocol === 'https:' && url.protocol !== 'https:') {
    throw new Error('The HTTPS client requires an HTTPS/WSS game server.');
  }
  return url.origin;
}
export function serverWebSocketUrl() {
  return serverHttpUrl().replace(/^http/, 'ws');
}
export function joinUrl(code: string) {
  const base = new URL(import.meta.env.VITE_PUBLIC_CLIENT_URL || window.location.origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    throw new Error('Set a valid public client URL.');
  if (
    ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(base.hostname) ||
    base.hostname.endsWith('.localhost')
  ) {
    throw new Error(
      'Open this page using the computer’s Wi-Fi IP address, or set VITE_PUBLIC_CLIENT_URL. A localhost QR code cannot work on phones.',
    );
  }
  return new URL(`/join/${code}`, base).href;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${serverHttpUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body === 'object' && body && 'message' in body
        ? String(body.message)
        : 'The server could not complete the request.',
    );
  return body as T;
}
