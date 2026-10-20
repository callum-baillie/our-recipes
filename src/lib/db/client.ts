import 'server-only';

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';

import {
  assertDuplicate0026Lineage,
  recoverDuplicate0026Lineage,
} from '../../../scripts/migration-lineage-recovery.cjs';
import { getDataDirectory, getRuntimeConfig } from '@/lib/config';
import { BACKUP_RESTORE_MARKER, BackupRecoveryRequiredError } from '@/lib/domain/backup-recovery';
import * as schema from '@/lib/db/schema';

type AppDatabase = BetterSQLite3Database<typeof schema>;

let database: Database.Database | undefined;
let drizzleDatabase: AppDatabase | undefined;
let openedPath: string | undefined;
let hasMigrated = false;

// Next's server/proxy bundles can instantiate this module separately while
// sharing one application process. Recovery must close every SQLite handle
// before replacing files, not only the caller's bundle-local handle.
function processConnections(): Set<Database.Database> {
  const state = globalThis as typeof globalThis & {
    __bordSqliteConnections?: Set<Database.Database>;
  };
  return (state.__bordSqliteConnections ??= new Set());
}

function resolveDatabasePath(databaseUrl: string): string {
  const path = databaseUrl.startsWith('file:') ? databaseUrl.slice('file:'.length) : databaseUrl;
  return path === ':memory:' || isAbsolute(path) ? path : normalize(`${process.cwd()}/${path}`);
}

function openDatabase(): { sqlite: Database.Database; db: AppDatabase; path: string } {
  const state = globalThis as typeof globalThis & { __bordRestoreVerification?: boolean };
  if (
    !state.__bordRestoreVerification &&
    existsSync(join(getDataDirectory(), BACKUP_RESTORE_MARKER))
  )
    throw new BackupRecoveryRequiredError();
  const path = resolveDatabasePath(getRuntimeConfig().databaseUrl);

  if (database?.open && drizzleDatabase && openedPath === path) {
    return { sqlite: database, db: drizzleDatabase, path };
  }

  if (database) {
    if (database.open) database.close();
    processConnections().delete(database);
  }
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  database = new Database(path);
  processConnections().add(database);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  drizzleDatabase = drizzle(database, { schema });
  openedPath = path;
  hasMigrated = false;
  return { sqlite: database, db: drizzleDatabase, path };
}

export function getDatabase(): AppDatabase {
  return openDatabase().db;
}

export function getSqliteDatabase(): Database.Database {
  return openDatabase().sqlite;
}

export function getDatabasePath(): string {
  return openDatabase().path;
}

export function ensureDatabase(): void {
  const { db, sqlite } = openDatabase();
  if (!hasMigrated) {
    const migrationsFolder = resolve(process.cwd(), 'drizzle');
    recoverDuplicate0026Lineage(sqlite, migrationsFolder);
    migrate(db, { migrationsFolder });
    assertDuplicate0026Lineage(sqlite, migrationsFolder);
    hasMigrated = true;
  }
}

export function resetDatabaseForTests(): void {
  closeDatabaseConnection();
}

export function closeDatabaseConnection(): void {
  for (const connection of processConnections()) {
    if (connection.open) connection.close();
  }
  processConnections().clear();
  database = undefined;
  drizzleDatabase = undefined;
  openedPath = undefined;
  hasMigrated = false;
}
