import Phaser from 'phaser';
import { TEAM_STYLE, worldToScreen, type PlayerState, type Point } from '@escape/shared';

function createCloakTexture(scene: Phaser.Scene, color: number) {
  const key = `explorer-cloak-${color}`;
  if (scene.textures.exists(key)) return key;
  const graphics = scene.add.graphics();
  graphics.fillStyle(color).fillPoints(
    [
      { x: 10, y: 1 },
      { x: 22, y: 1 },
      { x: 29, y: 29 },
      { x: 16, y: 32 },
      { x: 3, y: 29 },
    ],
    true,
  );
  graphics.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(24).color).fillPoints(
    [
      { x: 16, y: 7 },
      { x: 22, y: 3 },
      { x: 29, y: 29 },
      { x: 16, y: 32 },
    ],
    true,
  );
  graphics.lineStyle(2, 0x5e746e).lineBetween(5, 25, 27, 25);
  // Bake color into the tiny reusable texture: CanvasRenderer does not support image tint.
  graphics.generateTexture(key, 32, 34);
  graphics.destroy();
  return key;
}

export class PlayerEntity extends Phaser.GameObjects.Container {
  private readonly displayName: string;
  private readonly label: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Ellipse;
  private readonly torso: Phaser.GameObjects.Container;
  private readonly face: Phaser.GameObjects.Container;
  private readonly boots: Phaser.GameObjects.Ellipse[];
  private logical: Point;
  private facing = Math.PI / 2;
  private stride = 0;
  private idleTime = 0;
  constructor(scene: Phaser.Scene, player: PlayerState, overview: boolean) {
    const point = worldToScreen(player);
    super(scene, point.x, point.y);
    this.displayName =
      overview && player.teamId ? `${player.teamId} · ${player.nickname}` : player.nickname;
    this.logical = { x: player.x, y: player.y };
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const texture = createCloakTexture(scene, color);
    const shadow = scene.add.ellipse(0, 0, 28, 13, 0x071817, 0.45);
    this.ring = scene.add.ellipse(0, 0, 37, 18).setStrokeStyle(2, 0xd6f4ba, 0.9).setVisible(false);
    this.boots = [-5, 5].map((x) => scene.add.ellipse(x, -3, 8, 7, 0x1e3031));
    const cloak = scene.add.image(0, -4, texture).setOrigin(0.5, 1);
    const hood = scene.add.ellipse(0, -39, 23, 23, color).setStrokeStyle(1, 0xf4f5d8, 0.3);
    const face = scene.add.ellipse(0, 0, 13, 13, 0xdac9ae);
    const eyes = [-3, 3].map((x) => scene.add.rectangle(x, -1, 2, 3, 0x233434));
    this.face = scene.add.container(0, -37, [face, ...eyes]);
    this.torso = scene.add.container(0, 0, [cloak, hood, this.face]);
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
    this.add([shadow, this.ring, ...this.boots, this.torso]);
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
      this.facing = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4;
      this.stride += Math.min(delta, 80) / 75;
    } else this.stride = 0;
    this.idleTime += Math.min(delta, 80);
    const bob = moving
      ? Math.abs(Math.sin(this.stride)) * 1.8
      : Math.sin(this.idleTime / 700) * 0.5;
    this.torso.y = -bob;
    this.boots.forEach((boot, index) => {
      boot.y = -3 + (moving ? Math.sin(this.stride + index * Math.PI) * 2.5 : 0);
    });
    const lookX = Math.cos(this.facing);
    const lookY = Math.sin(this.facing);
    this.face.setPosition(lookX * 4, -38 + lookY * 3).setVisible(lookY > -0.5);
    this.setPosition(next.x, next.y)
      .setDepth(next.y)
      .setAlpha(player.connected ? 1 : 0.4);
    this.ring.setVisible(local);
    const labelScale = Math.min(1.5, Math.max(1, 0.8 / zoom));
    this.label
      .setPosition(next.x, next.y - 61)
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
