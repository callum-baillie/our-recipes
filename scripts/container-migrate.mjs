import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { access, mkdir, open, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import lineageRecovery from './migration-lineage-recovery.cjs';

const { assertDuplicate0026Lineage, recoverDuplicate0026Lineage } = lineageRecovery;

const dataDirectory = resolve(process.cwd(), process.env.DATA_DIR ?? '/data');
const configuredDatabase = process.env.DATABASE_URL ?? join(dataDirectory, 'bord.db');
const databasePath = configuredDatabase.startsWith('file:')
  ? configuredDatabase.slice('file:'.length)
  : configuredDatabase;
const resolvedDatabasePath = isAbsolute(databasePath)
  ? databasePath
  : resolve(process.cwd(), databasePath);
const pathWithinData = relative(dataDirectory, resolvedDatabasePath);

if (
  resolvedDatabasePath === ':memory:' ||
  pathWithinData.startsWith('..') ||
  isAbsolute(pathWithinData)
) {
  throw new Error('Container DATABASE_URL must point to a file inside DATA_DIR.');
}

await mkdir(dataDirectory, { recursive: true });
await mkdir(join(dataDirectory, 'backups'), { recursive: true });
const lockPath = join(dataDirectory, '.migration.lock');
let lock;
try {
  lock = await open(lockPath, 'wx');
} catch {
  throw new Error('Another application process is already migrating this DATA_DIR.');
}

try {
  const databaseExists = await access(resolvedDatabasePath)
    .then(() => true)
    .catch(() => false);
  const sqlite = new Database(resolvedDatabasePath);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    if (databaseExists) {
      const safetyPath = join(
        dataDirectory,
        'backups',
        `pre-migration-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`,
      );
      await sqlite.backup(safetyPath);
      const integrity = sqlite.prepare('PRAGMA integrity_check').all();
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
        throw new Error('SQLite integrity check failed before migration.');
      }
    }
    const migrationsFolder = resolve(process.cwd(), 'drizzle');
    recoverDuplicate0026Lineage(sqlite, migrationsFolder);
    migrate(drizzle(sqlite), { migrationsFolder });
    assertDuplicate0026Lineage(sqlite, migrationsFolder);
  } finally {
    sqlite.close();
  }
} finally {
  if (lock) await lock.close().catch(() => undefined);
  await rm(lockPath, { force: true });
}
