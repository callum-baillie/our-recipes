export const BACKUP_RESTORE_MARKER = '.restore-in-progress.json';

export class BackupRecoveryRequiredError extends Error {
  constructor() {
    super(
      'Backup recovery is incomplete. Stop the app and preserve its data directory for recovery.',
    );
  }
}
