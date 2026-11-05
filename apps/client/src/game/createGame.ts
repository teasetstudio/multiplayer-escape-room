import Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene';
import { ControlsScene } from './scenes/ControlsScene';
import type { GameConnection } from './network/GameConnection';

export function createGame(parent: HTMLElement, network: GameConnection, overview: boolean) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#121e18',
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    scene: overview
      ? [new WorldScene(network, true)]
      : [new WorldScene(network, false), new ControlsScene(network)],
    render: { antialias: true, pixelArt: false },
    input: { activePointers: 2, touch: { capture: true }, mouse: { preventDefaultWheel: true } },
    fps: { target: 60 },
    audio: { noAudio: true },
    banner: false,
  });
}
