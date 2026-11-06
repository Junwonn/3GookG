import { assertCanAct, gainSpirit, getUnit, SPIRIT_ON_HIT, updateResult } from './battle';
import { calcDamage, rangeTiles } from './combat';
import { manhattan } from './pathfinding';
import type { Battle, Pos, SkillDef, SkillHit, SkillResult, Unit } from './types';

const NEIGHBORS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function inBounds(battle: Battle, pos: Pos): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < battle.width && pos.y < battle.height;
}

/** from에 선 시전자가 center를 골랐을 때 기술이 닿는 칸들. */
export function skillArea(battle: Battle, skill: SkillDef, from: Pos, center: Pos): Pos[] {
  const tiles: Pos[] = [];
  if (skill.shape === 'pierce') {
    const dx = Math.sign(center.x - from.x);
    const dy = Math.sign(center.y - from.y);
    for (let step = 1; step <= skill.range.max; step++) {
      tiles.push({ x: from.x + dx * step, y: from.y + dy * step });
    }
    return tiles.filter((tile) => inBounds(battle, tile));
  }
  for (let dy = -skill.radius; dy <= skill.radius; dy++) {
    for (let dx = -skill.radius; dx <= skill.radius; dx++) {
      const tile = { x: center.x + dx, y: center.y + dy };
      if (inBounds(battle, tile) && manhattan(center, tile) <= skill.radius) tiles.push(tile);
    }
  }
  return tiles;
}

/**
 * 기술의 대상이 되는 부대. 회복은 다친 아군만 대상이다.
 * AI가 이동 전에 미리 계산할 수 있도록 시전자의 위치는 from을 쓴다.
 */
export function skillTargets(battle: Battle, caster: Unit, skill: SkillDef, from: Pos, center: Pos): Unit[] {
  const area = skillArea(battle, skill, from, center);
  return battle.units.filter((unit) => {
    if (unit.troops <= 0) return false;
    if (skill.targets === 'enemy' ? unit.side === caster.side : unit.side !== caster.side) return false;
    if (skill.effect === 'heal' && unit.troops >= unit.maxTroops) return false;
    const pos = unit.id === caster.id ? from : unit;
    return area.some((tile) => tile.x === pos.x && tile.y === pos.y);
  });
}

function ignitableTiles(battle: Battle, skill: SkillDef, area: Pos[]): Pos[] {
  const { ignite } = skill;
  if (!ignite) return [];
  return area.filter((tile) => ignite.terrain.includes(battle.tiles[tile.y][tile.x]));
}

function centerAllowed(battle: Battle, skill: SkillDef, center: Pos): boolean {
  const terrainId = battle.tiles[center.y][center.x];
  if (skill.forbidCenter?.includes(terrainId)) return false;
  if (!skill.requireNear) return true;
  if (terrainId === skill.requireNear) return true;
  return NEIGHBORS.some((dir) => {
    const next = { x: center.x + dir.x, y: center.y + dir.y };
    return inBounds(battle, next) && battle.tiles[next.y][next.x] === skill.requireNear;
  });
}

/** from에서 중심으로 고를 수 있는 칸. 대상이 있거나 태울 숲이 있어야 한다. */
export function skillCenters(battle: Battle, caster: Unit, skill: SkillDef, from: Pos = caster): Pos[] {
  return rangeTiles(battle, skill.range, from).filter((center) => {
    if (!centerAllowed(battle, skill, center)) return false;
    if (skillTargets(battle, caster, skill, from, center).length > 0) return true;
    return ignitableTiles(battle, skill, skillArea(battle, skill, from, center)).length > 0;
  });
}

/** 일반 공격과 같은 공식에 기술 위력을 곱한다. 반격은 없다. */
export function skillDamage(battle: Battle, caster: Unit, skill: SkillDef, target: Unit): number {
  const terrainId = battle.tiles[target.y][target.x];
  const multiplier = skill.terrain?.[terrainId] ?? battle.data.terrain[terrainId].damageTaken;
  return Math.max(1, Math.round(calcDamage(caster.troops, caster.power, target.guard, multiplier) * skill.power));
}

export function skillHeal(skill: SkillDef, target: Unit): number {
  return Math.min(target.maxTroops - target.troops, Math.round(target.maxTroops * skill.power));
}

/** 지금 못 쓰는 이유. 쓸 수 있으면 null. */
export function skillBlockReason(battle: Battle, unit: Unit, skill: SkillDef): string | null {
  if (unit.spirit < skill.cost) return '기력 부족';
  return skillCenters(battle, unit, skill).length === 0 ? '대상 없음' : null;
}

export function previewSkill(
  battle: Battle,
  caster: Unit,
  skill: SkillDef,
  center: Pos,
): { count: number; total: number; ignites: number } {
  const targets = skillTargets(battle, caster, skill, caster, center);
  const total = targets.reduce(
    (sum, target) =>
      sum +
      (skill.effect === 'heal'
        ? skillHeal(skill, target)
        : Math.min(skillDamage(battle, caster, skill, target), target.troops)),
    0,
  );
  const ignites = ignitableTiles(battle, skill, skillArea(battle, skill, caster, center)).length;
  return { count: targets.length, total, ignites };
}

export function useSkill(battle: Battle, casterId: string, skillId: string, center: Pos): SkillResult {
  const caster = getUnit(battle, casterId);
  assertCanAct(battle, caster);
  if (!caster.skills.includes(skillId)) throw new Error(`${caster.name}은(는) ${skillId}을(를) 쓸 수 없음`);
  const skill = battle.data.skills[skillId];
  if (caster.spirit < skill.cost) throw new Error(`${caster.name}의 기력이 부족함`);
  if (!skillCenters(battle, caster, skill).some((tile) => tile.x === center.x && tile.y === center.y)) {
    throw new Error(`${skill.name}을(를) (${center.x},${center.y})에 쓸 수 없음`);
  }

  const area = skillArea(battle, skill, caster, center);
  // 피해를 주기 전에 대상과 수치를 정해, 범위 안의 부대가 같은 기준으로 맞게 한다.
  const planned = skillTargets(battle, caster, skill, caster, center).map((target) => ({
    target,
    amount:
      skill.effect === 'heal'
        ? skillHeal(skill, target)
        : Math.min(skillDamage(battle, caster, skill, target), target.troops),
  }));
  const hits: SkillHit[] = planned.map(({ target, amount }) => {
    if (skill.effect === 'heal') {
      target.troops += amount;
    } else {
      target.troops -= amount;
      target.alerted = true;
      gainSpirit(target, SPIRIT_ON_HIT);
    }
    return {
      unitId: target.id,
      effect: skill.effect,
      amount,
      troops: target.troops,
      defeated: target.troops === 0,
    };
  });

  const ignited = ignitableTiles(battle, skill, area);
  for (const tile of ignited) {
    battle.fires = battle.fires.filter((fire) => fire.x !== tile.x || fire.y !== tile.y);
    battle.fires.push({ x: tile.x, y: tile.y, turns: skill.ignite!.turns });
  }

  caster.spirit -= skill.cost;
  caster.acted = true;
  caster.moved = true;
  updateResult(battle);
  return { casterId, skillId, center, area, hits, ignited };
}
