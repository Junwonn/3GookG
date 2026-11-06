import { describe, expect, it } from 'vitest';
import {
  attack,
  cancelMove,
  endAllyTurn,
  endEnemyTurn,
  facingAfterPath,
  getUnit,
  moveUnit,
  waitUnit,
} from '../src/core/battle';
import { calcDamage, inRange } from '../src/core/combat';
import { key, pathTo, reachableTiles } from '../src/core/pathfinding';
import { ally, enemy, makeBattle, openField } from './helpers';

describe('이동과 지형', () => {
  it('평지에서는 이동력만큼 움직인다', () => {
    const battle = makeBattle(openField(11, 11), [ally('a', 'liu-bei', 5, 5)]);
    const reach = reachableTiles(battle, getUnit(battle, 'a'));
    expect(reach.has(key(5, 1))).toBe(true);
    expect(reach.has(key(5, 0))).toBe(false);
    expect(reach.has(key(7, 7))).toBe(true);
  });

  it('병과마다 지형 비용이 다르다', () => {
    const rows = ['.fff'];
    const infantry = makeBattle(rows, [ally('a', 'liu-bei', 0, 0)]);
    const cavalry = makeBattle(rows, [ally('a', 'guan-yu', 0, 0)]);
    // 보병은 숲 비용 1, 기병은 숲 비용 3 (이동력 6)
    expect(reachableTiles(infantry, getUnit(infantry, 'a')).has(key(3, 0))).toBe(true);
    expect(reachableTiles(cavalry, getUnit(cavalry, 'a')).has(key(2, 0))).toBe(true);
    expect(reachableTiles(cavalry, getUnit(cavalry, 'a')).has(key(3, 0))).toBe(false);
  });

  it('강은 건널 수 없고 다리로만 지나간다', () => {
    const noBridge = makeBattle(['...', 'rrr', '...'], [ally('a', 'liu-bei', 1, 0)]);
    const noBridgeReach = reachableTiles(noBridge, getUnit(noBridge, 'a'));
    expect(noBridgeReach.has(key(1, 1))).toBe(false);
    expect(noBridgeReach.has(key(1, 2))).toBe(false);

    const bridge = makeBattle(['...', 'rbr', '...'], [ally('a', 'liu-bei', 1, 0)]);
    expect(reachableTiles(bridge, getUnit(bridge, 'a')).has(key(1, 2))).toBe(true);
  });

  it('적은 통과할 수 없다', () => {
    const battle = makeBattle(['r.r', '...', 'r.r', '...'], [
      ally('a', 'liu-bei', 1, 0),
      enemy('e', 'turban-infantry', 1, 2),
    ]);
    const reach = reachableTiles(battle, getUnit(battle, 'a'));
    expect(reach.has(key(1, 2))).toBe(false);
    expect(reach.has(key(1, 3))).toBe(false);
  });

  it('같은 편은 통과하지만 그 칸에 멈출 수 없다', () => {
    const battle = makeBattle(['r.r', 'r.r', 'r.r'], [
      ally('a', 'liu-bei', 1, 0),
      ally('b', 'guan-yu', 1, 1),
    ]);
    const unit = getUnit(battle, 'a');
    const reach = reachableTiles(battle, unit);
    expect(reach.has(key(1, 1))).toBe(false);
    expect(reach.has(key(1, 2))).toBe(true);
    expect(pathTo(battle, unit, 1, 2)).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]);
  });
});

describe('사거리', () => {
  it('궁병은 2~3칸만 쏘고 인접은 못 쏜다', () => {
    const range = { min: 2, max: 3, pattern: 'any' as const };
    expect(inRange(range, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
    expect(inRange(range, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(inRange(range, { x: 0, y: 0 }, { x: 2, y: 1 })).toBe(true);
    expect(inRange(range, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
  });

  it('창병은 직선 1~2칸만 찌른다', () => {
    const range = { min: 1, max: 2, pattern: 'line' as const };
    expect(inRange(range, { x: 0, y: 0 }, { x: 0, y: 2 })).toBe(true);
    expect(inRange(range, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });
});

describe('피해 공식', () => {
  it('병력 x 0.1 x 파워/가드 x 지형을 따른다', () => {
    expect(calcDamage(800, 95, 50, 1)).toBe(152);
    expect(calcDamage(800, 95, 50, 0.8)).toBe(122);
  });

  it('피해는 최소 1이다', () => {
    expect(calcDamage(1, 1, 100, 0.65)).toBe(1);
  });

  it('숲과 산에 있는 부대는 피해를 덜 받는다', () => {
    const units = (x: number) => [ally('a', 'zhang-fei', 0, 0), enemy('e', 'turban-infantry', x, 0)];
    const plain = makeBattle(['....'], units(1));
    const forest = makeBattle(['.f..'], units(1));
    const mountain = makeBattle(['.m..'], units(1));
    const damageOn = (battle: typeof plain) => attack(battle, 'a', 'e')[0].amount;
    const onPlain = damageOn(plain);
    const onForest = damageOn(forest);
    const onMountain = damageOn(mountain);
    expect(onForest).toBeLessThan(onPlain);
    expect(onMountain).toBeLessThan(onForest);
  });
});

describe('공격과 반격', () => {
  it('인접 공격에는 남은 병력으로 반격한다', () => {
    const battle = makeBattle(['..'], [ally('a', 'zhang-fei', 0, 0), enemy('e', 'turban-infantry', 1, 0)]);
    const attacker = getUnit(battle, 'a');
    const defender = getUnit(battle, 'e');
    const events = attack(battle, 'a', 'e');
    expect(events).toHaveLength(2);
    expect(events[1].isCounter).toBe(true);
    expect(defender.troops).toBe(defender.maxTroops - events[0].amount);
    expect(events[1].amount).toBe(calcDamage(defender.troops, defender.power, attacker.guard, 1));
    expect(attacker.troops).toBe(attacker.maxTroops - events[1].amount);
    expect(attacker.acted).toBe(true);
  });

  it('사거리 밖 공격에는 반격하지 못한다', () => {
    const battle = makeBattle(['...'], [ally('a', 'zhang-fei', 0, 0), enemy('e', 'turban-infantry', 2, 0)]);
    expect(attack(battle, 'a', 'e')).toHaveLength(1);
  });

  it('궁병은 인접 공격에 반격하지 못한다', () => {
    const battle = makeBattle(['..'], [ally('a', 'guan-yu', 0, 0), enemy('e', 'turban-archer', 1, 0)]);
    expect(attack(battle, 'a', 'e')).toHaveLength(1);
  });

  it('퇴각한 부대는 반격하지 못하고 병력은 0 아래로 내려가지 않는다', () => {
    const battle = makeBattle(['...'], [
      ally('a', 'zhang-fei', 0, 0),
      enemy('e', 'turban-infantry', 1, 0),
      enemy('e2', 'turban-infantry', 2, 0),
    ]);
    getUnit(battle, 'e').troops = 1;
    const events = attack(battle, 'a', 'e');
    expect(events).toHaveLength(1);
    expect(events[0].defeated).toBe(true);
    expect(events[0].amount).toBe(1);
    expect(getUnit(battle, 'e').troops).toBe(0);
  });

  it('사거리 밖이나 같은 편은 공격할 수 없다', () => {
    const battle = makeBattle(['....'], [
      ally('a', 'liu-bei', 0, 0),
      ally('b', 'guan-yu', 1, 0),
      enemy('e', 'turban-infantry', 3, 0),
    ]);
    expect(() => attack(battle, 'a', 'e')).toThrow('사거리');
    expect(() => attack(battle, 'a', 'b')).toThrow('같은 편');
  });

  it('공격하면 상대의 대기 AI가 깨어난다', () => {
    const battle = makeBattle(['..'], [
      ally('a', 'liu-bei', 0, 0),
      enemy('e', 'turban-infantry', 1, 0, { type: 'wait' }),
    ]);
    attack(battle, 'a', 'e');
    expect(getUnit(battle, 'e').alerted).toBe(true);
  });
});

describe('행동 규칙', () => {
  it('한 턴에 한 번만 이동하고 행동한다', () => {
    const battle = makeBattle(openField(5, 1), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-infantry', 4, 0)]);
    moveUnit(battle, 'a', 1, 0);
    expect(() => moveUnit(battle, 'a', 2, 0)).toThrow('이미 이동');
    waitUnit(battle, 'a');
    expect(() => waitUnit(battle, 'a')).toThrow('이미 행동');
  });

  it('갈 수 없는 칸으로는 이동을 거부한다', () => {
    const battle = makeBattle(openField(9, 1), [ally('a', 'liu-bei', 0, 0)]);
    expect(() => moveUnit(battle, 'a', 8, 0)).toThrow('이동할 수 없음');
  });

  it('이동 취소는 원래 칸으로 되돌리고 다시 움직일 수 있다', () => {
    const battle = makeBattle(openField(5, 1), [ally('a', 'liu-bei', 0, 0)]);
    moveUnit(battle, 'a', 2, 0);
    cancelMove(battle, 'a', { x: 0, y: 0 });
    expect(getUnit(battle, 'a').x).toBe(0);
    moveUnit(battle, 'a', 3, 0);
    expect(getUnit(battle, 'a').x).toBe(3);
  });

  it('자기 턴이 아니면 움직이지 못한다', () => {
    const battle = makeBattle(openField(3, 1), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-infantry', 2, 0)]);
    expect(() => moveUnit(battle, 'e', 1, 0)).toThrow('턴이 아님');
    endAllyTurn(battle);
    expect(() => moveUnit(battle, 'a', 1, 0)).toThrow('턴이 아님');
  });

  it('턴이 돌아오면 행동 기록이 초기화되고 턴 수가 오른다', () => {
    const battle = makeBattle(openField(3, 1), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-infantry', 2, 0)]);
    waitUnit(battle, 'a');
    endAllyTurn(battle);
    endEnemyTurn(battle);
    expect(battle.turn).toBe(2);
    expect(battle.phase).toBe('ally');
    expect(getUnit(battle, 'a').acted).toBe(false);
  });
});

describe('승패 판정', () => {
  it('적을 전멸시키면 승리한다', () => {
    const battle = makeBattle(['..'], [ally('a', 'zhang-fei', 0, 0), enemy('e', 'turban-infantry', 1, 0)]);
    getUnit(battle, 'e').troops = 1;
    attack(battle, 'a', 'e');
    expect(battle.result).toBe('victory');
    expect(battle.phase).toBe('ended');
    expect(() => waitUnit(battle, 'a')).toThrow('끝남');
  });

  it('패배 조건 부대가 쓰러지면 다른 아군이 있어도 패배한다', () => {
    const battle = makeBattle(['...'], [
      ally('leader', 'liu-bei', 0, 0),
      ally('b', 'guan-yu', 2, 0),
      enemy('e', 'turban-infantry', 1, 0),
    ]);
    getUnit(battle, 'leader').troops = 1;
    endAllyTurn(battle);
    attack(battle, 'e', 'leader');
    expect(battle.result).toBe('defeat');
  });

  it('공격자가 반격으로 쓰러져도 패배가 판정된다', () => {
    const battle = makeBattle(['..'], [ally('leader', 'liu-bei', 0, 0), enemy('e', 'deng-mao', 1, 0)]);
    getUnit(battle, 'leader').troops = 1;
    attack(battle, 'leader', 'e');
    expect(battle.result).toBe('defeat');
  });

  it('다른 아군이 쓰러져도 패배 조건 부대가 살아 있으면 계속된다', () => {
    const battle = makeBattle(['...'], [
      ally('leader', 'liu-bei', 2, 0),
      ally('b', 'guan-yu', 0, 0),
      enemy('e', 'turban-infantry', 1, 0),
    ]);
    getUnit(battle, 'b').troops = 1;
    endAllyTurn(battle);
    attack(battle, 'e', 'b');
    expect(battle.result).toBeNull();
  });
});

describe('바라보는 방향', () => {
  it('처음에는 아군은 오른쪽, 적군은 왼쪽을 본다', () => {
    const battle = makeBattle(openField(5, 5), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-infantry', 4, 4)]);
    expect(getUnit(battle, 'a').facing).toBe('right');
    expect(getUnit(battle, 'e').facing).toBe('left');
  });

  it('경로에서 마지막으로 좌우로 움직인 쪽을 본다', () => {
    const path = (...steps: [number, number][]) => steps.map(([x, y]) => ({ x, y }));
    expect(facingAfterPath(path([2, 2], [1, 2]), 'right')).toBe('left');
    expect(facingAfterPath(path([2, 2], [3, 2]), 'left')).toBe('right');
    // 오른쪽으로 갔다가 위로 올라가면 오른쪽
    expect(facingAfterPath(path([2, 2], [3, 2], [3, 1]), 'left')).toBe('right');
    // 오른쪽으로 갔다가 왼쪽으로 돌아오면 왼쪽
    expect(facingAfterPath(path([2, 2], [3, 2], [3, 1], [2, 1]), 'right')).toBe('left');
  });

  it('위아래로만 움직이거나 제자리면 방향을 유지한다', () => {
    expect(facingAfterPath([{ x: 2, y: 2 }, { x: 2, y: 1 }], 'left')).toBe('left');
    expect(facingAfterPath([{ x: 2, y: 2 }], 'right')).toBe('right');
  });

  it('이동하면 방향이 바뀌고, 취소하면 이동 전 방향으로 돌아온다', () => {
    const battle = makeBattle(openField(5, 5), [ally('a', 'liu-bei', 2, 2), enemy('e', 'turban-infantry', 4, 4)]);
    const unit = getUnit(battle, 'a');
    moveUnit(battle, 'a', 1, 2);
    expect(unit.facing).toBe('left');
    cancelMove(battle, 'a', { x: 2, y: 2 });
    expect(unit.facing).toBe('right');
  });

  it('공격은 바라보는 방향을 바꾸지 않는다', () => {
    const battle = makeBattle(openField(5, 5), [ally('a', 'liu-bei', 2, 2), enemy('e', 'turban-infantry', 3, 2)]);
    const unit = getUnit(battle, 'a');
    moveUnit(battle, 'a', 2, 2);
    unit.facing = 'left';
    attack(battle, 'a', 'e');
    expect(unit.facing).toBe('left');
    expect(getUnit(battle, 'e').facing).toBe('left');
  });
});
