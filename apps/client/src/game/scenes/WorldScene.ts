import Phaser from 'phaser';
import { DEFAULT_MAP, type Point } from '@escape/shared';
import { PlayerEntity } from '../entities/PlayerEntity';
import { IsometricMap } from '../world/IsometricMap';
import type { GameConnection } from '../network/GameConnection';

export class WorldScene extends Phaser.Scene {
  private readonly entities = new Map<string, PlayerEntity>();
  private following?: string;
  private map?: IsometricMap;
  constructor(
    private readonly network: GameConnection,
    private readonly overview: boolean,
  ) {
    super('world');
  }
  create() {
    this.map = new IsometricMap(this, DEFAULT_MAP);
    this.resize();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
      this.entities.clear();
      this.following = undefined;
      this.map = undefined;
    });
  }
  private resize() {
    if (!this.map) return;
    const camera = this.cameras.main;
    const { width, height } = this.scale;
    const b = this.map.bounds;
    if (this.overview) {
      camera.removeBounds();
      camera.setZoom(Math.max(0.1, Math.min((width - 64) / b.width, (height - 96) / b.height)));
      camera.centerOn(b.x + b.width / 2, b.y + b.height / 2 - 12);
    } else {
      // CSS-pixel viewport, independent of DPR. A landscape phone sees several tiles each way.
      camera.setZoom(Math.max(1.15, Math.min(1.8, height / 300)));
      camera.setBounds(b.x - 24, b.y - 56, b.width + 48, b.height + 80);
      camera.setFollowOffset(0, 20);
    }
  }
  override update(_time: number, delta: number) {
    const localId = this.network.getSnapshot().playerId;
    const players = this.network.world.sample(performance.now(), localId);
    const activeIds = new Set(players.map((player) => player.id));
    for (const [id, entity] of this.entities)
      if (!activeIds.has(id)) {
        if (id === this.following) {
          this.cameras.main.stopFollow();
          this.following = undefined;
        }
        entity.destroy();
        this.entities.delete(id);
      }
    let localPosition: Point | undefined;
    for (const player of players) {
      let entity = this.entities.get(player.id);
      if (!entity) {
        entity = new PlayerEntity(this, player);
        this.entities.set(player.id, entity);
      }
      const local = !this.overview && player.id === localId;
      entity.sync(player, local, delta, this.cameras.main.zoom);
      if (local) {
        localPosition = entity;
        if (this.following !== player.id) {
          this.cameras.main.startFollow(entity, false, 0.14, 0.14, 0, 20);
          this.following = player.id;
        }
      }
    }
    this.map?.update(localPosition, this.network.room?.state.doors, delta);
  }
}
