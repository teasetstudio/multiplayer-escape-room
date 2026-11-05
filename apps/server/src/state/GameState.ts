import { MapSchema, Schema, defineTypes } from '@colyseus/schema';
import { DEFAULT_MAP, type DoorState, type PlayerState, type SessionStatus } from '@escape/shared';

export class Player extends Schema implements PlayerState {
  id = '';
  nickname = '';
  color = '';
  x = 0;
  y = 0;
  connected = true;
}
defineTypes(Player, {
  id: 'string',
  nickname: 'string',
  color: 'string',
  x: 'float32',
  y: 'float32',
  connected: 'boolean',
});

export class Door extends Schema {
  id = '';
  state: DoorState = 'closed';
}
defineTypes(Door, { id: 'string', state: 'string' });

export class GameState extends Schema {
  mapId = DEFAULT_MAP.id;
  mapVersion = DEFAULT_MAP.version;
  status: SessionStatus = 'lobby';
  hostConnected = false;
  players = new MapSchema<Player>();
  doors = new MapSchema<Door>();
}
defineTypes(GameState, {
  mapId: 'string',
  mapVersion: 'string',
  status: 'string',
  hostConnected: 'boolean',
  players: { map: Player },
  doors: { map: Door },
});
