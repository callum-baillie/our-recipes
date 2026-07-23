import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';

import {
  assertDuplicate0026Lineage,
  recoverDuplicate0026Lineage,
} from '../../../scripts/migration-lineage-recovery.cjs';
import { getRuntimeConfig } from '@/lib/config';
import * as schema from '@/lib/db/schema';

type AppDatabase = BetterSQLite3Database<typeof schema>;

let database: Database.Database | undefined;
let drizzleDatabase: AppDatabase | undefined;
let openedPath: string | undefined;
let hasMigrated = false;

function resolveDatabasePath(databaseUrl: string): string {
  const path = databaseUrl.startsWith('file:') ? databaseUrl.slice('file:'.length) : databaseUrl;
  return path === ':memory:' || isAbsolute(path) ? path : normalize(`${process.cwd()}/${path}`);
}

function openDatabase(): { sqlite: Database.Database; db: AppDatabase; path: string } {
  const path = resolveDatabasePath(getRuntimeConfig().databaseUrl);

  if (database && drizzleDatabase && openedPath === path) {
    return { sqlite: database, db: drizzleDatabase, path };
  }

  if (database) database.close();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  database = new Database(path);
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
  database?.close();
  database = undefined;
  drizzleDatabase = undefined;
  openedPath = undefined;
  hasMigrated = false;
}
