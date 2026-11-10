import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MAX_PLAYERS, ROOM_NAME } from '@escape/shared';
import { GameRoom, sessions } from './rooms/GameRoom.js';
import { creationKey, hashToken } from './systems/identity.js';
import { RateLimiter } from './systems/RateLimiter.js';

const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};
function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

export function createGameServer() {
  matchMaker.controller.exposedMethods = ['joinById', 'reconnect'];
  const creationLimiter = new RateLimiter(10, 60_000);
  const readLimiter = new RateLimiter(240, 60_000);
  const origins = new Set(
    (process.env.CLIENT_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const isAllowedOrigin = (origin: string | undefined) =>
    !origin || origins.size === 0 || origins.has(origin);
  const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  const httpServer = createServer();
  const handleHttp = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url?.startsWith('/matchmake/')) {
      next();
      return;
    }
    void (async () => {
      const origin = request.headers.origin;
      if (!isAllowedOrigin(origin)) {
        json(response, 403, { message: 'Origin not allowed.' });
        return;
      }
      if (origin && origins.has(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        response.end();
        return;
      }
      const path = new URL(request.url ?? '/', 'http://internal').pathname;
      const ip = request.socket.remoteAddress ?? 'unknown'; // Never trust arbitrary X-Forwarded-For.
      if (path === '/health') {
        json(response, 200, { status: 'ok' });
        return;
      }
      if (path === '/api/sessions' && request.method === 'POST') {
        request.resume();
        if (!creationLimiter.allow(ip)) {
          json(response, 429, { message: 'Too many games created. Wait a minute.' });
          return;
        }
        const hostToken = randomBytes(32).toString('base64url');
        const room = await matchMaker.createRoom(ROOM_NAME, {
          creationKey,
          hostDigest: hashToken(hostToken),
          // Optional reproducible session for tests and playtests; random when unset.
          seed: process.env.GAME_SEED,
        });
        json(response, 201, { code: room.roomId, hostToken });
        return;
      }
      if (path.startsWith('/api/sessions/') && request.method === 'GET') {
        if (!readLimiter.allow(ip)) {
          json(response, 429, { message: 'Too many requests.' });
          return;
        }
        const code = path.slice('/api/sessions/'.length).toUpperCase();
        const room = sessions.get(code);
        if (!room) {
          json(response, 404, {
            message: 'Game not found or expired. Ask the host for a new code.',
          });
          return;
        }
        json(response, 200, {
          code,
          status: room.state.status,
          playerCount: room.state.players.size,
          maxPlayers: MAX_PLAYERS,
        });
        return;
      }
      if (path.startsWith('/api/')) {
        json(response, 404, { message: 'Not found.' });
        return;
      }
      if (process.env.NODE_ENV === 'production' && request.method === 'GET') {
        const decoded = decodeURIComponent(path);
        const asset = resolve(clientDist, `.${decoded}`);
        if (!asset.startsWith(clientDist + sep) && asset !== clientDist) {
          json(response, 403, { message: 'Forbidden.' });
          return;
        }
        const file = extname(asset) ? asset : resolve(clientDist, 'index.html');
        try {
          const body = await readFile(file);
          response.writeHead(200, {
            'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
          });
          response.end(body);
          return;
        } catch {
          json(response, 404, { message: 'Client build not found. Run pnpm build first.' });
          return;
        }
      }
      json(response, 404, { message: 'Not found.' });
    })().catch((error: unknown) => {
      console.error(
        'HTTP request failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
      if (!response.headersSent)
        json(response, 500, { message: 'Unable to create the game. Try again.' });
      else response.end();
    });
  };
  const gameServer = new Server({
    express: (app) => {
      app.use(handleHttp);
    },
    transport: new WebSocketTransport({
      server: httpServer,
      maxPayload: 2048,
      pingInterval: 3000,
      pingMaxRetries: 2,
      verifyClient: ({ origin }: { origin: string }) => isAllowedOrigin(origin),
    }),
    greet: false,
    gracefullyShutdown: false,
  });
  gameServer.define(ROOM_NAME, GameRoom);
  return { gameServer, httpServer };
}
