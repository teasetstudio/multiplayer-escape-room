import Phaser from 'phaser';
import { LEVELS, type Point, type RoomId } from '@escape/shared';
import { PlayerEntity } from '../entities/PlayerEntity';
import { IsometricMap } from '../world/IsometricMap';
import { chamberMap, createCharacterAnimations, preloadArt } from '../world/assets';
import type { GameConnection } from '../network/GameConnection';

export class WorldScene extends Phaser.Scene {
  private readonly entities = new Map<string, PlayerEntity>();
  private following?: string;
  private map?: IsometricMap;
  /** Level and hidden chamber this scene was built for. A change rebuilds the whole scene. */
  private built = '';
  constructor(
    private readonly network: GameConnection,
    private readonly scope: 'overview' | RoomId,
  ) {
    super('world');
  }
  private place() {
    const view = this.network.getSnapshot();
    // The host overview is public geometry only; a chamber exists solely on its explorer's phone.
    const area = this.scope === 'overview' ? undefined : view.area;
    return { level: view.quest.level, area, key: `${view.quest.level}|${area?.key ?? ''}` };
  }
  preload() {
    preloadArt(this);
  }
  create() {
    createCharacterAnimations(this);
    const { level, area, key } = this.place();
    this.built = key;
    if (area) this.map = new IsometricMap(this, chamberMap(area), 'room-hidden', area.fixtures);
    else {
      const definition = LEVELS[level - 1] ?? LEVELS[0]!;
      this.map = new IsometricMap(this, definition.map, this.scope, definition.fixtures);
    }
    this.resize();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
      // No stale sprites, camera target or geometry may survive into the next space.
      this.cameras.main?.stopFollow();
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
    if (this.scope === 'overview') {
      camera.removeBounds();
      camera.setZoom(Math.max(0.1, Math.min((width - 64) / b.width, (height - 96) / b.height)));
      camera.centerOn(b.x + b.width / 2, b.y + b.height / 2 - 12);
    } else {
      // CSS-pixel viewport, independent of DPR. A landscape phone sees several tiles each way.
      camera.setZoom(Math.max(1.15, Math.min(1.8, height / 300)));
      const padX = Math.max(24, (width / camera.zoom - b.width) / 2);
      const padY = Math.max(56, (height / camera.zoom - b.height) / 2);
      camera.setBounds(b.x - padX, b.y - padY, b.width + 2 * padX, b.height + padY + 80);
      camera.setFollowOffset(0, 20);
    }
  }
  override update(_time: number, delta: number) {
    if (this.place().key !== this.built) {
      this.scene.restart();
      return;
    }
    const view = this.network.getSnapshot();
    const localId = view.playerId;
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
        entity = new PlayerEntity(this, player, this.scope === 'overview');
        this.entities.set(player.id, entity);
      }
      const local = this.scope !== 'overview' && player.id === localId;
      entity.sync(player, local, delta, this.cameras.main.zoom);
      if (local) {
        localPosition = entity;
        if (this.following !== player.id) {
          this.cameras.main.startFollow(entity, false, 0.14, 0.14, 0, 20);
          this.following = player.id;
        }
      }
    }
    const state = this.network.room?.state;
    this.map?.update(
      localPosition,
      {
        doors: state?.doors,
        states: view.puzzle?.fixtures,
        discoveries: view.discoveries,
        pickups: view.area ? undefined : state?.pickups?.values(),
      },
      delta,
    );
  }
}
