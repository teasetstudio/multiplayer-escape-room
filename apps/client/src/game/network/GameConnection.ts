import { Client, type Room } from '@colyseus/sdk';
import {
  DEFAULT_MAP,
  MESSAGE,
  type ClientRole,
  type CreateSessionResponse,
  type GameError,
  type PlayerState,
  type WorldState,
} from '@escape/shared';
import { api, serverWebSocketUrl } from './config';
import { WorldBuffer } from './WorldBuffer';
import { clearSession, readSession, saveSession, type SavedSession } from './sessionStorage';

export type RosterPlayer = Pick<PlayerState, 'id' | 'nickname' | 'color' | 'connected'>;
export interface ConnectionView {
  phase: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';
  code: string;
  role: ClientRole;
  status: 'lobby' | 'playing';
  players: RosterPlayer[];
  hostConnected: boolean;
  playerId?: string;
  error?: string;
}
const initial: ConnectionView = {
  phase: 'idle',
  code: '',
  role: 'player',
  status: 'lobby',
  players: [],
  hostConnected: false,
};

export class GameConnection {
  room?: Room<WorldState>;
  readonly world = new WorldBuffer();
  private view: ConnectionView = initial;
  private listeners = new Set<() => void>();
  private pending?: Promise<void>;
  private saved?: SavedSession;
  private generation = 0;
  private rosterKey = '';
  readonly subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  };
  readonly getSnapshot = () => this.view;
  get connected() {
    return this.view.phase === 'connected';
  }

  private update(next: Partial<ConnectionView>) {
    this.view = { ...this.view, ...next };
    this.listeners.forEach((callback) => callback());
  }
  clearError() {
    this.update({ error: undefined });
  }

  async create() {
    const session = await api<CreateSessionResponse>('/api/sessions', { method: 'POST' });
    const saved: SavedSession = {
      code: session.code,
      role: 'host',
      endpoint: serverWebSocketUrl(),
      hostToken: session.hostToken,
    };
    saveSession(saved);
    await this.connect(saved, () =>
      new Client(saved.endpoint).joinById<WorldState>(saved.code, {
        role: 'host',
        hostToken: saved.hostToken,
      }),
    );
    return session.code;
  }
  async join(code: string, nickname: string) {
    const saved: SavedSession = { code, role: 'player', endpoint: serverWebSocketUrl() };
    await this.connect(saved, () =>
      new Client(saved.endpoint).joinById<WorldState>(code, { role: 'player', nickname }),
    );
  }
  restore(role: ClientRole, code: string) {
    if (this.pending || (this.room && this.view.code === code)) return this.pending;
    const saved = readSession();
    if (
      !saved ||
      saved.code !== code ||
      saved.role !== role ||
      saved.endpoint !== serverWebSocketUrl()
    )
      return;
    return this.reconnect(saved);
  }
  retry() {
    const saved = this.saved ?? readSession();
    if (saved) return this.reconnect(saved);
  }
  private reconnect(saved: SavedSession) {
    return this.connect(
      saved,
      () => {
        const sdk = new Client(saved.endpoint);
        if (saved.token) return sdk.reconnect<WorldState>(saved.token);
        if (saved.role === 'host' && saved.hostToken)
          return sdk.joinById<WorldState>(saved.code, { role: 'host', hostToken: saved.hostToken });
        throw new Error('No reconnect token remains. Join a new game.');
      },
      true,
    );
  }
  private connect(saved: SavedSession, open: () => Promise<Room<WorldState>>, reconnect = false) {
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    this.saved = saved;
    this.update({
      ...initial,
      code: saved.code,
      role: saved.role,
      playerId: saved.playerId,
      phase: reconnect ? 'reconnecting' : 'connecting',
    });
    this.pending = (async () => {
      try {
        const room = await open();
        if (generation !== this.generation) {
          await room.leave();
          return;
        }
        this.bind(room);
      } catch (error) {
        if (generation === this.generation)
          this.update({ phase: 'closed', error: connectionError(error) });
        throw error;
      } finally {
        this.pending = undefined;
      }
    })();
    return this.pending;
  }
  private bind(room: Room<WorldState>) {
    this.room = room;
    this.rosterKey = '';
    this.world.clear();
    room.reconnection.minUptime = 0;
    room.reconnection.maxRetries = 35;
    room.reconnection.maxDelay = 2000;
    room.reconnection.maxEnqueuedMessages = 0;
    const persist = () => {
      if (!this.saved) return;
      this.saved = { ...this.saved, token: room.reconnectionToken, playerId: this.view.playerId };
      saveSession(this.saved);
    };
    const sync = () => {
      if (room !== this.room || !room.state?.players) return;
      if (room.state.mapId !== DEFAULT_MAP.id || room.state.mapVersion !== DEFAULT_MAP.version) {
        room.reconnection.enabled = false;
        this.room = undefined;
        this.world.clear();
        this.update({
          phase: 'closed',
          error:
            'This client and server have different map versions. Refresh after both have been updated.',
        });
        if (room.connection.isOpen) void room.leave();
        return;
      }
      this.world.push(room.state);
      const players: RosterPlayer[] = [];
      room.state.players.forEach((player) =>
        players.push({
          id: player.id,
          nickname: player.nickname,
          color: player.color,
          connected: player.connected,
        }),
      );
      const key = JSON.stringify([room.state.status, room.state.hostConnected, players]);
      if (key !== this.rosterKey) {
        this.rosterKey = key;
        this.update({
          status: room.state.status,
          hostConnected: room.state.hostConnected,
          players,
        });
      }
    };
    room.onStateChange(sync);
    room.onMessage('identity', (identity: { playerId: string }) => {
      if (room !== this.room) return;
      this.update({ playerId: identity.playerId });
      persist();
    });
    room.onMessage(MESSAGE.error, (error: GameError) => this.update({ error: error.message }));
    room.onDrop(() => {
      if (room === this.room) this.update({ phase: 'reconnecting' });
    });
    room.onReconnect(() => {
      if (room !== this.room) {
        void room.leave();
        return;
      }
      this.update({ phase: 'connected', error: undefined });
      this.world.clear();
      persist();
      sync();
      if (room === this.room) room.send('identify');
    });
    room.onError((_code, message) => {
      if (room === this.room) this.update({ error: message || 'Connection error.' });
    });
    room.onLeave(() => {
      if (room !== this.room) return;
      this.room = undefined;
      this.update({
        phase: 'closed',
        error:
          'Connection ended. Reconnect within 60 seconds of a drop, or ask the host for a new game.',
      });
    });
    persist();
    this.update({ phase: 'connected', error: undefined });
    sync();
    if (room === this.room) room.send('identify');
  }
  start() {
    if (this.connected) this.room?.send(MESSAGE.start);
  }
  async leave() {
    ++this.generation;
    const room = this.room;
    this.room = undefined;
    this.saved = undefined;
    clearSession();
    this.world.clear();
    this.view = initial;
    this.listeners.forEach((callback) => callback());
    if (room) {
      room.reconnection.enabled = false;
      room.reconnection.maxRetries = 0;
      // SDK leave() waits for a server reply; a closed socket can never provide one.
      // Navigation must also work offline. An already scheduled retry is retired in onReconnect.
      if (room.connection.isOpen) void room.leave();
      else room.connection.close();
    }
  }
}
export function connectionError(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Unable to connect. Check Wi-Fi and the game URL.';
  if (/locked|not found|seat reservation|expired/i.test(message))
    return 'The game has started, is full, or has expired. Ask the host for an available game.';
  return message;
}
export const connection = new GameConnection();
