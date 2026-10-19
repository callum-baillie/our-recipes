import * as SQLite from 'expo-sqlite';
import type { BordState } from '@/state/model';

export interface BordRepository {
  read(scope: string): Promise<BordState | null>;
  write(scope: string, state: BordState): Promise<void>;
}

export function createExpoRepository(): BordRepository {
  const ready = SQLite.openDatabaseAsync('bord-mobile.db').then(async (database) => {
    await database.execAsync(
      'CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
    );
    return database;
  });
  return {
    async read(scope) {
      const database = await ready;
      const row = await database.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_state WHERE id = ?',
        [scope],
      );
      if (!row) return null;
      try {
        return JSON.parse(row.value) as BordState;
      } catch {
        await database.runAsync('DELETE FROM app_state WHERE id = ?', [scope]);
        return null;
      }
    },
    async write(scope, state) {
      const database = await ready;
      await database.runAsync('INSERT OR REPLACE INTO app_state (id, value) VALUES (?, ?)', [
        scope,
        JSON.stringify(state),
      ]);
    },
  };
}
