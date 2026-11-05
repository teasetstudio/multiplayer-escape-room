import Phaser from 'phaser';
import { WORLD } from '@escape/shared';
import { PlayerEntity } from '../entities/PlayerEntity';
import type { GameConnection } from '../network/GameConnection';

export class WorldScene extends Phaser.Scene {
  private readonly entities = new Map<string, PlayerEntity>();
  private following?: string;
  constructor(
    private readonly network: GameConnection,
    private readonly overview: boolean,
  ) {
    super('world');
  }
  create() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x1b2b24).fillRect(0, 0, WORLD.width, WORLD.height);
    graphics.lineStyle(1, 0x34483b, 0.7);
    for (let x = 0; x <= WORLD.width; x += WORLD.grid) graphics.lineBetween(x, 0, x, WORLD.height);
    for (let y = 0; y <= WORLD.height; y += WORLD.grid) graphics.lineBetween(0, y, WORLD.width, y);
    graphics.lineStyle(4, 0x719163, 0.85).strokeRect(0, 0, WORLD.width, WORLD.height);
    const corner = this.add.text(24, 20, 'COMMON GROUND', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      color: '#6f8a77',
      letterSpacing: 4,
    });
    corner.setAlpha(0.7);
    this.resize();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
      this.entities.clear();
      this.following = undefined;
    });
  }
  private resize() {
    const camera = this.cameras.main;
    const { width, height } = this.scale;
    if (this.overview) {
      camera.setZoom(Math.min((width - 70) / WORLD.width, (height - 60) / WORLD.height));
      camera.centerOn(WORLD.width / 2, WORLD.height / 2);
    } else {
      camera.setBounds(0, 0, WORLD.width, WORLD.height);
      camera.setZoom(Math.max(0.6, Math.min(1, height / 540)));
    }
  }
  override update(_time: number, delta: number) {
    const localId = this.network.getSnapshot().playerId;
    const players = this.network.world.sample(performance.now(), localId);
    const activeIds = new Set(players.map((player) => player.id));
    for (const [id, entity] of this.entities)
      if (!activeIds.has(id)) {
        entity.destroy();
        this.entities.delete(id);
      }
    for (const player of players) {
      let entity = this.entities.get(player.id);
      if (!entity) {
        entity = new PlayerEntity(this, player);
        this.entities.set(player.id, entity);
      }
      const local = !this.overview && player.id === localId;
      entity.sync(player, local, delta);
      if (local && this.following !== player.id) {
        this.cameras.main.startFollow(entity, false, 0.15, 0.15);
        this.following = player.id;
      }
    }
  }
}
