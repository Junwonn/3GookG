import { runEnemyUnit } from '../src/core/ai';
import {
  attack,
  canClaimGoal,
  createBattle,
  endAllyTurn,
  endEnemyTurn,
  getUnit,
  goalTile,
  isBurning,
  livingUnits,
  moveUnit,
  targetsFrom,
  unitAt,
  waitUnit,
} from '../src/core/battle';
import { calcDamage, damageAgainst, inRange, rangeTiles } from '../src/core/combat';
import { distanceMap, key, manhattan, reachableTiles, type ReachInfo } from '../src/core/pathfinding';
import { skillCenters, skillDamage, skillHeal, skillTargets, useSkill } from '../src/core/skills';
import type { Battle, MapDef, Pos, SkillDef, Unit } from '../src/core/types';
import { gameData } from '../src/gameData';

const MAX_TURNS = 40;

function enemyPhase(battle: Battle): void {
  for (const enemy of livingUnits(battle, 'enemy')) {
    if (battle.phase !== 'enemy') return;
    if (enemy.troops > 0) runEnemyUnit(battle, enemy.id);
  }
  if (battle.phase === 'enemy') endEnemyTurn(battle);
}

function nearestTile(battle: Battle, unit: Unit, tiles: ReachInfo[], goals: Pos[]): ReachInfo {
  const distances = distanceMap(battle, unit, goals);
  let tile = tiles[0];
  for (const candidate of tiles) {
    if ((distances.get(key(candidate.x, candidate.y)) ?? Infinity) < (distances.get(key(tile.x, tile.y)) ?? Infinity)) tile = candidate;
  }
  return tile;
}

/** 이기려면 어디로 가야 하는지. 목표 칸이나 목표 장수가 있으면 그쪽, 없으면 남은 적이다. */
function destination(battle: Battle): Pos[] {
  const { victory } = battle.map;
  if (victory.type === 'unitDown') return [getUnit(battle, victory.unitId)];
  // 도착 담당이 따로 있으면 호위는 그 부대를 따라간다
  if (victory.type === 'reach' && victory.unitId) return [getUnit(battle, victory.unitId)];
  const goal = goalTile(battle.map);
  return goal ? [goal] : livingUnits(battle, 'enemy');
}

function advance(battle: Battle, unit: Unit, tiles: ReachInfo[], together = false): void {
  // 혼자 앞서가지 않도록 아군 무리 근처의 칸만 쓴다
  const allies = livingUnits(battle, 'ally');
  const center = {
    x: allies.reduce((sum, one) => sum + one.x, 0) / allies.length,
    y: allies.reduce((sum, one) => sum + one.y, 0) / allies.length,
  };
  const near = together ? tiles.filter((tile) => manhattan(tile, center) <= 3) : [];
  const tile = nearestTile(battle, unit, near.length > 0 ? near : tiles, destination(battle));
  moveUnit(battle, unit.id, tile.x, tile.y);
  waitUnit(battle, unit.id);
}

/** 눈앞의 적만 때리는 플레이. 기술을 쓰지 않고 대장도 앞장선다. */
export function bruteTurn(battle: Battle): void {
  for (const unit of livingUnits(battle, 'ally')) {
    if (battle.phase !== 'ally') return;
    if (unit.troops <= 0) continue;
    const tiles = [...reachableTiles(battle, unit).values()];
    let best: { tile: ReachInfo; targetId: string; score: number } | null = null;
    for (const tile of tiles) {
      for (const target of targetsFrom(battle, unit, tile)) {
        const score = damageAgainst(battle, unit, target);
        if (!best || score > best.score) best = { tile, targetId: target.id, score };
      }
    }
    if (best) {
      moveUnit(battle, unit.id, best.tile.x, best.tile.y);
      attack(battle, unit.id, best.targetId);
    } else {
      advance(battle, unit, tiles);
    }
  }
  if (battle.phase === 'ally') endAllyTurn(battle);
}

export function idleTurn(battle: Battle): void {
  endAllyTurn(battle);
}

interface Choice {
  score: number;
  act: () => void;
}

function skillChoices(battle: Battle, unit: Unit, tile: ReachInfo, skill: SkillDef, id: string): Choice[] {
  const choices: Choice[] = [];
  for (const center of skillCenters(battle, unit, skill, tile)) {
    const targets = skillTargets(battle, unit, skill, tile, center);
    if (targets.length === 0) continue;
    let score = 0;
    for (const target of targets) {
      if (skill.effect === 'heal') {
        score += skillHeal(skill, target);
      } else {
        const damage = Math.min(skillDamage(battle, unit, skill, target), target.troops);
        score += damage + (damage === target.troops ? 150 : 0);
      }
    }
    const pos = { x: center.x, y: center.y };
    choices.push({
      score,
      act: () => {
        moveUnit(battle, unit.id, tile.x, tile.y);
        useSkill(battle, unit.id, id, pos);
      },
    });
  }
  return choices;
}

/** tiles에 서서 할 수 있는 공격과 기술 중 가장 나은 것. */
function bestChoice(battle: Battle, unit: Unit, tiles: ReachInfo[]): Choice | null {
  let best: Choice | null = null;
  const consider = (choice: Choice) => {
    if (!best || choice.score > best.score) best = choice;
  };
  for (const tile of tiles) {
    const standing = battle.data.terrain[battle.tiles[tile.y][tile.x]];
    const shelter = (1 - standing.damageTaken) * 80 - (isBurning(battle, tile.x, tile.y) ? 120 : 0);
    for (const target of targetsFrom(battle, unit, tile)) {
      const damage = Math.min(damageAgainst(battle, unit, target), target.troops);
      const left = target.troops - damage;
      const countered = left > 0 && inRange(battle.data.classes[target.classId].range, target, tile);
      const counter = countered ? calcDamage(left, target.power, unit.guard, standing.damageTaken) : 0;
      consider({
        score: damage - counter + (left === 0 ? 150 : 0) - left * 0.2 + shelter,
        act: () => {
          moveUnit(battle, unit.id, tile.x, tile.y);
          attack(battle, unit.id, target.id);
        },
      });
    }
    for (const id of unit.skills) {
      const skill = battle.data.skills[id];
      if (unit.spirit < skill.cost) continue;
      for (const choice of skillChoices(battle, unit, tile, skill, id)) {
        consider({ ...choice, score: choice.score + shelter });
      }
    }
  }
  return best;
}

/** 칸마다 이번 적 턴에 이곳을 때릴 수 있는 적의 수. 화면의 범위 표시로 사람이 읽는 정보다. */
function threatMap(battle: Battle): Map<string, number> {
  const threat = new Map<string, number>();
  for (const enemy of livingUnits(battle, 'enemy')) {
    const covered = new Set<string>();
    const range = battle.data.classes[enemy.classId].range;
    for (const tile of reachableTiles(battle, enemy).values()) {
      if (enemy.ai?.type === 'defend' && manhattan(tile, enemy.anchor) > enemy.ai.radius) continue;
      for (const pos of rangeTiles(battle, range, tile)) covered.add(key(pos.x, pos.y));
    }
    for (const tile of covered) threat.set(tile, (threat.get(tile) ?? 0) + 1);
  }
  return threat;
}

/** 깃발 쪽으로 가되 적의 손이 덜 닿는 칸을 고른다. */
function safeStep(battle: Battle, unit: Unit, tiles: ReachInfo[], goal: Pos): ReachInfo {
  const distances = distanceMap(battle, unit, [goal]);
  const threat = threatMap(battle);
  const cost = (tile: ReachInfo) =>
    (distances.get(key(tile.x, tile.y)) ?? 999) + (threat.get(key(tile.x, tile.y)) ?? 0) * 1.3 + battle.data.terrain[battle.tiles[tile.y][tile.x]].damageTaken;
  let best = tiles[0];
  for (const tile of tiles) if (cost(tile) < cost(best)) best = tile;
  return best;
}

/** 도착 조건을 맡은 부대. 지정되지 않았으면 가장 가까운 부대다. */
function runnerOf(battle: Battle, goal: Pos): Unit | null {
  const { victory } = battle.map;
  if (victory.type !== 'reach') return null;
  if (victory.unitId) return getUnit(battle, victory.unitId);
  const allies = livingUnits(battle, 'ally').filter((unit) => unit.id !== battle.map.defeat.unitId);
  allies.sort((a, b) => manhattan(a, goal) - manhattan(b, goal));
  return allies[0] ?? null;
}

/** 지켜야 하는 칸에 세울 부대. 가장 단단한 부대다. */
function holderOf(battle: Battle): Unit | null {
  const goal = goalTile(battle.map);
  const standing = goal ? unitAt(battle, goal.x, goal.y) : undefined;
  if (standing?.side === 'ally') return standing;
  const allies = livingUnits(battle, 'ally').filter((unit) => unit.id !== battle.map.defeat.unitId);
  allies.sort((a, b) => b.troops * b.guard - a.troops * a.guard);
  return allies[0] ?? null;
}

function act(battle: Battle, unit: Unit, tiles: ReachInfo[]): boolean {
  const chosen = bestChoice(battle, unit, tiles);
  if (chosen) chosen.act();
  return chosen !== null;
}

function skillfulAction(battle: Battle, unit: Unit, runner: Unit | null, holder: Unit | null): void {
  const enemies = livingUnits(battle, 'enemy');
  const goal = goalTile(battle.map);
  // 도착 담당이 아닌 부대는 깃발 칸을 막지 않는다
  const blocking = battle.map.victory.type === 'reach' && !canClaimGoal(battle.map, unit);
  const all = [...reachableTiles(battle, unit).values()];
  const open = blocking ? all.filter((tile) => tile.x !== goal!.x || tile.y !== goal!.y) : all;
  const tiles = open.length > 0 ? open : all;

  // 도착 임무: 깃발까지 갈 수 있으면 곧바로 가고, 아니면 가장 가까운 칸에서 때릴 수 있는 적을 때린다.
  if (goal && canClaimGoal(battle.map, unit) && tiles.some((tile) => tile.x === goal.x && tile.y === goal.y)) {
    moveUnit(battle, unit.id, goal.x, goal.y);
    waitUnit(battle, unit.id);
    return;
  }
  if (goal && runner?.id === unit.id) {
    const near = safeStep(battle, unit, tiles, goal);
    if (!act(battle, unit, [near])) {
      moveUnit(battle, unit.id, near.x, near.y);
      waitUnit(battle, unit.id);
    }
    return;
  }

  // 사수 임무: 한 부대는 칸 위에 서서 움직이지 않고, 나머지는 칸 근처에서만 싸운다.
  if (goal && battle.map.victory.type === 'hold') {
    if (holder?.id === unit.id) {
      const spot = tiles.find((tile) => tile.x === goal.x && tile.y === goal.y);
      const stand = spot ? [spot] : [nearestTile(battle, unit, tiles, [goal])];
      if (!act(battle, unit, stand)) {
        moveUnit(battle, unit.id, stand[0].x, stand[0].y);
        waitUnit(battle, unit.id);
      }
      return;
    }
    const around = tiles.filter((tile) => manhattan(tile, goal) <= 3 && (tile.x !== goal.x || tile.y !== goal.y));
    if (!act(battle, unit, around.length > 0 ? around : tiles)) {
      const spot = nearestTile(battle, unit, around.length > 0 ? around : tiles, [goal]);
      moveUnit(battle, unit.id, spot.x, spot.y);
      waitUnit(battle, unit.id);
    }
    return;
  }

  const limit = unit.id === battle.map.defeat.unitId ? 0.35 : 0.25;
  if (unit.troops < unit.maxTroops * limit && enemies.length > 0) {
    const danger = (tile: Pos) => Math.min(...enemies.map((enemy) => manhattan(tile, enemy)));
    let safest = tiles[0];
    for (const tile of tiles) if (danger(tile) > danger(safest)) safest = tile;
    moveUnit(battle, unit.id, safest.x, safest.y);
    waitUnit(battle, unit.id);
    return;
  }

  // 대장은 적 여럿의 손이 닿는 칸에 서지 않는다
  if (unit.id === battle.map.defeat.unitId) {
    const threat = threatMap(battle);
    const calm = tiles.filter((tile) => (threat.get(key(tile.x, tile.y)) ?? 0) <= 1);
    if (calm.length > 0) {
      if (act(battle, unit, calm)) return;
      const spot = nearestTile(battle, unit, calm, destination(battle));
      moveUnit(battle, unit.id, spot.x, spot.y);
      waitUnit(battle, unit.id);
      return;
    }
  }
  if (act(battle, unit, tiles)) return;
  // 버티는 화는 앞으로 나가지 않고 숲에서 기다린다.
  if (battle.map.victory.type === 'survive') {
    const forest = tiles.find((tile) => battle.tiles[tile.y][tile.x] === 'forest' && !isBurning(battle, tile.x, tile.y));
    if (forest) moveUnit(battle, unit.id, forest.x, forest.y);
    waitUnit(battle, unit.id);
    return;
  }
  advance(battle, unit, tiles, true);
}

/** 기술을 쓰고, 한 적에 집중하고, 지형을 활용하고, 약해진 대장은 뒤로 빼는 플레이. */
export function skillfulTurn(battle: Battle): void {
  const leaderId = battle.map.defeat.unitId;
  const goal = goalTile(battle.map);
  const runner = goal ? runnerOf(battle, goal) : null;
  const holder = battle.map.victory.type === 'hold' ? holderOf(battle) : null;
  // 호위가 먼저 길을 열고 대장과 도착 담당은 나중에 움직인다.
  const rank = (unit: Unit) => (unit.id === leaderId ? 2 : unit.id === runner?.id ? 1 : 0);
  const order = livingUnits(battle, 'ally').sort((a, b) => rank(a) - rank(b));
  for (const unit of order) {
    if (battle.phase !== 'ally') return;
    if (unit.troops <= 0) continue;
    skillfulAction(battle, unit, runner, holder);
  }
  if (battle.phase === 'ally') endAllyTurn(battle);
}

export function play(map: MapDef, allyTurn: (battle: Battle) => void): Battle {
  const battle = createBattle(gameData, map);
  while (battle.phase !== 'ended' && battle.turn <= MAX_TURNS) {
    allyTurn(battle);
    if (battle.phase === 'enemy') enemyPhase(battle);
  }
  return battle;
}

export const remaining = (battle: Battle): number => {
  const allies = battle.units.filter((unit) => unit.side === 'ally');
  return allies.reduce((sum, unit) => sum + unit.troops, 0) / allies.reduce((sum, unit) => sum + unit.maxTroops, 0);
};

/** 맵에 놓인 적 전체의 힘을 아군 전체의 힘으로 나눈 값. 지형과 기술은 뺀 단순 비교다. */
export function strengthRatio(map: MapDef): number {
  const battle = createBattle(gameData, map);
  const force = (side: 'ally' | 'enemy') =>
    battle.units.filter((unit) => unit.side === side).reduce((sum, unit) => sum + unit.troops * (unit.power + unit.guard), 0);
  return force('enemy') / force('ally');
}

