import classes from '../data/classes.json';
import generals from '../data/generals.json';
import skills from '../data/skills.json';
import terrain from '../data/terrain.json';
import { validateEpisodes, validateGameData } from './core/data';
import type { GameData, MapDef } from './core/types';

export const gameData = { classes, terrain, generals, skills } as unknown as GameData;

/** data/maps의 episode-NN.json을 번호 순서대로 모두 읽는다. 파일을 더하면 화가 늘어난다. */
const mapFiles = import.meta.glob('../data/maps/episode-*.json', { eager: true, import: 'default' });
export const episodes = Object.keys(mapFiles)
  .sort()
  .map((file) => mapFiles[file]) as MapDef[];
export const episodeOne = episodes[0];

const errors = [...validateGameData(gameData), ...validateEpisodes(gameData, episodes)];
if (errors.length > 0) throw new Error(`게임 데이터 오류:\n${errors.join('\n')}`);
