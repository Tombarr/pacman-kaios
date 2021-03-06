import * as Swipe from 'phaser-swipe';
import { SwipeModel } from '../interfaces/swipe';
import { State } from '../interfaces/state';
import { GameDifficulty, SFX } from '../interfaces/game';
import { GhostName } from '../interfaces/ghost';
import { difficulty } from '../config/difficulty';
import { Pill } from '../objects/pill';
import { Portal } from '../objects/portal';
import { Pacman } from '../objects/pacman';
import { Ghost } from '../objects/ghost';
import { MozWakeLock } from '../utils/mozwakelock';
import { Kaiad } from '../utils/kaiad';
import {
  getObjectsByType,
  getRespawnPoint,
  getTargetPoint
} from '../utils/tilemap.helpers';

export const PUBLISHER_ID = 'ed847862-2f6a-441e-855e-7e405549cf48'; // KaiAds

export function getAd(test: Number = 0): Promise<Kaiad|null> {
  return new Promise((resolve, reject) => {
    if (typeof window['getKaiAd'] === 'function') {
      window['getKaiAd']({
        publisher: PUBLISHER_ID,
        app: 'pacman',
        slot: 'main',
        test,
        onerror: () => reject(null),
        onready: (ad: Kaiad) => resolve(ad),
      });
    } else {
      return reject(null);
    }
  });
}

/**
 * Main game state.
 */
export class GameState extends State {
  map: Phaser.Tilemap;
  bgLayer: Phaser.TilemapLayer;
  wallsLayer: Phaser.TilemapLayer;
  active: boolean;
  score: number;
  multi: number;
  lifes: number;
  level: number;
  difficlty: GameDifficulty;
  pellets: Phaser.Group;
  pills: Phaser.Group;
  bonuses: Phaser.Group;
  portals: Phaser.Group;
  ghosts: Phaser.Group;
  ghostsHome = new Phaser.Point();
  pacman: Pacman;
  blinky: Ghost;
  pinky: Ghost;
  inky: Ghost;
  clyde: Ghost;

  controls: Phaser.CursorKeys;

  kaiad: Kaiad;

  enterKey: Phaser.Key;
  spaceKey: Phaser.Key;
  backKey: Phaser.Key;

  swipe: Swipe;
  isTouch: boolean;

  sfx: SFX;

  screenLock: MozWakeLock;

  private interface: Phaser.Group;
  private lifesArea: Phaser.Sprite[] = [];
  private scoreBtm: Phaser.BitmapText;
  private notification: Phaser.BitmapText;
  private notificationIn: Phaser.Tween;
  private notificationOut: Phaser.Tween;

  constructor() {
    super();

    this.onPowerModeStart = this.onPowerModeStart.bind(this);
    this.onPowerModeEnd = this.onPowerModeEnd.bind(this);
  }

  init(level = 1, lifes = 3, score = 0) {
    this.isTouch = this.game.device.touch;
    this.level = level;
    this.lifes = lifes;
    this.score = score;
    this.difficlty = difficulty[this.level - 1];
    this.multi = this.difficlty.multiplier;
    this.active = true;
  }

  minimizeMemoryUsage() {
    try {
      if (typeof window.navigator['minimizeMemoryUsage'] === 'function') {
        window.navigator['minimizeMemoryUsage']();
      }
    } catch (_) { }
  }

  requestWakeLock() {
    try {
      if (!this.screenLock && typeof window.navigator['requestWakeLock'] === 'function') {
        this.screenLock = window.navigator['requestWakeLock']('screen');
      }
    } catch (_) { }
  }

  releaseWakeLock() {
    try {
      if (this.screenLock && typeof this.screenLock['unlock'] === 'function') {
        this.screenLock.unlock();
        this.screenLock = null;
      }
    } catch (_) { }
  }

  create() {
    this.setTiles();
    this.initLayers();
    this.resizeMap();
    this.enablePhysics();
    this.setControls();

    this.createPortals();
    this.createPellets();
    this.createPills();
    this.createGhosts();
    this.createPacman();

    this.initUI();
    this.initSfx();
    this.setDefaultMute();

    // KaiOS-specific
    this.minimizeMemoryUsage();
    this.setAudioChannel('content');
    this.requestWakeLock();

    this.sfx.intro.play();

    // Preload KaiAds
    window.requestAnimationFrame(this.preloadKaiAds.bind(this));
  }

  private preloadKaiAds() {
    getAd(1) // TODO: remove 1 for publishing
      .then((ad) => {
        this.kaiad = ad;
      })
      .catch((e) => {
        console.warn(e);
      });
  }

  private onAdClose() {
    this.kaiad = null;
  }

  private renderKaiAds() {
    if (this.kaiad) {
      this.kaiad.on('close', this.onAdClose.bind(this));
      this.kaiad.on('click', this.onAdClose.bind(this));

      this.kaiad.call('display');
    }
  }

  setDefaultMute() {
    const mute = Boolean((localStorage.getItem('mute') || '1') === '1');
    this.game.sound.mute = mute;
  }

  mute() {
    localStorage.setItem('mute', '1');
    this.game.sound.mute = true;
  }

  unmute() {
    localStorage.setItem('mute', '0');
    this.game.sound.mute = false;
  }

  update() {
    // Check if game is active.
    if (!this.active) {
      this.ghosts.callAll('stop', undefined);
      this.pacman.stop();

      // Restarts state on win/game over or Pacman death.
      if ((this.spaceKey && this.spaceKey.isDown) ||
          (this.enterKey && this.enterKey.isDown)) {
        // Game over.
        if (this.lifes === 0) {
          this.game.state.start('Game', true, false);
        } else if (this.level <= 3) { // Next level.
          this.game.state.start('Game', true, false, this.level, this.lifes + 1, this.score);
        } else {
          this.game.state.start('Game', true, false); // Win.
        }
      }

      return;
    }

    // Checks collisions.
    this.game.physics.arcade.collide(this.pacman, this.wallsLayer);
    this.game.physics.arcade.collide(this.ghosts, this.wallsLayer);

    // Checks overlappings.
    this.game.physics.arcade.overlap(this.ghosts, this.portals, this.teleport, null, this);
    this.game.physics.arcade.overlap(this.pacman, this.portals, this.teleport, null, this);
    this.game.physics.arcade.overlap(this.pacman, this.pellets, this.collect, null, this);
    this.game.physics.arcade.overlap(this.pacman, this.bonuses, this.bonus, null, this);
    this.game.physics.arcade.overlap(this.pacman, this.pills, this.powerMode, null, this);
    this.game.physics.arcade.overlap(this.pacman, this.ghosts, this.meetGhost, null, this);

    // Upgates objects positions.
    this.ghosts.callAll('updatePosition', undefined, this.map, this.wallsLayer.index);
    this.ghosts.callAll('updateTarget', undefined, this.pacman.marker);

    if (this.game.time.events.duration > 0 &&
        this.game.time.events.duration < this.difficlty.powerModeTime * 0.3) {
      this.ghosts.callAll('normalSoon', undefined);
    }

    this.pacman.updatePosition(this.map, this.wallsLayer.index);

    this.checkControls();
  }

  /**
   * Update controls handler.
   */
  checkControls() {
    if (this.isTouch) {
      this.swipeControls();
    } else {
      this.keyboardControls();
    }

    if (this.pacman.turning !== Phaser.NONE) {
      this.pacman.turn();
    }
  }

  /**
   * Keyboard handler.
   */
  keyboardControls() {
    if (this.controls.left.isDown) {
      this.pacman.onControls(Phaser.LEFT);
    } else if (this.controls.right.isDown) {
      this.pacman.onControls(Phaser.RIGHT);
    } else if (this.controls.up.isDown) {
      this.pacman.onControls(Phaser.UP);
    } else if (this.controls.down.isDown) {
      this.pacman.onControls(Phaser.DOWN);
    } else {
      this.pacman.turning = Phaser.NONE;
    }
  }

  /**
   * Touch handler.
   */
  swipeControls() {
    const direction = this.swipe.check();

    if (direction !== null) {
      switch (direction.direction) {
        case this.swipe.DIRECTION_LEFT:
          this.pacman.onControls(Phaser.LEFT);
          break;

        case this.swipe.DIRECTION_RIGHT:
          this.pacman.onControls(Phaser.RIGHT);
          break;
        case this.swipe.DIRECTION_UP:
          this.pacman.onControls(Phaser.UP);
          break;

        case this.swipe.DIRECTION_DOWN:
          this.pacman.onControls(Phaser.DOWN);
          break;

        default:
          this.pacman.turning = Phaser.NONE;
          break;
      }
    }
  }

  /**
   * Inits map portals.
   */
  createPortals() {
    this.portals = this.game.add.group();
    this.portals.enableBody = true;

    const portals = getObjectsByType('portal', this.map, 'objects');

    portals.forEach(p => {
      this.portals
        .add(new Portal(this.game, p.x, p.y, p.width, p.height, p.properties));
    });
  }

  /**
   * Inits pellets.
   */
  createPellets() {
    this.pellets = this.game.add.group();
    this.pellets.enableBody = true;

    this.bonuses = this.game.add.group();
    this.bonuses.enableBody = true;

    this.map.createFromObjects('objects', 7, 'pellet', 0, true, false, this.pellets);
  }

  /**
   * Inits pills.
   */
  createPills() {
    this.pills = this.game.add.group();
    this.pills.enableBody = true;

    const pills = getObjectsByType('pill', this.map, 'objects');

    pills.forEach(p => {
      this.pills
        .add(new Pill(this.game, p.x, p.y));
    });
  }

  /**
   * Inits Ghosts.
   */
  createGhosts() {
    this.ghosts = this.game.add.group();
    this.ghosts.enableBody = true;
    this.ghostsHome = getRespawnPoint('blinky', this.map);

    this.addGostByName('blinky');
    this.addGostByName('inky');
    this.addGostByName('pinky');
    this.addGostByName('clyde');
  }

  /**
   * Inits Pacman.
   */
  createPacman() {
    const respawn = getRespawnPoint('pacman', this.map);

    this.pacman = new Pacman(this.game, respawn.x, respawn.y,
      this.game.tileSize, this.difficlty.pacmanSpeed);

    this.pacman.afterStart(() => this.afterPacmanRun());
  }

  /**
   * Pacman start hook.
   */
  afterPacmanRun() {
    this.sfx.intro.stop();
    this.blinky.onStart();
    this.pinky.escapeFromHome(800);
    this.inky.escapeFromHome(1000);
    this.clyde.escapeFromHome(1200);
  }

  /**
   * Portals handler.
   * @param unit - ghost or pacman to teleport.
   * @param portal - portal object.
   */
  teleport(unit: Pacman | Ghost, portal: Portal) {
    const { x, y } = this.portals
      .filter(p => p.props.i === portal.props.target)
      .list[0];

    unit.teleport(portal.x, portal.y, x, y);
  }

  /**
   * Munch handler.
   * @param pacman - pacman object.
   * @param item - pill or pellet to collect.
   */
  collect(pacman: Pacman, item) {
    const points = {
      pellet: 10,
      pill: 50
    }[item.key] || 0;

    if (points) {
      item.kill();
      this.updateScore(points);
    }

    // All items eaten by Pacman.
    if (!this.pellets.total) {
      pacman.sfx.munch.stop();
      const nextLevel = this.level < 3;
      const text = nextLevel ? `level ${this.level} completed` : 'game completed';
      this.level++;
      this.active = false;
      this.ghosts.callAll('stop', undefined);

      if (!nextLevel) {
        this.sfx.win.play();
      }

      this.showNotification(text);
    } else { // Bonuses initialization.
      const eated = `${this.pellets.children.length - this.pellets.total}`;

      const bonusName = {
        '60': 'cherry',
        '120': 'strawberry',
        '150': 'apple'
      }[eated];

      if (bonusName) {
        this.placeBonus(bonusName);
      }
    }
  }

  /**
   * Bonus eat handler.
   * @param pacman - pacman object.
   * @param bonus - friut.
   */
  bonus(pacman: Pacman, bonus) {
    const amount = {
      'cherry': 2,
      'strawberry': 3,
      'apple': 4
    }[bonus.key] || 1;

    bonus.destroy();
    this.sfx.fruit.play();

    this.multi = this.multi * amount;

    this.time.events.add(3000, () => {
      this.multi = this.difficlty.multiplier;
    });
  }

  /**
   * Pill eat handler.
   * @param pacman - pacman object.
   * @param pill - power pill.
   */
  powerMode(pacman: Pacman, pill: Pill) {
    this.collect(pacman, pill);

    pacman.enablePowerMode(this.difficlty.powerModeTime,
      this.onPowerModeStart, this.onPowerModeEnd);
  }

  /**
   * Pacman power mode start hook.
   */
  onPowerModeStart() {
    this.sfx.intermission.play();
    this.ghosts.callAll('enableSensetiveMode', undefined);
  }

  /**
   * Pacman power mode end hook.
   */
  onPowerModeEnd() {
    this.sfx.intermission.stop();
    this.sfx.regenerate.play();
    this.ghosts.callAll('disableSensetiveMode', undefined);
  }

  /**
   * Ghost overlap handler.
   * @param pacman - pacman object.
   * @param ghost - ghost object.
   */
  meetGhost(pacman: Pacman, ghost: Ghost) {
    // Prevent multiple overlaps.
    if (!pacman.alive || !ghost.alive) {
      return;
    }

    // Pacman powerfull.
    if (ghost.mode === 'frightened' && pacman.mode === 'power') {
      ghost.die();
      this.updateScore(200);
    } else {
      // Ghost eats Pacman.
      this.ghosts.callAll('stop', undefined);
      this.updateLifes(-1);

      // Game over.
      if (this.lifes === 0) {
        pacman.sfx.munch.stop();
        this.sfx.over.play();
        this.active = false;
        this.showNotification('game over');
        this.renderKaiAds();
      } else {
        // Minus 1 Pacman life.
        pacman.die();
        this.ghosts.callAll('respawn', undefined);
      }
    }
  }

  /**
   * Creates map.
   */
  private setTiles() {
    this.map = this.game.add.tilemap('level');
    this.map.addTilesetImage('walls', 'walls');
    this.map.setCollisionBetween(1, 33, true, 'walls');
  }

  /**
   * Gets random pellet position on map.
   */
  private getRandomPelletPosition(): Phaser.Point {
    const { x, y } = this.pellets
      .children[this.rnd.integerInRange(0, this.pellets.children.length - 1)];

    return { x, y } as Phaser.Point;
  }

  /**
   * Puts fruit on map.
   * @param name - fruit name.
   */
  private placeBonus(name: 'string') {
    const rndPoint = this.getRandomPelletPosition();
    this.add.sprite(rndPoint.x, rndPoint.y, name, 0, this.bonuses);
  }

  /**
   * Creates layers.
   */
  private initLayers() {
    this.bgLayer = this.map.createLayer('background');
    this.wallsLayer = this.map.createLayer('walls');
  }

  /**
   * Resises map.
   */
  private resizeMap() {
    this.bgLayer.resizeWorld();
  }

  /**
   * Enables physics.
   */
  private enablePhysics() {
    this.game.physics.startSystem(Phaser.Physics.ARCADE);
  }

  /**
   * Creates user interface.
   */
  private initUI() {
    this.interface = this.game.add.group();

    const text = this.score === 0 ? '00' : `${this.score}`;
    this.scoreBtm = this.game.make.bitmapText(this.game.world.centerX, this.game.world.bottom - 10, 'kong', text, 16);
    this.scoreBtm.anchor.set(0.5);
    this.notification = this.game.make.bitmapText(
      this.game.world.centerX,
      this.game.world.centerY + 48, 'kong', '', 16);
    this.notification.anchor.set(0.5);
    this.notification.alpha = 0;
    this.notificationIn = this.game.add.tween(this.notification)
      .to({ alpha: 1 }, 300, 'Linear');
    this.notificationOut = this.game.add.tween(this.notification)
      .to({ alpha: 0 }, 300, 'Linear');

    this.interface.add(this.scoreBtm);
    this.interface.add(this.notification);
    this.updateLifes(0);
  }

  /**
   * Updates player scores.
   * @param points - points to add.
   */
  private updateScore(points: number) {
    this.score += points * this.multi;
    this.scoreBtm.text = `${this.score}`;
  }

  /**
   * Updates player lifes.
   * @param amount - number of lifes.
   */
  private updateLifes(amount: number) {
    this.lifes += amount;

    // Create if no in UI.
    if (this.lifesArea.length &&
        this.lifesArea.length > this.lifes) {
      const life = this.lifesArea.pop();
      const lifeTween = this.game.add.tween(life)
          .to({ alpha: 0 }, 300, 'Linear');

      lifeTween.onComplete.add(() => life.destroy());
      lifeTween.start();
    }  else {
      // Update UI.
      let sprite: Phaser.Sprite;
      let prevSprite: Phaser.Sprite;

      for (let i = 0; i < this.lifes; i++) {
        if (prevSprite) {
          sprite = this.add.sprite(0, 0, 'pacman', 1)
            .alignTo(prevSprite, Phaser.RIGHT_CENTER, 8, 0);
        } else {
          sprite = this.add.sprite(8, this.game.world.bottom - 16, 'pacman', 1);
        }

        this.lifesArea.push(sprite);
        prevSprite = sprite;
      }
    }
  }

  /**
   * Shows game notification.
   * @param text - notification text.
   */
  private showNotification(text: string) {
    this.notification.text = text.toUpperCase();
    this.notificationIn.start();
  }

  /**
   * Hides game notification.
   */
  private hideNotification() {
    this.notification.text = '';
    this.notificationOut.start();
  }

  /**
   * Inits music & sounds.
   */
  private initSfx() {
    this.sfx = {
      intro: this.add.audio('intro'),
      over: this.add.audio('over'),
      win: this.add.audio('win'),
      fruit: this.add.audio('fruit'),
      intermission: this.add.audio('intermission'),
      regenerate: this.add.audio('regenerate')
    };
  }

  private togglePause() {
    this.game.paused = !this.game.paused;

    if (this.game.paused) {
      this.showNotification('paused');
    } else {
      this.hideNotification();
    }
  }

  private toggleMute() {
    this.game.sound.mute = !this.game.sound.mute;
    localStorage.setItem('mute', ((this.game.sound.mute) ? '1' : '0'));
  }

  private onBeforeExit() {
    const c = confirm('Quit Pak-Man?');
    if (c) {
      this.setAudioChannel('normal');
      this.releaseWakeLock();
      window.close();
    }
  }

  private setAudioChannel(channel) {
    try {
      if (typeof window.navigator['mozAudioChannelManager'] === 'object') {
        window.navigator['mozAudioChannelManager']['volumeControlChannel'] = channel;
        return (window.navigator['mozAudioChannelManager']['volumeControlChannel'] === channel);
      }
    } catch (_) { }
  
    return false;
  }

  private onPressCallback(_, e: KeyboardEvent) {
    switch (e.key) {
      case 'GoBack':
      case 'Escape':
      case 'Backspace':
      case 'EndCall':
        this.onBeforeExit();
        e.preventDefault();
        return true;
      case 'SoftRight':
        this.toggleMute();
        e.preventDefault();
        return true;
      case 'Enter':
      case 'Space':
        this.togglePause();
        e.preventDefault();
        return true;
    }
  }

  /**
   * Set game controls.
   */
  private setControls() {
    this.swipe = new Swipe(this.game, SwipeModel);
    this.input.keyboard.onPressCallback = this.onPressCallback.bind(this);
    this.controls = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR)
    this.enterKey = this.input.keyboard.addKey(Phaser.Keyboard.ENTER);
    this.backKey = this.input.keyboard.addKey(Phaser.Keyboard.BACKSPACE);
    this.backKey.onDown.add(this.onBeforeExit.bind(this));
    this.enterKey.onDown.add(this.togglePause.bind(this));
    this.spaceKey.onDown.add(this.togglePause.bind(this));
  }

  /**
   * Creates new ghost object by name.
   * @param name - ghost name.
   */
  private addGostByName(name: GhostName) {
    const respawn = getRespawnPoint(name, this.map);
    const target = getTargetPoint(name, this.map);

    this[name] = new Ghost(this.game, respawn.x, respawn.y, name, 2, this.game.tileSize,
      this.difficlty.ghostSpeed, target, this.ghostsHome, this.difficlty.wavesDurations);
    this.ghosts.add(this[name]);
  }
}
