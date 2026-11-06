import type * as Phaser from 'phaser';
import type { MapTheme } from '../core/types';
import { gameData } from '../gameData';

/**
 * 게임 안의 그림. 외부 파일 없이 캔버스 벡터로 그린다.
 * 그림 좌표는 "한 칸 = 100"인 디자인 단위를 쓰고, 부대 그림은 실제 화면 크기에 맞춘 시트 한 장에 모아 그린다.
 * 부대 그림의 원점은 발밑 가운데이고, 위쪽이 음수, 오른쪽을 바라본다.
 */
export const TILE = 36;

export const UNIT_W = 180;
export const UNIT_H = 150;
const FOOT_X = UNIT_W / 2;
const FOOT_Y = 132;

/** 부대 그림의 기준점(발밑). Phaser 이미지의 origin으로 쓴다. */
export const UNIT_ORIGIN = { x: FOOT_X / UNIT_W, y: FOOT_Y / UNIT_H };

type Ctx = CanvasRenderingContext2D;
type Paint = (ctx: Ctx) => void;

const INK = '#141a26';

function addTexture(scene: Phaser.Scene, textureKey: string, width: number, height: number, paint: Paint): void {
  if (scene.textures.exists(textureKey)) return;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  paint(canvas.getContext('2d')!);
  scene.textures.addCanvas(textureKey, canvas);
}

/* ---------- 그리기 도우미 ---------- */

const path = (draw: (p: Path2D) => void): Path2D => {
  const p = new Path2D();
  draw(p);
  return p;
};

const vGrad = (ctx: Ctx, y0: number, y1: number, top: string, bottom: string): CanvasGradient => {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
};

const hGrad = (ctx: Ctx, x0: number, x1: number, left: string, right: string): CanvasGradient => {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, left);
  g.addColorStop(1, right);
  return g;
};

function shape(ctx: Ctx, p: Path2D, fill: string | CanvasGradient, line = 2.2): void {
  ctx.fillStyle = fill;
  ctx.fill(p);
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke(p);
  }
}

const rounded = (x: number, y: number, w: number, h: number, r: number): Path2D =>
  path((p) => p.roundRect(x, y, w, h, r));

const ellipse = (x: number, y: number, rx: number, ry: number): Path2D =>
  path((p) => p.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2));

/* ---------- 부대 모습 ---------- */

interface Look {
  main: string;
  dark: string;
  light: string;
  trim: string;
  skin: string;
  head: 'helmet' | 'crown' | 'cap' | 'turban' | 'hood';
  plume: string;
  beard: 'none' | 'long' | 'wild' | 'short';
  cape: string | null;
  horse: string;
  horseDark: string;
  blade: 'saber' | 'guandao';
}

const GOLD = '#f0c766';
const STEEL = '#e6edf5';
const STEEL_DARK = '#8d9bae';
const WOOD = '#8b5e34';
const LEATHER = '#5a3f28';

const SOLDIER: Record<string, Look> = {
  ally: {
    main: '#2f7fe6',
    dark: '#143f8c',
    light: '#8cc4ff',
    trim: GOLD,
    skin: '#f3cda8',
    head: 'helmet',
    plume: '#e0413a',
    beard: 'none',
    cape: null,
    horse: '#7a4f2d',
    horseDark: '#47301c',
    blade: 'saber',
  },
  enemy: {
    main: '#b5532a',
    dark: '#6d2a14',
    light: '#e39a62',
    trim: '#c9a24a',
    skin: '#e8b98f',
    head: 'turban',
    plume: '#f4c735',
    beard: 'none',
    cape: null,
    horse: '#8a8d93',
    horseDark: '#55585f',
    blade: 'saber',
  },
};

/** 장수별 모습. 삼국지연의의 이미지를 빌려 새로 그렸다. */
const HERO: Record<string, Partial<Look>> = {
  'liu-bei': { main: '#2873de', dark: '#10357a', head: 'crown', cape: '#f2efe4', beard: 'short' },
  'guan-yu': { main: '#2f9c5b', dark: '#135a31', light: '#86d8a4', head: 'cap', plume: '#2f9c5b', beard: 'long', blade: 'guandao', horse: '#8f3b22', horseDark: '#58210f', cape: '#1d6d3f' },
  'zhang-fei': { main: '#3b4a72', dark: '#1a2240', light: '#8c9cc9', head: 'helmet', plume: '#1b1f2b', beard: 'wild' },
  'gong-jing': { main: '#5f7ea8', dark: '#31435f', light: '#b4c8e0', head: 'cap', plume: '#31435f', beard: 'short' },
  'militia-archer': { head: 'hood', main: '#3c86c9', dark: '#1d4c78' },
  'cheng-yuanzhi': { main: '#a63a22', dark: '#5d1c0d', cape: '#7c1f12', beard: 'short' },
  'deng-mao': { main: '#9c4a1e', dark: '#59260c', cape: '#7c1f12', beard: 'short' },
  'gao-sheng': { main: '#8e2a2a', dark: '#4e1212', cape: '#2f1012', beard: 'wild', plume: '#ffd84a' },
  'zhao-yun': { main: '#dfe6ee', dark: '#7d8ea3', light: '#ffffff', head: 'helmet', plume: '#2f7fe6', horse: '#ecece6', horseDark: '#a8a89e', cape: '#2f7fe6' },
  'zhuge-liang': { main: '#e9e4d3', dark: '#8d8568', light: '#ffffff', head: 'cap', plume: '#2a3350', beard: 'short', cape: '#2a3350' },
  'huang-zhong': { main: '#a9843a', dark: '#5f4719', light: '#e0c67e', beard: 'long', plume: '#e0413a', cape: '#5f4719' },
  'ma-chao': { main: '#e6e9ee', dark: '#8d99a8', light: '#ffffff', plume: '#d83a3a', cape: '#b52d2d', horse: '#d9d9d2', horseDark: '#9a9a90' },
  'wei-yan': { main: '#7d3a2c', dark: '#3f1a12', light: '#c98a78', beard: 'wild', plume: '#1b1f2b', cape: '#3f1a12' },
  'jiang-wei': { main: '#2c8c8c', dark: '#124c4c', light: '#8cd6d6', beard: 'short', plume: '#f0c766', cape: '#124c4c' },
  'ma-dai': { main: '#c9ced6', dark: '#7d8590', plume: '#d83a3a', beard: 'short' },
  'wang-ping': { main: '#4f7f5a', dark: '#274a30', light: '#a4d0ae', beard: 'short', plume: '#f0c766' },
  'guan-xing': { main: '#2f9c5b', dark: '#135a31', light: '#86d8a4', plume: '#2f9c5b', blade: 'guandao' },
  'zhang-bao': { main: '#3b4a72', dark: '#1a2240', light: '#8c9cc9', plume: '#1b1f2b' },
  'guan-ping': { main: '#3f8f65', dark: '#1d5237', light: '#98d8b4', plume: '#f0c766', beard: 'short' },
  'zhou-cang': { main: '#55603a', dark: '#2c331c', light: '#a8b480', beard: 'wild', plume: '#1b1f2b' },
  'gongsun-zan': { beard: 'short', cape: '#f2efe4' },
  'zhou-yu': { head: 'cap', plume: '#f2b92c', beard: 'none', cape: '#f2efe4' },
  'huang-gai': { beard: 'long', cape: '#6f1f10' },
  'hua-xiong': { beard: 'wild', cape: '#2c1a40', plume: '#d83a3a' },
  'lu-bu': { main: '#8c1d2e', dark: '#47101a', light: '#e36a7c', plume: '#ff5a48', beard: 'none', cape: '#2a0a10', horse: '#b3321f', horseDark: '#6a1a0e', trim: '#ffd84a' },
  'cao-cao': { main: '#2c3a5c', dark: '#131b30', light: '#8da0c8', head: 'crown', beard: 'short', cape: '#7d1f2e', trim: '#ffd84a' },
  'xiahou-dun': { beard: 'wild', plume: '#8c1d2e' },
  'xiahou-yuan': { beard: 'short', cape: '#8c1d2e' },
  'xu-chu': { beard: 'wild', plume: '#1b1f2b' },
  'sima-yi': { main: '#343a54', dark: '#171a2a', light: '#8e96b8', head: 'cap', plume: '#171a2a', beard: 'long', cape: '#171a2a', trim: '#c9a24a' },
  'lu-xun': { head: 'cap', plume: '#f2b92c', beard: 'none', cape: '#f2efe4' },
  'meng-huo': { head: 'turban', plume: '#d83a3a', beard: 'wild', cape: '#2f9c5b' },
  'zhu-rong': { head: 'turban', plume: '#ff7ab0', beard: 'none', main: '#b5482f', dark: '#6a2412', light: '#ea9a7f' },
  'wu-tugu': { main: '#4a4d3a', dark: '#26281c', light: '#92957a', beard: 'wild', head: 'helmet', plume: '#2f9c5b' },
  'han-zhong': { main: '#7a3a8c', dark: '#3f1a4c', light: '#c79ad6', cape: '#3f1a4c', beard: 'short', plume: '#ffd84a' },
};

/** 세력별 옷과 투구. 같은 병과도 어느 편인지 한눈에 보이게 한다. */
const FACTION: Record<string, Partial<Look>> = {
  allied: { main: '#6f8fb0', dark: '#3a526e', light: '#bcd2e6', plume: '#e8e8e8', horse: '#d9d9d2', horseDark: '#9a9a90' },
  dong: { head: 'helmet', main: '#5a3a78', dark: '#2c1a40', light: '#a88cc6', trim: '#c9a24a', plume: '#2c1a40', horse: '#5b4636', horseDark: '#33261c' },
  lu: { head: 'helmet', main: '#a32036', dark: '#560f1c', light: '#e47c8c', trim: '#d9b45a', plume: '#1b1b22', horse: '#7d1f1f', horseDark: '#470f0f' },
  wei: { head: 'helmet', main: '#3f4a5e', dark: '#1c2230', light: '#93a1b8', trim: '#b7c0cc', plume: '#27b0b8', horse: '#55504a', horseDark: '#2d2a26' },
  wu: { head: 'helmet', main: '#c7452b', dark: '#6f1f10', light: '#f09a7f', trim: '#f2b92c', plume: '#f2b92c' },
  south: { head: 'helmet', main: '#7d7a35', dark: '#413f17', light: '#c4c180', trim: '#e0d060', plume: '#e0d060' },
  man: { head: 'hood', main: '#8a5a2b', dark: '#4a2d12', light: '#cf9a60', trim: '#d9c36a', skin: '#b9804f', plume: '#2f9c5b', horse: '#6b4a2a', horseDark: '#3b2814' },
};

const lookOf = (side: string, generalId: string): Look => {
  const general = gameData.generals[generalId];
  const faction = general?.faction ? FACTION[general.faction] : undefined;
  const base = { ...SOLDIER[side], ...faction };
  // 이름 있는 장수는 수염과 망토를 둘러 일반 병사와 구별한다
  const officer: Partial<Look> = faction && general?.officer ? { beard: 'short', cape: base.dark } : {};
  return { ...base, ...officer, ...HERO[generalId] };
};

function paintCape(ctx: Ctx, look: Look, x: number, top: number, bottom: number): void {
  if (!look.cape) return;
  shape(
    ctx,
    path((p) => {
      p.moveTo(x + 8, top);
      p.bezierCurveTo(x - 10, top + 6, x - 24, bottom - 18, x - 30, bottom);
      p.bezierCurveTo(x - 18, bottom + 3, x - 8, bottom - 4, x + 2, bottom);
      p.lineTo(x + 10, top + 8);
      p.closePath();
    }),
    vGrad(ctx, top, bottom, look.cape, shade(look.cape)),
  );
}

/** #rrggbb 색을 살짝 어둡게 만든다. */
function shade(hex: string, amount = 0.72): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * amount);
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function paintHead(ctx: Ctx, look: Look, cx: number, cy: number, r: number): void {
  const u = r / 19;
  // 뒤로 날리는 머리 장식
  if (look.head === 'turban') {
    for (const drop of [0, 9]) {
      shape(
        ctx,
        path((p) => {
          p.moveTo(cx - 15 * u, cy - 11 * u);
          p.lineTo(cx - 31 * u, cy - 9 * u + drop * u);
          p.lineTo(cx - 28 * u, cy - 3 * u + drop * u);
          p.lineTo(cx - 15 * u, cy - 6 * u);
          p.closePath();
        }),
        vGrad(ctx, cy - 12 * u, cy + 6 * u, '#ffdc4e', '#d8981a'),
        1.6,
      );
    }
  }
  if (look.head === 'helmet' || look.head === 'crown') {
    const plume = look.head === 'crown' ? GOLD : look.plume;
    shape(
      ctx,
      path((p) => {
        p.moveTo(cx - 2 * u, cy - r - 2 * u);
        p.bezierCurveTo(cx - 14 * u, cy - r - 16 * u, cx - 30 * u, cy - r - 8 * u, cx - 34 * u, cy - 4 * u);
        p.bezierCurveTo(cx - 26 * u, cy - r + 2 * u, cx - 14 * u, cy - r + 4 * u, cx - 4 * u, cy - r + 6 * u);
        p.closePath();
      }),
      vGrad(ctx, cy - r - 12 * u, cy, plume, shade(plume)),
    );
  }

  // 귀와 얼굴
  shape(ctx, ellipse(cx - 13 * u, cy + 2 * u, 4 * u, 5 * u), shade(look.skin, 0.9), 1.8);
  shape(ctx, ellipse(cx, cy, r, r * 0.98), hGrad(ctx, cx - r, cx + r, shade(look.skin, 0.86), look.skin));
  ctx.fillStyle = 'rgba(235,110,90,0.32)';
  ctx.fill(ellipse(cx + 8 * u, cy + 7 * u, 5 * u, 3 * u));

  // 수염은 눈보다 먼저 그려 얼굴 아래를 덮는다
  if (look.beard === 'long') {
    shape(
      ctx,
      path((p) => {
        p.moveTo(cx - 5 * u, cy + 6 * u);
        p.bezierCurveTo(cx + 4 * u, cy + 12 * u, cx + 14 * u, cy + 11 * u, cx + 17 * u, cy + 5 * u);
        p.bezierCurveTo(cx + 20 * u, cy + 22 * u, cx + 13 * u, cy + 40 * u, cx + 6 * u, cy + 50 * u);
        p.bezierCurveTo(cx + 2 * u, cy + 36 * u, cx - 6 * u, cy + 22 * u, cx - 5 * u, cy + 6 * u);
        p.closePath();
      }),
      vGrad(ctx, cy, cy + 50 * u, '#2a2230', '#141018'),
      1.6,
    );
  } else if (look.beard === 'wild') {
    shape(
      ctx,
      path((p) => {
        p.moveTo(cx - 10 * u, cy + 4 * u);
        for (const [x, y] of [[-8, 16], [-3, 12], [0, 24], [5, 15], [10, 22], [13, 12], [20, 13], [17, 5]]) {
          p.lineTo(cx + x * u, cy + y * u);
        }
        p.bezierCurveTo(cx + 9 * u, cy + 10 * u, cx, cy + 9 * u, cx - 10 * u, cy + 4 * u);
        p.closePath();
      }),
      '#1b1820',
      1.4,
    );
  } else if (look.beard === 'short') {
    shape(
      ctx,
      path((p) => {
        p.moveTo(cx + 1 * u, cy + 9 * u);
        p.bezierCurveTo(cx + 6 * u, cy + 12 * u, cx + 13 * u, cy + 11 * u, cx + 16 * u, cy + 8 * u);
        p.bezierCurveTo(cx + 15 * u, cy + 17 * u, cx + 8 * u, cy + 22 * u, cx + 5 * u, cy + 23 * u);
        p.bezierCurveTo(cx + 3 * u, cy + 18 * u, cx + 1 * u, cy + 14 * u, cx + 1 * u, cy + 9 * u);
        p.closePath();
      }),
      '#2a2230',
      1.3,
    );
  }

  // 눈과 눈썹
  ctx.fillStyle = INK;
  ctx.fill(ellipse(cx + 8 * u, cy - 1 * u, 2.6 * u, 3.6 * u));
  ctx.fillStyle = '#ffffff';
  ctx.fill(ellipse(cx + 9 * u, cy - 2.4 * u, 0.9 * u, 1.1 * u));
  ctx.lineWidth = 2.2 * u;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 3 * u, cy - 7 * u);
  ctx.lineTo(cx + 13 * u, cy - 8.5 * u);
  ctx.stroke();

  const dome = (drop: number) =>
    path((p) => {
      p.moveTo(cx - r - 1.5 * u, cy - drop * u);
      p.bezierCurveTo(cx - r - 1 * u, cy - r - 8 * u, cx + r + 1 * u, cy - r - 8 * u, cx + r + 1.5 * u, cy - drop * u - 3 * u);
      p.bezierCurveTo(cx + r * 0.4, cy - drop * u - 6 * u, cx - r * 0.6, cy - drop * u - 3 * u, cx - r - 1.5 * u, cy - drop * u);
      p.closePath();
    });

  if (look.head === 'helmet' || look.head === 'crown') {
    shape(ctx, dome(3), vGrad(ctx, cy - r - 8 * u, cy, STEEL, STEEL_DARK));
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill(ellipse(cx + 4 * u, cy - r + 0 * u, 7 * u, 2.6 * u));
    shape(ctx, rounded(cx - r - 1.5 * u, cy - 9 * u, r * 2 + 3 * u, 4.5 * u, 2 * u), look.head === 'crown' ? GOLD : STEEL_DARK, 1.5);
    if (look.head === 'crown') {
      shape(ctx, path((p) => { p.moveTo(cx - 4 * u, cy - r - 2 * u); p.lineTo(cx, cy - r - 10 * u); p.lineTo(cx + 4 * u, cy - r - 2 * u); p.closePath(); }), GOLD, 1.5);
    }
  } else if (look.head === 'cap') {
    shape(ctx, dome(4), vGrad(ctx, cy - r - 8 * u, cy, look.main, look.dark));
    shape(ctx, rounded(cx - r - 1.5 * u, cy - 10 * u, r * 2 + 3 * u, 4 * u, 2 * u), GOLD, 1.4);
  } else if (look.head === 'turban') {
    shape(ctx, dome(5), vGrad(ctx, cy - r - 8 * u, cy, '#3a2e2a', '#1d1716'));
    shape(ctx, rounded(cx - r - 1.5 * u, cy - 14 * u, r * 2 + 3 * u, 8.5 * u, 3 * u), vGrad(ctx, cy - 14 * u, cy - 5 * u, '#ffe25e', '#e3a51f'), 1.8);
    shape(ctx, ellipse(cx - 15 * u, cy - 9.5 * u, 5 * u, 5 * u), '#f4c735', 1.6);
  } else {
    // 궁병의 두건
    shape(ctx, dome(2), vGrad(ctx, cy - r - 8 * u, cy, look.light, look.main));
    shape(ctx, path((p) => { p.moveTo(cx - r - 1 * u, cy - 3 * u); p.lineTo(cx - r - 8 * u, cy + 12 * u); p.lineTo(cx - r + 6 * u, cy + 10 * u); p.closePath(); }), look.main, 1.6);
  }
}

/** 서 있는 몸통과 다리. 머리 중심 y를 돌려준다. */
function paintStandingBody(ctx: Ctx, look: Look, slim: boolean): number {
  const width = slim ? 12 : 15;
  // 다리
  for (const [x, dark] of [[-width + 3, true], [3, false]] as const) {
    shape(ctx, rounded(x, -22, 8, 16, 3), dark ? shade(look.dark, 0.85) : look.dark);
    shape(ctx, rounded(x - 1, -8, 11, 8, 3), '#2e2219', 1.8);
  }
  // 몸통
  shape(
    ctx,
    path((p) => {
      p.moveTo(-width + 1, -54);
      p.quadraticCurveTo(0, -60, width - 1, -54);
      p.lineTo(width, -22);
      p.quadraticCurveTo(0, -17, -width, -22);
      p.closePath();
    }),
    hGrad(ctx, -width, width, look.dark, look.main),
  );
  // 가슴판과 허리띠
  shape(ctx, path((p) => { p.moveTo(-width + 6, -50); p.quadraticCurveTo(2, -54, width - 3, -50); p.lineTo(width - 4, -33); p.lineTo(-width + 6, -33); p.closePath(); }), vGrad(ctx, -52, -33, look.light, look.main), 1.3);
  shape(ctx, rounded(-width - 0.5, -32, width * 2 + 1, 5, 2), look.trim, 1.5);
  return -72;
}

const UNIT_BODY: Record<string, (ctx: Ctx, look: Look) => void> = {
  infantry: (ctx, look) => {
    paintCape(ctx, look, -6, -56, -6);
    const headY = paintStandingBody(ctx, look, false);
    // 칼을 든 뒤쪽 팔
    shape(ctx, rounded(-22, -52, 10, 22, 5), hGrad(ctx, -22, -12, look.dark, look.main));
    paintHead(ctx, look, 0, headY, 19);
    // 앞쪽 방패
    const shield = path((p) => {
      p.moveTo(10, -54);
      p.quadraticCurveTo(23, -58, 36, -54);
      p.bezierCurveTo(37, -36, 33, -18, 23, -9);
      p.bezierCurveTo(13, -18, 9, -36, 10, -54);
      p.closePath();
    });
    shape(ctx, shield, hGrad(ctx, 10, 36, look.main, look.light), 2.4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = look.trim;
    ctx.stroke(path((p) => {
      p.moveTo(14, -50);
      p.quadraticCurveTo(23, -53, 32, -50);
      p.bezierCurveTo(33, -36, 30, -22, 23, -14);
      p.bezierCurveTo(16, -22, 13, -36, 14, -50);
      p.closePath();
    }));
    shape(ctx, ellipse(23, -35, 4.5, 4.5), look.trim, 1.5);
  },
  spear: (ctx, look) => {
    paintCape(ctx, look, -5, -56, -6);
    const headY = paintStandingBody(ctx, look, true);
    paintHead(ctx, look, 0, headY, 19);
    shape(ctx, rounded(2, -50, 18, 9, 4.5), hGrad(ctx, 2, 20, look.main, look.light));
  },
  archer: (ctx, look) => {
    // 무릎 쏴 자세: 몸을 낮춘다
    shape(ctx, rounded(-16, -12, 22, 10, 4), shade(look.dark, 0.85));
    shape(ctx, rounded(-18, -7, 12, 7, 3), '#2e2219', 1.8);
    shape(ctx, rounded(0, -18, 9, 18, 3), look.dark);
    shape(ctx, rounded(-1, -7, 12, 7, 3), '#2e2219', 1.8);
    // 화살통
    shape(ctx, rounded(-22, -42, 9, 26, 3), LEATHER);
    for (const y of [-47, -44]) shape(ctx, rounded(y === -47 ? -21 : -16, y, 2.5, 8, 1), '#efe7d6', 1);
    shape(
      ctx,
      path((p) => {
        p.moveTo(-12, -44);
        p.quadraticCurveTo(0, -50, 12, -44);
        p.lineTo(13, -12);
        p.quadraticCurveTo(0, -8, -13, -12);
        p.closePath();
      }),
      hGrad(ctx, -12, 12, look.dark, look.main),
    );
    shape(ctx, rounded(-13, -22, 26, 4.5, 2), look.trim, 1.4);
    paintHead(ctx, look, 1, -60, 18);
    shape(ctx, rounded(3, -40, 18, 8, 4), hGrad(ctx, 3, 21, look.main, look.light));
  },
  cavalry: (ctx, look) => {
    paintCavalryHorse(ctx, look);
    // 기수
    paintCape(ctx, look, -6, -78, -40);
    shape(
      ctx,
      path((p) => {
        p.moveTo(-11, -78);
        p.quadraticCurveTo(0, -83, 11, -78);
        p.lineTo(13, -50);
        p.quadraticCurveTo(0, -46, -13, -50);
        p.closePath();
      }),
      hGrad(ctx, -13, 13, look.dark, look.main),
    );
    shape(ctx, rounded(-13, -57, 26, 5, 2), look.trim, 1.4);
    shape(ctx, rounded(-3, -52, 12, 22, 5), look.dark);
    shape(ctx, rounded(-3, -33, 13, 7, 3), '#2e2219', 1.7);
    paintHead(ctx, look, 1, -94, 16.5);
    shape(ctx, rounded(2, -74, 16, 8, 4), hGrad(ctx, 2, 18, look.main, look.light));
  },
};

function paintCavalryHorse(ctx: Ctx, look: Look): void {
  const coat = vGrad(ctx, -56, -18, look.horse, look.horseDark);
  // 꼬리
  shape(ctx, path((p) => { p.moveTo(-34, -42); p.bezierCurveTo(-50, -42, -52, -22, -46, -12); p.bezierCurveTo(-42, -20, -38, -26, -32, -32); p.closePath(); }), '#231710', 1.8);
  // 뒤쪽 다리
  for (const x of [-26, 18]) shape(ctx, rounded(x, -30, 8, 28, 3), look.horseDark, 1.9);
  // 몸통과 목
  shape(ctx, path((p) => {
    p.moveTo(-36, -38);
    p.bezierCurveTo(-34, -56, -8, -54, 14, -52);
    p.bezierCurveTo(22, -60, 28, -72, 36, -76);
    p.bezierCurveTo(46, -80, 54, -72, 58, -62);
    p.bezierCurveTo(59, -57, 53, -55, 48, -58);
    p.bezierCurveTo(44, -58, 38, -52, 36, -44);
    p.bezierCurveTo(34, -30, 18, -22, 0, -22);
    p.bezierCurveTo(-18, -22, -36, -24, -36, -38);
    p.closePath();
  }), coat);
  // 앞쪽 다리와 발굽
  for (const x of [-34, 26]) {
    shape(ctx, rounded(x, -30, 9, 28, 3), look.horse, 1.9);
    shape(ctx, rounded(x - 1, -6, 11, 6, 2), '#191310', 1.5);
  }
  for (const x of [-26, 18]) shape(ctx, rounded(x - 1, -6, 10, 6, 2), '#191310', 1.5);
  // 갈기, 귀, 눈, 굴레
  shape(ctx, path((p) => { p.moveTo(36, -76); p.bezierCurveTo(26, -74, 18, -62, 12, -52); p.bezierCurveTo(22, -56, 30, -62, 39, -70); p.closePath(); }), '#231710', 1.5);
  shape(ctx, path((p) => { p.moveTo(41, -77); p.lineTo(43, -86); p.lineTo(47, -76); p.closePath(); }), look.horse, 1.5);
  ctx.fillStyle = INK;
  ctx.fill(ellipse(47, -69, 1.9, 2.3));
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = look.trim;
  ctx.beginPath();
  ctx.moveTo(40, -74);
  ctx.quadraticCurveTo(48, -64, 55, -60);
  ctx.stroke();
  // 안장 천
  shape(ctx, path((p) => { p.moveTo(-18, -55); p.lineTo(16, -53); p.lineTo(18, -30); p.quadraticCurveTo(0, -24, -20, -30); p.closePath(); }), vGrad(ctx, -55, -28, look.main, look.dark));
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = look.trim;
  ctx.beginPath();
  ctx.moveTo(-19, -33);
  ctx.quadraticCurveTo(0, -27, 17, -33);
  ctx.stroke();
}

/** 손에 든 무기. 부대 몸과 따로 움직인다. pivot은 손의 위치다. */
export const WEAPON_PIVOT: Record<string, { x: number; y: number }> = {
  infantry: { x: -17, y: -44 },
  spear: { x: 13, y: -45 },
  archer: { x: 20, y: -36 },
  cavalry: { x: 15, y: -70 },
};

const UNIT_WEAPON: Record<string, (ctx: Ctx, look: Look) => void> = {
  infantry: (ctx, look) => {
    // 칼을 위로 치켜든 자세
    shape(ctx, path((p) => { p.moveTo(-20, -52); p.lineTo(-18, -94); p.lineTo(-14, -100); p.lineTo(-11, -94); p.lineTo(-13, -52); p.closePath(); }), hGrad(ctx, -20, -11, STEEL_DARK, '#ffffff'), 1.8);
    shape(ctx, rounded(-25, -54, 18, 4.5, 2), look.trim, 1.5);
    shape(ctx, rounded(-19, -50, 5, 10, 2), LEATHER, 1.4);
    shape(ctx, ellipse(-17, -44, 5.5, 5.5), look.skin, 1.7);
  },
  spear: (ctx, look) => {
    shape(ctx, path((p) => { p.moveTo(-23, -5); p.lineTo(46, -95); p.lineTo(49, -92); p.lineTo(-20, -2); p.closePath(); }), hGrad(ctx, -20, 48, shade(WOOD), WOOD), 1.6);
    shape(ctx, path((p) => { p.moveTo(45, -93); p.lineTo(48, -112); p.lineTo(60, -96); p.lineTo(52, -88); p.closePath(); }), hGrad(ctx, 45, 60, STEEL_DARK, '#ffffff'), 1.8);
    shape(ctx, path((p) => { p.moveTo(43, -88); p.bezierCurveTo(36, -86, 32, -78, 34, -70); p.bezierCurveTo(40, -74, 45, -78, 49, -84); p.closePath(); }), '#e0413a', 1.4);
    shape(ctx, ellipse(13, -45, 5.5, 5.5), look.skin, 1.7);
  },
  archer: (ctx, look) => {
    // 활과 시위, 걸어 둔 화살
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#f4efe2';
    ctx.beginPath();
    ctx.moveTo(26, -72);
    ctx.lineTo(10, -36);
    ctx.lineTo(26, 0);
    ctx.stroke();
    shape(ctx, rounded(10, -37.5, 34, 2.4, 1), '#efe7d6', 1.1);
    shape(ctx, path((p) => { p.moveTo(44, -40); p.lineTo(51, -36.5); p.lineTo(44, -33); p.closePath(); }), STEEL, 1.2);
    ctx.lineWidth = 6.2;
    ctx.strokeStyle = INK;
    const limb = new Path2D();
    limb.moveTo(26, -72);
    limb.bezierCurveTo(44, -60, 44, -12, 26, 0);
    ctx.stroke(limb);
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = WOOD;
    ctx.stroke(limb);
    shape(ctx, ellipse(35, -36, 5, 5), look.skin, 1.6);
    shape(ctx, ellipse(11, -36, 4.6, 4.6), look.skin, 1.6);
  },
  cavalry: (ctx, look) => {
    if (look.blade === 'guandao') {
      // 언월도: 긴 자루에 넓은 초승달 날
      shape(ctx, path((p) => { p.moveTo(-14, -30); p.lineTo(42, -108); p.lineTo(45, -105); p.lineTo(-11, -27); p.closePath(); }), hGrad(ctx, -14, 45, '#2a3a34', '#3f7f62'), 1.5);
      shape(ctx, path((p) => {
        p.moveTo(41, -102);
        p.bezierCurveTo(44, -118, 58, -130, 70, -128);
        p.bezierCurveTo(70, -114, 64, -98, 50, -92);
        p.closePath();
      }), hGrad(ctx, 41, 70, STEEL_DARK, '#ffffff'), 1.8);
      shape(ctx, ellipse(43, -100, 3.6, 3.6), GOLD, 1.3);
    } else {
      shape(ctx, path((p) => { p.moveTo(12, -74); p.bezierCurveTo(22, -88, 32, -102, 46, -112); p.bezierCurveTo(44, -96, 32, -80, 18, -67); p.closePath(); }), hGrad(ctx, 12, 46, STEEL_DARK, '#ffffff'), 1.8);
      shape(ctx, rounded(6, -76, 18, 4.5, 2), look.trim, 1.4);
    }
    shape(ctx, ellipse(15, -70, 5, 5), look.skin, 1.6);
  },
};

/** 정보 패널용 큰 그림. 머리와 몸통이 칸을 채우도록 확대한다. */
export function paintPortrait(ctx: Ctx, side: string, classId: string, generalId: string, size: number): void {
  const look = lookOf(side, generalId);
  const focus = { infantry: [4, -56, 1.5], spear: [8, -58, 1.55], archer: [12, -44, 1.6], cavalry: [12, -72, 1.25] }[classId] ?? [0, -50, 1.5];
  const zoom = (size / 100) * focus[2];
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-focus[0], -focus[1]);
  UNIT_BODY[classId](ctx, look);
  UNIT_WEAPON[classId](ctx, look);
  ctx.restore();
}

export const bodyFrame = (side: string, generalId: string): string => `body-${side}-${generalId}`;
export const weaponFrame = (side: string, generalId: string): string => `weapon-${side}-${generalId}`;
export const badgeFrame = (side: string, generalId: string): string => `badge-${side}-${generalId}`;
export const footFrame = (side: string): string => `foot-${side}`;
export const BAR_BACK_FRAME = 'bar-back';
export const BAR_FILL_FRAME = 'bar-fill';

export interface AtlasUnit {
  side: string;
  classId: string;
  generalId: string;
  mark: string;
  officer: boolean;
}

const ATLAS_PAD = 2;

/**
 * 이 전투의 부대 그림을 시트 한 장에 모은다. 그림을 바꿔 끼우는 횟수가 줄어 화면이 부드러워진다.
 * artTile은 칸 하나의 실제 픽셀 크기라서, 불필요하게 큰 그림을 만들지 않는다.
 */
export function createUnitAtlas(scene: Phaser.Scene, units: AtlasUnit[], artTile: number): string {
  const unique = [...new Map(units.map((unit) => [`${unit.side}-${unit.generalId}`, unit])).values()];
  const key = `units-${artTile}-${unique.map((unit) => `${unit.side}-${unit.generalId}`).join(',')}`;
  for (const existing of scene.textures.getTextureKeys()) {
    if (existing.startsWith('units-') && existing !== key) scene.textures.remove(existing);
  }
  if (scene.textures.exists(key)) return key;

  const k = artTile / 100;
  const cellW = Math.ceil(UNIT_W * k) + ATLAS_PAD * 2;
  const cellH = Math.ceil(UNIT_H * k) + ATLAS_PAD * 2;
  const footSize = Math.min(cellW, cellH) - ATLAS_PAD * 2;
  const badgeSize = Math.round(artTile * 0.42);
  const barW = Math.round(artTile * 0.84);
  const barH = Math.max(8, Math.round(artTile * 0.105));

  type Cell = { name: string; w: number; h: number; paint: (ctx: Ctx) => void };
  const inUnitSpace = (draw: (ctx: Ctx) => void) => (ctx: Ctx) => {
    ctx.scale(k, k);
    ctx.translate(FOOT_X, FOOT_Y);
    draw(ctx);
  };
  const cells: Cell[] = [];
  const fullW = cellW - ATLAS_PAD * 2;
  const fullH = cellH - ATLAS_PAD * 2;
  for (const unit of unique) {
    const look = lookOf(unit.side, unit.generalId);
    cells.push({ name: bodyFrame(unit.side, unit.generalId), w: fullW, h: fullH, paint: inUnitSpace((ctx) => UNIT_BODY[unit.classId](ctx, look)) });
    cells.push({ name: weaponFrame(unit.side, unit.generalId), w: fullW, h: fullH, paint: inUnitSpace((ctx) => UNIT_WEAPON[unit.classId](ctx, look)) });
    if (unit.officer) {
      cells.push({ name: badgeFrame(unit.side, unit.generalId), w: badgeSize, h: badgeSize, paint: (ctx) => paintBadge(ctx, unit.side, unit.mark, badgeSize) });
    }
  }
  cells.push({ name: footFrame('ally'), w: footSize, h: footSize, paint: (ctx) => paintFoot(ctx, '86,190,255', footSize) });
  cells.push({ name: footFrame('enemy'), w: footSize, h: footSize, paint: (ctx) => paintFoot(ctx, '255,170,70', footSize) });
  cells.push({ name: BAR_BACK_FRAME, w: barW, h: barH, paint: (ctx) => paintBarBack(ctx, barW, barH) });
  cells.push({ name: BAR_FILL_FRAME, w: barW, h: barH, paint: (ctx) => paintBarFill(ctx, barW, barH) });

  const columns = Math.ceil(Math.sqrt(cells.length));
  const canvas = document.createElement('canvas');
  canvas.width = columns * cellW;
  canvas.height = Math.ceil(cells.length / columns) * cellH;
  const ctx = canvas.getContext('2d')!;
  const places = cells.map((cell, index) => {
    const x = (index % columns) * cellW + ATLAS_PAD;
    const y = Math.floor(index / columns) * cellH + ATLAS_PAD;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, cell.w, cell.h);
    ctx.clip();
    cell.paint(ctx);
    ctx.restore();
    return { cell, x, y };
  });
  const texture = scene.textures.addCanvas(key, canvas)!;
  for (const { cell, x, y } of places) texture.add(cell.name, 0, x, y, cell.w, cell.h);
  return key;
}

function paintBadge(ctx: Ctx, side: string, mark: string, size: number): void {
  const color = side === 'ally' ? '#1f5fc0' : '#b0301f';
  const c = size / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - size * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = vGrad(ctx, 0, size, shade(color, 1.25), shade(color, 0.7));
  ctx.fill();
  ctx.lineWidth = size * 0.07;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${Math.round(size * 0.52)}px system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, c, c + size * 0.03);
}

/* ---------- 지형 소품 ---------- */

function paintTree(ctx: Ctx, variant: number): void {
  const palettes = [
    ['#5fae57', '#2f7a43', '#1f5a34'],
    ['#6cb65b', '#38824a', '#22603a'],
    ['#4f9f5c', '#2a6f43', '#194d31'],
  ];
  const [hi, mid, low] = palettes[variant % 3];
  ctx.fillStyle = 'rgba(10,20,20,0.28)';
  ctx.fill(ellipse(2, 1, 24, 7));
  shape(ctx, path((p) => { p.moveTo(-5, 0); p.quadraticCurveTo(-3, -12, -4, -24); p.lineTo(4, -24); p.quadraticCurveTo(3, -12, 6, 0); p.closePath(); }), hGrad(ctx, -5, 6, '#4f3620', '#7e5a36'), 1.6);
  const puff = (x: number, y: number, r: number) => {
    const g = ctx.createRadialGradient(x + r * 0.35, y - r * 0.45, r * 0.12, x, y, r * 1.08);
    g.addColorStop(0, hi);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, low);
    shape(ctx, ellipse(x, y, r, r * 0.92), g, 1.7);
  };
  puff(-13, -29, 15);
  puff(13, -29, 15);
  puff(0, -38, 18);
  puff(-7, -52, 13);
  puff(9, -50, 12);
  ctx.fillStyle = 'rgba(255,255,220,0.22)';
  ctx.fill(ellipse(5, -56, 6, 3));
  ctx.fill(ellipse(-8, -41, 4, 2.2));
}

function paintShrub(ctx: Ctx): void {
  ctx.fillStyle = 'rgba(10,20,20,0.25)';
  ctx.fill(ellipse(0, 1, 19, 5));
  for (const [x, y, r] of [[-10, -7, 9], [10, -7, 9], [0, -11, 11]]) {
    const g = ctx.createRadialGradient(x + 3, y - 4, 1, x, y, r * 1.1);
    g.addColorStop(0, '#6cb65b');
    g.addColorStop(1, '#22603a');
    shape(ctx, ellipse(x, y, r, r * 0.86), g, 1.5);
  }
}

function paintMountain(ctx: Ctx, variant: number): void {
  const peak = variant % 2 === 0 ? { x: -4, y: -100 } : { x: 6, y: -92 };
  ctx.fillStyle = 'rgba(10,15,25,0.3)';
  ctx.fill(ellipse(3, -1, 52, 11));
  const outline = path((p) => {
    p.moveTo(-50, 0);
    p.lineTo(-32, -34);
    p.lineTo(-20, -48);
    p.lineTo(peak.x, peak.y);
    p.lineTo(22, -54);
    p.lineTo(32, -38);
    p.lineTo(50, 0);
    p.quadraticCurveTo(0, 8, -50, 0);
    p.closePath();
  });
  shape(ctx, outline, vGrad(ctx, peak.y, 4, '#9c9a93', '#5e5a52'), 2.4);
  // 그늘진 오른쪽 면
  ctx.save();
  ctx.clip(outline);
  ctx.fillStyle = 'rgba(30,32,52,0.42)';
  ctx.fill(path((p) => {
    p.moveTo(peak.x, peak.y);
    p.lineTo(2, -62);
    p.lineTo(-6, -40);
    p.lineTo(6, -22);
    p.lineTo(-2, 8);
    p.lineTo(60, 8);
    p.lineTo(60, -40);
    p.closePath();
  }));
  // 왼쪽 면의 빛
  ctx.fillStyle = 'rgba(255,226,170,0.24)';
  ctx.fill(path((p) => {
    p.moveTo(peak.x - 1, peak.y + 4);
    p.lineTo(-22, -48);
    p.lineTo(-30, -24);
    p.lineTo(-14, -34);
    p.closePath();
  }));
  // 눈 덮인 봉우리
  ctx.fillStyle = '#f6f8fc';
  ctx.fill(path((p) => {
    p.moveTo(peak.x, peak.y - 2);
    p.lineTo(peak.x - 17, peak.y + 26);
    p.lineTo(peak.x - 9, peak.y + 21);
    p.lineTo(peak.x - 4, peak.y + 30);
    p.lineTo(peak.x + 3, peak.y + 22);
    p.lineTo(peak.x + 9, peak.y + 29);
    p.lineTo(peak.x + 16, peak.y + 24);
    p.closePath();
  }));
  ctx.fillStyle = 'rgba(120,140,190,0.35)';
  ctx.fill(path((p) => {
    p.moveTo(peak.x + 1, peak.y);
    p.lineTo(peak.x + 16, peak.y + 24);
    p.lineTo(peak.x + 9, peak.y + 29);
    p.lineTo(peak.x + 3, peak.y + 22);
    p.closePath();
  }));
  // 아래쪽 풀
  ctx.fillStyle = 'rgba(70,120,60,0.55)';
  ctx.fill(ellipse(-20, 2, 22, 9));
  ctx.fill(ellipse(24, 3, 20, 8));
  ctx.restore();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = INK;
  ctx.stroke(outline);
}

/** 정보 패널의 지형 그림. */
export function paintTerrainIcon(ctx: Ctx, terrainId: string, size: number): void {
  const k = size / 100;
  ctx.save();
  ctx.scale(k, k);
  const ground: Record<string, [string, string]> = {
    plain: ['#7cb868', '#578f4c'],
    forest: ['#5a9a55', '#3a6f40'],
    mountain: ['#8d8a72', '#65624f'],
    river: ['#3fa8c4', '#1d6f95'],
    bridge: ['#3fa8c4', '#1d6f95'],
    wall: ['#a8a18d', '#7c7664'],
    castle: ['#968c78', '#7c7260'],
    gate: ['#968c78', '#7c7260'],
    deck: ['#3fa8c4', '#1d6f95'],
  };
  const [top, bottom] = ground[terrainId] ?? ground.plain;
  ctx.fillStyle = vGrad(ctx, 0, 100, top, bottom);
  ctx.fillRect(0, 0, 100, 100);
  ctx.translate(50, 86);
  if (terrainId === 'forest') {
    ctx.scale(1.1, 1.1);
    paintTree(ctx, 0);
  } else if (terrainId === 'mountain') {
    ctx.scale(0.8, 0.8);
    paintMountain(ctx, 0);
  } else if (terrainId === 'bridge') {
    ctx.translate(-50, -86);
    paintBridgeTile(ctx, 15, 0, 70, 100);
  } else if (terrainId === 'wall') {
    ctx.translate(-50, -86);
    paintWallTile(ctx, 10, 18, 80, false);
  } else if (terrainId === 'castle') {
    ctx.translate(-50, -86);
    paintPavers(ctx, 0, 0, 100);
  } else if (terrainId === 'gate') {
    ctx.translate(-50, -86);
    paintPavers(ctx, 0, 0, 100);
    paintGateTile(ctx, 8, 8, 84);
  } else if (terrainId === 'deck') {
    ctx.translate(-50, -86);
    paintDeckTile(ctx, 8, 8, 84, { up: false, down: false, left: false, right: false });
  } else if (terrainId === 'plain') {
    ctx.fillStyle = 'rgba(255,255,220,0.5)';
    for (const [x, y] of [[-24, -40], [8, -60], [26, -22], [-8, -12]]) ctx.fill(ellipse(x, y, 2.4, 2.4));
  }
  ctx.restore();
}

/* ---------- 효과 ---------- */

const FX_SIZE = 128;

const paintSoft: Paint = (ctx) => {
  const g = ctx.createRadialGradient(FX_SIZE / 2, FX_SIZE / 2, 0, FX_SIZE / 2, FX_SIZE / 2, FX_SIZE / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FX_SIZE, FX_SIZE);
};

const paintRing: Paint = (ctx) => {
  ctx.translate(FX_SIZE / 2, FX_SIZE / 2);
  const g = ctx.createRadialGradient(0, 0, FX_SIZE * 0.26, 0, 0, FX_SIZE * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-FX_SIZE / 2, -FX_SIZE / 2, FX_SIZE, FX_SIZE);
};

const paintArc: Paint = (ctx) => {
  ctx.translate(FX_SIZE / 2, FX_SIZE / 2);
  const r = FX_SIZE * 0.42;
  const outer = new Path2D();
  outer.moveTo(-r * 0.86, r * 0.5);
  outer.quadraticCurveTo(r * 0.2, r * 0.42, r * 0.8, -r * 0.72);
  outer.quadraticCurveTo(r * 0.62, r * 0.22, -r * 0.86, r * 0.5);
  outer.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill(outer);
};

const paintArrow: Paint = (ctx) => {
  ctx.fillStyle = '#efe7d6';
  ctx.fillRect(10, 30, 96, 4);
  ctx.fillStyle = STEEL;
  ctx.beginPath();
  ctx.moveTo(100, 22);
  ctx.lineTo(126, 32);
  ctx.lineTo(100, 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d94a3c';
  ctx.beginPath();
  ctx.moveTo(4, 22);
  ctx.lineTo(28, 30);
  ctx.lineTo(28, 34);
  ctx.lineTo(4, 42);
  ctx.closePath();
  ctx.fill();
};

const paintRock: Paint = (ctx) => {
  ctx.scale(FX_SIZE / 100, FX_SIZE / 100);
  ctx.translate(50, 50);
  shape(ctx, path((p) => {
    p.moveTo(-30, 8);
    p.lineTo(-22, -22);
    p.lineTo(4, -32);
    p.lineTo(28, -16);
    p.lineTo(32, 14);
    p.lineTo(10, 30);
    p.lineTo(-18, 26);
    p.closePath();
  }), vGrad(ctx, -32, 30, '#b1b3b8', '#4d4f58'), 3);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill(path((p) => { p.moveTo(-18, -18); p.lineTo(4, -27); p.lineTo(10, -12); p.lineTo(-10, -6); p.closePath(); }));
};

const paintCross: Paint = (ctx) => {
  const c = FX_SIZE / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(c - 10, c - 36, 20, 72, 6);
  ctx.roundRect(c - 36, c - 10, 72, 20, 6);
  ctx.fill();
};

const paintStreak: Paint = (ctx) => {
  const g = ctx.createLinearGradient(0, 0, FX_SIZE, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, FX_SIZE / 2 - 3, FX_SIZE, 6);
};

const paintFlame: Paint = (ctx) => {
  const c = FX_SIZE / 2;
  const flame = (width: number, top: number, color: (g: CanvasGradient) => void) => {
    const g = ctx.createLinearGradient(0, top, 0, FX_SIZE);
    color(g);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(c, top);
    ctx.bezierCurveTo(c + width * 0.25, top + FX_SIZE * 0.26, c + width, FX_SIZE * 0.5, c + width * 0.8, FX_SIZE * 0.8);
    ctx.bezierCurveTo(c + width * 0.6, FX_SIZE * 0.98, c - width * 0.6, FX_SIZE * 0.98, c - width * 0.8, FX_SIZE * 0.8);
    ctx.bezierCurveTo(c - width, FX_SIZE * 0.5, c - width * 0.25, top + FX_SIZE * 0.26, c, top);
    ctx.fill();
  };
  flame(44, 4, (g) => {
    g.addColorStop(0, 'rgba(255,120,30,0.2)');
    g.addColorStop(0.5, 'rgba(255,92,20,0.95)');
    g.addColorStop(1, 'rgba(200,40,10,0.95)');
  });
  flame(29, 38, (g) => {
    g.addColorStop(0, 'rgba(255,210,80,0.5)');
    g.addColorStop(0.55, 'rgba(255,190,50,1)');
    g.addColorStop(1, 'rgba(255,120,30,1)');
  });
  flame(15, 74, (g) => {
    g.addColorStop(0, 'rgba(255,250,200,0.8)');
    g.addColorStop(1, 'rgba(255,235,150,1)');
  });
};

function paintBarBack(ctx: Ctx, width: number, height: number): void {
  ctx.fillStyle = 'rgba(7,11,18,0.86)';
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, height / 2);
  ctx.fill();
}

function paintBarFill(ctx: Ctx, width: number, height: number): void {
  const inset = height * 0.17;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, (height - inset * 2) / 2);
  ctx.fill();
}

/** 칸 네 귀퉁이의 꺾쇠. 안쪽 흰색만 색이 입혀지고 바깥 어두운 테두리는 그대로 남는다. */
const paintBrackets: Paint = (ctx) => {
  const c = FX_SIZE / 2;
  const half = FX_SIZE * 0.45;
  const arm = FX_SIZE * 0.17;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [[11, 'rgba(5,9,15,0.5)'], [6, '#ffffff']] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(c + sx * half, c + sy * (half - arm));
      ctx.lineTo(c + sx * half, c + sy * half);
      ctx.lineTo(c + sx * (half - arm), c + sy * half);
      ctx.stroke();
    }
  }
};

/** 이동, 공격, 기술 범위 칸. 색은 tint로 입힌다. */
const paintTileMark: Paint = (ctx) => {
  const inset = FX_SIZE * 0.035;
  const size = FX_SIZE - inset * 2;
  const radius = FX_SIZE * 0.13;
  ctx.beginPath();
  ctx.roundRect(inset, inset, size, size, radius);
  ctx.fillStyle = 'rgba(255,255,255,0.46)';
  ctx.fill();
  ctx.lineWidth = FX_SIZE * 0.032;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
};

/** 발밑 그림자와 진영 색 고리. 납작한 타원으로 쓴다. */
function paintFoot(ctx: Ctx, rgb: string, size: number): void {
  const c = size / 2;
  const shadow = ctx.createRadialGradient(c, c, 0, c, c, c * 0.8);
  shadow.addColorStop(0, 'rgba(5,16,28,0.62)');
  shadow.addColorStop(0.75, 'rgba(5,16,28,0.42)');
  shadow.addColorStop(1, 'rgba(5,16,28,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, size, size);
  const ring = ctx.createRadialGradient(c, c, c * 0.52, c, c, c);
  ring.addColorStop(0, `rgba(${rgb},0)`);
  ring.addColorStop(0.46, `rgba(${rgb},0.95)`);
  ring.addColorStop(0.62, `rgba(${rgb},0.6)`);
  ring.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, size, size);
}

/** 턴 안내 띠. 가운데가 진하고 좌우로 사라진다. */
const paintBand: Paint = (ctx) => {
  const g = ctx.createLinearGradient(0, 0, FX_SIZE, 0);
  g.addColorStop(0, 'rgba(8,12,20,0)');
  g.addColorStop(0.22, 'rgba(8,12,20,0.86)');
  g.addColorStop(0.78, 'rgba(8,12,20,0.86)');
  g.addColorStop(1, 'rgba(8,12,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FX_SIZE, FX_SIZE);
  const line = ctx.createLinearGradient(0, 0, FX_SIZE, 0);
  line.addColorStop(0, 'rgba(240,199,102,0)');
  line.addColorStop(0.5, 'rgba(240,199,102,1)');
  line.addColorStop(1, 'rgba(240,199,102,0)');
  ctx.fillStyle = line;
  ctx.fillRect(0, 0, FX_SIZE, 3);
  ctx.fillRect(0, FX_SIZE - 3, FX_SIZE, 3);
};

export const SOFT_KEY = 'fx-soft';
export const FLAME_KEY = 'fx-flame';
export const BAND_KEY = 'fx-band';
export const RING_KEY = 'fx-ring';
export const CURSOR_KEY = 'hud-cursor';
export const TILE_KEY = 'hud-tile';
export const ARC_KEY = 'fx-arc';
export const ARROW_KEY = 'fx-arrow';
export const ROCK_KEY = 'fx-rock';
export const CROSS_KEY = 'fx-cross';
export const STREAK_KEY = 'fx-streak';
export const FLAG_KEY = 'hud-flag';
export const FX_TEXTURE_SIZE = FX_SIZE;

export function createEffectTextures(scene: Phaser.Scene): void {
  addTexture(scene, SOFT_KEY, FX_SIZE, FX_SIZE, paintSoft);
  addTexture(scene, FLAME_KEY, FX_SIZE, FX_SIZE, paintFlame);
  addTexture(scene, BAND_KEY, FX_SIZE, FX_SIZE, paintBand);
  addTexture(scene, RING_KEY, FX_SIZE, FX_SIZE, paintRing);
  addTexture(scene, ARC_KEY, FX_SIZE, FX_SIZE, paintArc);
  addTexture(scene, ARROW_KEY, FX_SIZE, 64, paintArrow);
  addTexture(scene, ROCK_KEY, FX_SIZE, FX_SIZE, paintRock);
  addTexture(scene, CROSS_KEY, FX_SIZE, FX_SIZE, paintCross);
  addTexture(scene, STREAK_KEY, FX_SIZE, FX_SIZE, paintStreak);
  addTexture(scene, CURSOR_KEY, FX_SIZE, FX_SIZE, paintBrackets);
  addTexture(scene, TILE_KEY, FX_SIZE, FX_SIZE, paintTileMark);
  addTexture(scene, FLAG_KEY, FX_SIZE, FX_SIZE, paintFlag);
}

/** 목표 칸에 꽂는 깃발. 아래쪽 가운데가 땅에 닿는다. */
const paintFlag: Paint = (ctx) => {
  const s = FX_SIZE / 100;
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill(ellipse(52, 96, 16, 4));
  ctx.fillStyle = '#54391d';
  ctx.fillRect(47, 12, 6, 84);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(47, 12, 2, 84);
  ctx.beginPath();
  ctx.moveTo(53, 14);
  ctx.bezierCurveTo(68, 8, 78, 24, 94, 16);
  ctx.lineTo(94, 50);
  ctx.bezierCurveTo(78, 58, 68, 42, 53, 48);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, 12, 54, '#ffd65a', '#e8972a');
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#7a4a10';
  ctx.stroke();
};

/* ---------- 지면 한 장 그림 ---------- */

/** 맵마다 지형이 같은 무늬가 되도록 정해진 씨앗으로 만드는 난수. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed: number): (x: number, y: number) => number {
  const random = seededRandom(seed);
  const size = 64;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = random();
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const at = (x: number, y: number) => grid[((y & 63) << 6) | (x & 63)];
  const layer = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx;
    const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
  return (x, y) => (layer(x, y) * 0.6 + layer(x * 2.1 + 17, y * 2.1 + 9) * 0.28 + layer(x * 4.3 + 5, y * 4.3 + 31) * 0.12);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const GRASS_DARK: Rgb = [90, 152, 78];
const GRASS_MID: Rgb = [102, 164, 82];
const GRASS_LIGHT: Rgb = [126, 182, 90];
const GRASS_DRY: Rgb = [164, 186, 100];
const FOREST_FLOOR: Rgb = [62, 118, 68];
const ROCK_FLOOR: Rgb = [146, 136, 108];
const SAND: Rgb = [207, 186, 132];
const WATER_DEEP: Rgb = [24, 96, 140];
const WATER_SHALLOW: Rgb = [58, 170, 182];
const STONE: Rgb = [176, 168, 148];

/** 맵 분위기별 땅 색. wash는 다 그린 뒤 전체에 곱하는 색이다. */
interface ThemeColors {
  dark: Rgb;
  mid: Rgb;
  light: Rgb;
  dry: Rgb;
  forest: Rgb;
  rock: Rgb;
  blades: [string, string];
  flowers: number;
  wash: string | null;
}
const GREEN_THEME: ThemeColors = {
  dark: GRASS_DARK,
  mid: GRASS_MID,
  light: GRASS_LIGHT,
  dry: GRASS_DRY,
  forest: FOREST_FLOOR,
  rock: ROCK_FLOOR,
  blades: ['rgba(40,90,50,0.5)', 'rgba(190,226,130,0.45)'],
  flowers: 0.42,
  wash: null,
};
const THEMES: Record<MapTheme, ThemeColors> = {
  green: GREEN_THEME,
  dry: {
    ...GREEN_THEME,
    dark: [150, 138, 88],
    mid: [164, 150, 94],
    light: [182, 166, 106],
    dry: [198, 176, 116],
    forest: [104, 116, 70],
    rock: [150, 130, 102],
    blades: ['rgba(92,80,40,0.45)', 'rgba(224,204,132,0.4)'],
    flowers: 0.08,
  },
  lush: {
    ...GREEN_THEME,
    dark: [56, 126, 70],
    mid: [66, 140, 74],
    light: [84, 156, 78],
    dry: [108, 158, 80],
    forest: [36, 90, 58],
    rock: [108, 116, 92],
    blades: ['rgba(20,70,40,0.55)', 'rgba(140,210,110,0.45)'],
    flowers: 0.3,
  },
  dusk: { ...GREEN_THEME, wash: 'rgb(255,208,160)' },
  gloom: { ...GREEN_THEME, wash: 'rgb(168,178,212)', flowers: 0.1 },
};

/** 성 안의 돌바닥 줄눈. */
function paintPavers(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.fillStyle = vGrad(ctx, y, y + s, 'rgba(150,140,120,0.92)', 'rgba(124,114,96,0.92)');
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = 'rgba(50,44,32,0.4)';
  ctx.lineWidth = Math.max(1, s * 0.016);
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(x, y + (s * i) / 3);
    ctx.lineTo(x + s, y + (s * i) / 3);
  }
  for (let row = 0; row < 3; row++) {
    const offset = row % 2 === 0 ? 0.25 : 0.75;
    ctx.moveTo(x + s * offset, y + (s * row) / 3);
    ctx.lineTo(x + s * offset, y + (s * (row + 1)) / 3);
  }
  ctx.stroke();
}

/** 성벽 한 칸. 아래 칸도 성벽이면 앞면을 그리지 않는다. */
function paintWallTile(ctx: Ctx, x: number, y: number, s: number, wallBelow: boolean): void {
  const face = wallBelow ? 0 : s * 0.42;
  const top = y - s * 0.16;
  ctx.fillStyle = 'rgba(8,12,20,0.3)';
  ctx.fillRect(x, y + s - s * 0.02, s, s * 0.12);
  ctx.fillStyle = vGrad(ctx, top, y + s - face, '#e2dac6', '#c6bea8');
  ctx.fillRect(x, top, s, y + s - face - top);
  if (face > 0) {
    ctx.fillStyle = vGrad(ctx, y + s - face, y + s, '#7f7866', '#585243');
    ctx.fillRect(x, y + s - face, s, face);
    ctx.strokeStyle = 'rgba(30,26,18,0.45)';
    ctx.lineWidth = Math.max(1, s * 0.014);
    ctx.beginPath();
    for (let row = 0; row < 3; row++) {
      const py = y + s - face + (face * row) / 3;
      ctx.moveTo(x, py);
      ctx.lineTo(x + s, py);
      for (let col = row % 2 === 0 ? 0.25 : 0.5; col < 1; col += 0.5) {
        ctx.moveTo(x + s * col, py);
        ctx.lineTo(x + s * col, py + face / 3);
      }
    }
    ctx.stroke();
  }
  // 위쪽 톱니
  ctx.fillStyle = '#f0e9d6';
  for (let k = 0; k < 3; k++) {
    ctx.fillRect(x + s * (0.06 + k * 0.33), top - s * 0.09, s * 0.22, s * 0.11);
  }
  ctx.strokeStyle = 'rgba(40,34,24,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.strokeRect(x, top, s, y + s - top);
}

/** 성문. 양쪽 기둥과 지붕을 그리고 가운데는 지나갈 수 있게 비워 둔다. */
function paintGateTile(ctx: Ctx, x: number, y: number, s: number): void {
  const post = s * 0.17;
  ctx.fillStyle = 'rgba(30,22,14,0.5)';
  ctx.fillRect(x + post, y + s * 0.1, s - post * 2, s * 0.35);
  ctx.fillStyle = vGrad(ctx, y, y + s, '#a79f8a', '#6f6856');
  ctx.fillRect(x, y - s * 0.12, post, s * 1.12);
  ctx.fillRect(x + s - post, y - s * 0.12, post, s * 1.12);
  ctx.fillStyle = hGrad(ctx, x, x + s, '#7a2c1e', '#a8432c');
  ctx.beginPath();
  ctx.moveTo(x - s * 0.08, y + s * 0.1);
  ctx.lineTo(x + s * 0.12, y - s * 0.24);
  ctx.lineTo(x + s * 0.88, y - s * 0.24);
  ctx.lineTo(x + s * 1.08, y + s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#54391d';
  ctx.fillRect(x, y + s * 0.1, s, s * 0.09);
}

/** 배 갑판 한 칸. 이웃도 갑판이면 그쪽 뱃전을 그리지 않아 큰 배처럼 이어진다. */
function paintDeckTile(ctx: Ctx, x: number, y: number, s: number, near: { up: boolean; down: boolean; left: boolean; right: boolean }): void {
  ctx.fillStyle = vGrad(ctx, y, y + s, '#b78b57', '#94693c');
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = 'rgba(50,30,14,0.45)';
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.beginPath();
  for (let i = 1; i < 5; i++) {
    ctx.moveTo(x, y + (s * i) / 5);
    ctx.lineTo(x + s, y + (s * i) / 5);
  }
  ctx.stroke();
  const edge = s * 0.09;
  ctx.fillStyle = '#54391d';
  if (!near.up) ctx.fillRect(x, y, s, edge);
  if (!near.left) ctx.fillRect(x, y, edge, s);
  if (!near.right) ctx.fillRect(x + s - edge, y, edge, s);
  if (!near.down) {
    ctx.fillRect(x, y + s - edge, s, edge);
    ctx.fillStyle = 'rgba(5,20,35,0.4)';
    ctx.fillRect(x, y + s, s, s * 0.1);
  }
}

/** 돛대와 돛. 배 몇 칸에만 세운다. */
function paintMast(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.fillStyle = '#4a3218';
  ctx.fillRect(x + s * 0.47, y - s * 0.6, s * 0.06, s * 1.1);
  ctx.fillStyle = 'rgba(232,226,204,0.92)';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.53, y - s * 0.55);
  ctx.quadraticCurveTo(x + s * 0.95, y - s * 0.28, x + s * 0.53, y + s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,70,40,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.stroke();
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function paintBridgeTile(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(5,20,35,0.35)';
  ctx.fillRect(x + w * 0.08, y, w * 0.96, h);
  ctx.fillStyle = hGrad(ctx, x, x + w, '#8a6238', '#b78b57');
  ctx.fillRect(x, y, w, h);
  const planks = 6;
  for (let i = 0; i <= planks; i++) {
    const py = y + (h * i) / planks;
    ctx.fillStyle = 'rgba(50,30,14,0.55)';
    ctx.fillRect(x, py - h * 0.008, w, h * 0.016);
    ctx.fillStyle = 'rgba(255,230,180,0.14)';
    ctx.fillRect(x, py + h * 0.012, w, h * 0.012);
  }
  ctx.fillStyle = '#54391d';
  ctx.fillRect(x - w * 0.03, y, w * 0.08, h);
  ctx.fillRect(x + w * 0.95, y, w * 0.08, h);
  ctx.fillStyle = 'rgba(255,220,160,0.35)';
  ctx.fillRect(x - w * 0.03, y, w * 0.025, h);
  ctx.fillRect(x + w * 0.95, y, w * 0.025, h);
}

/** 지형 칸들을 경계 없이 이어진 한 장의 그림으로 그린다. 픽셀 계산은 절반 해상도로 해 시간을 줄인다. */
export function paintBackdrop(canvas: HTMLCanvasElement, tiles: string[][], tilePx: number, seedText: string, themeId: MapTheme = 'green'): void {
  const ctx = canvas.getContext('2d')!;
  const theme = THEMES[themeId];
  const rows = tiles.length;
  const cols = tiles[0].length;
  const seed = hashString(seedText);
  const noise = makeNoise(seed);
  const step = 2;
  const w = Math.ceil(canvas.width / step);
  const h = Math.ceil(canvas.height / step);
  const low = document.createElement('canvas');
  low.width = w;
  low.height = h;
  const lowCtx = low.getContext('2d')!;
  const image = lowCtx.createImageData(w, h);

  const tileAt = (tx: number, ty: number): string => tiles[Math.min(rows - 1, Math.max(0, ty))][Math.min(cols - 1, Math.max(0, tx))];
  /** 칸 중심 값을 부드럽게 이어 지형 경계를 유기적으로 만든다. */
  const blend = (fx: number, fy: number, test: (id: string) => boolean): number => {
    const gx = fx - 0.5;
    const gy = fy - 0.5;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const tx = smoothstep(0, 1, gx - ix);
    const ty = smoothstep(0, 1, gy - iy);
    const value = (x: number, y: number) => (test(tileAt(x, y)) ? 1 : 0);
    const top = value(ix, iy) * (1 - tx) + value(ix + 1, iy) * tx;
    const bottom = value(ix, iy + 1) * (1 - tx) + value(ix + 1, iy + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
  const isWater = (id: string) => id === 'river' || id === 'bridge' || id === 'deck';
  const isStone = (id: string) => id === 'castle' || id === 'gate' || id === 'wall';

  let i = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const fx = ((px + 0.5) * step) / tilePx;
      const fy = ((py + 0.5) * step) / tilePx;
      const n = noise(fx * 1.1, fy * 1.1);
      const fine = noise(fx * 11 + 40, fy * 11 + 11);
      let color = mix(theme.dark, theme.mid, smoothstep(0.41, 0.45, n));
      color = mix(color, theme.light, smoothstep(0.54, 0.58, n));
      color = mix(color, theme.dry, smoothstep(0.6, 0.64, noise(fx * 0.8 + 80, fy * 0.8 + 3)) * 0.5);
      const forest = blend(fx, fy, (id) => id === 'forest');
      color = mix(color, theme.forest, smoothstep(0.25, 0.75, forest + (fine - 0.5) * 0.35) * 0.9);
      const rock = blend(fx, fy, (id) => id === 'mountain');
      color = mix(color, theme.rock, smoothstep(0.3, 0.75, rock + (fine - 0.5) * 0.4) * 0.92);
      const stone = blend(fx, fy, isStone);
      color = mix(color, STONE, smoothstep(0.3, 0.6, stone + (fine - 0.5) * 0.25));
      const shade2 = 0.98 + (fine - 0.5) * 0.14;
      color = [color[0] * shade2, color[1] * shade2, color[2] * shade2];

      // 물: 칸 중심을 이은 값에 잡음을 더해 물가를 구불구불하게 만든다
      const water = blend(fx, fy, isWater) + (noise(fx * 2.4 + 9, fy * 2.4 + 61) - 0.5) * 0.28;
      if (water > 0.3) {
        const depth = smoothstep(0.42, 0.95, water);
        let wet = mix(WATER_SHALLOW, WATER_DEEP, depth);
        const wave = noise(fx * 9 + 7, fy * 26 + 3);
        wet = mix(wet, [190, 232, 236], smoothstep(0.66, 0.78, wave) * 0.28);
        const bank = smoothstep(0.3, 0.38, water) * (1 - smoothstep(0.38, 0.46, water));
        color = mix(mix(color, SAND, smoothstep(0.3, 0.36, water)), wet, smoothstep(0.37, 0.45, water));
        color = mix(color, SAND, bank * 0.5);
      }
      // 왼쪽 위에서 비치는 빛
      const light = 1.06 - (fx / cols + fy / rows) * 0.11;
      image.data[i++] = Math.min(255, color[0] * light);
      image.data[i++] = Math.min(255, color[1] * light);
      image.data[i++] = Math.min(255, color[2] * light);
      image.data[i++] = 255;
    }
  }
  lowCtx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(low, 0, 0, canvas.width, canvas.height);

  // 풀과 꽃 무늬
  const random = seededRandom(seed ^ 0x51ed);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const id = tiles[ty][tx];
      if (isWater(id) || isStone(id)) continue;
      const blades = id === 'plain' ? 16 : 7;
      for (let k = 0; k < blades; k++) {
        const x = (tx + random()) * tilePx;
        const y = (ty + random()) * tilePx;
        const size = tilePx * (0.03 + random() * 0.035);
        ctx.strokeStyle = random() < 0.5 ? theme.blades[0] : theme.blades[1];
        ctx.lineWidth = Math.max(1, tilePx * 0.008);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + size * 0.2, y - size * 0.7, x + size * (random() - 0.5), y - size * 1.2);
        ctx.stroke();
      }
      if (id === 'plain' && random() < theme.flowers) {
        const fx = (tx + 0.15 + random() * 0.7) * tilePx;
        const fy = (ty + 0.15 + random() * 0.7) * tilePx;
        const colors = ['#ffe9a8', '#ffffff', '#f7b9c8'];
        ctx.fillStyle = colors[Math.floor(random() * colors.length)];
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(fx + (random() - 0.5) * tilePx * 0.16, fy + (random() - 0.5) * tilePx * 0.16, tilePx * 0.012, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const id = tiles[ty][tx];
      if (id === 'castle' || id === 'gate') paintPavers(ctx, tx * tilePx, ty * tilePx, tilePx);
      if (id === 'deck') {
        const same = (dx: number, dy: number) => tiles[ty + dy]?.[tx + dx] === 'deck';
        paintDeckTile(ctx, tx * tilePx, ty * tilePx, tilePx, { up: same(0, -1), down: same(0, 1), left: same(-1, 0), right: same(1, 0) });
      }
      if (id !== 'bridge') continue;
      // 위아래가 물이면 좌우로 건너는 다리이므로 눕혀 그린다
      const water = (dx: number, dy: number) => tiles[ty + dy]?.[tx + dx] === 'river';
      if (water(0, -1) && water(0, 1) && !(water(-1, 0) && water(1, 0))) {
        ctx.save();
        ctx.translate((tx + 0.5) * tilePx, (ty + 0.5) * tilePx);
        ctx.rotate(Math.PI / 2);
        paintBridgeTile(ctx, -0.34 * tilePx, -0.6 * tilePx, tilePx * 0.68, tilePx * 1.2);
        ctx.restore();
      } else {
        paintBridgeTile(ctx, (tx + 0.16) * tilePx, (ty - 0.1) * tilePx, tilePx * 0.68, tilePx * 1.2);
      }
    }
  }

  // 칸을 읽을 수 있을 정도의 옅은 격자
  ctx.lineWidth = Math.max(1, tilePx * 0.008);
  ctx.strokeStyle = 'rgba(10,25,20,0.13)';
  ctx.beginPath();
  for (let tx = 1; tx < cols; tx++) {
    ctx.moveTo(tx * tilePx, 0);
    ctx.lineTo(tx * tilePx, rows * tilePx);
  }
  for (let ty = 1; ty < rows; ty++) {
    ctx.moveTo(0, ty * tilePx);
    ctx.lineTo(cols * tilePx, ty * tilePx);
  }
  ctx.stroke();

  paintProps(ctx, tiles, tilePx);
  paintLighting(ctx, canvas.width, canvas.height);
  if (theme.wash) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = theme.wash;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

/** 나무, 산을 칸 안쪽 뒤편에 그린다. 위 줄부터 그려 아래 줄이 앞에 온다. */
function paintProps(ctx: Ctx, tiles: string[][], tilePx: number): void {
  const random = seededRandom(7);
  const place = (draw: () => void, tx: number, ty: number, fx: number, fy: number, size: number) => {
    const k = (tilePx / 100) * size;
    ctx.save();
    ctx.translate((tx + fx) * tilePx, (ty + fy) * tilePx);
    ctx.scale(random() < 0.5 ? -k : k, k);
    draw();
    ctx.restore();
  };
  const tree = () => {
    const variant = Math.floor(random() * 3);
    return () => paintTree(ctx, variant);
  };
  tiles.forEach((row, ty) =>
    row.forEach((terrainId, tx) => {
      if (terrainId === 'forest') {
        place(tree(), tx, ty, 0.5, 0.3, 0.9);
        place(tree(), tx, ty, 0.78, 0.46, 0.86);
        place(tree(), tx, ty, 0.24, 0.5, 0.82);
        place(() => paintShrub(ctx), tx, ty, 0.14 + random() * 0.7, 0.92, 0.6);
      } else if (terrainId === 'mountain') {
        place(() => paintMountain(ctx, tx + ty), tx, ty, 0.5, 0.96, 0.98);
      } else if (terrainId === 'wall') {
        paintWallTile(ctx, tx * tilePx, ty * tilePx, tilePx, tiles[ty + 1]?.[tx] === 'wall');
      } else if (terrainId === 'gate') {
        paintGateTile(ctx, tx * tilePx, ty * tilePx, tilePx);
      } else if (terrainId === 'deck' && (tx * 3 + ty * 5) % 8 === 0) {
        paintMast(ctx, tx * tilePx, ty * tilePx, tilePx);
      } else if (terrainId === 'plain' && random() < 0.08) {
        place(() => paintShrub(ctx), tx, ty, 0.2 + random() * 0.6, 0.5 + random() * 0.4, 0.5);
      }
    }),
  );
}

/** 왼쪽 위에서 비치는 따뜻한 빛과, 시선을 가운데로 모으는 테두리 어둠. */
function paintLighting(ctx: Ctx, width: number, height: number): void {
  const warm = ctx.createRadialGradient(width * 0.1, height * 0.05, 0, width * 0.1, height * 0.05, width * 0.95);
  warm.addColorStop(0, 'rgba(255,224,168,0.17)');
  warm.addColorStop(1, 'rgba(255,224,168,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(width, height);
  const dark = ctx.createRadialGradient(0, 0, 0.42, 0, 0, 0.74);
  dark.addColorStop(0, 'rgba(6,12,24,0)');
  dark.addColorStop(1, 'rgba(6,12,24,0.6)');
  ctx.fillStyle = dark;
  ctx.fillRect(-0.5, -0.5, 1, 1);
  ctx.restore();
}
