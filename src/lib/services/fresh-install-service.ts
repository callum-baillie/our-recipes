import 'server-only';

import { isAbsolute, relative, resolve } from 'node:path';

import { getDataDirectory } from '@/lib/config';
import { ensureDatabase, getDatabasePath, getSqliteDatabase } from '@/lib/db/client';
import { createBackup } from '@/lib/services/backup-service';

export class FreshInstallRefusedError extends Error {}

function assertOwnedDatabasePath(databasePath: string): string {
  if (databasePath === ':memory:') {
    throw new FreshInstallRefusedError('An in-memory database cannot be reset this way.');
  }
  const dataDirectory = resolve(getDataDirectory());
  const absoluteDatabasePath = resolve(databasePath);
  const ownedPath = relative(dataDirectory, absoluteDatabasePath);
  if (!ownedPath || ownedPath.startsWith('..') || isAbsolute(ownedPath)) {
    throw new FreshInstallRefusedError('The database is outside DATA_DIR and will not be deleted.');
  }
  return absoluteDatabasePath;
}

const PRESERVED_TABLES = new Set([
  '__drizzle_migrations',
  'nutrient_definitions',
  'nutrition_calculation_versions',
  'nutrition_data_sources',
]);

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function clearActiveDatabase(): void {
  const sqlite = getSqliteDatabase();
  const tables = sqlite
    .prepare(
      `SELECT name, type
       FROM pragma_table_list
       WHERE schema = 'main'
         AND type IN ('table', 'virtual')
         AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as Array<{ name: string; type: 'table' | 'virtual' }>;
  const triggers = sqlite
    .prepare(
      `SELECT name, sql
       FROM sqlite_master
       WHERE type = 'trigger'
         AND sql IS NOT NULL`,
    )
    .all() as Array<{ name: string; sql: string }>;

  const reset = sqlite.transaction(() => {
    for (const trigger of triggers) {
      sqlite.exec(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`);
    }

    for (const table of tables
      .filter(({ name }) => !PRESERVED_TABLES.has(name))
      .sort((left, right) => (left.type === right.type ? 0 : left.type === 'virtual' ? -1 : 1))) {
      sqlite.exec(`DELETE FROM ${quoteIdentifier(table.name)}`);
    }

    sqlite.prepare('DELETE FROM nutrition_data_sources WHERE id <> ?').run('legacy_recipe_fields');
    sqlite
      .prepare('DELETE FROM nutrition_calculation_versions WHERE id <> ?')
      .run('legacy_recipe_fields_v1');

    for (const trigger of triggers) {
      sqlite.exec(trigger.sql);
    }

    const violations = sqlite.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error('Fresh install would leave invalid database references.');
    }
  });

  // A Next.js dev or production server can have more than one process holding the SQLite file.
  // Reset rows in-place so Windows does not need every worker to release its file handle first.
  sqlite.pragma('foreign_keys = OFF');
  try {
    reset.immediate();
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}

export async function performFreshInstall(): Promise<{ safetyBackupId: string }> {
  ensureDatabase();
  assertOwnedDatabasePath(getDatabasePath());
  const safetyBackup = await createBackup('manual');
  clearActiveDatabase();
  return { safetyBackupId: safetyBackup.id };
}
