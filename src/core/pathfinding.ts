import type { Battle, Pos, Unit } from './types';

export interface ReachInfo {
  x: number;
  y: number;
  cost: number;
  prev: string | null;
}

const DIRS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export const key = (x: number, y: number): string => `${x},${y}`;

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function inBounds(battle: Battle, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < battle.width && y < battle.height;
}

function moveCostAt(battle: Battle, unit: Unit, x: number, y: number): number | undefined {
  return battle.data.classes[unit.classId].moveCost[battle.tiles[y][x]];
}

/** 이동력 안에서 지나갈 수 있는 모든 칸. 같은 편은 통과할 수 있고 적은 통과할 수 없다. */
function explore(battle: Battle, unit: Unit): Map<string, ReachInfo> {
  const budget = battle.data.classes[unit.classId].move;
  const enemies = new Set(
    battle.units
      .filter((other) => other.troops > 0 && other.side !== unit.side)
      .map((other) => key(other.x, other.y)),
  );
  const start: ReachInfo = { x: unit.x, y: unit.y, cost: 0, prev: null };
  const best = new Map<string, ReachInfo>([[key(unit.x, unit.y), start]]);
  const queue = [start];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    if (best.get(key(current.x, current.y)) !== current) continue;
    for (const dir of DIRS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (!inBounds(battle, nx, ny) || enemies.has(key(nx, ny))) continue;
      const step = moveCostAt(battle, unit, nx, ny);
      if (step === undefined) continue;
      const cost = current.cost + step;
      if (cost > budget) continue;
      const existing = best.get(key(nx, ny));
      if (existing && existing.cost <= cost) continue;
      const info: ReachInfo = { x: nx, y: ny, cost, prev: key(current.x, current.y) };
      best.set(key(nx, ny), info);
      queue.push(info);
    }
  }
  return best;
}

/** 이번 턴에 멈출 수 있는 칸. 다른 부대가 있는 칸에는 멈출 수 없다. */
export function reachableTiles(battle: Battle, unit: Unit): Map<string, ReachInfo> {
  const tiles = explore(battle, unit);
  for (const other of battle.units) {
    if (other.troops > 0 && other.id !== unit.id) tiles.delete(key(other.x, other.y));
  }
  return tiles;
}

/** 현재 위치에서 목표 칸까지의 경로(시작 칸 포함). 갈 수 없으면 빈 배열. */
export function pathTo(battle: Battle, unit: Unit, x: number, y: number): Pos[] {
  const tiles = explore(battle, unit);
  const path: Pos[] = [];
  let cursor = tiles.get(key(x, y));
  while (cursor) {
    path.unshift({ x: cursor.x, y: cursor.y });
    cursor = cursor.prev ? tiles.get(cursor.prev) : undefined;
  }
  return path;
}

/**
 * 목표 칸까지 남은 이동 비용 지도. 부대는 장애물로 보지 않는다.
 * 앞이 막혀도 AI가 멈추지 않고 가장 가까운 칸으로 다가가게 하기 위함이다.
 */
export function distanceMap(battle: Battle, unit: Unit, goals: Pos[]): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: { x: number; y: number; cost: number }[] = [];
  for (const goal of goals) {
    dist.set(key(goal.x, goal.y), 0);
    queue.push({ x: goal.x, y: goal.y, cost: 0 });
  }
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    if ((dist.get(key(current.x, current.y)) ?? Infinity) < current.cost) continue;
    const enterCurrent = moveCostAt(battle, unit, current.x, current.y) ?? 1;
    for (const dir of DIRS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (!inBounds(battle, nx, ny)) continue;
      if (moveCostAt(battle, unit, nx, ny) === undefined) continue;
      const cost = current.cost + enterCurrent;
      if ((dist.get(key(nx, ny)) ?? Infinity) <= cost) continue;
      dist.set(key(nx, ny), cost);
      queue.push({ x: nx, y: ny, cost });
    }
  }
  return dist;
}
