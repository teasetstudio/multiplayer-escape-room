import { INPUT_HZ, MESSAGE } from '@escape/shared';
import type { GameConnection } from '../network/GameConnection';

export class InputSender {
  private seq = 0;
  private lastSent = 0;
  private lastX = 0;
  private lastY = 0;
  constructor(private readonly network: GameConnection) {}
  send(x: number, y: number, now: number, force = false) {
    if (!this.network.connected) return;
    const changed = x !== this.lastX || y !== this.lastY;
    const moving = x !== 0 || y !== 0;
    if (!force && ((!changed && !moving) || now - this.lastSent < 1000 / INPUT_HZ)) return;
    this.network.room?.send(MESSAGE.input, { x, y, seq: ++this.seq });
    this.lastX = x;
    this.lastY = y;
    this.lastSent = now;
  }
  stop = () => this.send(0, 0, performance.now(), true);
}
