import { describe, expect, it } from 'vitest';
import { runEnemyUnit } from '../src/core/ai';
import {
  attack,
  endAllyTurn,
  endEnemyTurn,
  getUnit,
  livingUnits,
  moveUnit,
  targetsFrom,
  waitUnit,
} from '../src/core/battle';
import { calcDamage, damageAgainst, inRange } from '../src/core/combat';
import { distanceMap, key, manhattan, reachableTiles, type ReachInfo } from '../src/core/pathfinding';
import type { Battle, Pos, Unit } from '../src/core/types';
import { newEpisodeOne } from './helpers';

const MAX_TURNS = 60;
const LEADER = 'liu-bei';

function enemyPhase(battle: Battle): void {
  for (const enemy of livingUnits(battle, 'enemy')) {
    if (battle.phase !== 'enemy') return;
    if (enemy.troops > 0) runEnemyUnit(battle, enemy.id);
  }
  if (battle.phase === 'enemy') endEnemyTurn(battle);
}

function approach(battle: Battle, unit: Unit, tiles: ReachInfo[], goals: Pos[]): void {
  const distances = distanceMap(battle, unit, goals);
  let tile = tiles[0];
  for (const candidate of tiles) {
    const current = distances.get(key(tile.x, tile.y)) ?? Infinity;
    if ((distances.get(key(candidate.x, candidate.y)) ?? Infinity) < current) tile = candidate;
  }
  moveUnit(battle, unit.id, tile.x, tile.y);
  waitUnit(battle, unit.id);
}

/** 눈앞의 적만 보고 달려드는 플레이. 유비도 똑같이 싸운다. */
function greedyTurn(battle: Battle): void {
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
      approach(battle, unit, tiles, livingUnits(battle, 'enemy'));
    }
  }
  if (battle.phase === 'ally') endAllyTurn(battle);
}

/** 사람의 기본 전술: 한 적에게 집중, 반격 피하기, 숲 활용, 약해진 유비는 뒤로 빼기. */
function carefulTurn(battle: Battle): void {
  const order = livingUnits(battle, 'ally').sort(
    (a, b) => Number(a.id === LEADER) - Number(b.id === LEADER),
  );
  for (const unit of order) {
    if (battle.phase !== 'ally') return;
    if (unit.troops <= 0) continue;
    carefulAction(battle, unit);
  }
  if (battle.phase === 'ally') endAllyTurn(battle);
}

function carefulAction(battle: Battle, unit: Unit): void {
  const enemies = livingUnits(battle, 'enemy');
  // 돌격 부대가 남아 있는 동안은 강(6행)을 건너지 않고 남쪽에서 받아낸다.
  const wave = enemies.some((enemy) => enemy.ai?.type === 'charge');
  const allTiles = [...reachableTiles(battle, unit).values()];
  const tiles = wave ? allTiles.filter((tile) => tile.y >= 7) : allTiles;
  if (tiles.length === 0) {
    waitUnit(battle, unit.id);
    return;
  }
  if (unit.id === LEADER && unit.troops < unit.maxTroops * 0.4) {
    let safest = tiles[0];
    const danger = (tile: Pos) => Math.min(...enemies.map((enemy) => manhattan(tile, enemy)));
    for (const tile of tiles) if (danger(tile) > danger(safest)) safest = tile;
    moveUnit(battle, unit.id, safest.x, safest.y);
    waitUnit(battle, unit.id);
    return;
  }
  let best: { tile: ReachInfo; targetId: string; score: number } | null = null;
  for (const tile of tiles) {
    const standing = battle.data.terrain[battle.tiles[tile.y][tile.x]];
    for (const target of targetsFrom(battle, unit, tile)) {
      const damage = Math.min(damageAgainst(battle, unit, target), target.troops);
      const left = target.troops - damage;
      const countered = left > 0 && inRange(battle.data.classes[target.classId].range, target, tile);
      const counter = countered ? calcDamage(left, target.power, unit.guard, standing.damageTaken) : 0;
      const score = damage - counter + (left === 0 ? 150 : 0) - left * 0.2 + (1 - standing.damageTaken) * 80;
      if (!best || score > best.score) best = { tile, targetId: target.id, score };
    }
  }
  if (best) {
    moveUnit(battle, unit.id, best.tile.x, best.tile.y);
    attack(battle, unit.id, best.targetId);
    return;
  }
  if (wave) {
    const forest = tiles.find((tile) => battle.tiles[tile.y][tile.x] === 'forest');
    if (forest) moveUnit(battle, unit.id, forest.x, forest.y);
    waitUnit(battle, unit.id);
    return;
  }
  approach(battle, unit, tiles, enemies);
}

function play(allyTurn: (battle: Battle) => void): Battle {
  const battle = newEpisodeOne();
  while (battle.phase !== 'ended' && battle.turn <= MAX_TURNS) {
    allyTurn(battle);
    if (battle.phase === 'enemy') enemyPhase(battle);
  }
  return battle;
}

describe('1화 자동 시뮬레이션', () => {
  it('가만히 있으면 이길 수 없다(방어 부대가 남는다)', () => {
    const battle = play((b) => endAllyTurn(b));
    expect(battle.result).not.toBe('victory');
    expect(livingUnits(battle, 'enemy').length).toBeGreaterThan(0);
  });

  it('눈앞의 적만 쫓으면 패배한다', () => {
    expect(play(greedyTurn).result).toBe('defeat');
  });

  it('집중 공격과 유비 보호를 하면 이길 수 있고, 피해도 적지 않다', () => {
    const battle = play(carefulTurn);
    expect(battle.result).toBe('victory');
    const allies = battle.units.filter((unit) => unit.side === 'ally');
    const left = allies.reduce((sum, unit) => sum + unit.troops, 0);
    const total = allies.reduce((sum, unit) => sum + unit.maxTroops, 0);
    expect(left / total).toBeLessThan(0.75);
    expect(getUnit(battle, LEADER).troops).toBeGreaterThan(0);
  });

  it('같은 입력이면 항상 같은 결과가 나온다', () => {
    const first = play(carefulTurn);
    const second = play(carefulTurn);
    expect(second.turn).toBe(first.turn);
    expect(second.units.map((unit) => unit.troops)).toEqual(first.units.map((unit) => unit.troops));
  });
});
