import type { BordState } from '@/state/model';

export interface BordRepository {
  read(scope: string): Promise<BordState | null>;
  write(scope: string, state: BordState): Promise<void>;
}

const STORAGE_PREFIX = 'bord-mobile-state:';

export function createExpoRepository(): BordRepository {
  return {
    async read(scope) {
      const key = `${STORAGE_PREFIX}${scope}`;
      const value = globalThis.localStorage?.getItem(key);
      if (!value) return null;
      try {
        return JSON.parse(value) as BordState;
      } catch {
        globalThis.localStorage?.removeItem(key);
        return null;
      }
    },
    async write(scope, state) {
      globalThis.localStorage?.setItem(`${STORAGE_PREFIX}${scope}`, JSON.stringify(state));
    },
  };
}
