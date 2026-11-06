import type { GameData, MapDef } from './types';

/** JSON 데이터의 오류를 모두 찾아 문자열 목록으로 돌려준다. 비어 있으면 정상. */
export function validateGameData(data: GameData): string[] {
  const errors: string[] = [];
  for (const [id, cls] of Object.entries(data.classes)) {
    if (cls.move <= 0) errors.push(`병과 ${id}: 이동력은 1 이상이어야 함`);
    if (cls.range.min < 1 || cls.range.max < cls.range.min) {
      errors.push(`병과 ${id}: 사거리가 잘못됨`);
    }
    for (const [terrainId, cost] of Object.entries(cls.moveCost)) {
      if (!data.terrain[terrainId]) errors.push(`병과 ${id}: 없는 지형 ${terrainId}`);
      if (cost <= 0) errors.push(`병과 ${id}: ${terrainId} 이동 비용은 1 이상이어야 함`);
    }
  }
  const symbols = new Set<string>();
  for (const [id, terrain] of Object.entries(data.terrain)) {
    if (symbols.has(terrain.symbol)) errors.push(`지형 ${id}: 기호 ${terrain.symbol} 중복`);
    symbols.add(terrain.symbol);
  }
  for (const [id, general] of Object.entries(data.generals)) {
    const cls = data.classes[general.classId];
    if (!cls) errors.push(`장수 ${id}: 없는 병과 ${general.classId}`);
    if (general.power <= 0 || general.troops <= 0) errors.push(`장수 ${id}: 능력치가 잘못됨`);
    if (cls && general.guard + cls.guardBonus <= 0) {
      errors.push(`장수 ${id}: 최종 가드는 1 이상이어야 함`);
    }
    for (const skillId of general.skills ?? []) {
      if (!data.skills[skillId]) errors.push(`장수 ${id}: 없는 기술 ${skillId}`);
    }
  }
  for (const [id, skill] of Object.entries(data.skills)) {
    if (skill.cost <= 0 || skill.cost > 100) errors.push(`기술 ${id}: 기력은 1~100이어야 함`);
    if (skill.power <= 0) errors.push(`기술 ${id}: 위력은 0보다 커야 함`);
    if (skill.range.min < 0 || skill.range.max < skill.range.min) errors.push(`기술 ${id}: 사거리가 잘못됨`);
    if (skill.shape === 'pierce' && skill.range.pattern !== 'line') errors.push(`기술 ${id}: 관통은 직선 사거리여야 함`);
    const mentioned = [
      ...Object.keys(skill.terrain ?? {}),
      ...(skill.forbidCenter ?? []),
      ...(skill.ignite?.terrain ?? []),
      ...(skill.requireNear ? [skill.requireNear] : []),
    ];
    for (const terrainId of mentioned) {
      if (!data.terrain[terrainId]) errors.push(`기술 ${id}: 없는 지형 ${terrainId}`);
    }
  }
  return errors;
}

export function validateMap(data: GameData, map: MapDef): string[] {
  const errors: string[] = [];
  const width = map.rows[0]?.length ?? 0;
  if (width === 0) errors.push('맵이 비어 있음');
  const symbolToTerrain = terrainBySymbol(data);
  map.rows.forEach((row, y) => {
    if (row.length !== width) errors.push(`${y}행의 길이가 다름`);
    for (const symbol of row) {
      if (!symbolToTerrain[symbol]) errors.push(`${y}행: 알 수 없는 지형 기호 ${symbol}`);
    }
  });

  const ids = new Set<string>();
  const occupied = new Set<string>();
  for (const unit of map.units) {
    if (ids.has(unit.id)) errors.push(`부대 id 중복: ${unit.id}`);
    ids.add(unit.id);
    const general = data.generals[unit.generalId];
    if (!general) {
      errors.push(`부대 ${unit.id}: 없는 장수 ${unit.generalId}`);
      continue;
    }
    const symbol = map.rows[unit.y]?.[unit.x];
    if (symbol === undefined) {
      errors.push(`부대 ${unit.id}: 맵 밖에 배치됨`);
      continue;
    }
    const terrainId = symbolToTerrain[symbol];
    const cls = data.classes[general.classId];
    if (terrainId && cls && cls.moveCost[terrainId] === undefined) {
      errors.push(`부대 ${unit.id}: 설 수 없는 지형에 배치됨`);
    }
    const tileKey = `${unit.x},${unit.y}`;
    if (occupied.has(tileKey)) errors.push(`부대 ${unit.id}: 같은 칸에 중복 배치됨`);
    occupied.add(tileKey);
    if (unit.side === 'enemy' && !unit.ai) errors.push(`부대 ${unit.id}: 적인데 AI 설정이 없음`);
  }
  for (const unit of map.units) {
    if (unit.ai?.type === 'guard' && !ids.has(unit.ai.escortId)) {
      errors.push(`부대 ${unit.id}: 호위 대상 ${unit.ai.escortId} 없음`);
    }
  }
  if (!ids.has(map.defeat.unitId)) errors.push(`패배 조건의 부대 ${map.defeat.unitId} 없음`);
  if (map.victory.type === 'unitDown') {
    const { unitId } = map.victory;
    if (!map.units.some((unit) => unit.id === unitId && unit.side === 'enemy')) {
      errors.push(`승리 조건의 적 부대 ${unitId} 없음`);
    }
  }
  if ((map.victory.type === 'survive' || map.victory.type === 'hold') && map.victory.turns <= 0) {
    errors.push('버틸 턴 수는 1 이상이어야 함');
  }
  if (map.victory.type === 'reach' || map.victory.type === 'hold') {
    const { x, y } = map.victory;
    const symbol = map.rows[y]?.[x];
    if (symbol === undefined) {
      errors.push('목표 칸이 맵 밖임');
    } else {
      const terrainId = symbolToTerrain[symbol];
      const walkable = Object.values(data.classes).some((cls) => cls.moveCost[terrainId] !== undefined);
      if (!walkable) errors.push('목표 칸에 설 수 없음');
    }
  }
  if (map.victory.type === 'reach' && map.victory.unitId) {
    const { unitId } = map.victory;
    if (!map.units.some((unit) => unit.id === unitId && unit.side === 'ally')) {
      errors.push(`승리 조건의 아군 부대 ${unitId} 없음`);
    }
  }
  return errors;
}

export function validateEpisodes(data: GameData, maps: MapDef[]): string[] {
  return maps.flatMap((map) => validateMap(data, map).map((error) => `${map.id}: ${error}`));
}

export function terrainBySymbol(data: GameData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [id, terrain] of Object.entries(data.terrain)) result[terrain.symbol] = id;
  return result;
}
