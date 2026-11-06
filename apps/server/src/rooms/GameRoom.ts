import { randomUUID } from 'node:crypto';
import { StateView } from '@colyseus/schema';
import { Room, ServerError, type Client } from '@colyseus/core';
import {
  DEFAULT_MAP,
  MAX_PLAYERS,
  MESSAGE,
  PATCH_HZ,
  PLAYER_COLORS,
  RECONNECT_SECONDS,
  SIMULATION_HZ,
  TEAM_IDS,
  type ClientRole,
  type RoomId,
  type TeamId,
  type Point,
} from '@escape/shared';
import { Door, GameState, Player, Team } from '../state/GameState.js';
import {
  createCode,
  creationKey,
  nicknameKey,
  normalizeNickname,
  validToken,
} from '../systems/identity.js';
import { movePlayer, validateInput, type TimedInput } from '../systems/movement.js';
import { RateLimiter } from '../systems/RateLimiter.js';
import { CollisionWorld, selectSpawnPoints } from '../systems/CollisionWorld.js';

import { assignTeams, startingRoom } from '../systems/teams.js';
import { syncVisibility, type Audience } from '../systems/visibility.js';

interface Auth {
  role: ClientRole;
  nickname?: string;
}
export const sessions = new Map<string, GameRoom>();

export class GameRoom extends Room<{ state: GameState }> {
  private readonly collision = new CollisionWorld(
    DEFAULT_MAP,
    (id) => this.state.doors.get(id)?.state ?? 'closed',
  );
  private readonly roomsById = new Map(DEFAULT_MAP.rooms.map((room) => [room.id, room]));
  private readonly starts = new Map<TeamId, { roomId: RoomId; spawns: Point[] }>();
  private hostId = '';
  private hostDigest = '';
  private readonly playerIds = new Map<string, string>();
  private readonly inputs = new Map<string, TimedInput>();
  private readonly inputLimiter = new RateLimiter(40, 1000);
  private accumulator = 0;
  private lastActivity = Date.now();
  private hostMissingSince = Date.now();
  private closing = false;
  private createdAt = Date.now();

  override onCreate(options: Record<string, unknown>) {
    if (options.creationKey !== creationKey || typeof options.hostDigest !== 'string') {
      throw new ServerError(403, 'Create games from the host page.');
    }
    if (sessions.size >= 100) throw new ServerError(503, 'The server is full. Try again later.');
    let code = createCode();
    while (sessions.has(code)) code = createCode();
    this.roomId = code;
    this.hostDigest = options.hostDigest;
    this.maxClients = MAX_PLAYERS + 1; // The host owns a connection, never a character.
    this.autoDispose = false;
    this.setState(new GameState());
    for (const object of DEFAULT_MAP.objects) {
      if (object.kind !== 'door') continue;
      if (!object.roomId) throw new Error(`Door ${object.id} needs a logical room.`);
      const door = new Door();
      door.roomId = object.roomId;
      door.id = object.id;
      this.state.doors.set(door.id, door);
    }
    for (const teamId of TEAM_IDS) {
      const room = startingRoom(DEFAULT_MAP, teamId);
      const spawns = selectSpawnPoints(
        this.collision,
        Math.ceil(MAX_PLAYERS / TEAM_IDS.length),
        room.bounds,
      );
      this.starts.set(teamId, { roomId: room.id, spawns });
    }
    void this.setPrivate(true);
    sessions.set(code, this);
    this.setPatchRate(1000 / PATCH_HZ);
    this.setSimulationInterval((elapsed) => this.simulate(elapsed), 1000 / SIMULATION_HZ);
    this.clock.setInterval(() => this.cleanupInactive(), 1000);
    this.onMessage('identify', (client) => {
      const playerId = this.playerIds.get(client.sessionId);
      if (playerId) client.send('identity', { playerId });
    });
    this.onMessage(MESSAGE.input, (client, raw: unknown) => {
      if (this.state.status !== 'playing' || !this.inputLimiter.allow(client.sessionId)) return;
      const id = this.playerIds.get(client.sessionId);
      const input = validateInput(raw);
      if (!id || !input || !this.state.players.get(id)?.connected) return;
      const previous = this.inputs.get(id);
      if (previous && input.seq <= previous.seq) return;
      this.inputs.set(id, { ...input, receivedAt: Date.now() });
      if (input.x || input.y) this.lastActivity = Date.now();
    });
    this.onMessage(MESSAGE.start, (client) => {
      if (client.sessionId !== this.hostId) {
        client.send(MESSAGE.error, { message: 'Only the host can start the game.' });
        return;
      }
      if (this.state.status !== 'lobby') return;
      if (![...this.state.players.values()].some((player) => player.connected)) {
        client.send(MESSAGE.error, { message: 'Wait for at least one player to join.' });
        return;
      }
      const assignments = assignTeams(this.state.players.values());
      for (const [teamId, start] of this.starts) {
        this.state.teams.set(teamId, new Team().assign({ id: teamId, roomId: start.roomId }));
        let seat = 0;
        for (const [id, assigned] of assignments) {
          if (assigned !== teamId) continue;
          const player = this.state.players.get(id)!;
          player.teamId = teamId;
          Object.assign(player, start.spawns[seat++]!);
        }
      }
      // One synchronous transition. Narrow every view before the next network patch.
      this.state.status = 'playing';
      for (const viewer of this.clients) this.refreshView(viewer);
      this.lastActivity = Date.now();
      void this.lock();
    });
  }

  override onAuth(_client: Client, options: Record<string, unknown>): Auth {
    if (options.role === 'host') {
      if (this.hostId || !validToken(options.hostToken, this.hostDigest)) {
        throw new ServerError(403, 'Host access is invalid. Reconnect from the original host tab.');
      }
      return { role: 'host' };
    }
    if (options.role !== 'player') throw new ServerError(400, 'Invalid connection role.');
    if (this.state.status !== 'lobby') throw new ServerError(409, 'This game has already started.');
    if (this.state.players.size >= MAX_PLAYERS) throw new ServerError(409, 'This game is full.');
    let nickname: string;
    try {
      nickname = normalizeNickname(options.nickname);
    } catch (error) {
      throw new ServerError(400, error instanceof Error ? error.message : 'Invalid nickname.');
    }
    this.assertNicknameAvailable(nickname);
    return { role: 'player', nickname };
  }

  override onJoin(client: Client, _options: unknown, auth: Auth) {
    this.lastActivity = Date.now();
    if (auth.role === 'host') {
      if (this.hostId) throw new ServerError(409, 'A host is already connected.');
      this.hostId = client.sessionId;
      this.state.hostConnected = true;
      this.hostMissingSince = 0;
      this.refreshView(client);
      return;
    }
    // Recheck at commit time: concurrent seat reservations must not bypass admission rules.
    if (this.state.status !== 'lobby' || this.state.players.size >= MAX_PLAYERS || !auth.nickname) {
      throw new ServerError(409, 'This game is no longer accepting players.');
    }
    this.assertNicknameAvailable(auth.nickname);
    const usedColors = new Set([...this.state.players.values()].map((player) => player.color));
    const player = new Player();
    player.id = randomUUID();
    player.nickname = auth.nickname;
    player.color = PLAYER_COLORS.find((color) => !usedColors.has(color)) ?? PLAYER_COLORS[0];
    // Lobby entries carry identity only; gameplay positions are assigned on start.
    this.playerIds.set(client.sessionId, player.id);
    this.state.players.set(player.id, player);
    for (const viewer of this.clients) this.refreshView(viewer);
  }

  override onDrop(client: Client) {
    const id = this.playerIds.get(client.sessionId);
    if (id) {
      const player = this.state.players.get(id);
      if (player) player.connected = false;
      this.inputs.delete(id);
    }
    if (client.sessionId === this.hostId) {
      this.state.hostConnected = false;
      this.hostMissingSince = Date.now();
    }
    // Return immediately. The framework invokes onReconnect or onLeave when the lease resolves.
    void this.allowReconnection(client, RECONNECT_SECONDS).catch(() => undefined);
  }

  override onReconnect(client: Client) {
    this.lastActivity = Date.now();
    if (client.sessionId === this.hostId) {
      this.state.hostConnected = true;
      this.hostMissingSince = 0;
    }
    const id = this.playerIds.get(client.sessionId);
    const player = id ? this.state.players.get(id) : undefined;
    if (player) {
      player.connected = true;
    }
    // A reserved player may have missed the whole start transition while offline.
    client.view = new StateView();
    this.refreshView(client);
  }

  override onLeave(client: Client) {
    const id = this.playerIds.get(client.sessionId);
    if (id) {
      this.state.players.delete(id);
      this.inputs.delete(id);
    }
    this.playerIds.delete(client.sessionId);
    this.inputLimiter.delete(client.sessionId);
    if (client.sessionId === this.hostId) this.closeRoom();
  }

  override onDispose() {
    sessions.delete(this.roomId);
  }

  private refreshView(client: Client) {
    const id = this.playerIds.get(client.sessionId);
    let audience: Audience;
    if (client.sessionId === this.hostId) audience = 'host';
    else if (id)
      audience = this.state.status === 'lobby' ? 'lobby' : this.state.players.get(id)?.teamId;
    syncVisibility((client.view ??= new StateView()), this.state, audience);
  }

  private assertNicknameAvailable(nickname: string) {
    if (
      [...this.state.players.values()].some(
        (player) => nicknameKey(player.nickname) === nicknameKey(nickname),
      )
    ) {
      throw new ServerError(409, 'That nickname is already taken. Choose another.');
    }
  }
  private simulate(elapsed: number) {
    if (this.state.status !== 'playing') return;
    const step = 1000 / SIMULATION_HZ;
    this.accumulator += Math.min(elapsed, 250);
    while (this.accumulator >= step) {
      const now = Date.now();
      for (const [id, player] of this.state.players) {
        const team = player.teamId && this.state.teams.get(player.teamId);
        const room = team && this.roomsById.get(team.roomId);
        if (room)
          movePlayer(player, this.inputs.get(id), step / 1000, now, this.collision, room.bounds);
      }
      this.accumulator -= step;
    }
  }
  private cleanupInactive() {
    const now = Date.now();
    if (
      (this.hostMissingSince && now - this.hostMissingSince > (RECONNECT_SECONDS + 5) * 1000) ||
      now - this.lastActivity > 30 * 60_000 ||
      now - this.createdAt > 4 * 60 * 60_000
    )
      this.closeRoom();
  }
  private closeRoom() {
    if (this.closing) return;
    this.closing = true;
    void this.disconnect().catch((error: unknown) => console.error('Room cleanup failed', error));
  }
}
