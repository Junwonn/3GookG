import { attack, getUnit, goalTile, isBurning, livingUnits, moveUnit, targetsFrom, waitUnit } from './battle';
import { calcDamage, damageAgainst, inRange } from './combat';
import { distanceMap, key, manhattan, reachableTiles, type ReachInfo } from './pathfinding';
import { skillCenters, skillDamage, skillHeal, skillTargets, useSkill } from './skills';
import type { Battle, DamageEvent, Pos, SkillDef, SkillResult, Unit } from './types';

export interface EnemyPlan {
  moveTo: Pos;
  targetId?: string;
  skill?: { id: string; center: Pos };
}

export interface EnemyStep {
  unitId: string;
  path: Pos[];
  events: DamageEvent[];
  skill?: SkillResult;
}

const KILL_BONUS = 200;
const LEADER_KILL_BONUS = 2000;
const TERRAIN_WEIGHT = 40;
const COUNTER_WEIGHT = 0.5;
/** 기력을 쓰는 만큼, 일반 공격보다 이만큼 나을 때만 기술을 쓴다. */
const SKILL_MARGIN = 1.15;

function livingEscort(battle: Battle, unit: Unit): Unit | undefined {
  if (unit.ai?.type !== 'guard') return undefined;
  const escort = getUnit(battle, unit.ai.escortId);
  return escort.troops > 0 ? escort : undefined;
}

/** 이 AI 유형이 이번 턴에 서도 되는 칸인지 판단한다. */
function allowedTile(battle: Battle, unit: Unit, tile: Pos): boolean {
  const ai = unit.ai;
  if (ai?.type === 'defend') return manhattan(tile, unit.anchor) <= ai.radius;
  if (ai?.type === 'guard') {
    const escort = livingEscort(battle, unit);
    return !escort || manhattan(tile, escort) <= ai.radius;
  }
  return true;
}

function scoreAttack(battle: Battle, unit: Unit, tile: ReachInfo, target: Unit): number {
  const damage = Math.min(damageAgainst(battle, unit, target), target.troops);
  const remaining = target.troops - damage;
  const standing = battle.data.terrain[battle.tiles[tile.y][tile.x]];
  let score = damage + (1 - standing.damageTaken) * TERRAIN_WEIGHT;
  if (remaining === 0) {
    score += target.id === battle.map.defeat.unitId ? LEADER_KILL_BONUS : KILL_BONUS;
  } else if (inRange(battle.data.classes[target.classId].range, target, tile)) {
    score -= calcDamage(remaining, target.power, unit.guard, standing.damageTaken) * COUNTER_WEIGHT;
  }
  return score;
}

function scoreSkill(battle: Battle, unit: Unit, skill: SkillDef, tile: ReachInfo, center: Pos): number {
  const standing = battle.data.terrain[battle.tiles[tile.y][tile.x]];
  let score = (1 - standing.damageTaken) * TERRAIN_WEIGHT;
  for (const target of skillTargets(battle, unit, skill, tile, center)) {
    if (skill.effect === 'heal') {
      score += skillHeal(skill, target);
      continue;
    }
    const damage = Math.min(skillDamage(battle, unit, skill, target), target.troops);
    score += damage;
    if (damage === target.troops) {
      score += target.id === battle.map.defeat.unitId ? LEADER_KILL_BONUS : KILL_BONUS;
    }
  }
  return score;
}

function bestSkillPlan(battle: Battle, unit: Unit, tiles: ReachInfo[]): { plan: EnemyPlan; score: number } | null {
  let best: { plan: EnemyPlan; score: number } | null = null;
  for (const id of unit.skills) {
    const skill = battle.data.skills[id];
    if (unit.spirit < skill.cost) continue;
    for (const tile of tiles) {
      for (const center of skillCenters(battle, unit, skill, tile)) {
        if (skillTargets(battle, unit, skill, tile, center).length === 0) continue;
        const score = scoreSkill(battle, unit, skill, tile, center);
        if (!best || score > best.score) {
          best = { plan: { moveTo: { x: tile.x, y: tile.y }, skill: { id, center } }, score };
        }
      }
    }
  }
  return best;
}

function closestTo(tiles: ReachInfo[], goal: Pos): Pos {
  let best = tiles[0];
  for (const tile of tiles) {
    if (manhattan(tile, goal) < manhattan(best, goal)) best = tile;
  }
  return { x: best.x, y: best.y };
}

function approachAllies(battle: Battle, unit: Unit, tiles: ReachInfo[]): Pos {
  const goals: Pos[] = livingUnits(battle, 'ally').map(({ x, y }) => ({ x, y }));
  // 지켜야 하는 칸이 있는 화에서는 그 칸도 노린다
  if (battle.map.victory.type === 'hold') goals.push(goalTile(battle.map)!);
  const distances = distanceMap(battle, unit, goals);
  let best = tiles[0];
  let bestDistance = Infinity;
  for (const tile of tiles) {
    const distance = distances.get(key(tile.x, tile.y)) ?? Infinity;
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return { x: best.x, y: best.y };
}

/**
 * 공격 가능한 행동 중 점수가 가장 높은 것을 고른다.
 * 공격할 수 없으면 AI 유형별 규칙으로 이동할 칸을 정한다.
 * 상태를 바꾸지 않는 판단 함수다.
 */
export function planEnemyAction(battle: Battle, unit: Unit): EnemyPlan {
  const origin = { x: unit.x, y: unit.y };
  const allowed = [...reachableTiles(battle, unit).values()].filter(
    (tile) => allowedTile(battle, unit, tile) || (tile.x === unit.x && tile.y === unit.y),
  );
  // 다른 곳에 설 수 있으면 불타는 칸에는 멈추지 않는다.
  const safe = allowed.filter((tile) => !isBurning(battle, tile.x, tile.y));
  const candidates = safe.length > 0 ? safe : allowed;

  // 지켜야 하는 칸을 밟을 수 있으면 곧바로 밟는다. 거기서 때릴 수 있으면 때린다.
  const { victory } = battle.map;
  if (victory.type === 'hold') {
    const tile = allowed.find((one) => one.x === victory.x && one.y === victory.y);
    if (tile) {
      const target = targetsFrom(battle, unit, tile).sort((a, b) => scoreAttack(battle, unit, tile, b) - scoreAttack(battle, unit, tile, a))[0];
      return { moveTo: { x: tile.x, y: tile.y }, targetId: target?.id };
    }
  }

  let best: { plan: EnemyPlan; score: number } | null = null;
  for (const tile of candidates) {
    for (const target of targetsFrom(battle, unit, tile)) {
      const score = scoreAttack(battle, unit, tile, target);
      if (!best || score > best.score) {
        best = { plan: { moveTo: { x: tile.x, y: tile.y }, targetId: target.id }, score };
      }
    }
  }
  const skillPlan = bestSkillPlan(battle, unit, candidates);
  if (skillPlan && (!best || skillPlan.score > best.score * SKILL_MARGIN)) return skillPlan.plan;
  if (best) return best.plan;

  const ai = unit.ai;
  switch (ai?.type) {
    case 'wait':
      return { moveTo: unit.alerted ? approachAllies(battle, unit, candidates) : origin };
    case 'defend':
      return { moveTo: closestTo(candidates, unit.anchor) };
    case 'guard': {
      const escort = livingEscort(battle, unit);
      if (!escort) return { moveTo: approachAllies(battle, unit, candidates) };
      return { moveTo: manhattan(origin, escort) <= ai.radius ? origin : closestTo(candidates, escort) };
    }
    default:
      return { moveTo: approachAllies(battle, unit, candidates) };
  }
}

/** 적 부대 하나의 행동을 실행하고, 화면이 재생할 기록을 돌려준다. */
export function runEnemyUnit(battle: Battle, unitId: string): EnemyStep {
  const unit = getUnit(battle, unitId);
  const plan = planEnemyAction(battle, unit);
  const path = moveUnit(battle, unitId, plan.moveTo.x, plan.moveTo.y);
  if (plan.skill) {
    unit.alerted = true;
    return { unitId, path, events: [], skill: useSkill(battle, unitId, plan.skill.id, plan.skill.center) };
  }
  if (plan.targetId) {
    unit.alerted = true;
    return { unitId, path, events: attack(battle, unitId, plan.targetId) };
  }
  waitUnit(battle, unitId);
  return { unitId, path, events: [] };
}
