import Phaser from 'phaser';
import { TEAM_STYLE, worldToScreen, type PlayerState, type Point } from '@escape/shared';
import { DIRECTIONS, characterKey } from '../world/assets';

// atan2 octants (E, SE, S, SW, W, NW, N, NE) → sheet rows (S, SE, E, NE, N, NW, W, SW).
const OCTANT_ROW = [2, 1, 0, 7, 6, 5, 4, 3];

/** An Adventure Comic explorer: directional walk cycle, team cloth, nickname and local ring. */
export class PlayerEntity extends Phaser.GameObjects.Container {
  private readonly displayName: string;
  private readonly label: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Ellipse;
  private readonly figure: Phaser.GameObjects.Sprite;
  private readonly texture: string;
  private logical: Point;
  private row = 0;
  private walking = false;
  constructor(scene: Phaser.Scene, player: PlayerState, overview: boolean) {
    const point = worldToScreen(player);
    super(scene, point.x, point.y);
    this.displayName =
      overview && player.teamId ? `${player.teamId} · ${player.nickname}` : player.nickname;
    this.logical = { x: player.x, y: player.y };
    this.texture = characterKey(player.character, player.teamId);
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const shadow = scene.add.ellipse(0, 0, 28, 13, 0x071817, 0.45);
    this.ring = scene.add.ellipse(0, 0, 37, 18).setStrokeStyle(2, 0xf3e3a6, 0.95).setVisible(false);
    // The personal colour stays visible as a small marker under the shared character designs.
    const marker = scene.add.ellipse(0, 0, 16, 8, color, 0.9);
    this.figure = scene.add.sprite(0, 0, this.texture, 0).setOrigin(0.5, 0.9375).setScale(0.5);
    this.label = scene.add
      .text(point.x, point.y - 65, this.displayName, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: overview && player.teamId ? TEAM_STYLE[player.teamId].color : '#eef2e4',
        backgroundColor: '#152825',
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(20_000)
      .setResolution(Math.min(2, window.devicePixelRatio || 1));
    this.add([shadow, this.ring, marker, this.figure]);
    scene.add.existing(this);
  }
  sync(player: PlayerState, local: boolean, delta: number, zoom: number) {
    const smoothing = local ? 1 - Math.exp(-delta / 35) : 1;
    this.logical.x += (player.x - this.logical.x) * smoothing;
    this.logical.y += (player.y - this.logical.y) * smoothing;
    const next = worldToScreen(this.logical);
    const dx = next.x - this.x;
    const dy = next.y - this.y;
    const moving = player.connected && Math.hypot(dx, dy) > 0.025;
    if (moving) {
      const octant = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      const row = OCTANT_ROW[octant]!;
      if (row !== this.row || !this.walking) {
        this.row = row;
        this.figure.play(`${this.texture}-walk-${DIRECTIONS[row]}`, true);
      }
    } else if (this.walking) {
      this.figure.stop();
      this.figure.setFrame(this.row * 5);
    }
    this.walking = moving;
    this.setPosition(next.x, next.y)
      .setDepth(next.y)
      .setAlpha(player.connected ? 1 : 0.4);
    this.ring.setVisible(local);
    const labelScale = Math.min(1.5, Math.max(1, 0.8 / zoom));
    this.label
      .setPosition(next.x, next.y - 68)
      .setScale(labelScale)
      .setAlpha(player.connected ? 1 : 0.4);
    const name = this.displayName + (local ? ' · you' : '');
    if (this.label.text !== name) this.label.setText(name);
  }
  override destroy(fromScene?: boolean) {
    this.label.destroy();
    super.destroy(fromScene);
  }
}
