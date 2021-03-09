import 'pixi';
import 'p2';
import * as Phaser from 'phaser';

import { BootState } from './states/boot';
import { PreloadState } from './states/preload';
import { GameState } from './states/game';

/**
 * Main game object.
 */
export class PacmanGame extends Phaser.Game {
  tileSize = 16;

  constructor(config: Phaser.IGameConfig) {
    super(config);

    this.initStates();

    this.state.start('Boot');
  }

  /**
   * Creates all game states.
   */
  private initStates() {
    this.state.add('Boot', BootState);
    this.state.add('Preload', PreloadState);
    this.state.add('Game', GameState);
  }
}

(function() {
  /**
   * Initialize game on page load.
   */
  window.onload = () => {
    const config: Phaser.IGameConfig = {
      width: 448,
      height: 576,
      renderer: Phaser.WEBGL,
      parent: 'root',
      antialias: false, // Used to keep pixelated graphics.
      transparent: false,
      resolution: 1,
      forceSetTimeOut: false,
      preserveDrawingBuffer: true,
      enableDebug: false,
      touch: false,
    };

    const pacmanGame = new PacmanGame(config);
    pacmanGame.clearBeforeRender = false;
  };
})();
