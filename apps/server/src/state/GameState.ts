import { MapSchema, Schema, defineTypes } from '@colyseus/schema';
import type { PlayerState, SessionStatus } from '@escape/shared';

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

export class GameState extends Schema {
  status: SessionStatus = 'lobby';
  hostConnected = false;
  players = new MapSchema<Player>();
}
defineTypes(GameState, { status: 'string', hostConnected: 'boolean', players: { map: Player } });
