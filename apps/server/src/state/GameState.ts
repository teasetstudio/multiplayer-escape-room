import { ArraySchema, Encoder, MapSchema, Schema, defineTypes, view } from '@colyseus/schema';
import {
  DEFAULT_MAP,
  type CardState,
  type DoorState,
  type ExplorerState,
  type PickupState,
  type PlayerState,
  type RoomId,
  type TeamId,
  type TeamPuzzleState,
  type TeamState,
  type SessionStatus,
} from '@escape/shared';

// The final stage carries 27 verse texts plus the revealed chapter in one snapshot.
Encoder.BUFFER_SIZE = 96 * 1024;

export class Player extends Schema implements PlayerState {
  id = '';
  nickname = '';
  color = '';
  x = 0;
  y = 0;
  connected = true;
  teamId?: TeamId;
  character = '';
  /** Inside a hidden chamber. x/y then stay at the last PUBLIC position. */
  exploring = false;
  verses = 0;
  artifacts = '';
}
defineTypes(Player, {
  id: 'string',
  nickname: 'string',
  color: 'string',
  x: 'float32',
  y: 'float32',
  connected: 'boolean',
  teamId: 'string',
  character: 'string',
  exploring: 'boolean',
  verses: 'uint8',
  artifacts: 'string',
});

/** Live position inside a hidden chamber. Only players in the same chamber ever receive it. */
export class Explorer extends Schema implements ExplorerState {
  id = '';
  area = '';
  x = 0;
  y = 0;
}
defineTypes(Explorer, { id: 'string', area: 'string', x: 'float32', y: 'float32' });

export class Team extends Schema implements TeamState {
  declare id: TeamId;
  declare roomId: RoomId;
}
defineTypes(Team, { id: 'string', roomId: 'string' });

/** Team-private puzzle information (JSON `PuzzleView`). Never granted to the other team or host. */
export class TeamPuzzle extends Schema implements TeamPuzzleState {
  declare id: TeamId;
  view = '';
}
defineTypes(TeamPuzzle, { id: 'string', view: 'string' });

export class Door extends Schema {
  declare roomId: RoomId;
  id = '';
  state: DoorState = 'closed';
}
defineTypes(Door, { id: 'string', state: 'string', roomId: 'string' });

/** A loose artifact lying in a PUBLIC room. Granted to that room's team only, not the host. */
export class Pickup extends Schema implements PickupState {
  declare roomId: RoomId;
  id = '';
  art = '';
  x = 0;
  y = 0;
}
defineTypes(Pickup, { id: 'string', roomId: 'string', art: 'string', x: 'float32', y: 'float32' });

/** A collected Scripture card: opaque ID and text, deliberately without any verse number. */
export class Card extends Schema implements CardState {
  id = '';
  text = '';
  finder = '';
}
defineTypes(Card, { id: 'string', text: 'string', finder: 'string' });

export class GameState extends Schema {
  mapId = DEFAULT_MAP.id;
  mapVersion = DEFAULT_MAP.version;
  status: SessionStatus = 'lobby';
  hostConnected = false;
  level = 1;
  puzzleSolved = false;
  exitsUnlocked = false;
  transition = false;
  versesFound = 0;
  versesA = 0;
  versesB = 0;
  requiredA = 0;
  requiredB = 0;
  exitA = false;
  exitB = false;
  artifactsFound = 0;
  boardSlots = new ArraySchema<string>();
  boardTray = new ArraySchema<string>();
  boardRevision = 0;
  boardAttempts = 0;
  boardCorrect = -1;
  /** JSON `ChapterReveal`; empty until the game is won. */
  chapter = '';
  /** JSON `PacingStats` for playtest timing. */
  stats = '';
  /** Translation credit and licence; public, shown next to every verse text. */
  credit = '';
  players = new MapSchema<Player>();
  teams = new MapSchema<Team>();
  doors = new MapSchema<Door>();
  explorers = new MapSchema<Explorer>();
  pickups = new MapSchema<Pickup>();
  cards = new MapSchema<Card>();
  puzzles = new MapSchema<TeamPuzzle>();
}
defineTypes(GameState, {
  mapId: 'string',
  mapVersion: 'string',
  status: 'string',
  hostConnected: 'boolean',
  level: 'uint8',
  puzzleSolved: 'boolean',
  exitsUnlocked: 'boolean',
  transition: 'boolean',
  versesFound: 'uint8',
  versesA: 'uint8',
  versesB: 'uint8',
  requiredA: 'uint8',
  requiredB: 'uint8',
  exitA: 'boolean',
  exitB: 'boolean',
  artifactsFound: 'uint8',
  boardSlots: ['string'],
  boardTray: ['string'],
  boardRevision: 'uint32',
  boardAttempts: 'uint16',
  boardCorrect: 'int8',
  chapter: 'string',
  stats: 'string',
  credit: 'string',
  players: { map: Player },
  teams: { map: Team },
  doors: { map: Door },
  explorers: { map: Explorer },
  pickups: { map: Pickup },
  cards: { map: Card },
  puzzles: { map: TeamPuzzle },
});
// Tag the collections themselves: membership, keys and every field of their children are private.
for (const field of ['players', 'teams', 'doors', 'explorers', 'pickups', 'cards', 'puzzles'])
  view()(GameState.prototype, field);
