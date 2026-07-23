import type Database from 'better-sqlite3';

export type Duplicate0026State = 'A' | 'B' | 'C';

export function recoverDuplicate0026Lineage(
  sqlite: Database.Database,
  migrationsFolder: string,
  options?: { testOnlyFailAfterDdl?: boolean },
): Duplicate0026State;

export function assertDuplicate0026Lineage(
  sqlite: Database.Database,
  migrationsFolder: string,
): void;
