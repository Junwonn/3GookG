import { describe, expect, it } from 'vitest';
import { planEnemyAction, runEnemyUnit } from '../src/core/ai';
import { endAllyTurn, getUnit } from '../src/core/battle';
import { manhattan } from '../src/core/pathfinding';
import { ally, enemy, makeBattle, openField } from './helpers';

describe('적 AI', () => {
  it('돌격형은 공격할 수 없어도 아군에게 다가간다', () => {
    const battle = makeBattle(openField(12, 1), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-infantry', 11, 0)]);
    endAllyTurn(battle);
    const step = runEnemyUnit(battle, 'e');
    expect(getUnit(battle, 'e').x).toBe(7);
    expect(step.events).toEqual([]);
  });

  it('돌격형은 강을 건너지 못하면 다리로 돌아간다', () => {
    const battle = makeBattle(['.....', 'rrrrb', '.....'], [
      ally('a', 'liu-bei', 0, 0),
      enemy('e', 'turban-infantry', 0, 2),
    ]);
    endAllyTurn(battle);
    runEnemyUnit(battle, 'e');
    expect(getUnit(battle, 'e').x).toBe(4);
    expect(getUnit(battle, 'e').y).toBe(2);
  });

  it('사거리에 닿으면 이동 후 공격한다', () => {
    const battle = makeBattle(openField(6, 1), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-infantry', 4, 0)]);
    endAllyTurn(battle);
    const step = runEnemyUnit(battle, 'e');
    expect(getUnit(battle, 'e').x).toBe(1);
    expect(step.events[0].defenderId).toBe('a');
  });

  it('처치할 수 있는 패배 조건 부대를 가장 먼저 노린다', () => {
    const battle = makeBattle(['...'], [
      ally('leader', 'liu-bei', 0, 0),
      ally('b', 'zhang-fei', 2, 0),
      enemy('e', 'turban-infantry', 1, 0),
    ]);
    getUnit(battle, 'leader').troops = 1;
    endAllyTurn(battle);
    expect(planEnemyAction(battle, getUnit(battle, 'e')).targetId).toBe('leader');
  });

  it('궁병은 반격받지 않는 거리에서 쏜다', () => {
    const battle = makeBattle(openField(8, 1), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-archer', 4, 0)]);
    endAllyTurn(battle);
    const step = runEnemyUnit(battle, 'e');
    expect(manhattan(getUnit(battle, 'e'), getUnit(battle, 'a'))).toBeGreaterThanOrEqual(2);
    expect(step.events).toHaveLength(1);
  });

  it('대기형은 범위 밖의 아군을 무시하다가 공격받으면 깨어난다', () => {
    const battle = makeBattle(openField(12, 1), [
      ally('a', 'liu-bei', 0, 0),
      enemy('e', 'turban-infantry', 11, 0, { type: 'wait' }),
    ]);
    endAllyTurn(battle);
    runEnemyUnit(battle, 'e');
    expect(getUnit(battle, 'e').x).toBe(11);

    const awake = makeBattle(openField(12, 1), [
      ally('a', 'liu-bei', 0, 0),
      enemy('e', 'turban-infantry', 11, 0, { type: 'wait' }),
    ]);
    getUnit(awake, 'e').alerted = true;
    endAllyTurn(awake);
    runEnemyUnit(awake, 'e');
    expect(getUnit(awake, 'e').x).toBe(7);
  });

  it('대기형도 사거리에 들어온 아군은 공격하고 이후 계속 추격한다', () => {
    const battle = makeBattle(openField(8, 1), [
      ally('a', 'liu-bei', 0, 0),
      enemy('e', 'turban-infantry', 3, 0, { type: 'wait' }),
    ]);
    endAllyTurn(battle);
    const step = runEnemyUnit(battle, 'e');
    expect(step.events.length).toBeGreaterThan(0);
    expect(getUnit(battle, 'e').alerted).toBe(true);
  });

  it('거점 방어형은 반경 밖으로 나가지 않고 복귀한다', () => {
    const battle = makeBattle(openField(12, 1), [
      ally('a', 'liu-bei', 0, 0),
      enemy('e', 'turban-infantry', 8, 0, { type: 'defend', radius: 2 }),
    ]);
    const unit = getUnit(battle, 'e');
    unit.x = 11;
    endAllyTurn(battle);
    runEnemyUnit(battle, 'e');
    expect(unit.x).toBe(8);
  });

  it('거점 방어형은 반경 안에서 닿는 적만 공격한다', () => {
    const near = makeBattle(openField(12, 1), [
      ally('a', 'liu-bei', 5, 0),
      enemy('e', 'turban-infantry', 8, 0, { type: 'defend', radius: 2 }),
    ]);
    endAllyTurn(near);
    expect(planEnemyAction(near, getUnit(near, 'e')).targetId).toBe('a');

    const far = makeBattle(openField(12, 1), [
      ally('a', 'liu-bei', 4, 0),
      enemy('e', 'turban-infantry', 8, 0, { type: 'defend', radius: 2 }),
    ]);
    endAllyTurn(far);
    expect(planEnemyAction(far, getUnit(far, 'e')).targetId).toBeUndefined();
  });

  it('호위형은 지휘관 곁을 지키고, 지휘관이 쓰러지면 돌격한다', () => {
    const units = [
      ally('a', 'liu-bei', 0, 0),
      enemy('boss', 'cheng-yuanzhi', 10, 0, { type: 'defend', radius: 1 }),
      enemy('e', 'turban-infantry', 11, 0, { type: 'guard', escortId: 'boss', radius: 2 }),
    ];
    const battle = makeBattle(openField(12, 1), units);
    endAllyTurn(battle);
    runEnemyUnit(battle, 'e');
    expect(getUnit(battle, 'e').x).toBe(11);

    const leaderless = makeBattle(openField(12, 1), units);
    getUnit(leaderless, 'boss').troops = 0;
    endAllyTurn(leaderless);
    runEnemyUnit(leaderless, 'e');
    expect(getUnit(leaderless, 'e').x).toBe(7);
  });
});
