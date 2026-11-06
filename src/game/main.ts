import * as Phaser from 'phaser';
import { createBattle, isBurning, SPIRIT_MAX, unitAt } from '../core/battle';
import { episodes, gameData } from '../gameData';
import type { Pos } from '../core/types';
import { BattleController, type SkillOption } from '../ui/controller';
import {
  browserStorage,
  isUnlocked,
  loadProgress,
  recordClear,
  saveProgress,
  startingEpisode,
} from '../ui/progress';
import { BattleScene, SCENE_KEY, type SceneHost } from './BattleScene';
import { paintPortrait, paintTerrainIcon, TILE } from './textures';
import { goalTile } from '../core/battle';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = el<HTMLElement>('stage');
const hud = {
  turn: el('turn'),
  objective: el('objective'),
  unitInfo: el('unit-info'),
  message: el('message'),
  attack: el<HTMLButtonElement>('btn-attack'),
  wait: el<HTMLButtonElement>('btn-wait'),
  cancel: el<HTMLButtonElement>('btn-cancel'),
  end: el<HTMLButtonElement>('btn-end'),
  endLabel: el('btn-end-label'),
  skill: el<HTMLButtonElement>('btn-skill'),
  infoMain: el('info-main'),
  skillList: el('skill-list'),
  menuButton: el<HTMLButtonElement>('btn-menu'),
  mapButton: el<HTMLButtonElement>('btn-map'),
  mapView: el('mapview'),
  mapCanvas: el<HTMLCanvasElement>('mapview-canvas'),
  menu: el('menu'),
  menuCurrent: el('menu-current'),
  resume: el<HTMLButtonElement>('btn-resume'),
  retry: el<HTMLButtonElement>('btn-retry'),
  episodeList: el('episode-list'),
  next: el<HTMLButtonElement>('btn-next'),
  resultMenu: el<HTMLButtonElement>('btn-result-menu'),
  result: el('result'),
  resultCard: el('result-card'),
  resultTitle: el('result-title'),
  resultDetail: el('result-detail'),
  restart: el<HTMLButtonElement>('btn-restart'),
};

const storage = browserStorage();
let progress = loadProgress(storage, episodes.length);
let episodeIndex = startingEpisode(progress, episodes.length);

const newController = () => new BattleController(createBattle(gameData, episodes[episodeIndex]));

let controller = newController();
let busy = false;

/** 칸 크기의 기준. 이 넓이가 맵 영역을 꽉 채운다. 더 큰 맵은 같은 칸 크기로 끌어서 본다. */
const BASE_COLS = 10;
const BASE_ROWS = 13;

/** 칸 크기 배율. 그림이 벡터 기반이라 어떤 배율에서도 매끈하다. */
function computeScale(): number {
  const dpr = window.devicePixelRatio || 1;
  const area = stage.getBoundingClientRect();
  return Math.min((area.width * dpr) / (BASE_COLS * TILE), (area.height * dpr) / (BASE_ROWS * TILE));
}

let scale = computeScale();

/** 캔버스 크기(기기 픽셀). 맵이 크면 맵 영역을 꽉 채우고, 작으면 맵 크기에 맞춘다. */
function canvasPixels(): { width: number; height: number } {
  const dpr = window.devicePixelRatio || 1;
  const area = stage.getBoundingClientRect();
  const tile = TILE * scale;
  const { width, height } = controller.battle;
  return {
    width: Math.round(Math.min(width * tile, Math.max(BASE_COLS * tile, area.width * dpr))),
    height: Math.round(Math.min(height * tile, Math.max(BASE_ROWS * tile, area.height * dpr))),
  };
}

function applyCanvasSize(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const size = canvasPixels();
  canvas.style.width = `${size.width / dpr}px`;
  canvas.style.height = `${size.height / dpr}px`;
}

function resizeCanvas(): void {
  const size = canvasPixels();
  if (game.scale.width !== size.width || game.scale.height !== size.height) game.scale.resize(size.width, size.height);
  applyCanvasSize(game.canvas);
}

function refreshHud(cursor: Pos): void {
  const battle = controller.battle;
  const view = controller.view();
  const phaseText = battle.phase === 'enemy' ? '적군 턴' : battle.phase === 'ally' ? '아군 턴' : '전투 종료';
  const { victory } = battle.map;
  const turnText = victory.type === 'survive' || victory.type === 'hold' ? `${Math.min(battle.turn, victory.turns)}/${victory.turns}턴` : `${battle.turn}턴`;
  hud.turn.innerHTML = `<span>${turnText}</span><span class="turn-phase"> · ${phaseText}</span>`;
  // 10턴이 넘는 화는 턴 숫자가 길어 좁은 화면에서 승패 조건을 밀어낸다
  hud.turn.classList.toggle('turn-long', 'turns' in victory && victory.turns >= 10);
  hud.turn.dataset.phase = battle.phase;
  hud.objective.textContent = battle.map.objective;

  const terrainId = battle.tiles[cursor.y][cursor.x];
  const unit = (view.selectedId && unitAtId(view.selectedId)) || unitAt(battle, cursor.x, cursor.y);
  if (unit) {
    const cls = battle.data.classes[unit.classId];
    const standing = battle.data.terrain[battle.tiles[unit.y][unit.x]];
    const range = cls.range.min === cls.range.max ? `${cls.range.min}` : `${cls.range.min}~${cls.range.max}`;
    drawPortrait(`unit-${unit.side}-${unit.generalId}`, unit.side, (ctx, size) => paintPortrait(ctx, unit.side, unit.classId, unit.generalId, size));
    setInfo(
      `<div class="unit-title"><span class="unit-name ${unit.side}">${unit.name}</span><span class="unit-class">${cls.name}</span></div>` +
        `<div class="meter ${unit.side}" data-meter="troops"><span class="meter-label">병력</span><span class="meter-bar"><i></i></span><span class="meter-num"></span></div>` +
        (unit.skills.length > 0
          ? `<div class="meter spirit" data-meter="spirit"><span class="meter-label">기력</span><span class="meter-bar"><i></i></span><span class="meter-num"></span></div>`
          : '') +
        `<div class="unit-stats"><span>파워 <b>${unit.power}</b></span><span>가드 <b>${unit.guard}</b></span><span>이동 <b>${cls.move}</b></span><span>사거리 <b>${range}${cls.range.pattern === 'line' ? ' 직선' : ''}</b></span><span>${terrainLabel(standing.name, standing.damageTaken, true)}</span></div>` +
        `<div class="unit-trait">${cls.trait}</div>`,
    );
    setMeter('troops', unit.troops, unit.maxTroops);
    setMeter('spirit', unit.spirit, SPIRIT_MAX);
  } else {
    const terrain = battle.data.terrain[terrainId];
    drawPortrait(`terrain-${terrainId}`, 'none', (ctx, size) => paintTerrainIcon(ctx, terrainId, size));
    setInfo(
      `<div class="unit-title"><span class="unit-name">${terrain.name}</span><span class="unit-class">지형</span></div>` +
        `<div class="unit-stats"><span>${terrainLabel(terrain.name, terrain.damageTaken)}</span>${isBurning(battle, cursor.x, cursor.y) ? '<span class="burning">불타는 중</span>' : ''}</div>`,
    );
  }
  hud.message.textContent = view.message;
  renderSkillList(view.skillOptions);

  const locked = busy || battle.phase !== 'ally';
  hud.attack.disabled = locked || !view.canAttack;
  hud.wait.disabled = locked || !view.canWait;
  hud.cancel.disabled = locked || !view.canCancel;
  hud.end.disabled = locked || !view.canEndTurn;
  hud.end.hidden = view.showSkillButton;
  hud.skill.hidden = !view.showSkillButton;
  hud.skill.disabled = locked || !view.canSkill;
  hud.menuButton.disabled = busy;
  hud.mapButton.hidden = !scene()?.canPan;
  hud.mapButton.disabled = busy;
  hud.end.classList.toggle('confirm', view.confirmEnd);
  hud.endLabel.textContent = view.confirmEnd ? '정말 종료' : '턴 종료';
}

/** 구조가 같으면 그대로 두어 막대가 부드럽게 움직이게 한다. */
let infoHtml = '';
function setInfo(html: string): void {
  if (html === infoHtml) return;
  infoHtml = html;
  hud.unitInfo.innerHTML = html;
}

function setMeter(name: string, value: number, max: number): void {
  const meter = hud.unitInfo.querySelector<HTMLElement>(`[data-meter="${name}"]`);
  if (!meter) return;
  meter.querySelector('i')!.style.transform = `scaleX(${Math.max(0, Math.min(1, value / max))})`;
  meter.querySelector('.meter-num')!.textContent = name === 'troops' ? `${value}/${max}` : `${value}`;
}

/** 기술 목록은 내용이 바뀔 때만 새로 만든다. 키보드 포커스를 잃지 않기 위함이다. */
let skillListKey = '';
function renderSkillList(options: SkillOption[] | null): void {
  hud.infoMain.hidden = options !== null;
  hud.skillList.hidden = options === null;
  const nextKey = JSON.stringify(options);
  if (nextKey === skillListKey) return;
  skillListKey = nextKey;
  hud.skillList.replaceChildren(
    ...(options ?? []).map((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.skill = option.id;
      button.disabled = option.blocked !== null;
      const name = document.createElement('span');
      name.className = 'skill-name';
      name.textContent = option.name;
      const key = document.createElement('kbd');
      key.textContent = String(index + 1);
      name.append(key);
      const detail = document.createElement('span');
      detail.className = 'skill-detail';
      detail.textContent = option.blocked ?? `${option.kindLabel} · 기력 ${option.cost}`;
      button.append(name, detail);
      return button;
    }),
  );
}

function terrainLabel(name: string, damageTaken: number, short = false): string {
  const reduction = Math.round((1 - damageTaken) * 100);
  if (reduction <= 0) return name;
  return short ? `${name} -${reduction}%` : `${name} (받는 피해 -${reduction}%)`;
}

// 정보 패널의 그림. 내용이 바뀔 때만 다시 그린다.
const portrait = el<HTMLCanvasElement>('portrait');
let portraitKey = '';
function drawPortrait(key: string, side: string, paint: (ctx: CanvasRenderingContext2D, size: number) => void): void {
  if (key === portraitKey) return;
  portraitKey = key;
  portrait.dataset.side = side;
  const ctx = portrait.getContext('2d')!;
  ctx.clearRect(0, 0, portrait.width, portrait.height);
  paint(ctx, portrait.width);
}

function unitAtId(id: string) {
  return controller.battle.units.find((unit) => unit.id === id && unit.troops > 0);
}

function showResult(): void {
  const battle = controller.battle;
  const won = battle.result === 'victory';
  if (won) {
    progress = recordClear(progress, episodeIndex);
    saveProgress(storage, progress);
  }
  const allies = battle.units.filter((unit) => unit.side === 'ally');
  const left = allies.reduce((sum, unit) => sum + unit.troops, 0);
  const total = allies.reduce((sum, unit) => sum + unit.maxTroops, 0);
  const hasNext = won && episodeIndex + 1 < episodes.length;
  const finished = won && !hasNext;
  hud.resultTitle.textContent = won ? `${battle.map.name} 승리` : `${battle.map.name} 패배`;
  // 병력이 남았는데 졌다면 깃발 칸을 빼앗긴 것이다
  const leaderAlive = battle.units.some((unit) => unit.id === battle.map.defeat.unitId && unit.troops > 0);
  const goalLost = !won && battle.map.victory.type === 'hold' && leaderAlive;
  hud.resultDetail.textContent =
    `남은 아군 병력 ${left}/${total}` + (finished ? ' · 마지막 화까지 모두 끝냈습니다.' : goalLost ? ' · 적이 깃발 칸을 차지했습니다.' : '');
  hud.resultCard.classList.toggle('defeat', !won);
  hud.next.hidden = !hasNext;
  hud.restart.classList.toggle('secondary', hasNext);
  hud.result.hidden = false;
  (hasNext ? hud.next : hud.restart).focus();
}

function startEpisode(index: number): void {
  episodeIndex = index;
  hud.result.hidden = true;
  hud.menu.hidden = true;
  controller = newController();
  busy = false;
  closeMap();
  resizeCanvas();
  scene().scene.restart({ host, intro: true });
}

const restart = (): void => startEpisode(episodeIndex);
const goNext = (): void => startEpisode(episodeIndex + 1);

function openMenu(): void {
  if (busy) return;
  const ended = controller.battle.phase === 'ended';
  hud.result.hidden = true;
  hud.menuCurrent.textContent = controller.battle.map.name;
  hud.resume.hidden = ended;
  hud.episodeList.replaceChildren(
    ...episodes.map((map, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      const unlocked = isUnlocked(progress, index);
      button.disabled = !unlocked;
      button.textContent = map.name;
      const state = document.createElement('span');
      const done = index < progress.cleared;
      state.className = `episode-state ${done ? 'done' : unlocked ? 'open' : 'locked'}`;
      state.textContent = done ? '완료' : unlocked ? '도전 가능' : '잠김';
      button.append(state);
      button.addEventListener('click', () => startEpisode(index));
      return button;
    }),
  );
  hud.menu.hidden = false;
  (ended ? hud.retry : hud.resume).focus();
  hud.episodeList.children[Math.min(episodeIndex, episodes.length - 1)]?.scrollIntoView({ block: 'center' });
}

function closeMenu(): void {
  hud.menu.hidden = true;
  if (controller.battle.phase === 'ended') showResult();
}

/* 전체 지도 */

function drawMap(): void {
  const current = scene();
  const battle = controller.battle;
  const dpr = window.devicePixelRatio || 1;
  const area = stage.getBoundingClientRect();
  const cell = Math.max(4, Math.floor(Math.min(((area.width - 18) * dpr) / battle.width, ((area.height - 58) * dpr) / battle.height)));
  const canvas = hud.mapCanvas;
  canvas.width = battle.width * cell;
  canvas.height = battle.height * cell;
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
  const ctx = canvas.getContext('2d')!;
  const image = current.backdropImage;
  if (image) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,12,20,0.22)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const dot = (x: number, y: number, radius: number, fill: string, ring = 'rgba(10,14,22,0.9)') => {
    ctx.beginPath();
    ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, cell * 0.08);
    ctx.strokeStyle = ring;
    ctx.stroke();
  };
  const { victory } = battle.map;
  const goal = goalTile(battle.map);
  if (goal) {
    const half = cell * 0.46;
    const cx = (goal.x + 0.5) * cell;
    const cy = (goal.y + 0.5) * cell;
    ctx.beginPath();
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx + half, cy);
    ctx.lineTo(cx, cy + half);
    ctx.lineTo(cx - half, cy);
    ctx.closePath();
    ctx.fillStyle = '#ffd65a';
    ctx.fill();
    ctx.lineWidth = Math.max(1, cell * 0.08);
    ctx.strokeStyle = '#3a2a10';
    ctx.stroke();
  }
  for (const unit of battle.units) {
    if (unit.troops <= 0) continue;
    const target = victory.type === 'unitDown' && victory.unitId === unit.id;
    const radius = cell * (unit.officer ? 0.36 : 0.27);
    dot(unit.x, unit.y, radius, unit.side === 'ally' ? '#4fb6ff' : '#ff8b3d', target ? '#ffd65a' : undefined);
  }
  const view = current.viewTiles;
  ctx.lineWidth = Math.max(2, cell * 0.12);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeRect(view.x * cell, view.y * cell, view.w * cell, view.h * cell);
}

function openMap(): void {
  if (busy || hud.mapButton.hidden) return;
  drawMap();
  hud.mapView.hidden = false;
}

function closeMap(): void {
  hud.mapView.hidden = true;
}

hud.mapButton.addEventListener('click', () => (hud.mapView.hidden ? openMap() : closeMap()));
hud.mapView.addEventListener('click', (event) => {
  const rect = hud.mapCanvas.getBoundingClientRect();
  const fx = (event.clientX - rect.left) / rect.width;
  const fy = (event.clientY - rect.top) / rect.height;
  if (fx >= 0 && fy >= 0 && fx <= 1 && fy <= 1) {
    const { width, height } = controller.battle;
    scene().jumpTo({ x: Math.min(width - 1, Math.floor(fx * width)), y: Math.min(height - 1, Math.floor(fy * height)) });
  }
  closeMap();
});

const host: SceneHost = {
  controller: () => controller,
  scale: () => scale,
  refreshHud,
  showResult,
  onBusyChange: (value) => {
    busy = value;
    refreshHud(scene().cursorPos);
  },
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: stage,
  width: canvasPixels().width,
  height: canvasPixels().height,
  backgroundColor: '#0b1017',
  antialias: true,
  // 경계 부드럽게 처리(MSAA)는 큰 화면에서 비싸고, 그림 가장자리는 이미 텍스처에서 부드럽다
  antialiasGL: false,
  powerPreference: 'high-performance',
  banner: false,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.NONE },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  scene: [],
});

function scene(): BattleScene {
  return game.scene.getScene(SCENE_KEY) as BattleScene;
}

game.events.once(Phaser.Core.Events.READY, () => {
  game.scene.add(SCENE_KEY, BattleScene, true, { host, intro: true });
  applyCanvasSize(game.canvas);
  bindPointer(game.canvas);
});

function bindPointer(canvas: HTMLCanvasElement): void {
  let down: { x: number; y: number; lastX: number; lastY: number; dragging: boolean } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, dragging: false };
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!down || !scene().canPan) return;
    // 조금 움직인 것은 손 떨림으로 보고, 그 이상부터 맵을 끈다
    if (!down.dragging && Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 12) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = game.scale.width / rect.width;
    scene().panBy((down.lastX - event.clientX) * ratio, (down.lastY - event.clientY) * ratio);
    down.dragging = true;
    down.lastX = event.clientX;
    down.lastY = event.clientY;
  });
  canvas.addEventListener('pointerup', (event) => {
    const start = down;
    down = null;
    if (!start || start.dragging) return;
    // 손가락이 많이 움직였다면 탭이 아니다
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 24) return;
    const rect = canvas.getBoundingClientRect();
    scene().tapAt((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  });
  canvas.addEventListener('pointercancel', () => {
    down = null;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

hud.attack.addEventListener('click', () => scene().pressAttack());
hud.wait.addEventListener('click', () => scene().dispatch((c) => c.pressWait()));
hud.cancel.addEventListener('click', () => scene().dispatch((c) => c.pressCancel()));
hud.end.addEventListener('click', () => scene().dispatch((c) => c.pressEndTurn()));
hud.skill.addEventListener('click', () => scene().pressSkill());
hud.skillList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-skill]');
  if (button && !button.disabled) scene().chooseSkill(button.dataset.skill!);
});
hud.restart.addEventListener('click', restart);
hud.next.addEventListener('click', goNext);
hud.resultMenu.addEventListener('click', openMenu);
hud.menuButton.addEventListener('click', openMenu);
hud.resume.addEventListener('click', closeMenu);
hud.retry.addEventListener('click', restart);

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

window.addEventListener('keydown', (event) => {
  if (!hud.menu.hidden) {
    // Enter는 포커스된 버튼이 처리한다.
    if (event.key === 'Escape') closeMenu();
    return;
  }
  if (!hud.result.hidden) return;
  const current = scene();
  if (!current) return;
  if (event.key === 'm' || event.key === 'M') {
    if (hud.mapView.hidden) openMap();
    else closeMap();
    return;
  }
  if (!hud.mapView.hidden) {
    if (event.key === 'Escape') closeMap();
    return;
  }
  const arrow = ARROWS[event.key];
  if (arrow) {
    event.preventDefault();
    current.moveCursor(arrow[0], arrow[1]);
    return;
  }
  switch (event.key) {
    case 'Enter':
    case ' ':
      event.preventDefault();
      current.tap(current.cursorPos.x, current.cursorPos.y);
      break;
    case 'a':
    case 'A':
      current.pressAttack();
      break;
    case 's':
    case 'S':
      current.pressSkill();
      break;
    case '1':
    case '2':
    case '3':
    case '4': {
      const option = controller.view().skillOptions?.[Number(event.key) - 1];
      if (option) current.chooseSkill(option.id);
      break;
    }
    case 'w':
    case 'W':
      current.dispatch((c) => c.pressWait());
      break;
    case 'Escape':
    case 'Backspace':
      event.preventDefault();
      current.dispatch((c) => c.pressCancel());
      break;
    case 'e':
    case 'E':
      current.dispatch((c) => c.pressEndTurn());
      break;
  }
});

// 개발 서버와 시험용 빌드(VITE_DEBUG_HOOKS=1)에서만 켜지는 디버그용 조회 창구. 일반 빌드 결과물에는 들어가지 않는다.
if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_HOOKS === '1') {
  (window as unknown as { __debug: unknown }).__debug = {
    controller: () => controller,
    busy: () => busy,
    scale: () => scale,
    game,
    startEpisode,
    progress: () => progress,
  };

  // ?mirror=1: 일부 안드로이드 에뮬레이터는 WebGL 캔버스를 화면에 표시하지 못하고, drawImage 로 복사해도 검게 나온다.
  // gl.readPixels 는 정상 값을 돌려주므로, 매 프레임 픽셀을 읽어 소프트웨어 2D 캔버스에 올려 보여 준다.
  // 터치는 아래의 원래 캔버스로 그대로 전달된다.
  if (new URLSearchParams(location.search).has('mirror')) {
    const mirror = document.createElement('canvas');
    mirror.style.cssText = 'position:fixed;pointer-events:none';
    hud.result.before(mirror); // 결과 카드보다 아래 층에 놓는다
    const context = mirror.getContext('2d', { willReadFrequently: true })!;
    let image: ImageData | null = null;
    let row = new Uint8ClampedArray(0);
    game.events.on(Phaser.Core.Events.POST_RENDER, () => {
      const gl = (game.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
      if (!gl) return;
      const { width, height } = game.canvas;
      if (!image || image.width !== width || image.height !== height) {
        mirror.width = width;
        mirror.height = height;
        image = context.createImageData(width, height);
        row = new Uint8ClampedArray(width * 4);
      }
      const pixels = image.data;
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      // WebGL 은 아래쪽 줄부터 돌려주므로 위아래를 뒤집는다.
      const stride = width * 4;
      for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
        const a = top * stride;
        const b = bottom * stride;
        row.set(pixels.subarray(a, a + stride));
        pixels.copyWithin(a, b, b + stride);
        pixels.set(row, b);
      }
      context.putImageData(image, 0, 0);
      const rect = game.canvas.getBoundingClientRect();
      mirror.style.left = `${rect.left}px`;
      mirror.style.top = `${rect.top}px`;
      mirror.style.width = `${rect.width}px`;
      mirror.style.height = `${rect.height}px`;
    });
  }
}

// 화면 크기가 바뀌어 배율이 달라지면, 전투 상태는 그대로 두고 화면만 다시 만든다.
let resizePending = 0;
function onResize(): void {
  window.clearTimeout(resizePending);
  resizePending = window.setTimeout(() => {
    const current = scene();
    if (!current) return;
    if (busy) {
      onResize();
      return;
    }
    const next = computeScale();
    const before = canvasPixels();
    const changed = Math.abs(next - scale) > 0.001;
    scale = next;
    const size = canvasPixels();
    if (changed || game.scale.width !== size.width || game.scale.height !== size.height || before.width !== size.width) {
      closeMap();
      resizeCanvas();
      current.scene.restart({ host, cursor: current.cursorPos });
    }
    applyCanvasSize(game.canvas);
  }, 120);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
