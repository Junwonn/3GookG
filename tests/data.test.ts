import { describe, expect, it } from 'vitest';
import { validateGameData, validateMap } from '../src/core/data';
import type { MapDef } from '../src/core/types';
import { episodeOne, gameData } from '../src/gameData';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('JSON 데이터 검증', () => {
  it('실제 데이터와 1화 맵은 오류가 없다', () => {
    expect(validateGameData(gameData)).toEqual([]);
    expect(validateMap(gameData, episodeOne)).toEqual([]);
  });

  it('1화에는 유비, 관우, 장비와 황건적이 있다', () => {
    const allies = episodeOne.units.filter((unit) => unit.side === 'ally').map((unit) => unit.generalId);
    expect(allies.sort()).toEqual(['guan-yu', 'liu-bei', 'zhang-fei']);
    expect(episodeOne.units.filter((unit) => unit.side === 'enemy').length).toBeGreaterThan(0);
  });

  it('없는 병과를 찾아낸다', () => {
    const data = clone(gameData);
    data.generals['liu-bei'].classId = 'dragon';
    expect(validateGameData(data).join()).toContain('없는 병과');
  });

  const brokenMap = (edit: (map: MapDef) => void): string => {
    const map = clone(episodeOne);
    edit(map);
    return validateMap(gameData, map).join();
  };

  it('맵의 잘못된 행과 기호를 찾아낸다', () => {
    expect(brokenMap((map) => (map.rows[1] = '.'))).toContain('길이가 다름');
    expect(brokenMap((map) => (map.rows[1] = '?'.repeat(10)))).toContain('알 수 없는 지형');
  });

  it('잘못된 배치를 찾아낸다', () => {
    expect(brokenMap((map) => (map.units[0].x = 99))).toContain('맵 밖');
    expect(brokenMap((map) => { map.units[0].x = 0; map.units[0].y = 6; })).toContain('설 수 없는 지형');
    expect(brokenMap((map) => { map.units[1].x = map.units[0].x; map.units[1].y = map.units[0].y; })).toContain('중복 배치');
    expect(brokenMap((map) => delete map.units[3].ai)).toContain('AI 설정이 없음');
  });
});
