import { damageAgainst, inRange } from './combat';
import { terrainBySymbol } from './data';
import { key, pathTo, reachableTiles } from './pathfinding';
import type { Battle, BurnEvent, DamageEvent, Facing, GameData, MapDef, Pos, Side, Unit } from './types';

export const SPIRIT_START = 30;
export const SPIRIT_MAX = 100;
/** 자기 턴이 시작될 때 */
export const SPIRIT_PER_TURN = 10;
/** 일반 공격을 했을 때 */
export const SPIRIT_ON_ATTACK = 10;
/** 피해를 받았을 때 */
export const SPIRIT_ON_HIT = 5;
/** 불타는 칸에서 턴을 시작할 때 잃는 병력(최대 병력 대비) */
export const BURN_RATE = 0.08;

export function gainSpirit(unit: Unit, amount: number): void {
  unit.spirit = Math.min(SPIRIT_MAX, unit.spirit + amount);
}

export function createBattle(data: GameData, map: MapDef): Battle {
  const symbols = terrainBySymbol(data);
  const tiles = map.rows.map((row) => [...row].map((symbol) => symbols[symbol]));
  const units: Unit[] = map.units.map((def) => {
    const general = data.generals[def.generalId];
    const cls = data.classes[general.classId];
    const facing: Facing = def.side === 'ally' ? 'right' : 'left';
    const scale = def.side === 'enemy' ? map.enemyScale : undefined;
    const troops = Math.round(general.troops * (scale?.troops ?? 1));
    return {
      id: def.id,
      generalId: def.generalId,
      name: general.name,
      mark: general.mark,
      officer: general.officer === true,
      classId: general.classId,
      side: def.side,
      x: def.x,
      y: def.y,
      facing,
      facingBeforeMove: facing,
      troops,
      maxTroops: troops,
      power: Math.round((general.power + cls.powerBonus) * (scale?.power ?? 1)),
      guard: general.guard + cls.guardBonus,
      spirit: SPIRIT_START,
      skills: general.skills ?? [],
      moved: false,
      acted: false,
      ai: def.ai,
      alerted: false,
      anchor: { x: def.x, y: def.y },
    };
  });
  return {
    data,
    map,
    tiles,
    width: map.rows[0].length,
    height: map.rows.length,
    units,
    turn: 1,
    phase: 'ally',
    result: null,
    fires: [],
  };
}

export function getUnit(battle: Battle, id: string): Unit {
  const unit = battle.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`없는 부대: ${id}`);
  return unit;
}

export function unitAt(battle: Battle, x: number, y: number): Unit | undefined {
  return battle.units.find((unit) => unit.troops > 0 && unit.x === x && unit.y === y);
}

export function livingUnits(battle: Battle, side: Side): Unit[] {
  return battle.units.filter((unit) => unit.side === side && unit.troops > 0);
}

/** 해당 칸에 서서 공격할 수 있는 적 부대 목록. */
export function targetsFrom(battle: Battle, unit: Unit, from: Pos): Unit[] {
  const range = battle.data.classes[unit.classId].range;
  return battle.units.filter(
    (other) => other.troops > 0 && other.side !== unit.side && inRange(range, from, other),
  );
}

export function isBurning(battle: Battle, x: number, y: number): boolean {
  return battle.fires.some((fire) => fire.x === x && fire.y === y);
}

export function assertCanAct(battle: Battle, unit: Unit): void {
  if (battle.phase === 'ended') throw new Error('전투가 이미 끝남');
  if (battle.phase !== unit.side) throw new Error(`${unit.name}의 턴이 아님`);
  if (unit.troops <= 0) throw new Error(`${unit.name}은(는) 이미 퇴각함`);
  if (unit.acted) throw new Error(`${unit.name}은(는) 이미 행동함`);
}

/** 경로에서 마지막으로 좌우로 움직인 쪽. 위아래로만 움직였거나 제자리면 지금 방향 그대로다. */
export function facingAfterPath(path: Pos[], current: Facing): Facing {
  for (let i = path.length - 1; i > 0; i--) {
    const dx = path[i].x - path[i - 1].x;
    if (dx !== 0) return dx < 0 ? 'left' : 'right';
  }
  return current;
}

/** 이동하고 지나간 경로를 돌려준다. 같은 칸으로의 이동은 제자리 행동을 뜻한다. */
export function moveUnit(battle: Battle, unitId: string, x: number, y: number): Pos[] {
  const unit = getUnit(battle, unitId);
  assertCanAct(battle, unit);
  if (unit.moved) throw new Error(`${unit.name}은(는) 이미 이동함`);
  if (!reachableTiles(battle, unit).has(key(x, y))) {
    throw new Error(`${unit.name}은(는) (${x},${y})로 이동할 수 없음`);
  }
  const path = pathTo(battle, unit, x, y);
  unit.x = x;
  unit.y = y;
  unit.moved = true;
  unit.facingBeforeMove = unit.facing;
  unit.facing = facingAfterPath(path, unit.facing);
  return path;
}

/** 이동 후 아직 행동하지 않았을 때만 원래 칸으로 되돌린다. */
export function cancelMove(battle: Battle, unitId: string, origin: Pos): void {
  const unit = getUnit(battle, unitId);
  assertCanAct(battle, unit);
  if (!unit.moved) throw new Error(`${unit.name}은(는) 이동하지 않음`);
  unit.x = origin.x;
  unit.y = origin.y;
  unit.facing = unit.facingBeforeMove;
  unit.moved = false;
}

function strike(battle: Battle, attacker: Unit, defender: Unit, isCounter: boolean): DamageEvent {
  const amount = Math.min(damageAgainst(battle, attacker, defender), defender.troops);
  defender.troops -= amount;
  defender.alerted = true;
  gainSpirit(defender, SPIRIT_ON_HIT);
  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    amount,
    defenderTroops: defender.troops,
    defeated: defender.troops === 0,
    isCounter,
  };
}

/** 공격 후 상대가 살아 있고 사거리 안이면 반격한다. */
export function attack(battle: Battle, attackerId: string, targetId: string): DamageEvent[] {
  const attacker = getUnit(battle, attackerId);
  const target = getUnit(battle, targetId);
  assertCanAct(battle, attacker);
  if (target.side === attacker.side) throw new Error('같은 편은 공격할 수 없음');
  if (target.troops <= 0) throw new Error('이미 퇴각한 부대임');
  if (!inRange(battle.data.classes[attacker.classId].range, attacker, target)) {
    throw new Error(`${target.name}이(가) 사거리 밖임`);
  }

  const events = [strike(battle, attacker, target, false)];
  if (target.troops > 0 && inRange(battle.data.classes[target.classId].range, target, attacker)) {
    events.push(strike(battle, target, attacker, true));
  }
  attacker.acted = true;
  attacker.moved = true;
  gainSpirit(attacker, SPIRIT_ON_ATTACK);
  updateResult(battle);
  return events;
}

export function waitUnit(battle: Battle, unitId: string): void {
  const unit = getUnit(battle, unitId);
  assertCanAct(battle, unit);
  unit.acted = true;
  unit.moved = true;
  updateResult(battle);
}

/** 도착하거나 지켜야 하는 칸. 없는 화면 null이다. */
export function goalTile(map: MapDef): Pos | null {
  const { victory } = map;
  return victory.type === 'reach' || victory.type === 'hold' ? { x: victory.x, y: victory.y } : null;
}

/** 이 칸에서 행동을 마치면 승리로 이어지는 부대인지. */
export function canClaimGoal(map: MapDef, unit: Unit): boolean {
  const { victory } = map;
  return victory.type === 'reach' && unit.side === 'ally' && (!victory.unitId || victory.unitId === unit.id);
}

function goalLost(battle: Battle): boolean {
  const { victory } = battle.map;
  if (victory.type !== 'hold') return false;
  return battle.units.some((unit) => unit.side === 'enemy' && unit.troops > 0 && unit.x === victory.x && unit.y === victory.y);
}

function victoryReached(battle: Battle): boolean {
  if (livingUnits(battle, 'enemy').length === 0) return true;
  const { victory } = battle.map;
  if (victory.type === 'unitDown') return getUnit(battle, victory.unitId).troops <= 0;
  if (victory.type === 'survive' || victory.type === 'hold') return battle.turn > victory.turns;
  if (victory.type === 'reach') {
    return battle.units.some(
      (unit) => unit.troops > 0 && unit.acted && unit.x === victory.x && unit.y === victory.y && canClaimGoal(battle.map, unit),
    );
  }
  return false;
}

export function updateResult(battle: Battle): void {
  const defeatUnit = getUnit(battle, battle.map.defeat.unitId);
  if (defeatUnit.troops <= 0 || livingUnits(battle, 'ally').length === 0 || goalLost(battle)) {
    battle.result = 'defeat';
  } else if (victoryReached(battle)) {
    battle.result = 'victory';
  }
  if (battle.result) battle.phase = 'ended';
}

/**
 * 한 편의 턴을 시작한다. 불타는 칸에 선 부대는 병력을 잃는다.
 * 불길만으로는 퇴각하지 않고 병력 1에서 멈춘다.
 */
function startSide(battle: Battle, side: Side): BurnEvent[] {
  const burns: BurnEvent[] = [];
  for (const unit of battle.units) {
    if (unit.side !== side) continue;
    unit.acted = false;
    unit.moved = false;
    if (unit.troops <= 0) continue;
    gainSpirit(unit, SPIRIT_PER_TURN);
    if (!isBurning(battle, unit.x, unit.y)) continue;
    unit.alerted = true;
    const amount = Math.min(unit.troops - 1, Math.round(unit.maxTroops * BURN_RATE));
    if (amount <= 0) continue;
    unit.troops -= amount;
    burns.push({ unitId: unit.id, amount, troops: unit.troops });
  }
  return burns;
}

export function endAllyTurn(battle: Battle): BurnEvent[] {
  if (battle.phase !== 'ally') throw new Error('아군 턴이 아님');
  battle.phase = 'enemy';
  return startSide(battle, 'enemy');
}

export function endEnemyTurn(battle: Battle): BurnEvent[] {
  if (battle.phase !== 'enemy') throw new Error('적군 턴이 아님');
  battle.phase = 'ally';
  battle.turn += 1;
  battle.fires = battle.fires
    .map((fire) => ({ ...fire, turns: fire.turns - 1 }))
    .filter((fire) => fire.turns > 0);
  updateResult(battle);
  return battle.phase === 'ally' ? startSide(battle, 'ally') : [];
}
