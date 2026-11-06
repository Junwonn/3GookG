import { describe, expect, it } from 'vitest';
import { createBattle, endAllyTurn, endEnemyTurn, getUnit, isBurning, moveUnit, waitUnit } from '../src/core/battle';
import { key, reachableTiles } from '../src/core/pathfinding';
import { skillDamage, useSkill } from '../src/core/skills';
import { runEnemyUnit } from '../src/core/ai';
import { validateEpisodes } from '../src/core/data';
import type { Battle, MapDef } from '../src/core/types';
import { BattleController } from '../src/ui/controller';
import { episodes, gameData } from '../src/gameData';
import {
  isUnlocked,
  loadProgress,
  type ProgressStorage,
  recordClear,
  saveProgress,
  startingEpisode,
} from '../src/ui/progress';
import { bruteTurn, idleTurn, play, remaining, skillfulTurn, strengthRatio } from './autoplay';

describe('화 데이터', () => {
  it('23화 전부 있고 맵이 올바르다', () => {
    expect(validateEpisodes(gameData, episodes)).toEqual([]);
    expect(episodes.length).toBe(23);
    expect(episodes.map((map) => map.id)).toEqual(episodes.map((_, index) => `episode-${String(index + 1).padStart(2, '0')}`));
  });

  it('기본 화면보다 큰 맵이 있고, 기본 화면보다 작은 맵은 없다', () => {
    expect(episodes.every((map) => map.rows[0].length >= 10 && map.rows.length >= 13)).toBe(true);
    expect(episodes.filter((map) => map.rows[0].length > 10 || map.rows.length > 13).length).toBe(20);
    expect(Math.max(...episodes.map((map) => map.rows[0].length * map.rows.length))).toBeGreaterThanOrEqual(300);
  });

  it('승리 조건의 적이 없으면 찾아낸다', () => {
    const broken = { ...episodes[1], victory: { type: 'unitDown', unitId: 'nobody' } } as MapDef;
    expect(validateEpisodes(gameData, [broken]).join()).toContain('승리 조건');
  });

  it('목표 칸이 맵 밖이거나 벽이면 찾아낸다', () => {
    const outside = { ...episodes[0], victory: { type: 'reach', x: 99, y: 0 } } as MapDef;
    expect(validateEpisodes(gameData, [outside]).join()).toContain('목표 칸');
    const wall = { ...episodes[0], rows: ['w' + episodes[0].rows[0].slice(1), ...episodes[0].rows.slice(1)], victory: { type: 'hold', x: 0, y: 0, turns: 3 } } as MapDef;
    expect(validateEpisodes(gameData, [wall]).join()).toContain('목표 칸');
  });

  it('맵마다 소개 문장과 목표 설명이 있다', () => {
    for (const map of episodes) {
      expect(map.brief, map.name).toBeTruthy();
      expect(map.objective, map.name).toContain('승리');
      expect(map.objective, map.name).toContain('패배');
    }
  });

  it('이야기대로 장수가 합류하고 떠난다', () => {
    const roster = (no: number) => episodes[no - 1].units.filter((unit) => unit.side === 'ally').map((unit) => unit.generalId);
    expect(roster(9)).toEqual(['guan-yu']);
    expect(roster(10)).toContain('zhao-yun');
    expect(roster(11)).toContain('zhuge-liang');
    expect(roster(14)).toContain('huang-zhong');
    expect(roster(15)).toContain('ma-chao');
    for (let no = 18; no <= 23; no++) {
      expect(roster(no)).not.toContain('guan-yu');
      expect(roster(no)).not.toContain('zhang-fei');
    }
    for (let no = 19; no <= 23; no++) expect(roster(no)).not.toContain('liu-bei');
    expect(roster(21)).toContain('jiang-wei');
    expect(roster(23)).not.toContain('zhuge-liang');
    expect(episodes[22].defeat.unitId).toBe('jiang-wei');
  });
});

/** 칸 하나짜리 간단한 맵으로 새 승리 조건을 확인한다. */
function flatMap(victory: MapDef['victory']): MapDef {
  return {
    id: 'test',
    name: '시험',
    objective: '승리 / 패배',
    victory,
    defeat: { type: 'unitDown', unitId: 'liu-bei' },
    rows: Array.from({ length: 13 }, () => '..........'),
    units: [
      { id: 'liu-bei', generalId: 'liu-bei', side: 'ally', x: 1, y: 10 },
      { id: 'guan-yu', generalId: 'guan-yu', side: 'ally', x: 2, y: 10 },
      { id: 'foe', generalId: 'turban-infantry', side: 'enemy', x: 8, y: 2, ai: { type: 'charge' } },
    ],
  };
}

function enemyTurn(battle: Battle): void {
  runEnemyUnit(battle, 'foe');
  if (battle.phase === 'enemy') endEnemyTurn(battle);
}

describe('도착 승리', () => {
  it('지정된 장수가 깃발 칸에서 행동을 마치면 이긴다', () => {
    const battle = createBattle(gameData, flatMap({ type: 'reach', x: 1, y: 8, unitId: 'liu-bei' }));
    moveUnit(battle, 'liu-bei', 1, 8);
    expect(battle.result).toBeNull();
    waitUnit(battle, 'liu-bei');
    expect(battle.result).toBe('victory');
  });

  it('다른 장수가 밟으면 이기지 않는다', () => {
    const battle = createBattle(gameData, flatMap({ type: 'reach', x: 2, y: 8, unitId: 'liu-bei' }));
    moveUnit(battle, 'guan-yu', 2, 8);
    waitUnit(battle, 'guan-yu');
    expect(battle.result).toBeNull();
  });

  it('지정이 없으면 아군 누구든 된다', () => {
    const battle = createBattle(gameData, flatMap({ type: 'reach', x: 2, y: 8 }));
    moveUnit(battle, 'guan-yu', 2, 8);
    waitUnit(battle, 'guan-yu');
    expect(battle.result).toBe('victory');
  });

  it('이동을 취소하면 승리로 치지 않고, 안내 문구가 나온다', () => {
    const battle = createBattle(gameData, flatMap({ type: 'reach', x: 2, y: 8 }));
    const controller = new BattleController(battle);
    controller.tapTile(2, 10);
    controller.tapTile(2, 8);
    expect(controller.view().message).toContain('목표 칸');
    controller.pressCancel();
    expect(battle.result).toBeNull();
    expect(getUnit(battle, 'guan-yu').y).toBe(10);
  });
});

describe('사수 승리', () => {
  it('정한 턴을 버티면 이긴다', () => {
    const battle = createBattle(gameData, flatMap({ type: 'hold', x: 1, y: 10, turns: 1 }));
    endAllyTurn(battle);
    enemyTurn(battle);
    expect(battle.result).toBe('victory');
  });

  it('적이 깃발 칸에 닿으면 곧바로 지고, 적은 그 칸을 노린다', () => {
    const map = flatMap({ type: 'hold', x: 8, y: 5, turns: 9 });
    const battle = createBattle(gameData, map);
    endAllyTurn(battle);
    runEnemyUnit(battle, 'foe');
    expect(getUnit(battle, 'foe')).toMatchObject({ x: 8, y: 5 });
    expect(battle.result).toBe('defeat');
  });

  it('아군이 칸을 막고 서 있으면 적이 밟을 수 없다', () => {
    const map = flatMap({ type: 'hold', x: 8, y: 5, turns: 9 });
    map.units[1] = { ...map.units[1], x: 8, y: 5 };
    const battle = createBattle(gameData, map);
    endAllyTurn(battle);
    runEnemyUnit(battle, 'foe');
    expect(battle.result).toBeNull();
  });
});

describe('새 지형', () => {
  const terrainMap = (rows: string[], units: MapDef['units']): MapDef => ({
    ...flatMap({ type: 'annihilate' }),
    rows: [...rows, ...Array.from({ length: 13 - rows.length }, () => '.'.repeat(rows[0].length))],
    units,
  });

  it('성벽은 아무도 지나가지 못하고, 성문으로는 지나간다', () => {
    const map = terrainMap(['..........', 'wwwwwgwwww', '..........'], [
      { id: 'liu-bei', generalId: 'liu-bei', side: 'ally', x: 5, y: 2 },
      { id: 'foe', generalId: 'turban-infantry', side: 'enemy', x: 0, y: 8, ai: { type: 'wait' } },
    ]);
    const battle = createBattle(gameData, map);
    const tiles = reachableTiles(battle, getUnit(battle, 'liu-bei'));
    expect(tiles.has(key(5, 0))).toBe(true);
    expect(tiles.has(key(4, 1))).toBe(false);
    expect(tiles.has(key(4, 0))).toBe(true);
    expect(battle.data.classes.cavalry.moveCost.wall).toBeUndefined();
  });

  it('성 안과 성문에 서면 받는 피해가 줄어든다', () => {
    expect(gameData.terrain.castle.damageTaken).toBeLessThan(1);
    expect(gameData.terrain.gate.damageTaken).toBeLessThan(1);
  });

  it('배 위의 적은 화공에 더 아프고, 갑판에 불이 붙는다', () => {
    const units: MapDef['units'] = [
      { id: 'liu-bei', generalId: 'liu-bei', side: 'ally', x: 2, y: 2 },
      { id: 'foe', generalId: 'turban-infantry', side: 'enemy', x: 2, y: 0, ai: { type: 'wait' } },
    ];
    const onDeck = createBattle(gameData, terrainMap(['ssssssssss', 'ssssssssss', '..........'], units));
    const onLand = createBattle(gameData, terrainMap(['..........', '..........', '..........'], units));
    getUnit(onDeck, 'liu-bei').spirit = 100;
    const damage = (battle: Battle) => skillDamage(battle, getUnit(battle, 'liu-bei'), gameData.skills['fire-attack'], getUnit(battle, 'foe'));
    expect(damage(onDeck)).toBeGreaterThan(damage(onLand));
    const result = useSkill(onDeck, 'liu-bei', 'fire-attack', { x: 2, y: 0 });
    expect(result.ignited.length).toBeGreaterThan(0);
    expect(isBurning(onDeck, 2, 0)).toBe(true);
  });
});

describe('적 배율', () => {
  it('적의 파워와 병력에만 곱해진다', () => {
    const map = { ...flatMap({ type: 'annihilate' }), enemyScale: { power: 1.5, troops: 2 } };
    const plain = createBattle(gameData, flatMap({ type: 'annihilate' }));
    const scaled = createBattle(gameData, map);
    expect(getUnit(scaled, 'foe').maxTroops).toBe(getUnit(plain, 'foe').maxTroops * 2);
    expect(getUnit(scaled, 'foe').power).toBe(Math.round(getUnit(plain, 'foe').power * 1.5));
    expect(getUnit(scaled, 'guan-yu')).toEqual(getUnit(plain, 'guan-yu'));
  });
});

const skilled = episodes.map((map) => play(map, skillfulTurn));

describe.each(episodes.map((map, index) => ({ map, index })))('$map.name 자동 시뮬레이션', ({ map, index }) => {
  it('기술과 전술을 쓰면 이길 수 있고, 피해도 적지 않다', () => {
    expect(skilled[index].result).toBe('victory');
    expect(remaining(skilled[index])).toBeLessThan(0.9);
  });

  it('같은 입력이면 항상 같은 결과가 나온다', () => {
    const second = play(map, skillfulTurn);
    expect(second.turn).toBe(skilled[index].turn);
    expect(second.units.map((unit) => unit.troops)).toEqual(skilled[index].units.map((unit) => unit.troops));
  });

  it('아무것도 하지 않으면 이기지 못한다', () => {
    expect(play(map, idleTurn).result).not.toBe('victory');
  });
});

describe('난이도 곡선', () => {
  const average = (from: number, to: number, value: (index: number) => number): number => {
    let sum = 0;
    for (let no = from; no <= to; no++) sum += value(no - 1);
    return sum / (to - from + 1);
  };
  const enemyCount = (index: number) => episodes[index].units.filter((unit) => unit.side === 'enemy').length;
  const left = (index: number) => remaining(skilled[index]);
  const PARTS: [number, number][] = [[1, 3], [4, 9], [10, 16], [17, 23]];

  it('뒤로 갈수록 숙련 플레이가 남기는 병력이 구간 평균으로 줄어든다', () => {
    const values = PARTS.map(([from, to]) => average(from, to, left));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
  });

  it('뒤로 갈수록 상대하는 적의 수가 구간 평균으로 늘어난다', () => {
    const values = PARTS.map(([from, to]) => average(from, to, enemyCount));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it('후반은 눈앞의 적만 치는 플레이로 거의 이기지 못한다', () => {
    const wins = episodes.slice(15).filter((map) => play(map, bruteTurn).result === 'victory').length;
    expect(wins).toBeLessThanOrEqual(1);
  });

  it('적과 아군의 전체 힘 비율이 터무니없지 않다', () => {
    for (const map of episodes) {
      const ratio = strengthRatio(map);
      expect(ratio, map.name).toBeGreaterThan(0.7);
      expect(ratio, map.name).toBeLessThan(3);
    }
  });
});

describe('2화와 3화의 난이도', () => {
  it.each([1, 2])('%i번 화는 기술과 전술을 쓰면 눈앞의 적만 칠 때보다 병력이 크게 남는다', (index) => {
    const brute = play(episodes[index], bruteTurn);
    expect(remaining(skilled[index]) - remaining(brute)).toBeGreaterThan(0.3);
    expect(remaining(brute)).toBeLessThan(0.3);
  });

  it('3화는 턴만 넘기거나 눈앞의 적만 치면 버티지 못하고 진다', () => {
    expect(play(episodes[2], idleTurn).result).toBe('defeat');
    expect(play(episodes[2], bruteTurn).result).toBe('defeat');
  });
});

describe('진행도 저장', () => {
  const memory = (initial?: string): ProgressStorage & { value: string | null } => ({
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  });

  it('저장한 진행도를 다시 읽고, 다음 화부터 시작한다', () => {
    const storage = memory();
    saveProgress(storage, recordClear(loadProgress(storage, 3), 0));
    const loaded = loadProgress(storage, 3);
    expect(loaded.cleared).toBe(1);
    expect(startingEpisode(loaded, 3)).toBe(1);
    expect(isUnlocked(loaded, 1)).toBe(true);
    expect(isUnlocked(loaded, 2)).toBe(false);
  });

  it('앞 화를 다시 깨도 진행도가 뒤로 가지 않는다', () => {
    expect(recordClear({ cleared: 2 }, 0).cleared).toBe(2);
  });

  it('전부 깼으면 마지막 화에서 시작한다', () => {
    expect(startingEpisode({ cleared: 3 }, 3)).toBe(2);
  });

  it('저장 내용이 깨졌거나 저장 공간이 없어도 처음부터 시작한다', () => {
    expect(loadProgress(memory('{깨진 값'), 3).cleared).toBe(0);
    expect(loadProgress(memory('{"cleared":-1}'), 3).cleared).toBe(0);
    expect(loadProgress(memory('{"cleared":"2"}'), 3).cleared).toBe(0);
    expect(loadProgress(null, 3).cleared).toBe(0);
    expect(loadProgress(memory('{"cleared":99}'), 3).cleared).toBe(3);
    const broken: ProgressStorage = {
      getItem: () => {
        throw new Error('막힘');
      },
      setItem: () => {
        throw new Error('막힘');
      },
    };
    expect(loadProgress(broken, 3).cleared).toBe(0);
    expect(() => saveProgress(broken, { cleared: 1 })).not.toThrow();
  });
});
