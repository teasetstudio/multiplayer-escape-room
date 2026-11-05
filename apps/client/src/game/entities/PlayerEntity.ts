import Phaser from 'phaser';
import { WORLD, type PlayerState } from '@escape/shared';

export class PlayerEntity extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Arc;
  constructor(scene: Phaser.Scene, player: PlayerState) {
    super(scene, player.x, player.y);
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const shadow = scene.add.ellipse(0, 6, 44, 34, 0x000000, 0.2);
    this.ring = scene.add
      .circle(0, 0, WORLD.playerRadius + 7)
      .setStrokeStyle(2, 0xffffff, 0.8)
      .setVisible(false);
    const circle = scene.add
      .circle(0, 0, WORLD.playerRadius, color)
      .setStrokeStyle(2, 0xffffff, 0.25);
    const dot = scene.add.circle(-5, -5, 4, 0xffffff, 0.4);
    this.label = scene.add
      .text(0, -42, player.nickname, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#f2f5ec',
        backgroundColor: '#14211c',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0.5);
    this.add([shadow, this.ring, circle, dot, this.label]);
    scene.add.existing(this);
  }
  sync(player: PlayerState, local: boolean, delta: number) {
    const smoothing = local ? 1 - Math.exp(-delta / 35) : 1;
    this.x += (player.x - this.x) * smoothing;
    this.y += (player.y - this.y) * smoothing;
    this.setDepth(this.y + 100);
    this.setAlpha(player.connected ? 1 : 0.35);
    this.ring.setVisible(local);
    this.label.setText(player.nickname + (local ? ' · you' : ''));
  }
}
