import { describe, expect, it } from 'vitest';
import { planEnemyAction, runEnemyUnit } from '../src/core/ai';
import {
  attack,
  BURN_RATE,
  endAllyTurn,
  endEnemyTurn,
  getUnit,
  moveUnit,
  SPIRIT_MAX,
  SPIRIT_ON_ATTACK,
  SPIRIT_ON_HIT,
  SPIRIT_PER_TURN,
  SPIRIT_START,
} from '../src/core/battle';
import { calcDamage } from '../src/core/combat';
import { skillBlockReason, skillCenters, useSkill } from '../src/core/skills';
import { gameData } from '../src/gameData';
import { BattleController } from '../src/ui/controller';
import { ally, enemy, makeBattle, openField } from './helpers';

const skills = gameData.skills;

describe('기력', () => {
  it('시작값에서 턴, 공격, 피격으로 쌓이고 최대치를 넘지 않는다', () => {
    const battle = makeBattle(openField(4, 1), [ally('a', 'zhang-fei', 0, 0), enemy('e', 'turban-infantry', 1, 0)]);
    const unit = getUnit(battle, 'a');
    const foe = getUnit(battle, 'e');
    expect(unit.spirit).toBe(SPIRIT_START);

    attack(battle, 'a', 'e');
    // 때려서 얻고, 반격을 맞아서 또 얻는다
    expect(unit.spirit).toBe(SPIRIT_START + SPIRIT_ON_ATTACK + SPIRIT_ON_HIT);
    expect(foe.spirit).toBe(SPIRIT_START + SPIRIT_ON_HIT);

    endAllyTurn(battle);
    expect(foe.spirit).toBe(SPIRIT_START + SPIRIT_ON_HIT + SPIRIT_PER_TURN);
    endEnemyTurn(battle);
    expect(unit.spirit).toBe(SPIRIT_START + SPIRIT_ON_ATTACK + SPIRIT_ON_HIT + SPIRIT_PER_TURN);

    unit.spirit = SPIRIT_MAX;
    endAllyTurn(battle);
    endEnemyTurn(battle);
    expect(unit.spirit).toBe(SPIRIT_MAX);
  });
});

describe('화공', () => {
  const field = () =>
    makeBattle(['..f..', '.....', '.....'], [
      ally('a', 'liu-bei', 0, 2),
      ally('b', 'zhang-fei', 2, 1),
      enemy('e1', 'turban-infantry', 2, 0),
      enemy('e2', 'turban-infantry', 3, 1),
      enemy('far', 'turban-infantry', 4, 2),
    ]);

  it('범위 안의 적만 맞히고, 숲의 적은 1.5배를 받으며, 아군은 맞지 않는다', () => {
    const battle = field();
    const caster = getUnit(battle, 'a');
    caster.spirit = 40;
    const skill = skills['fire-attack'];
    const base = calcDamage(caster.troops, caster.power, getUnit(battle, 'e1').guard, 1);
    const result = useSkill(battle, 'a', 'fire-attack', { x: 2, y: 1 });
    const hit = (id: string) => result.hits.find((one) => one.unitId === id)!;
    expect(result.hits.map((one) => one.unitId).sort()).toEqual(['e1', 'e2']);
    expect(hit('e2').amount).toBe(Math.round(base * skill.power));
    expect(hit('e1').amount).toBe(Math.round(calcDamage(caster.troops, caster.power, getUnit(battle, 'e1').guard, 1.5) * skill.power));
    expect(getUnit(battle, 'b').troops).toBe(getUnit(battle, 'b').maxTroops);
    expect(getUnit(battle, 'far').troops).toBe(getUnit(battle, 'far').maxTroops);
  });

  it('기력을 쓰고 행동을 끝내며 반격을 받지 않는다', () => {
    const battle = field();
    const caster = getUnit(battle, 'a');
    caster.spirit = 45;
    useSkill(battle, 'a', 'fire-attack', { x: 2, y: 1 });
    expect(caster.spirit).toBe(5);
    expect(caster.acted).toBe(true);
    expect(caster.troops).toBe(caster.maxTroops);
    expect(() => useSkill(battle, 'a', 'fire-attack', { x: 2, y: 1 })).toThrow();
  });

  it('기력이 모자라거나 사거리 밖이면 쓸 수 없다', () => {
    const battle = field();
    const caster = getUnit(battle, 'a');
    caster.spirit = 39;
    expect(skillBlockReason(battle, caster, skills['fire-attack'])).toBe('기력 부족');
    expect(() => useSkill(battle, 'a', 'fire-attack', { x: 2, y: 1 })).toThrow('기력');
    caster.spirit = 100;
    expect(() => useSkill(battle, 'a', 'fire-attack', { x: 4, y: 0 })).toThrow('쓸 수 없음');
  });

  it('강 칸을 중심으로 고를 수 없다', () => {
    const battle = makeBattle(['.....', 'rrrrr', '.....'], [
      ally('a', 'liu-bei', 2, 2),
      enemy('e', 'turban-infantry', 2, 0),
    ]);
    const caster = getUnit(battle, 'a');
    caster.spirit = 100;
    const centers = skillCenters(battle, caster, skills['fire-attack']);
    expect(centers).toContainEqual({ x: 2, y: 0 });
    expect(centers).not.toContainEqual({ x: 2, y: 1 });
  });

  it('숲이 2턴 동안 타면서 그 칸에서 턴을 시작한 부대의 병력을 깎고 꺼진다', () => {
    const battle = makeBattle(['f....', '.....'], [ally('a', 'liu-bei', 2, 1), enemy('e', 'turban-infantry', 0, 0, { type: 'wait' })]);
    const caster = getUnit(battle, 'a');
    const foe = getUnit(battle, 'e');
    caster.spirit = 40;
    const result = useSkill(battle, 'a', 'fire-attack', { x: 0, y: 0 });
    expect(result.ignited).toEqual([{ x: 0, y: 0 }]);
    expect(battle.fires).toEqual([{ x: 0, y: 0, turns: 2 }]);

    const before = foe.troops;
    const burns = endAllyTurn(battle);
    const burn = Math.round(foe.maxTroops * BURN_RATE);
    expect(burns).toEqual([{ unitId: 'e', amount: burn, troops: before - burn }]);
    expect(foe.troops).toBe(before - burn);

    endEnemyTurn(battle);
    expect(battle.fires).toEqual([{ x: 0, y: 0, turns: 1 }]);
    endAllyTurn(battle);
    endEnemyTurn(battle);
    expect(battle.fires).toEqual([]);
  });

  it('불길만으로는 퇴각하지 않고 병력 1에서 멈춘다', () => {
    const battle = makeBattle(['f....', '.....'], [ally('a', 'liu-bei', 2, 1), enemy('e', 'turban-infantry', 0, 0)]);
    const foe = getUnit(battle, 'e');
    foe.troops = 5;
    battle.fires = [{ x: 0, y: 0, turns: 3 }];
    endAllyTurn(battle);
    expect(foe.troops).toBe(1);
    expect(battle.result).toBeNull();
    endEnemyTurn(battle);
    endAllyTurn(battle);
    expect(foe.troops).toBe(1);
  });

  it('적이 없어도 숲만 미리 태울 수 있다', () => {
    const battle = makeBattle(['f....', '.....'], [ally('a', 'liu-bei', 2, 1), enemy('e', 'turban-infantry', 4, 0)]);
    const caster = getUnit(battle, 'a');
    caster.spirit = 40;
    expect(skillCenters(battle, caster, skills['fire-attack'])).toContainEqual({ x: 0, y: 0 });
    const result = useSkill(battle, 'a', 'fire-attack', { x: 0, y: 0 });
    expect(result.hits).toEqual([]);
    expect(result.ignited).toHaveLength(1);
  });
});

describe('다른 기술', () => {
  it('낙석은 산 옆의 적에게만 쓰고 지형 방어를 무시한다', () => {
    const battle = makeBattle(['m.f...', '......'], [
      ally('a', 'guan-yu', 2, 1),
      enemy('near', 'turban-infantry', 1, 0),
      enemy('far', 'turban-infantry', 2, 0),
    ]);
    const caster = getUnit(battle, 'a');
    caster.spirit = 30;
    const centers = skillCenters(battle, caster, skills.rockfall);
    expect(centers).toContainEqual({ x: 1, y: 0 });
    expect(centers).not.toContainEqual({ x: 2, y: 0 });
    expect(skillBlockReason(battle, caster, skills.rockfall)).toBeNull();

    const open = makeBattle(openField(4, 2), [ally('a', 'guan-yu', 0, 0), enemy('e', 'turban-infantry', 1, 0)]);
    getUnit(open, 'a').spirit = 30;
    expect(skillBlockReason(open, getUnit(open, 'a'), skills.rockfall)).toBe('대상 없음');
  });

  it('격려는 다친 아군만 회복하고 최대 병력을 넘지 않는다', () => {
    const battle = makeBattle(openField(5, 1), [
      ally('a', 'liu-bei', 0, 0),
      ally('b', 'zhang-fei', 1, 0),
      ally('c', 'guan-yu', 2, 0),
      enemy('e', 'turban-infantry', 4, 0),
    ]);
    const caster = getUnit(battle, 'a');
    caster.spirit = 30;
    const hurt = getUnit(battle, 'b');
    hurt.troops = hurt.maxTroops - 10;
    const veryHurt = getUnit(battle, 'c');
    veryHurt.troops = 100;
    const result = useSkill(battle, 'a', 'rally', { x: 1, y: 0 });
    expect(hurt.troops).toBe(hurt.maxTroops);
    expect(veryHurt.troops).toBe(100 + Math.round(veryHurt.maxTroops * 0.2));
    expect(result.hits.map((hit) => hit.unitId).sort()).toEqual(['b', 'c']);
    expect(caster.troops).toBe(caster.maxTroops);
  });

  it('다친 아군이 없으면 격려를 쓸 수 없다', () => {
    const battle = makeBattle(openField(5, 1), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-infantry', 4, 0)]);
    getUnit(battle, 'a').spirit = 30;
    expect(skillBlockReason(battle, getUnit(battle, 'a'), skills.rally)).toBe('대상 없음');
  });

  it('청룡참은 자기 주변 네 칸의 적을 모두 벤다', () => {
    const battle = makeBattle(openField(5, 3), [
      ally('a', 'guan-yu', 2, 1),
      enemy('n', 'turban-infantry', 2, 0),
      enemy('w', 'turban-infantry', 1, 1),
      enemy('corner', 'turban-infantry', 3, 0),
    ]);
    getUnit(battle, 'a').spirit = 50;
    const result = useSkill(battle, 'a', 'dragon-slash', { x: 2, y: 1 });
    expect(result.hits.map((hit) => hit.unitId).sort()).toEqual(['n', 'w']);
  });

  it('사모 관통은 그 줄의 적을 두 칸까지 함께 찌른다', () => {
    const battle = makeBattle(openField(5, 2), [
      ally('a', 'zhang-fei', 0, 0),
      enemy('e1', 'turban-infantry', 1, 0),
      enemy('e2', 'turban-infantry', 2, 0),
      enemy('e3', 'turban-infantry', 3, 0),
    ]);
    getUnit(battle, 'a').spirit = 50;
    const result = useSkill(battle, 'a', 'serpent-pierce', { x: 1, y: 0 });
    expect(result.hits.map((hit) => hit.unitId).sort()).toEqual(['e1', 'e2']);
  });

  it('기술로 마지막 적을 쓰러뜨리면 승리한다', () => {
    const battle = makeBattle(openField(3, 1), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-infantry', 1, 0)]);
    getUnit(battle, 'a').spirit = 50;
    getUnit(battle, 'e').troops = 1;
    const result = useSkill(battle, 'a', 'twin-swords', { x: 1, y: 0 });
    expect(result.hits[0].defeated).toBe(true);
    expect(battle.result).toBe('victory');
  });
});

describe('승리 조건', () => {
  const withVictory = (victory: object) => {
    const battle = makeBattle(openField(5, 1), [
      ally('a', 'zhang-fei', 0, 0),
      enemy('boss', 'turban-infantry', 1, 0),
      enemy('other', 'turban-infantry', 4, 0),
    ]);
    battle.map = { ...battle.map, victory } as typeof battle.map;
    return battle;
  };

  it('지휘관을 쓰러뜨리면 다른 적이 남아 있어도 승리한다', () => {
    const battle = withVictory({ type: 'unitDown', unitId: 'boss' });
    getUnit(battle, 'boss').troops = 1;
    attack(battle, 'a', 'boss');
    expect(battle.result).toBe('victory');
  });

  it('정해진 턴을 버티면 승리한다', () => {
    const battle = withVictory({ type: 'survive', turns: 2 });
    getUnit(battle, 'boss').x = 3;
    endAllyTurn(battle);
    endEnemyTurn(battle);
    expect(battle.result).toBeNull();
    expect(battle.turn).toBe(2);
    endAllyTurn(battle);
    endEnemyTurn(battle);
    expect(battle.result).toBe('victory');
    expect(battle.phase).toBe('ended');
  });
});

describe('적의 기술 사용', () => {
  const mob = () =>
    makeBattle(openField(8, 3), [
      ally('a', 'liu-bei', 3, 0),
      ally('b', 'zhang-fei', 3, 2),
      ally('c', 'guan-yu', 4, 1),
      enemy('e', 'han-zhong', 0, 1),
    ]);

  it('기력이 있으면 여러 부대를 맞히는 화공을 고른다', () => {
    const battle = mob();
    const caster = getUnit(battle, 'e');
    caster.spirit = 40;
    endAllyTurn(battle);
    const step = runEnemyUnit(battle, 'e');
    expect(step.skill?.skillId).toBe('fire-attack');
    expect(step.skill!.hits.length).toBeGreaterThanOrEqual(2);
    expect(caster.spirit).toBeLessThan(40 + SPIRIT_PER_TURN);
  });

  it('기력이 없으면 일반 행동을 한다', () => {
    const battle = mob();
    getUnit(battle, 'e').spirit = 0;
    endAllyTurn(battle);
    expect(runEnemyUnit(battle, 'e').skill).toBeUndefined();
  });

  it('다른 곳에 설 수 있으면 불타는 칸에 멈추지 않는다', () => {
    const battle = makeBattle(openField(5, 1), [ally('a', 'liu-bei', 4, 0), enemy('e', 'turban-infantry', 0, 0)]);
    battle.fires = [{ x: 3, y: 0, turns: 2 }];
    endAllyTurn(battle);
    const plan = planEnemyAction(battle, getUnit(battle, 'e'));
    expect(plan.moveTo).not.toEqual({ x: 3, y: 0 });
  });
});

describe('기술 입력 흐름', () => {
  const setup = () => {
    const battle = makeBattle(openField(6, 3), [
      ally('a', 'liu-bei', 0, 1),
      enemy('e1', 'turban-infantry', 2, 1),
      enemy('e2', 'turban-infantry', 3, 1),
    ]);
    getUnit(battle, 'a').spirit = 100;
    const controller = new BattleController(battle);
    controller.tapTile(0, 1);
    controller.tapTile(0, 1);
    return { battle, controller };
  };

  it('이동 전에는 턴 종료를, 이동 후에는 기술 버튼을 보여 준다', () => {
    const battle = makeBattle(openField(4, 1), [ally('a', 'liu-bei', 0, 0), enemy('e', 'turban-infantry', 3, 0)]);
    const controller = new BattleController(battle);
    expect(controller.view().showSkillButton).toBe(false);
    controller.tapTile(0, 0);
    expect(controller.view().showSkillButton).toBe(false);
    controller.tapTile(0, 0);
    expect(controller.view().showSkillButton).toBe(true);
    expect(controller.view().canSkill).toBe(true);
  });

  it('목록, 칸 고르기, 범위 확인, 같은 칸 다시 누르기 순서로 쓴다', () => {
    const { battle, controller } = setup();
    controller.pressSkill();
    expect(controller.view().skillOptions?.map((one) => one.name)).toEqual(['화공', '격려', '쌍고검']);
    expect(controller.view().skillOptions?.find((one) => one.name === '격려')?.blocked).toBe('대상 없음');

    controller.chooseSkill('fire-attack');
    const aiming = controller.view();
    expect(aiming.skillOptions).toBeNull();
    expect(aiming.skillTiles).toContainEqual({ x: 2, y: 1 });
    expect(aiming.areaTiles).toEqual([]);

    expect(controller.tapTile(1, 1)).toEqual([]);
    expect(controller.view().areaTiles).toHaveLength(5);
    expect(controller.view().message).toContain('적 1부대');
    expect(getUnit(battle, 'e1').troops).toBe(getUnit(battle, 'e1').maxTroops);

    // 다른 칸을 누르면 중심만 바뀌고 아직 쓰지 않는다
    expect(controller.tapTile(3, 1)).toEqual([]);
    expect(controller.view().message).toContain('적 2부대');

    const effects = controller.tapTile(3, 1);
    expect(effects[0].type).toBe('skill');
    expect(getUnit(battle, 'a').acted).toBe(true);
  });

  it('취소를 누르면 한 단계씩 되돌아간다', () => {
    const { controller } = setup();
    controller.pressSkill();
    controller.chooseSkill('fire-attack');
    controller.pressCancel();
    expect(controller.view().skillOptions).not.toBeNull();
    controller.pressCancel();
    expect(controller.view().skillOptions).toBeNull();
    expect(controller.view().canSkill).toBe(true);
  });

  it('막힌 기술은 고를 수 없다', () => {
    const { controller } = setup();
    controller.pressSkill();
    controller.chooseSkill('rally');
    expect(controller.view().skillOptions).not.toBeNull();
  });

  it('자기 칸이 중심인 기술은 바로 범위를 보여 준다', () => {
    const battle = makeBattle(openField(4, 3), [ally('a', 'guan-yu', 1, 1), enemy('e', 'turban-infantry', 2, 1)]);
    getUnit(battle, 'a').spirit = 100;
    const controller = new BattleController(battle);
    controller.tapTile(1, 1);
    controller.tapTile(1, 1);
    controller.pressSkill();
    controller.chooseSkill('dragon-slash');
    expect(controller.view().areaTiles.length).toBeGreaterThan(0);
    expect(controller.tapTile(2, 1)[0].type).toBe('skill');
  });
});

describe('이동과 기술', () => {
  it('이동한 칸을 기준으로 사거리를 계산한다', () => {
    const battle = makeBattle(openField(7, 1), [ally('a', 'guan-yu', 0, 0), enemy('e', 'turban-infantry', 6, 0)]);
    const caster = getUnit(battle, 'a');
    caster.spirit = 50;
    expect(skillBlockReason(battle, caster, skills['dragon-slash'])).toBe('대상 없음');
    moveUnit(battle, 'a', 5, 0);
    expect(skillBlockReason(battle, caster, skills['dragon-slash'])).toBeNull();
  });
});
