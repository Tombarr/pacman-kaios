import 'pixi';
import 'p2';
import * as Phaser from 'phaser';

import { BootState } from './states/boot';
import { PreloadState } from './states/preload';
import { GameState } from './states/game';
import { setAudioChannel } from './utils/helpers';
import { releaseWakeLock } from './utils/mozwakelock';
import { isUpdateAvailable, goToStore } from './utils/update';

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
    function showUpdatePrompt() {
      const c = confirm('An update is available, install from the store now?');
      if (c) {
        goToStore()
          .catch((e) => console.warn(e));
      }
    }
  
    function checkForUpdates() {
      isUpdateAvailable()
        .then((downloadAvailable) => {
          if (downloadAvailable) {
            showUpdatePrompt();
          }
        })
        .catch((e) => console.warn(e));
    }

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

    function onBeforeExit() {
      const c = confirm('Exit Pak-Man?');
      if (c) {
        setAudioChannel('normal');
        releaseWakeLock();
        window.requestAnimationFrame(() => window.close());
      }
    }

    function onKeyDown(event) {
      switch (event.key) {
        case 'GoBack':
        case 'Escape':
        case 'Backspace':
          event.preventDefault();
          onBeforeExit();
          return true;
      }
    }

    function onVisibilityChange() {
      // Pause game if screen turns off (i.e. flip closed)
      if (document.hidden || document.visibilityState === 'hidden') {
        pacmanGame.paused = true;
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.requestAnimationFrame(checkForUpdates);
  };
})();
