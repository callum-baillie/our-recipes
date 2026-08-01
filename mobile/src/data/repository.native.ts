import * as SQLite from 'expo-sqlite';
import type { BordState } from '@/state/model';

export interface BordRepository {
  read(scope: string): Promise<BordState | null>;
  write(scope: string, state: BordState): Promise<void>;
}

export function createExpoRepository(): BordRepository {
  const database = SQLite.openDatabaseSync('bord-mobile.db');
  database.execSync(
    'CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
  );
  return {
    async read(scope) {
      const row = database.getFirstSync<{ value: string }>(
        'SELECT value FROM app_state WHERE id = ?',
        [scope],
      );
      if (!row) return null;
      try {
        return JSON.parse(row.value) as BordState;
      } catch {
        database.runSync('DELETE FROM app_state WHERE id = ?', [scope]);
        return null;
      }
    },
    async write(scope, state) {
      database.runSync('INSERT OR REPLACE INTO app_state (id, value) VALUES (?, ?)', [
        scope,
        JSON.stringify(state),
      ]);
    },
  };
}
