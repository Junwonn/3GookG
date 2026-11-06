import * as Phaser from 'phaser';
import { runEnemyUnit } from '../core/ai';
import { endEnemyTurn, getUnit, goalTile, livingUnits } from '../core/battle';
import type { BurnEvent, DamageEvent, Pos, SkillHit, SkillResult, SkillVisual, Unit } from '../core/types';
import type { BattleController, Effect } from '../ui/controller';
import {
  ARC_KEY,
  ARROW_KEY,
  badgeFrame,
  BAND_KEY,
  BAR_BACK_FRAME,
  BAR_FILL_FRAME,
  bodyFrame,
  createEffectTextures,
  createUnitAtlas,
  CROSS_KEY,
  CURSOR_KEY,
  FLAG_KEY,
  FLAME_KEY,
  footFrame,
  FX_TEXTURE_SIZE,
  paintBackdrop,
  RING_KEY,
  ROCK_KEY,
  SOFT_KEY,
  STREAK_KEY,
  TILE,
  TILE_KEY,
  UNIT_H,
  UNIT_ORIGIN,
  UNIT_W,
  WEAPON_PIVOT,
  weaponFrame,
} from './textures';

export const SCENE_KEY = 'battle';

const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

const COLOR_MOVE = 0x46b2ff;
const COLOR_THREAT = 0xff5a4d;
const COLOR_TARGET = 0xff3b30;
const COLOR_SKILL = 0xa35cff;
const COLOR_AREA = 0xff9a2e;
const COLOR_CURSOR = 0xffe08a;
const COLOR_SELECTED = 0xffffff;
const COLOR_ALLY = 0x4fb6ff;
const COLOR_ENEMY = 0xff8b3d;
const COLOR_GHOST = 0xfff1c9;
const STROKE_DAMAGE = '#8c1410';
const STROKE_HEAL = '#0f6a3b';
const STROKE_SKILL = '#3d2a8c';

const STEP_MS = 105;
/** 부대 그림 크기. 칸보다 조금 커서 입체적으로 서 있는 느낌을 준다. */
const UNIT_SCALE = 0.92;
const FOOT_Y = 0.36;

const DEPTH_WATER = 1;
const DEPTH_CLOUD = 9;
const DEPTH_OVERLAY = 10;
const DEPTH_FIRE = 12;
const DEPTH_UNIT = 20;
const DEPTH_LIGHT = 150;
const DEPTH_FX = 200;
const DEPTH_TEXT = 300;
const DEPTH_BANNER = 400;

/** 맵이 화면보다 클 때 칸을 따라 움직이는 시간 */
const PAN_MS = 240;
/** 적 턴의 기본 속도. 적이 많은 큰 맵에서도 지루하지 않게 조금 빠르게 돌린다. */
const ENEMY_SPEED = 1.4;
/** 적 턴에 화면을 누르면 이 속도로 바뀐다. 다시 누르면 돌아온다. */
const FAST_FORWARD = 3;
/** 지면 그림의 픽셀 수 상한. 큰 맵에서 메모리와 준비 시간을 지킨다. */
const BACKDROP_MAX_PIXELS = 3_200_000;

interface UnitView {
  container: Phaser.GameObjects.Container;
  /** 몸과 무기를 함께 움직이고 뒤집는 묶음 */
  rig: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Image;
  foot: Phaser.GameObjects.Image;
  barGhost: Phaser.GameObjects.Image;
  barFill: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Image | null;
  maxTroops: number;
  /** 체력 칸에 그리는 값. target은 실제 값, shown은 막대, ghost는 뒤따라 줄어드는 흰 부분 */
  hp: { target: number; shown: number; ghost: number };
  side: string;
  classId: string;
  /** 숨쉬기 동작이 부대마다 엇갈리게 하는 값 */
  phase: number;
  facingLeft: boolean;
  turnTween: Phaser.Tweens.Tween | null;
  knockTween: Phaser.Tweens.Tween | null;
  /** 공격 동작 중에는 숨쉬기로 무기 각도를 덮어쓰지 않는다 */
  acting: boolean;
}

interface FireView {
  root: Phaser.GameObjects.Container;
  flames: Phaser.GameObjects.Image[];
  glow: Phaser.GameObjects.Image;
  sparks: Phaser.GameObjects.Particles.ParticleEmitter;
}

export interface SceneHost {
  controller: () => BattleController;
  scale: () => number;
  refreshHud: (cursor: Pos) => void;
  showResult: () => void;
  onBusyChange: (busy: boolean) => void;
}

/**
 * 전투 상태를 그리고 애니메이션만 담당한다. 규칙은 core, 입력 흐름은 controller에 있다.
 * 좌표는 기기 픽셀이고, 칸 크기는 this.unit이다.
 */
export class BattleScene extends Phaser.Scene {
  private host!: SceneHost;
  private views = new Map<string, UnitView>();
  private fireViews = new Map<string, FireView>();
  private tileMarks: { image: Phaser.GameObjects.Image; alpha: number }[] = [];
  private tileMarksUsed = 0;
  private cursorMark!: Phaser.GameObjects.Image;
  private selectMark!: Phaser.GameObjects.Image;
  private cursor: Pos = { x: 0, y: 0 };
  private busy = false;
  private unit = TILE;
  private atlas = '';
  private artTile = TILE;
  private intro = false;
  private reduced = false;
  private clouds: { image: Phaser.GameObjects.Image; speed: number }[] = [];
  private ripples: { image: Phaser.GameObjects.Image; x: number; phase: number }[] = [];
  private waterTiles: Pos[] = [];
  private nextSparkle = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private healMotes!: Phaser.GameObjects.Particles.ParticleEmitter;
  private glints!: Phaser.GameObjects.Particles.ParticleEmitter;
  private worldW = 0;
  private worldH = 0;
  private panTween: Phaser.Tweens.Tween | null = null;
  private panDone: (() => void) | null = null;
  private goalRing: Phaser.GameObjects.Image | null = null;
  private inEnemyPhase = false;
  /** 한 번 빠르게 바꾸면 다음 적 턴에도 이어진다. */
  private enemySpeed = ENEMY_SPEED;

  constructor() {
    super(SCENE_KEY);
  }

  init(data: { host: SceneHost; cursor?: Pos; intro?: boolean }): void {
    this.host = data.host;
    this.cursor = data.cursor ?? this.defaultCursor();
    this.intro = data.intro ?? false;
    this.busy = false;
    this.views = new Map();
    this.fireViews = new Map();
    this.clouds = [];
    this.ripples = [];
    this.waterTiles = [];
    this.tileMarks = [];
    this.tileMarksUsed = 0;
  }

  create(): void {
    this.unit = TILE * this.host.scale();
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.setSpeed(1);
    this.panTween = null;
    this.panDone = null;
    this.goalRing = null;
    this.inEnemyPhase = false;
    const { width, height } = this.controller.battle;
    this.worldW = width * this.unit;
    this.worldH = height * this.unit;
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.centerOn(this.cursor);
    createEffectTextures(this);
    this.drawWorld();
    this.createEmitters();
    this.selectMark = this.add.image(0, 0, CURSOR_KEY).setTint(COLOR_SELECTED).setDepth(DEPTH_OVERLAY + 1).setVisible(false);
    this.cursorMark = this.add
      .image(this.px(this.cursor.x), this.px(this.cursor.y), CURSOR_KEY)
      .setTint(COLOR_CURSOR)
      .setDepth(DEPTH_FX - 1);
    this.artTile = Math.ceil(this.unit * UNIT_SCALE * 1.05);
    this.atlas = createUnitAtlas(this, this.controller.battle.units, this.artTile);
    for (const unit of this.controller.battle.units) {
      if (unit.troops > 0) this.createUnitView(unit);
    }
    this.addGoalMark();
    this.refresh();
    if (this.intro) this.playIntro();
  }

  /* ---------- 카메라 ---------- */

  /** 맵이 화면보다 커서 움직일 수 있는지 */
  get canPan(): boolean {
    return this.worldW > this.scale.width + 1 || this.worldH > this.scale.height + 1;
  }

  /** 전체 지도에 깔 지면 그림 */
  get backdropImage(): CanvasImageSource | null {
    const key = this.textures.getTextureKeys().find((one) => one.startsWith('backdrop-'));
    return key ? (this.textures.get(key).getSourceImage() as CanvasImageSource) : null;
  }

  /** 지금 화면에 보이는 칸 범위 */
  get viewTiles(): { x: number; y: number; w: number; h: number } {
    const camera = this.cameras.main;
    return { x: camera.scrollX / this.unit, y: camera.scrollY / this.unit, w: this.scale.width / this.unit, h: this.scale.height / this.unit };
  }

  private clampScroll(x: number, y: number): Pos {
    const maxX = Math.max(0, this.worldW - this.scale.width);
    const maxY = Math.max(0, this.worldH - this.scale.height);
    return { x: Math.round(Math.min(maxX, Math.max(0, x))), y: Math.round(Math.min(maxY, Math.max(0, y))) };
  }

  private stopPan(): void {
    this.panTween?.stop();
    this.panTween = null;
    this.panDone?.();
    this.panDone = null;
  }

  private centerOn(tile: Pos): void {
    this.stopPan();
    const next = this.clampScroll(this.px(tile.x) - this.scale.width / 2, this.px(tile.y) - this.scale.height / 2);
    this.cameras.main.setScroll(next.x, next.y);
  }

  /** 손가락으로 끄는 만큼 맵을 옮긴다. 값은 캔버스 픽셀이다. */
  panBy(dx: number, dy: number): void {
    if (this.busy || !this.canPan) return;
    this.stopPan();
    const camera = this.cameras.main;
    const next = this.clampScroll(camera.scrollX + dx, camera.scrollY + dy);
    camera.setScroll(next.x, next.y);
  }

  /** 전체 지도에서 고른 칸을 화면 가운데로 가져온다. */
  jumpTo(tile: Pos): void {
    this.centerOn(tile);
  }

  /** 주어진 칸들이 모두 보이도록 필요한 만큼만 화면을 옮긴다. */
  private focus(tiles: Pos[], margin = 1.2, ms = PAN_MS): Promise<void> {
    if (!this.canPan || tiles.length === 0) return Promise.resolve();
    const camera = this.cameras.main;
    const u = this.unit;
    const left = Math.min(...tiles.map((tile) => tile.x)) * u - margin * u;
    const right = (Math.max(...tiles.map((tile) => tile.x)) + 1) * u + margin * u;
    const top = Math.min(...tiles.map((tile) => tile.y)) * u - margin * u;
    const bottom = (Math.max(...tiles.map((tile) => tile.y)) + 1) * u + margin * u;
    const axis = (low: number, high: number, scroll: number, size: number): number => {
      if (high - low >= size) return (low + high - size) / 2;
      if (low < scroll) return low;
      if (high > scroll + size) return high - size;
      return scroll;
    };
    const next = this.clampScroll(axis(left, right, camera.scrollX, this.scale.width), axis(top, bottom, camera.scrollY, this.scale.height));
    this.stopPan();
    if (Math.abs(next.x - camera.scrollX) < 1 && Math.abs(next.y - camera.scrollY) < 1) return Promise.resolve();
    if (this.reduced || ms <= 0) {
      camera.setScroll(next.x, next.y);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.panDone = resolve;
      this.panTween = this.tweens.add({
        targets: camera,
        scrollX: next.x,
        scrollY: next.y,
        duration: ms,
        ease: 'Cubic.easeInOut',
        onComplete: () => {
          this.panTween = null;
          this.panDone = null;
          resolve();
        },
      });
    });
  }

  private inView(tile: Pos): boolean {
    const camera = this.cameras.main;
    const x = this.px(tile.x) - camera.scrollX;
    const y = this.px(tile.y) - camera.scrollY;
    return x > -this.unit && y > -this.unit && x < this.scale.width + this.unit && y < this.scale.height + this.unit;
  }

  /** 적 턴을 빠르게 넘긴다. 애니메이션 시간만 줄고 결과는 같다. */
  private setSpeed(rate: number): void {
    this.tweens.timeScale = rate;
    this.time.timeScale = rate;
  }

  /** 도착하거나 지켜야 하는 칸에 깃발을 세운다. */
  private addGoalMark(): void {
    const { map } = this.controller.battle;
    const goal = goalTile(map);
    if (!goal) return;
    const u = this.unit;
    const x = this.px(goal.x);
    const y = this.px(goal.y);
    const holding = map.victory.type === 'hold';
    this.goalRing = this.add
      .image(x, y + u * 0.12, RING_KEY)
      .setScale(this.soft(1.05), this.soft(0.62))
      .setTint(holding ? 0x7fd0ff : 0xffd65a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH_OVERLAY - 1);
    this.add
      .image(x + u * 0.2, y + u * 0.42, FLAG_KEY)
      .setOrigin(0.5, 0.96)
      .setScale(this.soft(0.72))
      .setDepth(DEPTH_UNIT + goal.y / 100 - 0.002);
    this.add
      .text(x, y - u * 0.34, holding ? '사수' : map.victory.type === 'reach' && !map.victory.unitId ? '점령' : '도착', {
        fontFamily: FONT,
        fontSize: `${Math.round(u * 0.25)}px`,
        fontStyle: '800',
        color: '#fff1c4',
        stroke: '#3a2a10',
        strokeThickness: Math.max(2, u * 0.05),
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UNIT + goal.y / 100 - 0.001);
  }

  /** 매 프레임: 숨쉬기, 불꽃 흔들림, 물결, 구름, 선택 표시 맥박. */
  update(time: number): void {
    const t = time / 1000;
    const camera = this.cameras.main;
    const pad = this.unit * 1.2;
    const seen = (x: number, y: number) =>
      x > camera.scrollX - pad && y > camera.scrollY - pad && x < camera.scrollX + this.scale.width + pad && y < camera.scrollY + this.scale.height + pad;
    this.goalRing?.setAlpha(this.reduced ? 0.8 : 0.55 + Math.sin(t * 2.4) * 0.35);
    for (const view of this.views.values()) {
      // 화면 밖의 부대는 그리지도 움직이지도 않는다
      const visible = seen(view.container.x, view.container.y);
      if (view.container.visible !== visible) view.container.setVisible(visible);
      if (!visible) continue;
      const depth = DEPTH_UNIT + view.container.y / this.unit / 100;
      if (view.container.depth !== depth) view.container.setDepth(depth);
      if (this.reduced) continue;
      const breath = Math.sin(t * 2.6 + view.phase);
      view.body.setScale(this.artScale * (1 - breath * 0.006), this.artScale * (1 + breath * 0.016));
      if (!view.acting) view.weapon.setRotation(Math.sin(t * 2.6 + view.phase - 0.5) * 0.028);
    }
    const pulse = this.reduced ? 1 : 0.5 + Math.sin(t * 3.4) * 0.5;
    for (let index = 0; index < this.tileMarksUsed; index++) {
      const mark = this.tileMarks[index];
      mark.image.setAlpha(mark.alpha * (0.82 + pulse * 0.18));
    }
    const markScale = this.soft(1);
    this.cursorMark.setScale(markScale * (this.reduced ? 1 : 1 + pulse * 0.035));
    this.selectMark.setScale(markScale * (this.reduced ? 1 : 1.015 + (1 - pulse) * 0.03));

    for (const fire of this.fireViews.values()) {
      const visible = seen(fire.root.x, fire.root.y);
      if (fire.root.visible !== visible) {
        fire.root.setVisible(visible);
        fire.sparks.setVisible(visible);
        if (visible) fire.sparks.start();
        else fire.sparks.stop();
      }
      if (!visible) continue;
      fire.flames.forEach((flame, index) => {
        const flick = Math.sin(t * (9 + index * 2.3) + index * 2);
        flame.setScale(flame.getData('base') * (1 + flick * 0.07), flame.getData('base') * (1 + Math.sin(t * (13 + index) + index) * 0.15));
      });
      fire.glow.setAlpha(0.42 + Math.sin(t * 8) * 0.1);
    }
    if (this.reduced) return;

    for (const cloud of this.clouds) {
      cloud.image.x += cloud.speed * (this.game.loop.delta / 1000);
      if (cloud.image.x - cloud.image.displayWidth / 2 > this.worldW) cloud.image.x = -cloud.image.displayWidth / 2;
    }
    for (const ripple of this.ripples) {
      ripple.image.x = ripple.x + Math.sin(t * 0.7 + ripple.phase) * this.unit * 0.22;
      ripple.image.setAlpha(0.14 + Math.sin(t * 1.3 + ripple.phase * 1.7) * 0.11);
    }
    if (time > this.nextSparkle && this.waterTiles.length > 0) {
      this.nextSparkle = time + 110;
      const tile = this.waterTiles[Math.floor(Math.random() * this.waterTiles.length)];
      this.glints.emitParticleAt((tile.x + Math.random()) * this.unit, (tile.y + Math.random()) * this.unit, 1);
    }
  }

  get isBusy(): boolean {
    return this.busy;
  }

  get cursorPos(): Pos {
    return this.cursor;
  }

  /** 입력 처리 공통 지점. 애니메이션 중에는 입력을 받지 않는다. */
  dispatch(run: (controller: BattleController) => Effect[]): void {
    if (this.busy) return;
    void this.play(run(this.controller));
  }

  tap(x: number, y: number): void {
    if (this.busy) return;
    this.cursor = { x, y };
    this.dispatch((controller) => controller.tapTile(x, y));
    // 고른 부대가 화면 끝에 있으면 움직일 곳이 보이도록 당겨 온다
    const selected = this.controller.view().selectedId;
    if (selected && !this.busy) {
      const unit = getUnit(this.controller.battle, selected);
      void this.focus([unit], 3);
    }
  }

  /** 캔버스 위의 비율 좌표(0~1)를 맵 칸으로 바꿔 누른다. 적 턴에는 빠르게 넘긴다. */
  tapAt(fx: number, fy: number): void {
    if (this.busy) {
      if (this.inEnemyPhase) {
        this.enemySpeed = this.enemySpeed === FAST_FORWARD ? ENEMY_SPEED : FAST_FORWARD;
        this.setSpeed(this.enemySpeed);
        this.showEnemyMessage();
      }
      return;
    }
    const camera = this.cameras.main;
    const x = Math.floor((fx * this.scale.width + camera.scrollX) / this.unit);
    const y = Math.floor((fy * this.scale.height + camera.scrollY) / this.unit);
    const { width, height } = this.controller.battle;
    if (x >= 0 && y >= 0 && x < width && y < height) this.tap(x, y);
  }

  moveCursor(dx: number, dy: number): void {
    if (this.busy) return;
    const { width, height } = this.controller.battle;
    this.cursor = {
      x: Math.min(width - 1, Math.max(0, this.cursor.x + dx)),
      y: Math.min(height - 1, Math.max(0, this.cursor.y + dy)),
    };
    void this.focus([this.cursor], 1, 120);
    this.refresh();
  }

  pressSkill(): void {
    this.dispatch((controller) => controller.pressSkill());
  }

  /** 기술을 고르면 커서를 첫 칸으로 옮겨 키보드로도 바로 고를 수 있게 한다. */
  chooseSkill(skillId: string): void {
    if (this.busy) return;
    this.dispatch((controller) => controller.chooseSkill(skillId));
    const first = this.controller.view().skillTiles[0];
    if (first) {
      this.cursor = first;
      void this.focus(this.controller.view().skillTiles, 0.5);
      this.refresh();
    }
  }

  /** 키보드로 공격을 고르면 커서를 첫 대상으로 옮긴다. */
  pressAttack(): void {
    if (this.busy) return;
    const targets = this.controller.view().targetTiles;
    this.dispatch((controller) => controller.pressAttack());
    if (targets.length > 0) {
      this.cursor = targets[0];
      this.refresh();
    }
  }

  private get controller(): BattleController {
    return this.host.controller();
  }

  private get artScale(): number {
    return (this.unit / this.artTile) * UNIT_SCALE;
  }

  private defaultCursor(): Pos {
    const battle = this.host.controller().battle;
    const leader = battle.map.defeat.type === 'unitDown' ? getUnit(battle, battle.map.defeat.unitId) : livingUnits(battle, 'ally')[0];
    return { x: leader.x, y: leader.y };
  }

  private px(tile: number): number {
    return tile * this.unit + this.unit / 2;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => this.tweens.add({ ...config, onComplete: () => resolve() }));
  }

  private soft(diameterTiles: number): number {
    return (this.unit * diameterTiles) / FX_TEXTURE_SIZE;
  }

  /* ---------- 세계 그리기 ---------- */

  private drawWorld(): void {
    const { tiles, map } = this.controller.battle;
    // 큰 맵은 지면 그림의 해상도를 조금 낮춰 메모리를 아낀다
    const pixelScale = Math.min(1, Math.sqrt(BACKDROP_MAX_PIXELS / (this.worldW * this.worldH)));
    const width = Math.round(this.worldW * pixelScale);
    const height = Math.round(this.worldH * pixelScale);
    const key = `backdrop-${map.name}-${width}x${height}`;
    for (const existing of this.textures.getTextureKeys()) {
      if (existing.startsWith('backdrop-') && existing !== key) this.textures.remove(existing);
    }
    if (!this.textures.exists(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      paintBackdrop(canvas, tiles, width / tiles[0].length, map.name, map.theme);
      this.textures.addCanvas(key, canvas);
    }
    this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(this.worldW, this.worldH).setDepth(0);

    tiles.forEach((row, y) =>
      row.forEach((terrainId, x) => {
        if (terrainId === 'river') this.waterTiles.push({ x, y });
      }),
    );
    this.addAtmosphere();
  }

  /** 물결, 구름 그림자, 빛, 떠다니는 꽃가루. 게임 판단에는 영향이 없는 장식이다. */
  private addAtmosphere(): void {
    const stride = Math.max(1, Math.ceil(this.waterTiles.length / 24));
    this.waterTiles.forEach((tile, index) => {
      if (index % stride !== 0) return;
      const x = (tile.x + 0.5) * this.unit;
      const image = this.add
        .image(x, (tile.y + 0.25 + (index % 3) * 0.25) * this.unit, STREAK_KEY)
        .setScale((this.unit * 0.7) / FX_TEXTURE_SIZE, (this.unit * 0.1) / 6)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.15)
        .setDepth(DEPTH_WATER);
      this.ripples.push({ image, x, phase: index * 1.9 });
    });

    if (this.reduced) return;
    for (const [fx, fy, size, speed] of [[0.3, 0.3, 6, 6]]) {
      const image = this.add
        .image(this.worldW * fx, this.worldH * fy, SOFT_KEY)
        .setScale((this.unit * size) / FX_TEXTURE_SIZE, ((this.unit * size) / FX_TEXTURE_SIZE) * 0.65)
        .setTint(0x06141f)
        .setAlpha(0.2)
        .setDepth(DEPTH_CLOUD);
      this.clouds.push({ image, speed: (this.unit / 36) * speed });
    }
    // 꽃가루는 지금 보이는 화면에만 날린다
    this.add
      .particles(0, 0, SOFT_KEY, {
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 0, this.scale.width, this.scale.height) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
        frequency: 520,
        lifespan: 5200,
        speedX: { min: this.unit * 0.05, max: this.unit * 0.25 },
        speedY: { min: -this.unit * 0.18, max: -this.unit * 0.03 },
        scale: { start: this.soft(0.1), end: this.soft(0.05) },
        alpha: { start: 0.55, end: 0 },
        tint: 0xfff4c4,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_LIGHT - 1);
  }

  private createEmitters(): void {
    const make = (config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth = DEPTH_FX) =>
      this.add.particles(0, 0, SOFT_KEY, { emitting: false, ...config }).setDepth(depth);
    const u = this.unit;
    this.sparks = make({
      speed: { min: u * 1.2, max: u * 3.6 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 180, max: 380 },
      scale: { start: this.soft(0.16), end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: u * 5,
      tint: [0xffffff, 0xffe28a, 0xffb347],
      blendMode: Phaser.BlendModes.ADD,
    });
    this.dust = make({
      speed: { min: u * 0.1, max: u * 0.45 },
      angle: { min: 180, max: 360 },
      lifespan: { min: 260, max: 460 },
      scale: { start: this.soft(0.2), end: this.soft(0.42) },
      alpha: { start: 0.42, end: 0 },
      tint: 0xe9dcc0,
    }, DEPTH_UNIT - 1);
    this.smoke = make({
      speed: { min: u * 0.15, max: u * 0.6 },
      angle: { min: 230, max: 310 },
      lifespan: { min: 500, max: 900 },
      scale: { start: this.soft(0.32), end: this.soft(0.8) },
      alpha: { start: 0.5, end: 0 },
      tint: 0x4a4d55,
    });
    this.embers = make({
      speed: { min: u * 0.3, max: u * 1.2 },
      angle: { min: 240, max: 300 },
      lifespan: { min: 400, max: 800 },
      scale: { start: this.soft(0.15), end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffe08a, 0xff9a2e, 0xff5a1e],
      blendMode: Phaser.BlendModes.ADD,
    });
    this.healMotes = make({
      speed: { min: u * 0.2, max: u * 0.8 },
      angle: { min: 250, max: 290 },
      lifespan: { min: 500, max: 800 },
      scale: { start: this.soft(0.18), end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xc8ffd8, 0x6dffa5],
      blendMode: Phaser.BlendModes.ADD,
    });
    this.glints = make({
      lifespan: 620,
      scale: { start: this.soft(0.11), end: 0 },
      alpha: { start: 0.9, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
    }, DEPTH_WATER);
  }

  /* ---------- 부대 ---------- */

  private createUnitView(unit: Unit): void {
    const s = this.artScale;
    const u = this.unit;
    const footY = u * FOOT_Y;
    const foot = this.add
      .image(0, footY, this.atlas, footFrame(unit.side))
      .setDisplaySize(u * 0.94, u * 0.4);
    const body = this.add
      .image(0, 0, this.atlas, bodyFrame(unit.side, unit.generalId))
      .setOrigin(UNIT_ORIGIN.x, UNIT_ORIGIN.y)
      .setScale(s);
    const pivot = WEAPON_PIVOT[unit.classId];
    const unitPx = (this.artTile * s) / 100; // 디자인 단위 하나의 화면 픽셀
    const weapon = this.add
      .image(pivot.x * unitPx, pivot.y * unitPx, this.atlas, weaponFrame(unit.side, unit.generalId))
      .setOrigin(UNIT_ORIGIN.x + pivot.x / UNIT_W, UNIT_ORIGIN.y + pivot.y / UNIT_H)
      .setScale(s);
    const rig = this.add.container(0, footY, [body, weapon]);
    rig.scaleX = unit.facing === 'left' ? -1 : 1;
    const barImage = (frame: string) => this.add.image(0, u * 0.44, this.atlas, frame).setOrigin(0, 0.5);
    const barBack = barImage(BAR_BACK_FRAME);
    const barGhost = barImage(BAR_FILL_FRAME).setTint(COLOR_GHOST);
    const barFill = barImage(BAR_FILL_FRAME).setTint(unit.side === 'ally' ? COLOR_ALLY : COLOR_ENEMY);
    const barScale = (u * 0.76) / barBack.width;
    for (const image of [barBack, barGhost, barFill]) image.setX((-barBack.width * barScale) / 2).setScale(barScale);
    const badge = unit.officer
      ? this.add.image(-u * 0.33, -u * 0.4, this.atlas, badgeFrame(unit.side, unit.generalId)).setDisplaySize(u * 0.36, u * 0.36)
      : null;
    const { victory } = this.controller.battle.map;
    const targetLabel =
      victory.type === 'unitDown' && victory.unitId === unit.id
        ? this.add
            .text(0, -u * 0.62, '목표', {
              fontFamily: FONT,
              fontSize: `${Math.round(u * 0.24)}px`,
              fontStyle: '800',
              color: '#ffe9a8',
              stroke: '#5a1410',
              strokeThickness: Math.max(2, u * 0.05),
            })
            .setOrigin(0.5)
        : null;
    const container = this.add
      .container(this.px(unit.x), this.px(unit.y), [foot, rig, barBack, barGhost, barFill, ...(badge ? [badge] : []), ...(targetLabel ? [targetLabel] : [])])
      .setDepth(DEPTH_UNIT);
    const view: UnitView = {
      container,
      rig,
      body,
      weapon,
      foot,
      barGhost,
      barFill,
      badge,
      maxTroops: unit.maxTroops,
      hp: { target: unit.troops, shown: unit.troops, ghost: unit.troops },
      side: unit.side,
      classId: unit.classId,
      phase: this.views.size * 1.37,
      facingLeft: unit.facing === 'left',
      turnTween: null,
      knockTween: null,
      acting: false,
    };
    this.views.set(unit.id, view);
    this.drawBar(view);
    this.syncUnit(unit, unit.troops);
  }

  private drawBar(view: UnitView): void {
    const crop = (image: Phaser.GameObjects.Image, value: number) =>
      image.setCrop(0, 0, (Math.max(0, value) / view.maxTroops) * image.width, image.height);
    crop(view.barFill, view.hp.shown);
    // 닳은 표시가 필요 없을 때는 그리지 않아 한 장이라도 줄인다
    view.barGhost.setVisible(view.hp.ghost > view.hp.shown);
    if (view.barGhost.visible) crop(view.barGhost, view.hp.ghost);
  }

  /** 병력 막대를 부드럽게 옮긴다. 닳은 부분은 흰색으로 남았다가 뒤따라 줄어든다. */
  private setHp(view: UnitView, troops: number): void {
    if (view.hp.target === troops) return;
    const healing = troops > view.hp.target;
    view.hp.target = troops;
    this.tweens.killTweensOf(view.hp);
    const redraw = () => this.drawBar(view);
    if (healing) {
      view.hp.ghost = troops;
      this.tweens.add({ targets: view.hp, shown: troops, duration: 320, ease: 'Sine.easeOut', onUpdate: redraw, onComplete: redraw });
      return;
    }
    this.tweens.add({ targets: view.hp, shown: troops, duration: 140, ease: 'Quad.easeOut', onUpdate: redraw });
    this.tweens.add({ targets: view.hp, ghost: troops, delay: 260, duration: 420, ease: 'Sine.easeInOut', onUpdate: redraw, onComplete: redraw });
  }

  private syncUnit(unit: Unit, troops: number): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    this.setHp(view, troops);
    const dim = unit.side === 'ally' && unit.acted;
    this.turn(view, unit.facing === 'left');
    const tint = dim ? 0x7d828c : 0xffffff;
    view.body.setTint(tint);
    view.weapon.setTint(tint);
    view.foot.setAlpha(dim ? 0.5 : 1);
    view.badge?.setAlpha(dim ? 0.65 : 1);
  }

  private flash(view: UnitView, on: boolean): void {
    const mode = on ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY;
    view.body.setTintMode(mode);
    view.weapon.setTintMode(mode);
    if (on) {
      view.body.setTint(0xffffff);
      view.weapon.setTint(0xffffff);
    }
  }

  /** 좌우로 몸을 돌린다. 뚝 뒤집히지 않고 짧게 돈다. */
  private turn(view: UnitView, left: boolean): void {
    if (view.facingLeft === left) return;
    view.facingLeft = left;
    view.turnTween?.stop();
    view.turnTween = this.tweens.add({ targets: view.rig, scaleX: left ? -1 : 1, duration: this.reduced ? 1 : 130, ease: 'Sine.easeInOut' });
  }

  private syncAll(): void {
    for (const unit of this.controller.battle.units) {
      if (unit.troops > 0) this.syncUnit(unit, unit.troops);
    }
  }

  /* ---------- 칸 표시 ---------- */

  private markTile(tile: Pos, color: number, alpha: number): void {
    let mark = this.tileMarks[this.tileMarksUsed];
    if (!mark) {
      mark = { image: this.add.image(0, 0, TILE_KEY).setScale(this.soft(1)).setDepth(DEPTH_OVERLAY), alpha };
      this.tileMarks.push(mark);
    }
    this.tileMarksUsed += 1;
    mark.alpha = alpha;
    mark.image.setPosition(this.px(tile.x), this.px(tile.y)).setTint(color).setAlpha(alpha).setVisible(true);
  }

  private clearTileMarks(): void {
    for (const mark of this.tileMarks) mark.image.setVisible(false);
    this.tileMarksUsed = 0;
  }

  /** 하이라이트, 커서, HUD를 현재 상태로 다시 그린다. */
  refresh(): void {
    const view = this.controller.view();
    this.clearTileMarks();
    const fill = (tiles: Pos[], color: number, alpha: number) => {
      for (const tile of tiles) this.markTile(tile, color, alpha);
    };
    fill(view.threatTiles, COLOR_THREAT, 0.5);
    fill(view.moveTiles, COLOR_MOVE, 0.92);
    fill(view.targetTiles, COLOR_TARGET, 1);
    fill(view.skillTiles, COLOR_SKILL, 1);
    fill(view.areaTiles, COLOR_AREA, 1);

    const selected = view.selectedId ? getUnit(this.controller.battle, view.selectedId) : null;
    if (selected && selected.troops > 0) {
      this.selectMark.setVisible(true).setPosition(this.px(selected.x), this.px(selected.y));
    } else {
      this.selectMark.setVisible(false);
    }
    this.cursorMark.setVisible(true);
    this.tweens.killTweensOf(this.cursorMark);
    this.tweens.add({
      targets: this.cursorMark,
      x: this.px(this.cursor.x),
      y: this.px(this.cursor.y),
      duration: this.reduced ? 1 : 110,
      ease: 'Cubic.easeOut',
    });
    this.syncAll();
    this.syncFires();
    this.host.refreshHud(this.cursor);
  }

  /** 불타는 칸의 그림을 현재 상태에 맞춘다. 화면을 다시 만들어도 이어진다. */
  private syncFires(): void {
    const { fires } = this.controller.battle;
    const alive = new Set(fires.map((fire) => `${fire.x},${fire.y}`));
    for (const [tile, view] of this.fireViews) {
      if (!alive.has(tile)) {
        view.sparks.destroy();
        view.root.destroy();
        this.fireViews.delete(tile);
      }
    }
    for (const fire of fires) {
      const tile = `${fire.x},${fire.y}`;
      if (!this.fireViews.has(tile)) this.fireViews.set(tile, this.createFire(fire.x, fire.y));
    }
  }

  private createFire(tileX: number, tileY: number): FireView {
    const u = this.unit;
    const x = this.px(tileX);
    const y = this.px(tileY);
    const glow = this.add
      .image(0, u * 0.15, SOFT_KEY)
      .setScale(this.soft(1.3))
      .setTint(0xff7a1e)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.45);
    const flames = [[-0.24, 0.42, 0.52], [0.24, 0.44, 0.56], [0, 0.46, 0.76]].map(([fx, fy, size]) => {
      const base = this.soft(size);
      return this.add
        .image(fx * u, fy * u, FLAME_KEY)
        .setOrigin(0.5, 1)
        .setScale(base)
        .setData('base', base);
    });
    const root = this.add.container(x, y, [glow, ...flames]).setDepth(DEPTH_FIRE);
    const sparks = this.add
      .particles(x, y + u * 0.2, SOFT_KEY, {
        frequency: this.reduced ? 2000 : 230,
        lifespan: { min: 500, max: 950 },
        speedY: { min: -u * 1.1, max: -u * 0.45 },
        speedX: { min: -u * 0.2, max: u * 0.2 },
        scale: { start: this.soft(0.11), end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffe08a, 0xff9a2e],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(DEPTH_LIGHT - 1);
    return { root, flames, glow, sparks };
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.host.onBusyChange(busy);
  }

  private async play(effects: Effect[]): Promise<void> {
    if (effects.length === 0) {
      this.refresh();
      this.finishIfEnded();
      return;
    }
    this.setBusy(true);
    this.clearTileMarks();
    this.selectMark.setVisible(false);
    this.cursorMark.setVisible(false);
    for (const effect of effects) {
      if (effect.type === 'move') {
        await this.focus(effect.path.slice(-1));
        await this.animatePath(effect.unitId, effect.path);
      }
      if (effect.type === 'snap') this.snapUnit(effect.unitId);
      if (effect.type === 'attack') {
        await this.focusEvents(effect.events);
        await this.animateAttack(effect.events);
      }
      if (effect.type === 'skill') {
        await this.focusSkill(effect.result);
        await this.animateSkill(effect.result);
      }
      if (effect.type === 'burn') await this.animateBurn(effect.events);
      if (effect.type === 'enemyPhase') await this.runEnemyPhase();
    }
    this.setBusy(false);
    const moved = effects.find((effect) => effect.type === 'move');
    if (moved?.type === 'move') this.cursor = moved.path[moved.path.length - 1] ?? this.cursor;
    this.refresh();
    this.finishIfEnded();
  }

  private focusEvents(events: DamageEvent[]): Promise<void> {
    const battle = this.controller.battle;
    return this.focus(events.flatMap((event) => [getUnit(battle, event.attackerId), getUnit(battle, event.defenderId)]), 0.8);
  }

  private focusSkill(result: SkillResult): Promise<void> {
    const battle = this.controller.battle;
    return this.focus([getUnit(battle, result.casterId), result.center, ...result.hits.map((hit) => getUnit(battle, hit.unitId))], 0.8);
  }

  private finishIfEnded(): void {
    if (this.controller.battle.phase === 'ended') this.host.showResult();
  }

  private snapUnit(unitId: string): void {
    const unit = getUnit(this.controller.battle, unitId);
    const view = this.views.get(unitId);
    view?.container.setPosition(this.px(unit.x), this.px(unit.y));
    this.cursor = { x: unit.x, y: unit.y };
  }

  /* ---------- 이동 ---------- */

  private async animatePath(unitId: string, path: Pos[]): Promise<void> {
    const view = this.views.get(unitId);
    if (!view) return;
    const steps = path.length - 1;
    const cavalry = view.classId === 'cavalry';
    const hop = this.unit * (cavalry ? 0.05 : 0.09);
    const stepMs = cavalry ? STEP_MS * 0.8 : STEP_MS;
    const foot = this.unit * FOOT_Y;
    let from = path[0];
    for (let index = 0; index < steps; index++) {
      const step = path[index + 1];
      if (step.x !== from.x) this.turn(view, step.x < from.x);
      from = step;
      const ease = steps === 1 ? 'Sine.easeInOut' : index === 0 ? 'Sine.easeIn' : index === steps - 1 ? 'Sine.easeOut' : 'Linear';
      const duration = index === 0 || index === steps - 1 ? stepMs * 1.2 : stepMs;
      this.dust.explode(2, view.container.x, view.container.y + foot);
      const walking = this.reduced
        ? Promise.resolve()
        : this.tween({ targets: view.rig, y: foot - hop, duration: duration / 2, ease: 'Sine.easeOut', yoyo: true });
      await Promise.all([
        walking,
        this.tween({ targets: view.container, x: this.px(step.x), y: this.px(step.y), duration, ease }),
      ]);
    }
    if (steps > 0) this.dust.explode(3, view.container.x, view.container.y + foot);
  }

  /** 걷거나 때리는 동안 잠깐 그쪽을 보게 한다. 끝난 뒤의 방향은 부대 데이터(facing)가 정한다. */
  private lookToward(view: UnitView, dx: number): void {
    if (dx !== 0) this.turn(view, dx < 0);
  }

  /* ---------- 공격 ---------- */

  private async animateAttack(events: DamageEvent[]): Promise<void> {
    for (const event of events) await this.animateStrike(event);
  }

  private async animateStrike(event: DamageEvent): Promise<void> {
    const battle = this.controller.battle;
    const attacker = getUnit(battle, event.attackerId);
    const defender = getUnit(battle, event.defenderId);
    const attackerView = this.views.get(event.attackerId);
    const defenderView = this.views.get(event.defenderId);
    if (!attackerView || !defenderView) return;

    this.lookToward(attackerView, defender.x - attacker.x);
    attackerView.acting = true;
    const recover = await this.playAttackMotion(attacker.classId, attackerView, defenderView);

    this.impact(defenderView, attackerView, event.amount);
    this.setHp(defenderView, event.defenderTroops);
    await this.wait(60); // 맞는 순간을 짧게 멈춰 묵직하게 보인다
    this.flash(defenderView, false);
    this.syncUnit(defender, event.defenderTroops);
    await recover();
    attackerView.acting = false;
    this.turn(attackerView, attacker.facing === 'left');
    await this.wait(90);

    if (event.defeated) await this.defeatView(event.defenderId, defenderView);
    else this.syncUnit(defender, event.defenderTroops);
  }

  /** 때리는 쪽이 앞으로 나가고 무기를 휘두른다. 맞는 순간에 끝나며, 돌아오는 동작을 돌려준다. */
  private async playAttackMotion(classId: string, attacker: UnitView, defender: UnitView): Promise<() => Promise<void>> {
    const from = attacker.container;
    const to = defender.container;
    const startX = from.x;
    const startY = from.y;
    const distance = Math.hypot(to.x - startX, to.y - startY) || 1;
    const dirX = (to.x - startX) / distance;
    const dirY = (to.y - startY) / distance;
    const u = this.unit;
    const moveTo = (tiles: number, duration: number, ease: string) =>
      this.tween({ targets: from, x: startX + dirX * u * tiles, y: startY + dirY * u * tiles, duration, ease });
    const back = (duration = 170) => () =>
      Promise.all([
        this.tween({ targets: from, x: startX, y: startY, duration, ease: 'Cubic.easeOut' }),
        this.tween({ targets: attacker.weapon, rotation: 0, duration, ease: 'Sine.easeOut' }),
      ]).then(() => undefined);

    if (classId === 'archer') {
      await Promise.all([
        moveTo(-0.07, 130, 'Sine.easeOut'),
        this.tween({ targets: attacker.weapon, x: attacker.weapon.x - u * 0.05, duration: 130, yoyo: true, hold: 40, ease: 'Sine.easeOut' }),
      ]);
      await this.flyArrow(from.x, from.y - u * 0.05, to.x, to.y - u * 0.05);
      return back(120);
    }
    if (classId === 'spear') {
      await Promise.all([
        moveTo(-0.08, 110, 'Sine.easeOut'),
        this.tween({ targets: attacker.weapon, rotation: 0.55, duration: 110, ease: 'Sine.easeOut' }),
      ]);
      await Promise.all([
        moveTo(0.3, 80, 'Cubic.easeIn'),
        this.tween({ targets: attacker.weapon, rotation: 0.9, duration: 80, ease: 'Cubic.easeIn' }),
      ]);
      this.streak(from.x, from.y, to.x, to.y);
      return back();
    }
    if (classId === 'cavalry') {
      await Promise.all([
        moveTo(-0.14, 130, 'Sine.easeOut'),
        this.tween({ targets: attacker.weapon, rotation: -0.7, duration: 130, ease: 'Sine.easeOut' }),
      ]);
      this.dust.explode(5, from.x, from.y + u * FOOT_Y);
      await moveTo(0.62, 110, 'Cubic.easeIn');
      await this.tween({ targets: attacker.weapon, rotation: 1.25, duration: 70, ease: 'Cubic.easeIn' });
      this.slashArc(to.x, to.y, dirX);
      return back(210);
    }
    await Promise.all([
      moveTo(-0.08, 110, 'Sine.easeOut'),
      this.tween({ targets: attacker.weapon, rotation: -0.8, duration: 110, ease: 'Sine.easeOut' }),
    ]);
    await moveTo(0.34, 85, 'Cubic.easeIn');
    await this.tween({ targets: attacker.weapon, rotation: 1.45, duration: 65, ease: 'Cubic.easeIn' });
    this.slashArc(to.x, to.y, dirX);
    return back();
  }

  private async flyArrow(x0: number, y0: number, x1: number, y1: number): Promise<void> {
    const u = this.unit;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const arc = dist * 0.22;
    const arrow = this.add
      .image(x0, y0, ARROW_KEY)
      .setScale((u * 0.62) / FX_TEXTURE_SIZE)
      .setDepth(DEPTH_FX);
    const trail = this.add
      .image(x0, y0, STREAK_KEY)
      .setScale((u * 0.7) / FX_TEXTURE_SIZE, (u * 0.04) / 6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.65)
      .setDepth(DEPTH_FX - 1);
    const state = { t: 0 };
    const place = () => {
      const { t } = state;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * arc;
      const slope = (y1 - y0) / (dist || 1) - (Math.cos(t * Math.PI) * Math.PI * arc) / (dist || 1);
      const angle = Math.atan2(slope * dist, x1 - x0 || 0.0001);
      arrow.setPosition(x, y).setRotation(angle);
      trail.setPosition(x - Math.cos(angle) * u * 0.25, y - Math.sin(angle) * u * 0.25).setRotation(angle);
    };
    place();
    await this.tween({ targets: state, t: 1, duration: 110 + (dist / u) * 62, ease: 'Sine.easeIn', onUpdate: place });
    arrow.destroy();
    trail.destroy();
  }

  private streak(x0: number, y0: number, x1: number, y1: number): void {
    const u = this.unit;
    const line = this.add
      .image((x0 + x1) / 2, (y0 + y1) / 2, STREAK_KEY)
      .setRotation(Math.atan2(y1 - y0, x1 - x0))
      .setScale((Math.hypot(x1 - x0, y1 - y0) * 1.3) / FX_TEXTURE_SIZE, (u * 0.14) / 6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH_FX);
    this.tweens.add({ targets: line, alpha: 0, scaleY: 0.2, duration: 180, onComplete: () => line.destroy() });
  }

  private slashArc(x: number, y: number, dirX: number, color = 0xffffff): void {
    const size = this.soft(1.5);
    const arc = this.add
      .image(x, y - this.unit * 0.1, ARC_KEY)
      .setScale(size * 0.72)
      .setFlipX(dirX < 0)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH_FX);
    this.tweens.add({ targets: arc, scale: size, alpha: 0, duration: 230, ease: 'Cubic.easeOut', onComplete: () => arc.destroy() });
  }

  /** 맞는 순간의 효과: 번쩍임, 불꽃, 화면 흔들림, 뒤로 밀림, 숫자. */
  private impact(defender: UnitView, attacker: UnitView | null, amount: number): void {
    const { x, y } = defender.container;
    this.flash(defender, true);
    this.sparks.explode(12, x, y - this.unit * 0.1);
    this.ringBurst(x, y - this.unit * 0.05, 0xffe9b0, 1.05);
    if (!this.reduced) this.cameras.main.shake(130, 0.0045);
    const dx = attacker ? Math.sign(x - attacker.container.x) : 0;
    const dy = attacker ? Math.sign(y - attacker.container.y) : 0;
    const foot = this.unit * FOOT_Y;
    defender.knockTween?.stop();
    defender.rig.setPosition(0, foot);
    defender.knockTween = this.tweens.add({
      targets: defender.rig,
      x: dx * this.unit * 0.14,
      y: foot + dy * this.unit * 0.08,
      duration: 70,
      ease: 'Cubic.easeOut',
      yoyo: true,
      hold: 40,
      onComplete: () => defender.rig.setPosition(0, foot),
    });
    this.floatNumber(x, y, `-${amount}`, STROKE_DAMAGE, amount >= 250 ? 1.2 : 1);
  }

  private ringBurst(x: number, y: number, color: number, size: number): void {
    const ring = this.add
      .image(x, y, RING_KEY)
      .setScale(this.soft(size * 0.4))
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH_FX);
    this.tweens.add({ targets: ring, scale: this.soft(size * 1.3), alpha: 0, duration: 300, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  private async defeatView(unitId: string, view: UnitView): Promise<void> {
    const { x, y } = view.container;
    this.smoke.explode(7, x, y);
    this.views.delete(unitId);
    await Promise.all([
      this.tween({ targets: view.rig, rotation: view.facingLeft ? 0.85 : -0.85, y: view.rig.y + this.unit * 0.06, duration: 300, ease: 'Quad.easeIn' }),
      this.tween({ targets: view.container, alpha: 0, duration: 360, delay: 60 }),
    ]);
    view.container.destroy();
  }

  /* ---------- 기술 ---------- */

  private async animateSkill(result: SkillResult): Promise<void> {
    const battle = this.controller.battle;
    const caster = getUnit(battle, result.casterId);
    const skill = battle.data.skills[result.skillId];
    const view = this.views.get(result.casterId);
    if (view) {
      this.lookToward(view, result.center.x - caster.x);
      this.skillLabel(view.container.x, view.container.y - this.unit * 0.72, skill.name);
      this.ringBurst(view.container.x, view.container.y + this.unit * FOOT_Y, skill.effect === 'heal' ? 0x8dffb7 : 0xc9a4ff, 1.5);
      view.acting = true;
      await Promise.all([
        this.tween({ targets: view.rig, y: this.unit * (FOOT_Y - 0.16), duration: 150, ease: 'Sine.easeOut', yoyo: true, hold: 60 }),
        this.tween({ targets: view.weapon, rotation: -0.55, duration: 170, ease: 'Sine.easeOut', yoyo: true, hold: 40 }),
      ]);
      view.acting = false;
    }

    await Promise.all(result.area.map((tile, index) => this.playSkillVisual(skill.visual, tile, index)));
    this.syncFires();

    await Promise.all(result.hits.map((hit) => this.showSkillHit(hit)));
    if (view) this.turn(view, caster.facing === 'left');
  }

  private async playSkillVisual(visual: SkillVisual, tile: Pos, index: number): Promise<void> {
    const u = this.unit;
    const x = this.px(tile.x);
    const y = this.px(tile.y);
    const delay = index * 45;
    if (delay > 0) await this.wait(delay);
    if (visual === 'fire') {
      const base = this.soft(1.15);
      const flame = this.add
        .image(x, y + u * 0.46, FLAME_KEY)
        .setOrigin(0.5, 1)
        .setScale(base * 0.8, 0)
        .setDepth(DEPTH_FX);
      const glow = this.add
        .image(x, y, SOFT_KEY)
        .setScale(this.soft(0.8))
        .setTint(0xff7a1e)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH_FX - 1);
      this.embers.explode(9, x, y + u * 0.2);
      this.tweens.add({ targets: glow, scale: this.soft(1.9), alpha: 0, duration: 460, ease: 'Cubic.easeOut', onComplete: () => glow.destroy() });
      await this.tween({ targets: flame, scaleY: base * 1.15, scaleX: base, duration: 200, ease: 'Back.easeOut' });
      await this.tween({ targets: flame, alpha: 0, scaleY: base * 1.4, duration: 240, ease: 'Sine.easeIn' });
      flame.destroy();
    } else if (visual === 'rock') {
      const size = this.soft(0.8);
      const rock = this.add
        .image(x + u * 0.35, y - u * 2.4, ROCK_KEY)
        .setScale(size)
        .setRotation(-0.6)
        .setDepth(DEPTH_FX);
      const shadow = this.add.image(x, y + u * 0.2, SOFT_KEY).setScale(this.soft(0.2), this.soft(0.08)).setTint(0x05101c).setAlpha(0.2).setDepth(DEPTH_OVERLAY + 2);
      this.tweens.add({ targets: shadow, scaleX: this.soft(0.9), scaleY: this.soft(0.32), alpha: 0.65, duration: 300, ease: 'Quad.easeIn' });
      await this.tween({ targets: rock, x, y, rotation: 0.5, duration: 300, ease: 'Quad.easeIn' });
      if (!this.reduced) this.cameras.main.shake(170, 0.008);
      this.dust.explode(12, x, y + u * 0.2);
      this.smoke.explode(4, x, y);
      this.ringBurst(x, y + u * 0.15, 0xffe9c8, 1.3);
      await this.tween({ targets: [rock, shadow], alpha: 0, duration: 200, delay: 60 });
      rock.destroy();
      shadow.destroy();
    } else if (visual === 'heal') {
      this.healMotes.explode(9, x, y + u * 0.2);
      const base = this.soft(0.42);
      const sign = this.add
        .image(x, y, CROSS_KEY)
        .setScale(base * 0.4)
        .setTint(0x8dffb7)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH_FX);
      const ring = this.add
        .image(x, y + u * FOOT_Y, RING_KEY)
        .setScale(this.soft(0.5), this.soft(0.2))
        .setTint(0x6dffa5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH_FX - 1);
      this.tweens.add({ targets: ring, scaleX: this.soft(1.2), scaleY: this.soft(0.5), alpha: 0, duration: 520, onComplete: () => ring.destroy() });
      await this.tween({ targets: sign, scale: base, duration: 170, ease: 'Back.easeOut' });
      await this.tween({ targets: sign, y: y - u * 0.5, alpha: 0, duration: 330, ease: 'Sine.easeIn' });
      sign.destroy();
    } else if (visual === 'arrow') {
      await this.flyArrow(x - u * 0.9, y - u * 2.4, x, y);
      this.sparks.explode(6, x, y);
      this.dust.explode(4, x, y + u * 0.2);
    } else {
      this.slashArc(x, y, 1, 0xffd86b);
      this.sparks.explode(6, x, y);
      await this.wait(250);
    }
  }

  private skillLabel(x: number, y: number, name: string): void {
    const label = this.add
      .text(x, y, name, {
        fontFamily: FONT,
        fontSize: `${Math.round(this.unit * 0.34)}px`,
        fontStyle: '800',
        color: '#ffe9a8',
        stroke: STROKE_SKILL,
        strokeThickness: Math.max(3, this.unit * 0.07),
      })
      .setOrigin(0.5)
      .setScale(0.5)
      .setAlpha(0)
      .setDepth(DEPTH_TEXT);
    const edge = label.width / 2;
    label.x = Math.min(this.worldW - edge, Math.max(edge, x));
    label.y = Math.max(label.height / 2, y);
    this.tweens.add({ targets: label, scale: 1, alpha: 1, duration: 170, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, y: label.y - this.unit * 0.25, alpha: 0, delay: 620, duration: 240, ease: 'Sine.easeIn', onComplete: () => label.destroy() });
  }

  private async showSkillHit(hit: SkillHit): Promise<void> {
    const unit = getUnit(this.controller.battle, hit.unitId);
    const view = this.views.get(hit.unitId);
    if (!view) return;
    const healed = hit.effect === 'heal';
    this.setHp(view, hit.troops);
    if (healed) {
      this.floatNumber(view.container.x, view.container.y, `+${hit.amount}`, STROKE_HEAL);
      this.syncUnit(unit, hit.troops);
      await this.wait(160);
      return;
    }
    this.impact(view, null, hit.amount);
    await this.wait(90);
    this.flash(view, false);
    this.syncUnit(unit, hit.troops);
    await this.wait(130);
    if (hit.defeated) await this.defeatView(hit.unitId, view);
  }

  /** 불타는 칸에서 턴을 시작한 부대의 피해를 보여 준다. */
  private async animateBurn(events: BurnEvent[]): Promise<void> {
    if (events.length === 0) return;
    const battle = this.controller.battle;
    for (const event of events) {
      const view = this.views.get(event.unitId);
      if (!view) continue;
      this.embers.explode(6, view.container.x, view.container.y);
      this.floatNumber(view.container.x, view.container.y, `-${event.amount}`, STROKE_DAMAGE);
      this.syncUnit(getUnit(battle, event.unitId), event.troops);
    }
    await this.wait(380);
  }

  /** 튀어 오르는 숫자. 처음에 크게 나타났다가 자리를 잡고 위로 사라진다. */
  private floatNumber(x: number, y: number, text: string, stroke: string, emphasis = 1): void {
    const size = Math.round(this.unit * 0.38 * emphasis);
    const label = this.add
      .text(x, y - this.unit * 0.2, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: '900',
        color: '#ffffff',
        stroke,
        strokeThickness: Math.max(3, size * 0.17),
      })
      .setOrigin(0.5)
      .setScale(0.3)
      .setDepth(DEPTH_TEXT);
    const edge = label.width / 2;
    label.x = Math.min(this.worldW - edge, Math.max(edge, label.x));
    this.tweens.add({ targets: label, scale: 1, y: label.y - this.unit * 0.3, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, y: label.y - this.unit * 0.72, alpha: 0, delay: 430, duration: 300, ease: 'Sine.easeIn', onComplete: () => label.destroy() });
  }

  /* ---------- 안내 띠 ---------- */

  private banner(title: string, subtitle: string, color: string, hold: number): Promise<void> {
    const { width, height } = this.scale;
    const u = this.unit;
    const y = height * 0.44;
    const bandHeight = u * (subtitle ? 2.1 : 1.6);
    const band = this.add
      .image(width / 2, y, BAND_KEY)
      .setDisplaySize(width * 1.1, bandHeight)
      .setScrollFactor(0)
      .setDepth(DEPTH_BANNER);
    const maxWidth = width * 0.88;
    const heading = this.add
      .text(0, subtitle ? -u * 0.2 : 0, title, {
        fontFamily: FONT,
        fontSize: `${Math.round(u * (subtitle ? 0.58 : 0.72))}px`,
        fontStyle: '900',
        color,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    if (heading.width > maxWidth) heading.setScale(maxWidth / heading.width);
    const parts: Phaser.GameObjects.GameObject[] = [heading];
    if (subtitle) {
      const small = this.add
        .text(0, u * 0.42, subtitle, {
          fontFamily: FONT,
          fontSize: `${Math.round(u * 0.27)}px`,
          fontStyle: '600',
          color: '#d9dee6',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      if (small.width > maxWidth) small.setScale(maxWidth / small.width);
      parts.push(small);
    }
    const text = this.add.container(width / 2 - u * 0.8, y, parts).setScrollFactor(0).setDepth(DEPTH_BANNER + 1).setAlpha(0);
    band.setAlpha(0).setScale(band.scaleX, band.scaleY * 0.4);
    const finalBandY = (bandHeight / FX_TEXTURE_SIZE);
    this.tweens.add({ targets: band, alpha: 1, scaleY: finalBandY, duration: 200, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: text, alpha: 1, x: width / 2, duration: 240, ease: 'Cubic.easeOut' });
    return new Promise((resolve) => {
      this.time.delayedCall(240 + hold, () => {
        this.tweens.add({ targets: band, alpha: 0, scaleY: finalBandY * 0.5, duration: 170, ease: 'Sine.easeIn' });
        this.tweens.add({
          targets: text,
          alpha: 0,
          x: width / 2 + u * 0.8,
          duration: 170,
          ease: 'Sine.easeIn',
          onComplete: () => {
            band.destroy();
            text.destroy(true);
            resolve();
          },
        });
      });
    });
  }

  /** 화 시작 연출: 어둠에서 밝아지고 이름과 목표를 띄운다. 조작을 막지 않는다. */
  private playIntro(): void {
    const { map } = this.controller.battle;
    this.cameras.main.fadeIn(360, 8, 12, 20);
    void this.banner(map.name, map.objective, '#ffe2a0', 1100);
  }

  /* ---------- 적 턴 ---------- */

  private async runEnemyPhase(): Promise<void> {
    const controller = this.controller;
    const battle = controller.battle;
    this.inEnemyPhase = true;
    this.setSpeed(this.enemySpeed);
    this.showEnemyMessage();
    await this.banner('적군 턴', '', '#ff9a7a', 260);
    // 싸우지 않고 이동만 하는 부대는 기다리지 않고 함께 움직여 적 턴이 길어지지 않게 한다
    const moving: Promise<void>[] = [];
    for (const enemy of livingUnits(battle, 'enemy')) {
      if (battle.phase !== 'enemy') break;
      if (enemy.troops <= 0) continue;
      const step = runEnemyUnit(battle, enemy.id);
      const fights = step.events.length > 0 || step.skill !== undefined;
      if (fights) {
        this.cursor = { x: enemy.x, y: enemy.y };
        await this.focus([...step.path.slice(-1), ...step.events.map((event) => getUnit(battle, event.defenderId)), ...(step.skill ? [step.skill.center] : [])], 0.8);
        await this.animatePath(enemy.id, step.path);
        if (step.skill) await this.animateSkill(step.skill);
        await this.animateAttack(step.events);
        await this.wait(70);
      } else if (step.path.length > 1) {
        if (this.inView(step.path[0]) || this.inView(enemy)) {
          moving.push(this.animatePath(enemy.id, step.path));
          await this.wait(45);
        } else {
          this.snapUnit(enemy.id);
          this.cursor = { x: enemy.x, y: enemy.y };
        }
      }
    }
    await Promise.all(moving);
    if (battle.phase === 'enemy') {
      const burns = endEnemyTurn(battle);
      this.syncFires();
      await this.animateBurn(burns);
      if (battle.result) {
        this.finishEnemyPhase();
        return;
      }
      controller.onAllyTurnStart();
      const leader = livingUnits(battle, 'ally').find((unit) => !unit.acted);
      if (leader) {
        this.cursor = { x: leader.x, y: leader.y };
        await this.focus([leader], 2);
      }
      this.syncAll();
      this.finishEnemyPhase();
      await this.banner('아군 턴', '', '#9fd8ff', 260);
      return;
    }
    this.finishEnemyPhase();
  }

  private showEnemyMessage(): void {
    this.controller.setMessage(
      this.enemySpeed === FAST_FORWARD ? '적군 턴을 빠르게 넘기는 중입니다. 화면을 누르면 보통 속도로 돌아옵니다.' : '적군이 움직이고 있습니다. 화면을 누르면 빠르게 넘어갑니다.',
    );
    this.host.refreshHud(this.cursor);
  }

  private finishEnemyPhase(): void {
    this.inEnemyPhase = false;
    this.setSpeed(1);
  }
}
