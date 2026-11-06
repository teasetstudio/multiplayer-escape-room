import { MapSchema, Schema, defineTypes, view } from '@colyseus/schema';
import {
  DEFAULT_MAP,
  type DoorState,
  type PlayerState,
  type RoomId,
  type TeamId,
  type TeamState,
  type SessionStatus,
} from '@escape/shared';

export class Player extends Schema implements PlayerState {
  id = '';
  nickname = '';
  color = '';
  x = 0;
  y = 0;
  connected = true;
  teamId?: TeamId;
}
defineTypes(Player, {
  id: 'string',
  nickname: 'string',
  color: 'string',
  x: 'float32',
  y: 'float32',
  connected: 'boolean',
  teamId: 'string',
});

export class Team extends Schema implements TeamState {
  declare id: TeamId;
  declare roomId: RoomId;
}
defineTypes(Team, { id: 'string', roomId: 'string' });

export class Door extends Schema {
  declare roomId: RoomId;
  id = '';
  state: DoorState = 'closed';
}
defineTypes(Door, { id: 'string', state: 'string', roomId: 'string' });

export class GameState extends Schema {
  mapId = DEFAULT_MAP.id;
  mapVersion = DEFAULT_MAP.version;
  status: SessionStatus = 'lobby';
  hostConnected = false;
  players = new MapSchema<Player>();
  teams = new MapSchema<Team>();
  doors = new MapSchema<Door>();
}
defineTypes(GameState, {
  mapId: 'string',
  mapVersion: 'string',
  status: 'string',
  hostConnected: 'boolean',
  players: { map: Player },
  teams: { map: Team },
  doors: { map: Door },
});
// Tag the collections themselves: membership, keys and every field of their children are private.
view()(GameState.prototype, 'players');
view()(GameState.prototype, 'teams');
view()(GameState.prototype, 'doors');
