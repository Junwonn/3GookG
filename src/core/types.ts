export interface Pos {
  x: number;
  y: number;
}

export type Side = 'ally' | 'enemy';

/** 옆모습 그림이라 좌우 두 방향만 있다. */
export type Facing = 'left' | 'right';

export interface RangeDef {
  min: number;
  max: number;
  /** any: 맨해튼 거리 안 어디든, line: 상하좌우 직선만 */
  pattern: 'any' | 'line';
}

export interface ClassDef {
  name: string;
  move: number;
  range: RangeDef;
  powerBonus: number;
  guardBonus: number;
  /** 지형별 이동 비용. 없는 지형은 진입 불가. */
  moveCost: Record<string, number>;
  /** 화면에 보여 줄 병과 특징 한 줄 */
  trait: string;
}

export interface TerrainDef {
  name: string;
  symbol: string;
  /** 이 지형 위의 부대가 받는 피해 배율 */
  damageTaken: number;
}

export interface GeneralDef {
  name: string;
  mark: string;
  classId: string;
  /** 이름 있는 장수인지(깃발 표시). 일반 병사는 생략한다. */
  officer?: boolean;
  power: number;
  guard: number;
  troops: number;
  /** 쓸 수 있는 책략과 필살기 id */
  skills?: string[];
  /** 소속 세력. 옷 색과 투구 같은 겉모습만 정한다. */
  faction?: string;
}

export type SkillVisual = 'fire' | 'rock' | 'heal' | 'slash' | 'arrow';

export interface SkillDef {
  name: string;
  /** stratagem: 책략, special: 필살기 */
  kind: 'stratagem' | 'special';
  description: string;
  /** 필요 기력 */
  cost: number;
  effect: 'damage' | 'heal';
  /** 시전자에서 중심 칸까지의 거리. max가 0이면 자기 칸이 중심이다. */
  range: RangeDef;
  /** burst: 중심에서 radius 안, pierce: 시전자에서 중심 쪽으로 range.max 칸까지 일직선 */
  shape: 'burst' | 'pierce';
  radius: number;
  targets: 'enemy' | 'ally';
  /** damage: 일반 공격 대비 배율, heal: 최대 병력 대비 회복 비율 */
  power: number;
  /** 지형별 피해 배율. 없으면 지형의 일반 방어 배율을 쓴다. */
  terrain?: Record<string, number>;
  /** 중심으로 삼을 수 없는 지형 */
  forbidCenter?: string[];
  /** 중심 칸이 이 지형 위이거나 바로 옆이어야 한다. */
  requireNear?: string;
  /** 범위 안의 해당 지형을 몇 턴 동안 태운다. */
  ignite?: { terrain: string[]; turns: number };
  visual: SkillVisual;
}

export type AiConfig =
  | { type: 'charge' }
  | { type: 'wait' }
  | { type: 'defend'; radius: number }
  | { type: 'guard'; escortId: string; radius: number };

export interface MapUnitDef {
  id: string;
  generalId: string;
  side: Side;
  x: number;
  y: number;
  ai?: AiConfig;
}

export type VictoryDef =
  | { type: 'annihilate' }
  | { type: 'unitDown'; unitId: string }
  | { type: 'survive'; turns: number }
  /** 목표 칸에 서서 행동을 마치면 승리. unitId가 없으면 아군 누구든 된다. */
  | { type: 'reach'; x: number; y: number; unitId?: string }
  /** turns턴을 버티면 승리. 적이 목표 칸에 서서 행동을 마치면 패배. */
  | { type: 'hold'; x: number; y: number; turns: number };

/** 맵의 분위기. 땅 색과 빛만 바뀌고 규칙에는 영향이 없다. */
export type MapTheme = 'green' | 'dry' | 'lush' | 'dusk' | 'gloom';

export interface MapDef {
  id: string;
  name: string;
  objective: string;
  /** 이 화의 사정을 알려 주는 한 줄 */
  brief?: string;
  theme?: MapTheme;
  /** 이 화의 적 전체에 곱하는 배율. 같은 병사로 난이도를 조절한다. */
  enemyScale?: { power?: number; troops?: number };
  /** 어떤 조건이든 적을 전멸시키면 승리한다. */
  victory: VictoryDef;
  defeat: { type: 'unitDown'; unitId: string };
  rows: string[];
  units: MapUnitDef[];
}

export interface GameData {
  classes: Record<string, ClassDef>;
  terrain: Record<string, TerrainDef>;
  generals: Record<string, GeneralDef>;
  skills: Record<string, SkillDef>;
}

export interface Unit {
  id: string;
  generalId: string;
  name: string;
  mark: string;
  officer: boolean;
  classId: string;
  side: Side;
  x: number;
  y: number;
  /** 바라보는 방향. 마지막으로 좌우로 움직인 쪽을 본다. */
  facing: Facing;
  /** 이동을 취소할 때 되돌릴 방향 */
  facingBeforeMove: Facing;
  troops: number;
  maxTroops: number;
  power: number;
  guard: number;
  /** 책략과 필살기에 쓰는 힘 */
  spirit: number;
  skills: string[];
  moved: boolean;
  acted: boolean;
  ai?: AiConfig;
  /** wait 유형이 깨어났는지 여부 */
  alerted: boolean;
  /** defend 유형이 지키는 위치 */
  anchor: Pos;
}

export type Phase = 'ally' | 'enemy' | 'ended';
export type BattleResult = 'victory' | 'defeat' | null;

export interface Battle {
  data: GameData;
  map: MapDef;
  /** tiles[y][x] = 지형 id */
  tiles: string[][];
  width: number;
  height: number;
  units: Unit[];
  turn: number;
  phase: Phase;
  result: BattleResult;
  fires: Fire[];
}

/** 불타는 칸. turns가 0이 되면 꺼진다. */
export interface Fire {
  x: number;
  y: number;
  turns: number;
}

export interface BurnEvent {
  unitId: string;
  amount: number;
  troops: number;
}

export interface SkillHit {
  unitId: string;
  effect: 'damage' | 'heal';
  amount: number;
  troops: number;
  defeated: boolean;
}

export interface SkillResult {
  casterId: string;
  skillId: string;
  center: Pos;
  area: Pos[];
  hits: SkillHit[];
  ignited: Pos[];
}

export interface DamageEvent {
  attackerId: string;
  defenderId: string;
  amount: number;
  defenderTroops: number;
  defeated: boolean;
  isCounter: boolean;
}
