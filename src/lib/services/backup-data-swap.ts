import 'server-only';

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { BACKUP_RESTORE_MARKER } from '@/lib/domain/backup-recovery';

export class BackupSwapRollbackError extends Error {}

/** Keep DATA_DIR itself in place: it can be a non-renamable Docker mount. */
export function swapBackupData({
  dataDirectory,
  restoredDirectory,
  previousDirectory,
  paths,
  databaseSidecars,
  closeDatabase,
  verify,
}: {
  dataDirectory: string;
  restoredDirectory: string;
  previousDirectory: string;
  paths: string[];
  databaseSidecars: string[];
  closeDatabase: () => void;
  verify: () => void;
}): void {
  const moved: string[] = [];
  const installed: string[] = [];
  let verificationStarted = false;
  const marker = join(dataDirectory, BACKUP_RESTORE_MARKER);
  // Persist intent before moving anything. A crash/incomplete rollback must not
  // let startup silently initialize an empty replacement database.
  writeFileSync(
    marker,
    JSON.stringify({
      previous: relative(dataDirectory, previousDirectory),
      staged: relative(dataDirectory, restoredDirectory),
      paths,
    }),
    { flag: 'wx', mode: 0o600 },
  );
  try {
    closeDatabase();
    // No awaits between the first move and verified completion/rollback. Requests
    // in this application process cannot observe a half-installed consistency set.
    for (const path of paths) {
      const current = join(dataDirectory, path);
      if (!existsSync(current)) continue;
      const previous = join(previousDirectory, path);
      mkdirSync(dirname(previous), { recursive: true });
      renameSync(current, previous);
      moved.push(path);
    }
    for (const path of paths) {
      const restored = join(restoredDirectory, path);
      if (!existsSync(restored)) continue;
      const destination = join(dataDirectory, path);
      mkdirSync(dirname(destination), { recursive: true });
      renameSync(restored, destination);
      installed.push(path);
    }
    verificationStarted = true;
    const state = globalThis as typeof globalThis & { __bordRestoreVerification?: boolean };
    state.__bordRestoreVerification = true;
    try {
      verify();
    } finally {
      state.__bordRestoreVerification = false;
    }
    rmSync(marker);
  } catch (error) {
    closeDatabase();
    try {
      // Opening the replacement SQLite file can create new WAL/SHM files even
      // when validation fails. Never attach those to the rolled-back database.
      if (verificationStarted) {
        for (const path of databaseSidecars) rmSync(join(dataDirectory, path), { force: true });
      }
      for (const path of installed.reverse())
        rmSync(join(dataDirectory, path), { recursive: true, force: true });
      for (const path of moved.reverse())
        renameSync(join(previousDirectory, path), join(dataDirectory, path));
      rmSync(marker);
    } catch (rollbackError) {
      throw new BackupSwapRollbackError(
        'Restore rollback could not finish. Stop the app and preserve its data directory for recovery.',
        { cause: new AggregateError([error, rollbackError]) },
      );
    }
    throw error;
  }
}
