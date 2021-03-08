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
import { isUpdateAvailable, goToStore, openAppPromise } from '../utils/update';
import {
  getObjectsByType,
  getRespawnPoint,
  getTargetPoint
} from '../utils/tilemap.helpers';

export const BONUSES = new Map<number, string>([
  [60, 'cherry'],
  [120, 'strawberry'],
  [150, 'apple'],
]);

export const BONUS_AMOUNT = new Map<string, number>([
  ['cherry', 2],
  ['strawberry', 3],
  ['apple', 4],
]);

export const POINTS = new Map<string, number>([
  ['pellet', 10],
  ['pill', 50],
]);

const FINAL_LEVEL = 3; // 3 Levels

export const PUBLISHER_ID = 'ed847862-2f6a-441e-855e-7e405549cf48'; // KaiAds
export const AD_TIMEOUT = 45 * 1000; // 45s

// Manifest URL to launch KaiStore for PodLP
export const INTERSTITIAL_MANIFEST_URL = 'https://api.kaiostech.com/apps/manifest/UxappJMyyWGDpPORzsyl';
const INTERSTITIAL_RATE = 0.5; // 50%

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
  adVisible: boolean;

  enterKey: Phaser.Key;
  spaceKey: Phaser.Key;
  backKey: Phaser.Key;

  muteIcon: Phaser.Sprite;
  unmuteIcon: Phaser.Sprite;

  sfx: SFX;

  screenLock: MozWakeLock;
  interstitial: HTMLElement;

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
    this.level = Math.min(FINAL_LEVEL, Math.max(1, level));
    this.lifes = Math.max(1, lifes);
    this.score = Math.max(0, score);
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
    this.initMute();
    this.initSfx();
    this.setDefaultMute();

    this.showNotification('ready!');

    // KaiOS-specific
    this.bindAppInterstitial();
    this.requestWakeLock();
    this.minimizeMemoryUsage();

    // Audio content
    this.setAudioChannel('content');
    this.sfx.intro.play();

    // Preload KaiAds
    window.requestAnimationFrame(this.checkForUpdates.bind(this));
    window.requestAnimationFrame(this.preloadKaiAds.bind(this));
  }

  private isInterstitialVisible(): boolean {
    return !this.interstitial.hasAttribute('hidden');
  }

  private setInterstitialVisibility(visible: boolean) {
    if (visible) {
      this.interstitial.removeAttribute('aria-hidden');
      this.interstitial.removeAttribute('hidden');
    } else {
      this.interstitial.setAttribute('aria-hidden', 'true');
      this.interstitial.setAttribute('hidden', 'true');
    }
  }

  private onInterstitialSoftKeyClick(key: string): boolean {
    switch (key) {
      case 'SoftLeft':
        this.setInterstitialVisibility(false);
        return true;
      case 'Enter':
      case 'SoftRight':
        this.setInterstitialVisibility(false);
        openAppPromise(INTERSTITIAL_MANIFEST_URL)
          .catch((e) => console.warn(e));
        return true;
    }

    return false;
  }

  private bindAppInterstitial() {
    this.interstitial = document.getElementById('app-interstitial');
    const softKeys: NodeListOf<HTMLElement> = this.interstitial.querySelectorAll('.soft-keys > [data-action]');
    for (let i = 0, e = softKeys.length; i < e; i++) {
      const button: HTMLElement = softKeys[i];
      const key = button.dataset.key;
      button.addEventListener('click', () => this.onInterstitialSoftKeyClick(key))
    }
  }

  private onAdPreloaded() {
    if (this.pacman && !this.pacman.hasStarted()) {
      window.requestAnimationFrame(this.renderKaiAds.bind(this));
    }
  }

  private preloadKaiAds() {
    const offline = !navigator.onLine;
    if (offline || this.kaiad) {
      if (offline) {
        this.onAdPreloaded();
      }
      return;
    }

    getAd()
      .then((ad) => {
        this.kaiad = ad;
        this.onAdPreloaded();
      })
      .catch((e) => {
        console.warn(e);
      });
  }

  private onAdClose() {
    this.kaiad = null;
    this.adVisible = false;
    window.requestAnimationFrame(this.minimizeMemoryUsage.bind(this));
    window.setTimeout(this.preloadKaiAds.bind(this), AD_TIMEOUT);
  }

  private renderKaiAds() {
    // Don't render more than one ad at a time
    if (this.adVisible || this.isInterstitialVisible()) {
      return;
    }

    const renderInterstitial = (Math.random() > INTERSTITIAL_RATE);

    if (renderInterstitial) {
      this.setInterstitialVisibility(true);
    } else if (this.kaiad) {
      this.kaiad.on('close', this.onAdClose.bind(this));
      this.kaiad.on('click', this.onAdClose.bind(this));

      this.kaiad.call('display');
      this.adVisible = true;
    }
  }

  private setMuteIcon(mute: boolean) {
    if (mute) {
      this.unmuteIcon.alpha = 0;
      this.muteIcon.alpha = 1;
    } else {
      this.muteIcon.alpha = 0;
      this.unmuteIcon.alpha = 1;
    }
  }

  setDefaultMute() {
    const mute = Boolean((localStorage.getItem('mute') || '1') === '1');
    this.game.sound.mute = mute;
    this.setMuteIcon(mute);
  }

  mute() {
    localStorage.setItem('mute', '1');
    this.game.sound.mute = true;
    this.setMuteIcon(true);
  }

  unmute() {
    localStorage.setItem('mute', '0');
    this.game.sound.mute = false;
    this.setMuteIcon(false);
  }

  update() {
    // Check if game is active.
    if (!this.active) {
      this.ghosts.callAll('stop', undefined);
      this.pacman.stop();
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

  private showUpdatePrompt() {
    const c = confirm('An update is available, install from the store now?');
    if (c) {
      goToStore()
        .catch((e) => console.warn(e));
    }
  }

  private checkForUpdates() {
    isUpdateAvailable()
      .then((downloadAvailable) => {
        if (downloadAvailable) {
          this.showUpdatePrompt();
        }
      })
      .catch((e) => console.warn(e));
  }

  /**
   * Update controls handler.
   */
  checkControls() {
    this.keyboardControls();

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
    this.hideNotification();
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

  private hasPallets(): boolean {
    return (this.pellets.total > 0);
  }

  private onLevelComplete(pacman: Pacman) {
    pacman.sfx.munch.stop();
    const nextLevel = this.level < FINAL_LEVEL;
    const text = nextLevel ? `level ${this.level} completed` : 'game completed';
    this.level++;
    this.active = false;
    this.ghosts.callAll('stop', undefined);
    pacman.stop();

    if (!nextLevel) {
      this.sfx.win.play();
    }

    this.showNotification(text);
  }

  private maybePlaceBonus() {
    // Bonuses initialization.
    const eaten = this.pellets.children.length - this.pellets.total;

    if (BONUSES.has(eaten)) {
      this.placeBonus(BONUSES.get(eaten));
    }
  }

  /**
   * Munch handler.
   * @param pacman - pacman object.
   * @param item - pill or pellet to collect.
   */
  collect(pacman: Pacman, item) {
    const points = POINTS.get(item.key) || 0;

    if (points) {
      item.kill();
      this.updateScore(points);
    }

    // All items eaten by Pacman.
    if (!this.hasPallets()) {
      this.onLevelComplete(pacman);
    } else {
      this.maybePlaceBonus();
    }
  }

  /**
   * Bonus eat handler.
   * @param bonus - friut.
   */
  bonus(_: Pacman, bonus) {
    const amount = BONUS_AMOUNT.get(bonus.key) || 1;

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

  private onGameOver(pacman: Pacman) {
    pacman.sfx.munch.stop();
    pacman.stop();
    this.ghosts.callAll('stop', undefined);
    this.sfx.over.play();
    this.active = false;
    this.showNotification('game over');
  }

  private onLostLife(pacman: Pacman) {
    // Minus 1 Pacman life.
    pacman.die();
    this.ghosts.callAll('respawn', undefined);
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
        this.onGameOver(pacman);
      } else {
        this.onLostLife(pacman);
      }

      window.setTimeout(this.renderKaiAds.bind(this), 500);
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
  private placeBonus(name: string) {
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
      this.game.world.centerY + 40, 'kong', '', 16);
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

  private initMute() {
    this.muteIcon = this.game.make
      .sprite(this.game.world.right - 20, this.game.world.bottom - 10, 'mute');
    this.unmuteIcon = this.game.make
      .sprite(this.game.world.right - 20, this.game.world.bottom - 10, 'unmute');
    
    this.muteIcon.anchor.set(0.5);
    this.unmuteIcon.anchor.set(0.5);
    this.muteIcon.scale.setTo(1.5);
    this.unmuteIcon.scale.setTo(1.5);

    this.muteIcon.alpha = 0;
    this.unmuteIcon.alpha = 0;

    this.interface.add(this.muteIcon);
    this.interface.add(this.unmuteIcon);
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
  private updateLifes(amount: number = 0) {
    this.lifes += amount;

    this.lifesArea.map((life) => life.destroy());
    this.lifesArea = [];

    // Add lifes
    for (let i = 0; i < this.lifes; i++) {
      let sprite: Phaser.Sprite;
      const prevSprite = this.lifesArea[this.lifesArea.length - 1];
      
      if (prevSprite) {
        sprite = this.add.sprite(0, 0, 'pacman', 1)
          .alignTo(prevSprite, Phaser.RIGHT_CENTER, 8, 0);
      } else {
        sprite = this.add.sprite(8, this.game.world.bottom - 16, 'pacman', 1);
      }

      this.lifesArea.push(sprite);
    }
  }

  /**
   * Shows game notification.
   * @param text - notification text.
   */
  private showNotification(text: string, instant: boolean = false) {
    this.notification.text = text.toUpperCase();

    if (instant) {
      this.notification.alpha = 1;
    } else {
      this.notificationIn.start();
    }
  }

  /**
   * Hides game notification.
   */
  private hideNotification(instant: boolean = false) {
    this.notification.text = '';

    if (instant) {
      this.notification.alpha = 0;
    } else {
      this.notificationOut.start();
    }
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
    const willPause = !this.game.paused;

    if (willPause) {
      this.showNotification('paused', true);
    } else {
      this.hideNotification(true);
    }

    // Needs to happen after pausing game
    this.game.paused = willPause;
  }

  private toggleMute() {
    this.game.sound.mute = !this.game.sound.mute;
    localStorage.setItem('mute', ((this.game.sound.mute) ? '1' : '0'));
    this.setMuteIcon(this.game.sound.mute);
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
    if (this.adVisible) {
      return true;
    }

    // Pass through to interstitial
    if (this.isInterstitialVisible()) {
      const responded = this.onInterstitialSoftKeyClick(e.key);
      if (responded) {
        e.preventDefault();
        return true;
      }
    }
  
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
    }
  }

  private updateGameState() {
    // Check if game is active.
    if (this.active || this.adVisible || this.isInterstitialVisible()) {
      return false;
    }

    if (this.lifes === 0 || this.level > FINAL_LEVEL) {
      // Game over: win or loss
      this.game.state.start('Game', true, false);
    } else {
      // Level up and get another life
      this.game.state.start('Game', true, false, this.level, this.lifes + 1, this.score);
    }

    return true;
  }

  private onEnterPress() {
    const updatedState = this.updateGameState();
    if (updatedState || this.adVisible) {
      return;
    }

    // Pass through to interstitial
    if (this.isInterstitialVisible()) {
      const responded = this.onInterstitialSoftKeyClick('Enter');
      if (responded) {
        return true;
      }
    }
    
    // Initial direction
    if (this.pacman && !this.pacman.hasStarted()) {
      this.pacman.onControls(Phaser.RIGHT);
    } else {
      this.togglePause();
    }
  }

  /**
   * Set game controls.
   */
  private setControls() {
    this.input.keyboard.onPressCallback = this.onPressCallback.bind(this);
    this.controls = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR)
    this.enterKey = this.input.keyboard.addKey(Phaser.Keyboard.ENTER);
    this.backKey = this.input.keyboard.addKey(Phaser.Keyboard.BACKSPACE);
    this.backKey.onDown.add(this.onBeforeExit.bind(this));
    this.enterKey.onDown.add(this.onEnterPress.bind(this));
    this.spaceKey.onDown.add(this.onEnterPress.bind(this));
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
