import Phaser from 'phaser';
import { VirtualJoystick } from '../controls/VirtualJoystick';
import { InputSender } from '../controls/InputSender';
import type { GameConnection } from '../network/GameConnection';

export class ControlsScene extends Phaser.Scene {
  private joystick?: VirtualJoystick;
  private sender: InputSender;
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private unsubscribe?: () => void;
  constructor(private readonly network: GameConnection) {
    super({ key: 'controls', active: true });
    this.sender = new InputSender(network);
  }
  create() {
    this.joystick = new VirtualJoystick(this);
    this.keys = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D') as typeof this.wasd;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize);
    window.addEventListener('blur', this.stop);
    document.addEventListener('visibilitychange', this.stop);
    this.game.canvas.addEventListener('touchcancel', this.stop);
    this.unsubscribe = this.network.subscribe(() => {
      if (!this.network.connected) this.stop();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stop();
      this.unsubscribe?.();
      this.joystick?.destroy();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resize);
      window.removeEventListener('blur', this.stop);
      document.removeEventListener('visibilitychange', this.stop);
      this.game.canvas.removeEventListener('touchcancel', this.stop);
    });
  }
  private resize = () => {
    this.stop();
    this.joystick?.resize();
  };
  private stop = () => {
    this.joystick?.reset();
    this.input.keyboard?.resetKeys();
    this.sender.stop();
  };
  override update() {
    if (document.hidden || window.innerHeight > window.innerWidth || !this.network.connected)
      return;
    let x = this.joystick?.x ?? 0;
    let y = this.joystick?.y ?? 0;
    const keyboardX =
      Number(this.keys?.right.isDown || this.wasd?.D.isDown) -
      Number(this.keys?.left.isDown || this.wasd?.A.isDown);
    const keyboardY =
      Number(this.keys?.down.isDown || this.wasd?.S.isDown) -
      Number(this.keys?.up.isDown || this.wasd?.W.isDown);
    if (keyboardX || keyboardY) {
      const length = Math.max(1, Math.hypot(keyboardX, keyboardY));
      x = keyboardX / length;
      y = keyboardY / length;
    }
    this.sender.send(x, y, performance.now());
  }
}
