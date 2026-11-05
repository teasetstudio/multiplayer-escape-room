import Phaser from 'phaser';

export class VirtualJoystick {
  x = 0;
  y = 0;
  private pointerId?: number;
  private center = { x: 100, y: 100 };
  private readonly graphics: Phaser.GameObjects.Graphics;
  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    scene.input.on('pointerdown', this.down);
    scene.input.on('pointermove', this.move);
    scene.input.on('pointerup', this.up);
    scene.input.on('pointerupoutside', this.up);
    scene.input.on('gameout', this.reset);
    this.resize();
  }
  resize = () => {
    this.center = { x: 96, y: this.scene.scale.height - 90 };
    this.reset();
  };
  private down = (pointer: Phaser.Input.Pointer) => {
    if (
      this.pointerId !== undefined ||
      Phaser.Math.Distance.Between(pointer.x, pointer.y, this.center.x, this.center.y) > 100
    )
      return;
    this.pointerId = pointer.id;
    this.move(pointer);
  };
  private move = (pointer: Phaser.Input.Pointer) => {
    if (this.pointerId !== pointer.id) return;
    const dx = pointer.x - this.center.x;
    const dy = pointer.y - this.center.y;
    const strength = Math.min(1, Math.hypot(dx, dy) / 56);
    if (strength < 0.18) {
      this.x = 0;
      this.y = 0;
    } else {
      const angle = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4;
      this.x = Math.cos(angle) * strength;
      this.y = Math.sin(angle) * strength;
    }
    this.draw();
  };
  private up = (pointer: Phaser.Input.Pointer) => {
    if (this.pointerId === pointer.id) this.reset();
  };
  reset = () => {
    this.pointerId = undefined;
    this.x = 0;
    this.y = 0;
    this.draw();
  };
  private draw() {
    this.graphics.clear().fillStyle(0x101b15, 0.75).fillCircle(this.center.x, this.center.y, 66);
    this.graphics.lineStyle(1.5, 0xc5f277, 0.35).strokeCircle(this.center.x, this.center.y, 66);
    this.graphics.lineStyle(1, 0xffffff, 0.12).strokeCircle(this.center.x, this.center.y, 44);
    this.graphics
      .fillStyle(0xc5f277, 0.95)
      .fillCircle(this.center.x + this.x * 38, this.center.y + this.y * 38, 23);
    this.graphics
      .fillStyle(0x16201b, 0.6)
      .fillCircle(this.center.x + this.x * 38, this.center.y + this.y * 38, 4);
  }
  destroy() {
    this.scene.input.off('pointerdown', this.down);
    this.scene.input.off('pointermove', this.move);
    this.scene.input.off('pointerup', this.up);
    this.scene.input.off('pointerupoutside', this.up);
    this.scene.input.off('gameout', this.reset);
    this.graphics.destroy();
  }
}
