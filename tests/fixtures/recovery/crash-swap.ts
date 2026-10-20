// Isolated process fixture: terminate inside the guarded swap, never a production hook.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { swapBackupData } from '../../../src/lib/services/backup-data-swap';
import { closeDatabaseConnection, ensureDatabase } from '../../../src/lib/db/client';
import { invalidateAuthenticationAfterRestore } from '../../../src/lib/services/auth-service';

const [directory, phase] = process.argv.slice(2) as [string, string];
const restoredDirectory = join(directory, '.restore-new-crash');
mkdirSync(restoredDirectory);
copyFileSync(join(directory, 'fixture-snapshot.sqlite'), join(restoredDirectory, 'bord.db'));
swapBackupData({
  dataDirectory: directory,
  restoredDirectory,
  previousDirectory: join(directory, '.restore-previous-crash'),
  paths: ['bord.db', 'bord.db-wal', 'bord.db-shm'],
  databaseSidecars: ['bord.db-wal', 'bord.db-shm'],
  closeDatabase: closeDatabaseConnection,
  verify: () => {
    ensureDatabase();
    if (phase === 'before') process.exit(42);
    invalidateAuthenticationAfterRestore();
    process.exit(43);
  },
});
throw new Error('Crash fixture did not terminate in the guarded phase.');
