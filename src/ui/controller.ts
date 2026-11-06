import {
  attack,
  canClaimGoal,
  cancelMove,
  endAllyTurn,
  getUnit,
  goalTile,
  livingUnits,
  moveUnit,
  targetsFrom,
  unitAt,
  waitUnit,
} from '../core/battle';
import { rangeTiles } from '../core/combat';
import { key, reachableTiles } from '../core/pathfinding';
import { previewSkill, skillArea, skillBlockReason, skillCenters, useSkill } from '../core/skills';
import type { Battle, BurnEvent, DamageEvent, Pos, SkillResult, Unit } from '../core/types';

export type Effect =
  | { type: 'move'; unitId: string; path: Pos[] }
  | { type: 'snap'; unitId: string }
  | { type: 'attack'; events: DamageEvent[] }
  | { type: 'skill'; result: SkillResult }
  | { type: 'burn'; events: BurnEvent[] }
  | { type: 'enemyPhase' };

type Mode =
  | { kind: 'idle' }
  | { kind: 'inspect'; unitId: string }
  | { kind: 'selected'; unitId: string }
  | { kind: 'moved'; unitId: string; origin: Pos }
  | { kind: 'targeting'; unitId: string; origin: Pos }
  | { kind: 'skillMenu'; unitId: string; origin: Pos }
  | { kind: 'skillAim'; unitId: string; origin: Pos; skillId: string; center: Pos | null };

export interface SkillOption {
  id: string;
  name: string;
  kindLabel: string;
  cost: number;
  /** 지금 못 쓰는 이유. 쓸 수 있으면 null */
  blocked: string | null;
}

export interface ControllerView {
  selectedId: string | null;
  moveTiles: Pos[];
  threatTiles: Pos[];
  targetTiles: Pos[];
  /** 기술의 중심으로 고를 수 있는 칸 */
  skillTiles: Pos[];
  /** 고른 중심에서 기술이 닿는 칸 */
  areaTiles: Pos[];
  /** 기술 목록을 펼친 동안만 값이 있다. */
  skillOptions: SkillOption[] | null;
  /** 부대를 옮긴 뒤에는 턴 종료 자리에 기술 버튼을 보여 준다. */
  showSkillButton: boolean;
  canSkill: boolean;
  canAttack: boolean;
  canWait: boolean;
  canCancel: boolean;
  canEndTurn: boolean;
  confirmEnd: boolean;
  message: string;
}

const IDLE_MESSAGE = '움직일 아군 부대를 누르세요.';

/**
 * 터치와 키보드 입력을 전투 규칙 호출로 바꾼다. 화면(Phaser)을 전혀 모른다.
 * 흐름: 부대 선택 -> 이동 칸 선택 -> 공격/기술/대기/취소 -> 다음 부대.
 * 기술은 목록에서 고르고, 칸을 눌러 범위를 본 다음, 같은 칸을 한 번 더 눌러 쓴다.
 */
export class BattleController {
  private mode: Mode = { kind: 'idle' };
  private confirmEnd = false;
  private message: string;

  constructor(public readonly battle: Battle) {
    this.message = battle.map.brief ?? `${battle.map.name}. ${IDLE_MESSAGE}`;
  }

  tapTile(x: number, y: number): Effect[] {
    if (this.battle.phase !== 'ally') return [];
    this.confirmEnd = false;
    switch (this.mode.kind) {
      case 'idle':
      case 'inspect':
        return this.tapToSelect(x, y);
      case 'selected':
        return this.tapInSelected(this.mode.unitId, x, y);
      case 'moved':
      case 'targeting':
        return this.tapTarget(this.mode.unitId, x, y);
      case 'skillMenu':
        return [];
      case 'skillAim':
        return this.tapSkillTile(this.mode, x, y);
    }
  }

  pressSkill(): Effect[] {
    if (this.mode.kind !== 'moved' || !this.view().canSkill) return [];
    this.confirmEnd = false;
    this.mode = { ...this.mode, kind: 'skillMenu' };
    this.message = '쓸 기술을 고르세요.';
    return [];
  }

  chooseSkill(skillId: string): Effect[] {
    if (this.mode.kind !== 'skillMenu') return [];
    const unit = getUnit(this.battle, this.mode.unitId);
    if (!unit.skills.includes(skillId)) return [];
    const skill = this.battle.data.skills[skillId];
    if (skillBlockReason(this.battle, unit, skill)) return [];
    const { unitId, origin } = this.mode;
    // 자기 칸이 중심인 기술은 고를 칸이 없으니 바로 범위를 보여 준다.
    const center = skill.range.max === 0 ? { x: unit.x, y: unit.y } : null;
    this.mode = { kind: 'skillAim', unitId, origin, skillId, center };
    this.message = center ? this.previewMessage(unit, skillId, center) : `${skill.name}: ${skill.description} 보라색 칸을 고르세요.`;
    return [];
  }

  pressAttack(): Effect[] {
    if (this.mode.kind !== 'moved' || !this.view().canAttack) return [];
    this.confirmEnd = false;
    this.mode = { ...this.mode, kind: 'targeting' };
    this.message = '공격할 적을 고르세요.';
    return [];
  }

  pressWait(): Effect[] {
    if (this.mode.kind !== 'moved' && this.mode.kind !== 'targeting') return [];
    this.confirmEnd = false;
    waitUnit(this.battle, this.mode.unitId);
    return this.afterAction('대기했습니다.');
  }

  pressCancel(): Effect[] {
    this.confirmEnd = false;
    switch (this.mode.kind) {
      case 'skillAim':
        this.mode = { kind: 'skillMenu', unitId: this.mode.unitId, origin: this.mode.origin };
        this.message = '쓸 기술을 고르세요.';
        return [];
      case 'skillMenu':
      case 'targeting':
        this.mode = { kind: 'moved', unitId: this.mode.unitId, origin: this.mode.origin };
        this.message = '행동을 고르세요.';
        return [];
      case 'moved': {
        const { unitId, origin } = this.mode;
        cancelMove(this.battle, unitId, origin);
        this.mode = { kind: 'selected', unitId };
        this.message = '이동을 취소했습니다. 이동할 칸을 누르세요.';
        return [{ type: 'snap', unitId }];
      }
      case 'selected':
      case 'inspect':
        this.mode = { kind: 'idle' };
        this.message = IDLE_MESSAGE;
        return [];
      case 'idle':
        return [];
    }
  }

  pressEndTurn(): Effect[] {
    if (!this.view().canEndTurn) return [];
    const unacted = livingUnits(this.battle, 'ally').some((unit) => !unit.acted);
    if (unacted && !this.confirmEnd) {
      this.confirmEnd = true;
      this.message = '아직 행동하지 않은 부대가 있습니다. 한 번 더 누르면 턴을 끝냅니다.';
      return [];
    }
    return this.startEnemyPhase();
  }

  /** 적 턴이 끝나고 아군 턴이 다시 시작될 때 화면이 호출한다. */
  onAllyTurnStart(): void {
    this.mode = { kind: 'idle' };
    this.confirmEnd = false;
    this.message = `${this.battle.turn}턴 시작. ${IDLE_MESSAGE}`;
  }

  /** 적 턴 동안 안내 문구를 바꿀 때 화면이 호출한다. */
  setMessage(message: string): void {
    this.message = message;
  }

  view(): ControllerView {
    const mode = this.mode;
    const base: ControllerView = {
      selectedId: null,
      moveTiles: [],
      threatTiles: [],
      targetTiles: [],
      skillTiles: [],
      areaTiles: [],
      skillOptions: null,
      showSkillButton: false,
      canSkill: false,
      canAttack: false,
      canWait: false,
      canCancel: false,
      canEndTurn: this.battle.phase === 'ally' && (mode.kind === 'idle' || mode.kind === 'inspect'),
      confirmEnd: this.confirmEnd,
      message: this.message,
    };
    if (mode.kind === 'idle') return base;

    const unit = getUnit(this.battle, mode.unitId);
    if (mode.kind === 'inspect' || mode.kind === 'selected') {
      return { ...base, selectedId: unit.id, ...this.rangeOverlay(unit), canCancel: true };
    }
    const acting = { ...base, selectedId: unit.id, showSkillButton: true, canCancel: true };
    if (mode.kind === 'skillMenu') return { ...acting, skillOptions: this.skillOptions(unit) };
    if (mode.kind === 'skillAim') {
      const skill = this.battle.data.skills[mode.skillId];
      return {
        ...acting,
        skillTiles: skillCenters(this.battle, unit, skill),
        areaTiles: mode.center ? skillArea(this.battle, skill, unit, mode.center) : [],
      };
    }
    const targets = targetsFrom(this.battle, unit, unit).map(({ x, y }) => ({ x, y }));
    return {
      ...acting,
      targetTiles: targets,
      canAttack: mode.kind === 'moved' && targets.length > 0,
      canSkill: mode.kind === 'moved' && unit.skills.length > 0,
      canWait: true,
    };
  }

  private skillOptions(unit: Unit): SkillOption[] {
    return unit.skills.map((id) => {
      const skill = this.battle.data.skills[id];
      return {
        id,
        name: skill.name,
        kindLabel: skill.kind === 'stratagem' ? '책략' : '필살기',
        cost: skill.cost,
        blocked: skillBlockReason(this.battle, unit, skill),
      };
    });
  }

  private previewMessage(unit: Unit, skillId: string, center: Pos): string {
    const skill = this.battle.data.skills[skillId];
    const preview = previewSkill(this.battle, unit, skill, center);
    const parts: string[] = [];
    if (skill.effect === 'heal') parts.push(`아군 ${preview.count}부대 병력 ${preview.total} 회복`);
    else if (preview.count > 0) parts.push(`적 ${preview.count}부대에 피해 ${preview.total}`);
    if (preview.ignites > 0) parts.push(`${preview.ignites}칸에 불`);
    return `${skill.name}: ${parts.join(', ')}. 같은 칸을 한 번 더 누르면 사용합니다.`;
  }

  private tapSkillTile(mode: Extract<Mode, { kind: 'skillAim' }>, x: number, y: number): Effect[] {
    const unit = getUnit(this.battle, mode.unitId);
    const skill = this.battle.data.skills[mode.skillId];
    if (mode.center && mode.center.x === x && mode.center.y === y) return this.castSkill(unit, mode.skillId, mode.center);
    if (skillCenters(this.battle, unit, skill).some((tile) => tile.x === x && tile.y === y)) {
      const center = { x, y };
      this.mode = { ...mode, center };
      this.message = this.previewMessage(unit, mode.skillId, center);
      return [];
    }
    // 자기 칸이 중심인 기술은 범위 안 어디를 눌러도 쓴다.
    if (mode.center && skill.range.max === 0 && skillArea(this.battle, skill, unit, mode.center).some((tile) => tile.x === x && tile.y === y)) {
      return this.castSkill(unit, mode.skillId, mode.center);
    }
    return [];
  }

  private castSkill(unit: Unit, skillId: string, center: Pos): Effect[] {
    const skill = this.battle.data.skills[skillId];
    const result = useSkill(this.battle, unit.id, skillId, center);
    const total = result.hits.reduce((sum, hit) => sum + hit.amount, 0);
    const summary =
      result.hits.length === 0
        ? `${result.ignited.length}칸에 불을 질렀습니다.`
        : skill.effect === 'heal'
          ? `병력 ${total} 회복.`
          : `적 ${result.hits.length}부대에 피해 ${total}.`;
    return [{ type: 'skill', result }, ...this.afterAction(`${unit.name}의 ${skill.name}: ${summary}`)];
  }

  private rangeOverlay(unit: Unit): { moveTiles: Pos[]; threatTiles: Pos[] } {
    const reach = [...reachableTiles(this.battle, unit).values()];
    const moveKeys = new Set(reach.map((tile) => key(tile.x, tile.y)));
    const threat = new Map<string, Pos>();
    const range = this.battle.data.classes[unit.classId].range;
    for (const tile of reach) {
      for (const pos of rangeTiles(this.battle, range, tile)) {
        const tileKey = key(pos.x, pos.y);
        if (!moveKeys.has(tileKey)) threat.set(tileKey, pos);
      }
    }
    return {
      moveTiles: reach.map(({ x, y }) => ({ x, y })),
      threatTiles: [...threat.values()],
    };
  }

  private tapToSelect(x: number, y: number): Effect[] {
    const unit = unitAt(this.battle, x, y);
    if (!unit) {
      this.mode = { kind: 'idle' };
      this.message = IDLE_MESSAGE;
    } else if (unit.side === 'ally' && !unit.acted) {
      this.mode = { kind: 'selected', unitId: unit.id };
      this.message = `${unit.name}: 이동할 파란 칸을 누르세요. 제자리도 됩니다.`;
    } else {
      this.mode = { kind: 'inspect', unitId: unit.id };
      this.message =
        unit.side === 'ally'
          ? `${unit.name}은(는) 이미 행동했습니다.`
          : `${unit.name}의 이동(파랑)과 공격(빨강) 범위입니다.`;
    }
    return [];
  }

  private tapInSelected(unitId: string, x: number, y: number): Effect[] {
    const unit = getUnit(this.battle, unitId);
    if (!reachableTiles(this.battle, unit).has(key(x, y))) return this.tapToSelect(x, y);
    const origin = { x: unit.x, y: unit.y };
    const path = moveUnit(this.battle, unitId, x, y);
    this.mode = { kind: 'moved', unitId, origin };
    const goal = goalTile(this.battle.map);
    const onGoal = goal?.x === x && goal.y === y && canClaimGoal(this.battle.map, unit);
    this.message = onGoal
      ? '목표 칸입니다. 대기를 누르면 도착합니다.'
      : targetsFrom(this.battle, unit, unit).length > 0
        ? '빨간 칸의 적을 눌러 공격하거나 대기하세요.'
        : '공격할 적이 없습니다. 대기 또는 취소하세요.';
    return [{ type: 'move', unitId, path }];
  }

  private tapTarget(unitId: string, x: number, y: number): Effect[] {
    const unit = getUnit(this.battle, unitId);
    const target = targetsFrom(this.battle, unit, unit).find((enemy) => enemy.x === x && enemy.y === y);
    if (!target) return [];
    const events = attack(this.battle, unitId, target.id);
    const [hit, counter] = events;
    const text = counter
      ? `${unit.name}: ${target.name}에게 ${hit.amount} 피해, 반격으로 ${counter.amount} 피해.`
      : `${unit.name}: ${target.name}에게 ${hit.amount} 피해.`;
    return [{ type: 'attack', events }, ...this.afterAction(text)];
  }

  private afterAction(message: string): Effect[] {
    this.mode = { kind: 'idle' };
    this.message = message;
    if (this.battle.phase === 'ended') return [];
    if (livingUnits(this.battle, 'ally').every((unit) => unit.acted)) return this.startEnemyPhase();
    return [];
  }

  private startEnemyPhase(): Effect[] {
    this.mode = { kind: 'idle' };
    this.confirmEnd = false;
    const burns = endAllyTurn(this.battle);
    return [...(burns.length > 0 ? [{ type: 'burn' as const, events: burns }] : []), { type: 'enemyPhase' }];
  }
}
