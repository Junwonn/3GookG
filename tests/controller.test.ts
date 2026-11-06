import { describe, expect, it } from 'vitest';
import { getUnit } from '../src/core/battle';
import { BattleController } from '../src/ui/controller';
import { ally, enemy, makeBattle, openField } from './helpers';

const setup = () => {
  const battle = makeBattle(openField(8, 3), [
    ally('a', 'liu-bei', 0, 0),
    ally('b', 'zhang-fei', 0, 2),
    enemy('e', 'turban-infantry', 3, 0),
  ]);
  return { battle, controller: new BattleController(battle) };
};

describe('입력 흐름', () => {
  it('고르기, 이동, 공격 순서로 진행된다', () => {
    const { battle, controller } = setup();
    controller.tapTile(0, 0);
    const selected = controller.view();
    expect(selected.selectedId).toBe('a');
    expect(selected.moveTiles).toContainEqual({ x: 2, y: 0 });
    expect(selected.canEndTurn).toBe(false);

    const moved = controller.tapTile(2, 0);
    expect(moved[0].type).toBe('move');
    expect(controller.view().canAttack).toBe(true);
    expect(controller.view().targetTiles).toEqual([{ x: 3, y: 0 }]);

    const hit = controller.tapTile(3, 0);
    expect(hit[0].type).toBe('attack');
    expect(getUnit(battle, 'a').acted).toBe(true);
    expect(controller.view().selectedId).toBeNull();
  });

  it('공격 버튼을 거쳐도 공격할 수 있다(키보드 흐름)', () => {
    const { controller } = setup();
    controller.tapTile(0, 0);
    controller.tapTile(2, 0);
    controller.pressAttack();
    expect(controller.view().canAttack).toBe(false);
    expect(controller.tapTile(3, 0)[0].type).toBe('attack');
  });

  it('대상이 아닌 칸을 눌러도 잘못 공격하지 않는다', () => {
    const { battle, controller } = setup();
    controller.tapTile(0, 0);
    controller.tapTile(2, 0);
    expect(controller.tapTile(7, 2)).toEqual([]);
    expect(getUnit(battle, 'a').acted).toBe(false);
  });

  it('취소는 공격 선택, 이동, 선택 순서로 되돌린다', () => {
    const { battle, controller } = setup();
    controller.tapTile(0, 0);
    controller.tapTile(2, 0);
    controller.pressAttack();

    controller.pressCancel();
    expect(controller.view().canAttack).toBe(true);

    expect(controller.pressCancel()).toEqual([{ type: 'snap', unitId: 'a' }]);
    expect(getUnit(battle, 'a').x).toBe(0);
    expect(controller.view().moveTiles.length).toBeGreaterThan(0);

    controller.pressCancel();
    expect(controller.view().selectedId).toBeNull();
  });

  it('제자리를 누르면 이동 없이 행동을 고른다', () => {
    const { battle, controller } = setup();
    controller.tapTile(0, 0);
    controller.tapTile(0, 0);
    expect(controller.view().canWait).toBe(true);
    controller.pressWait();
    expect(getUnit(battle, 'a').acted).toBe(true);
  });

  it('적을 누르면 범위만 보여 주고 조작되지 않는다', () => {
    const { controller } = setup();
    controller.tapTile(3, 0);
    const view = controller.view();
    expect(view.selectedId).toBe('e');
    expect(view.threatTiles.length).toBeGreaterThan(0);
    expect(view.canWait).toBe(false);
    expect(controller.tapTile(4, 0)).toEqual([]);
  });

  it('선택 중 다른 아군을 누르면 선택이 바뀐다', () => {
    const { controller } = setup();
    controller.tapTile(0, 0);
    controller.tapTile(0, 2);
    expect(controller.view().selectedId).toBe('b');
  });

  it('행동을 마친 부대는 다시 고를 수 없다', () => {
    const { controller } = setup();
    controller.tapTile(0, 0);
    controller.tapTile(0, 0);
    controller.pressWait();
    controller.tapTile(0, 0);
    expect(controller.view().canWait).toBe(false);
    expect(controller.tapTile(1, 0)).toEqual([]);
  });

  it('전원 행동을 마치면 자동으로 적 턴이 된다', () => {
    const { battle, controller } = setup();
    controller.tapTile(0, 0);
    controller.tapTile(0, 0);
    expect(controller.pressWait()).toEqual([]);
    controller.tapTile(0, 2);
    controller.tapTile(0, 2);
    expect(controller.pressWait()).toEqual([{ type: 'enemyPhase' }]);
    expect(battle.phase).toBe('enemy');
  });

  it('행동 안 한 부대가 있으면 턴 종료를 한 번 더 확인한다', () => {
    const { battle, controller } = setup();
    expect(controller.pressEndTurn()).toEqual([]);
    expect(controller.view().confirmEnd).toBe(true);
    expect(battle.phase).toBe('ally');
    expect(controller.pressEndTurn()).toEqual([{ type: 'enemyPhase' }]);
  });

  it('다른 칸을 누르면 턴 종료 확인이 풀린다', () => {
    const { battle, controller } = setup();
    controller.pressEndTurn();
    controller.tapTile(7, 2);
    expect(controller.view().confirmEnd).toBe(false);
    controller.pressEndTurn();
    expect(battle.phase).toBe('ally');
  });
});
