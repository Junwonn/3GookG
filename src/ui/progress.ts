/** 몇 화까지 깼는지 기기에 저장한다. 전투 중간 상태는 저장하지 않는다. */
const STORAGE_KEY = 'battle-progress-v1';

export interface Progress {
  /** 깬 화의 수. 1이면 1화를 깼다는 뜻이고 2화까지 열려 있다. */
  cleared: number;
}

export type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 저장 공간을 쓸 수 없는 환경에서도 게임은 돌아가게 한다. 이 경우 진행도는 앱을 닫으면 사라진다. */
export function browserStorage(): ProgressStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(storage: ProgressStorage | null, total: number): Progress {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    const cleared = (parsed as Progress | null)?.cleared;
    if (typeof cleared === 'number' && Number.isInteger(cleared) && cleared >= 0) {
      return { cleared: Math.min(cleared, total) };
    }
  } catch {
    // 저장 내용이 깨졌으면 처음부터 시작한다.
  }
  return { cleared: 0 };
}

/** 다시 깬 화 때문에 진행도가 뒤로 가지 않게 한다. */
export function recordClear(progress: Progress, episodeIndex: number): Progress {
  return { cleared: Math.max(progress.cleared, episodeIndex + 1) };
}

export function saveProgress(storage: ProgressStorage | null, progress: Progress): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // 저장 공간이 가득 찬 경우 등. 이번 실행 동안은 메모리의 진행도로 계속한다.
  }
}

export function isUnlocked(progress: Progress, episodeIndex: number): boolean {
  return episodeIndex <= progress.cleared;
}

/** 앱을 켰을 때 시작할 화: 아직 깨지 않은 첫 화. 전부 깼으면 마지막 화. */
export function startingEpisode(progress: Progress, total: number): number {
  return Math.min(progress.cleared, total - 1);
}
