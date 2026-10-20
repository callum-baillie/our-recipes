import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackupSwapRollbackError, swapBackupData } from '@/lib/services/backup-data-swap';
import { BACKUP_RESTORE_MARKER } from '@/lib/domain/backup-recovery';

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, renameSync: vi.fn(original.renameSync) };
});
const original = await vi.importActual<typeof import('node:fs')>('node:fs');
const roots: string[] = [];
afterEach(() => {
  vi.mocked(renameSync).mockImplementation(original.renameSync);
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bord-swap-'));
  roots.push(root);
  const dataDirectory = join(root, 'data');
  const restoredDirectory = join(dataDirectory, '.restore-new-fixture');
  const previousDirectory = join(dataDirectory, '.restore-previous-fixture');
  for (const directory of [dataDirectory, restoredDirectory]) {
    mkdirSync(join(directory, 'uploads'), { recursive: true });
    writeFileSync(join(directory, 'bord.db'), directory === dataDirectory ? 'old-db' : 'new-db');
    writeFileSync(
      join(directory, 'uploads', 'photo'),
      directory === dataDirectory ? 'old-photo' : 'new-photo',
    );
  }
  mkdirSync(join(dataDirectory, 'backups'));
  writeFileSync(join(dataDirectory, 'backups', 'safety'), 'retained');
  return {
    root,
    dataDirectory,
    restoredDirectory,
    previousDirectory,
    paths: ['bord.db', 'bord.db-wal', 'bord.db-shm', 'uploads'],
    databaseSidecars: ['bord.db-wal', 'bord.db-shm'],
    closeDatabase: vi.fn(),
    verify: vi.fn(),
  };
}

describe('mounted data restoration', () => {
  it('keeps the data root and archives in place without requiring writable parent storage', () => {
    const f = fixture();
    const inode = statSync(f.dataDirectory).ino;
    chmodSync(f.root, 0o555);
    swapBackupData(f);
    expect(statSync(f.dataDirectory).ino).toBe(inode);
    expect(readFileSync(join(f.dataDirectory, 'bord.db'), 'utf8')).toBe('new-db');
    expect(readFileSync(join(f.dataDirectory, 'uploads', 'photo'), 'utf8')).toBe('new-photo');
    expect(readFileSync(join(f.dataDirectory, 'backups', 'safety'), 'utf8')).toBe('retained');
    expect(f.verify).toHaveBeenCalledOnce();
    expect(existsSync(join(f.dataDirectory, BACKUP_RESTORE_MARKER))).toBe(false);
  });

  it('rolls back the whole moved consistency set when installing media fails', () => {
    const f = fixture();
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (from === join(f.restoredDirectory, 'uploads')) throw new Error('Controlled move failure');
      original.renameSync(from, to);
    });
    expect(() => swapBackupData(f)).toThrow('Controlled move failure');
    expect(readFileSync(join(f.dataDirectory, 'bord.db'), 'utf8')).toBe('old-db');
    expect(readFileSync(join(f.dataDirectory, 'uploads', 'photo'), 'utf8')).toBe('old-photo');
    expect(f.verify).not.toHaveBeenCalled();
    expect(existsSync(join(f.dataDirectory, BACKUP_RESTORE_MARKER))).toBe(false);
  });

  it('removes new SQLite sidecars before restoring original data after failed integrity/migration', () => {
    const f = fixture();
    writeFileSync(join(f.dataDirectory, 'bord.db-wal'), 'old-wal');
    f.verify.mockImplementation(() => {
      writeFileSync(join(f.dataDirectory, 'bord.db-wal'), 'new-wal');
      writeFileSync(join(f.dataDirectory, 'bord.db-shm'), 'new-shm');
      throw new Error('Controlled integrity failure');
    });
    expect(() => swapBackupData(f)).toThrow('Controlled integrity failure');
    expect(readFileSync(join(f.dataDirectory, 'bord.db'), 'utf8')).toBe('old-db');
    expect(readFileSync(join(f.dataDirectory, 'bord.db-wal'), 'utf8')).toBe('old-wal');
    expect(existsSync(join(f.dataDirectory, 'bord.db-shm'))).toBe(false);
    expect(readFileSync(join(f.dataDirectory, 'uploads', 'photo'), 'utf8')).toBe('old-photo');
    expect(f.closeDatabase).toHaveBeenCalledTimes(2);
  });

  it('retains previous data and reports incomplete rollback instead of deleting recovery files', () => {
    const f = fixture();
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (
        from === join(f.restoredDirectory, 'uploads') ||
        from === join(f.previousDirectory, 'bord.db')
      )
        throw new Error('Controlled storage failure');
      original.renameSync(from, to);
    });
    expect(() => swapBackupData(f)).toThrow(BackupSwapRollbackError);
    expect(readFileSync(join(f.previousDirectory, 'bord.db'), 'utf8')).toBe('old-db');
    expect(existsSync(f.restoredDirectory)).toBe(true);
    expect(existsSync(join(f.dataDirectory, BACKUP_RESTORE_MARKER))).toBe(true);
  });
});
