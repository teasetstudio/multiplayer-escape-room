import { INTERPOLATION_MS, type PlayerState, type WorldState } from '@escape/shared';

export interface Frame {
  time: number;
  players: Map<string, PlayerState>;
}
export class WorldBuffer {
  private frames: Frame[] = [];
  push(state: WorldState) {
    const players = new Map<string, PlayerState>();
    state.players?.forEach((player, id) =>
      players.set(id, {
        id,
        nickname: player.nickname,
        color: player.color,
        x: player.x,
        y: player.y,
        connected: player.connected,
      }),
    );
    this.frames.push({ time: performance.now(), players });
    if (this.frames.length > 30) this.frames.shift();
  }
  clear() {
    this.frames = [];
  }
  sample(now: number, localId: string | undefined): PlayerState[] {
    const latest = this.frames.at(-1);
    if (!latest) return [];
    const time = now - INTERPOLATION_MS;
    let before = this.frames[0] ?? latest;
    let after = latest;
    for (const frame of this.frames) {
      if (frame.time <= time) before = frame;
      if (frame.time >= time) {
        after = frame;
        break;
      }
    }
    const t = Math.max(
      0,
      Math.min(1, (time - before.time) / Math.max(1, after.time - before.time)),
    );
    return [...latest.players.values()].map((player) => {
      // Local movement uses the newest server position; render smoothing is applied by the entity.
      if (player.id === localId) return player;
      const a = before.players.get(player.id) ?? player;
      const b = after.players.get(player.id) ?? player;
      return { ...player, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    });
  }
}
