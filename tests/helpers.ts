import { createBattle } from '../src/core/battle';
import type { Battle, MapUnitDef } from '../src/core/types';
import { episodeOne, gameData } from '../src/gameData';

/** 규칙 테스트용 작은 전투. 실제 JSON의 병과와 장수를 그대로 쓴다. */
export function makeBattle(rows: string[], units: MapUnitDef[]): Battle {
  return createBattle(gameData, {
    id: 'test',
    name: 'test',
    objective: '',
    victory: { type: 'annihilate' },
    defeat: { type: 'unitDown', unitId: units[0].id },
    rows,
    units,
  });
}

export const ally = (id: string, generalId: string, x: number, y: number): MapUnitDef => ({
  id,
  generalId,
  side: 'ally',
  x,
  y,
});

export const enemy = (
  id: string,
  generalId: string,
  x: number,
  y: number,
  ai: MapUnitDef['ai'] = { type: 'charge' },
): MapUnitDef => ({ id, generalId, side: 'enemy', x, y, ai });

export const openField = (width: number, height: number): string[] =>
  Array.from({ length: height }, () => '.'.repeat(width));

export const newEpisodeOne = (): Battle => createBattle(gameData, episodeOne);
