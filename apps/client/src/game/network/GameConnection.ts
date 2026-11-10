import { Client, type Room } from '@colyseus/sdk';
import {
  LEVELS,
  MESSAGE,
  type AreaMessage,
  type BoardOp,
  type CardState,
  type ChapterReveal,
  type ClientRole,
  type CreateSessionResponse,
  type GameError,
  type NoticeMessage,
  type PacingStats,
  type PanelMessage,
  type PlayerState,
  type PromptMessage,
  type PuzzleView,
  type SessionStatus,
  type WorldState,
  type TeamState,
} from '@escape/shared';
import { api, serverWebSocketUrl } from './config';
import { WorldBuffer } from './WorldBuffer';
import { clearSession, readSession, saveSession, type SavedSession } from './sessionStorage';

export type RosterPlayer = Pick<
  PlayerState,
  'id' | 'nickname' | 'color' | 'connected' | 'teamId' | 'exploring' | 'verses' | 'artifacts'
>;
export interface Notice extends NoticeMessage {
  id: number;
}
/** Public progress of both quests, identical on phones and the host monitor. */
export interface QuestView {
  level: number;
  puzzleSolved: boolean;
  exitsUnlocked: boolean;
  transition: boolean;
  versesFound: number;
  versesA: number;
  versesB: number;
  requiredA: number;
  requiredB: number;
  exitA: boolean;
  exitB: boolean;
  artifactsFound: number;
}
export interface BoardView {
  slots: string[];
  tray: string[];
  revision: number;
  attempts: number;
  correct: number;
}
export interface ConnectionView {
  phase: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';
  code: string;
  role: ClientRole;
  status: SessionStatus;
  players: RosterPlayer[];
  teams: TeamState[];
  hostConnected: boolean;
  playerId?: string;
  error?: string;
  quest: QuestView;
  /** Collected Scripture cards this client is authorized to read (text only, no numbers). */
  cards: CardState[];
  /** This team's private half of the current puzzle. */
  puzzle?: PuzzleView;
  board: BoardView;
  chapter?: ChapterReveal;
  stats?: PacingStats;
  prompt: PromptMessage;
  panel?: PanelMessage;
  /** Geometry of the hidden chamber this player is standing in, if any. */
  area?: AreaMessage['area'];
  discoveries: string[];
  notices: Notice[];
}
const noQuest: QuestView = {
  level: 1,
  puzzleSolved: false,
  exitsUnlocked: false,
  transition: false,
  versesFound: 0,
  versesA: 0,
  versesB: 0,
  requiredA: 0,
  requiredB: 0,
  exitA: false,
  exitB: false,
  artifactsFound: 0,
};
const initial: ConnectionView = {
  phase: 'idle',
  code: '',
  role: 'player',
  status: 'lobby',
  players: [],
  teams: [],
  hostConnected: false,
  quest: noQuest,
  cards: [],
  board: { slots: [], tray: [], revision: 0, attempts: 0, correct: -1 },
  prompt: {},
  discoveries: [],
  notices: [],
};
function parse<T>(json: string | undefined): T | undefined {
  if (!json) return;
  try {
    return JSON.parse(json) as T;
  } catch {
    return;
  }
}

export class GameConnection {
  room?: Room<WorldState>;
  readonly world = new WorldBuffer();
  private view: ConnectionView = initial;
  private listeners = new Set<() => void>();
  private pending?: Promise<void>;
  private saved?: SavedSession;
  private generation = 0;
  private rosterKey = '';
  private noticeId = 0;
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
      if (room !== this.room || !room.state?.mapId) return;
      const state = room.state;
      const level = LEVELS[(state.level || 1) - 1];
      if (!level || state.mapId !== level.map.id || state.mapVersion !== level.map.version) {
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
      const players: RosterPlayer[] = [];
      state.players?.forEach((player) =>
        players.push({
          id: player.id,
          nickname: player.nickname,
          color: player.color,
          connected: player.connected,
          teamId: player.teamId,
          exploring: player.exploring,
          verses: player.verses,
          artifacts: player.artifacts,
        }),
      );
      if (state.status === 'playing') {
        // Inside a hidden chamber the world is the chamber: only its explorers are drawn.
        // Everywhere else, explorers are absent — their public x/y is just a last-known spot.
        const visible: PlayerState[] = [];
        const inside = this.view.area?.key;
        if (inside)
          state.explorers?.forEach((explorer) => {
            const player = state.players.get(explorer.id);
            if (player && explorer.area === inside)
              visible.push({ ...snapshot(player), x: explorer.x, y: explorer.y });
          });
        else
          state.players?.forEach((player) => {
            if (!player.exploring) visible.push(snapshot(player));
          });
        this.world.push(visible);
      }
      const teams = Array.from(state.teams?.values() ?? [], ({ id, roomId }) => ({ id, roomId }));
      const quest: QuestView = {
        level: state.level,
        puzzleSolved: state.puzzleSolved,
        exitsUnlocked: state.exitsUnlocked,
        transition: state.transition,
        versesFound: state.versesFound,
        versesA: state.versesA,
        versesB: state.versesB,
        requiredA: state.requiredA,
        requiredB: state.requiredB,
        exitA: state.exitA,
        exitB: state.exitB,
        artifactsFound: state.artifactsFound,
      };
      const me = players.find((player) => player.id === this.view.playerId);
      const puzzleRaw = (me?.teamId && state.puzzles?.get(me.teamId)?.view) || '';
      const key = JSON.stringify([
        state.status,
        state.hostConnected,
        players,
        teams,
        quest,
        state.cards?.size ?? 0,
        state.boardRevision,
        state.boardSlots?.length ?? 0,
        state.boardTray?.length ?? 0,
        puzzleRaw,
        state.chapter?.length ?? 0,
        state.stats,
      ]);
      if (key !== this.rosterKey) {
        this.rosterKey = key;
        this.update({
          status: state.status,
          hostConnected: state.hostConnected,
          players,
          teams,
          quest,
          cards: Array.from(state.cards?.values() ?? [], ({ id, text, finder }) => ({
            id,
            text,
            finder,
          })),
          puzzle: parse<PuzzleView>(puzzleRaw),
          board: {
            slots: [...(state.boardSlots ?? [])],
            tray: [...(state.boardTray ?? [])],
            revision: state.boardRevision,
            attempts: state.boardAttempts,
            correct: state.boardCorrect,
          },
          chapter: parse<ChapterReveal>(state.chapter),
          stats: parse<PacingStats>(state.stats),
        });
      }
    };
    room.onStateChange(sync);
    room.onMessage(MESSAGE.identity, (identity: { playerId?: string }) => {
      if (room !== this.room) return;
      this.update({ playerId: identity.playerId });
      persist();
      this.rosterKey = '';
      sync();
    });
    const mine =
      <T>(handler: (message: T) => void) =>
      (message: T) => {
        if (room === this.room) handler(message);
      };
    room.onMessage(
      MESSAGE.prompt,
      mine((prompt: PromptMessage) => this.update({ prompt })),
    );
    room.onMessage(
      MESSAGE.panel,
      mine((panel: PanelMessage) =>
        this.update({ panel: panel.type === 'none' ? undefined : panel }),
      ),
    );
    room.onMessage(
      MESSAGE.area,
      mine((message: AreaMessage) => {
        // Entering or leaving a chamber is a hard cut: forget interpolation history.
        if (message.area?.key !== this.view.area?.key) this.world.clear();
        this.update({ area: message.area, prompt: {} });
        sync();
      }),
    );
    room.onMessage(
      MESSAGE.discoveries,
      mine((message: { ids: string[] }) => this.update({ discoveries: message.ids })),
    );
    room.onMessage(
      MESSAGE.notice,
      mine((notice: NoticeMessage) => {
        const entry = { ...notice, id: ++this.noticeId };
        this.update({ notices: [...this.view.notices.slice(-2), entry] });
        setTimeout(() => {
          if (this.view.notices.includes(entry))
            this.update({ notices: this.view.notices.filter((other) => other !== entry) });
        }, 5000);
      }),
    );
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
      if (room === this.room) room.send(MESSAGE.identify);
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
    if (room === this.room) room.send(MESSAGE.identify);
  }
  start() {
    if (this.connected) this.room?.send(MESSAGE.start);
  }
  /** Use whatever the server currently offers this player. The server re-validates reach. */
  interact() {
    const id = this.view.prompt.id;
    if (this.connected && id) this.room?.send(MESSAGE.interact, { id });
  }
  collect(id: string) {
    if (this.connected) this.room?.send(MESSAGE.collect, { id });
  }
  puzzleAction(id: string, action: Record<string, unknown>) {
    if (this.connected) this.room?.send(MESSAGE.puzzle, { ...action, id });
  }
  board(op: BoardOp) {
    if (this.connected) this.room?.send(MESSAGE.board, op);
  }
  closePanel() {
    this.update({ panel: undefined });
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
function snapshot(player: PlayerState): PlayerState {
  return {
    id: player.id,
    nickname: player.nickname,
    color: player.color,
    teamId: player.teamId,
    character: player.character,
    x: player.x,
    y: player.y,
    connected: player.connected,
  };
}
export function connectionError(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Unable to connect. Check Wi-Fi and the game URL.';
  if (/locked|not found|seat reservation|expired/i.test(message))
    return 'The game has started, is full, or has expired. Ask the host for an available game.';
  return message;
}
export const connection = new GameConnection();
