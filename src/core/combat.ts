import { manhattan } from './pathfinding';
import type { Battle, Pos, RangeDef, Unit } from './types';

export const TROOP_DAMAGE_RATE = 0.1;

/** 피해 = 공격 측 병력 x 0.1 x (파워 / 상대 가드) x 지형. 최소 1. */
export function calcDamage(
  attackerTroops: number,
  power: number,
  guard: number,
  terrainMultiplier: number,
): number {
  const raw = attackerTroops * TROOP_DAMAGE_RATE * (power / guard) * terrainMultiplier;
  return Math.max(1, Math.round(raw));
}

export function damageAgainst(battle: Battle, attacker: Unit, defender: Unit): number {
  const terrain = battle.data.terrain[battle.tiles[defender.y][defender.x]];
  return calcDamage(attacker.troops, attacker.power, defender.guard, terrain.damageTaken);
}

export function inRange(range: RangeDef, from: Pos, to: Pos): boolean {
  const distance = manhattan(from, to);
  if (distance < range.min || distance > range.max) return false;
  if (range.pattern === 'line') return from.x === to.x || from.y === to.y;
  return true;
}

/** from 칸에서 공격할 수 있는 모든 칸(맵 안쪽만). */
export function rangeTiles(battle: Battle, range: RangeDef, from: Pos): Pos[] {
  const tiles: Pos[] = [];
  for (let dy = -range.max; dy <= range.max; dy++) {
    for (let dx = -range.max; dx <= range.max; dx++) {
      const to = { x: from.x + dx, y: from.y + dy };
      if (to.x < 0 || to.y < 0 || to.x >= battle.width || to.y >= battle.height) continue;
      if (inRange(range, from, to)) tiles.push(to);
    }
  }
  return tiles;
}
