import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { c as createTar, t as listTar, x as extractTar } from 'tar';

import { getDataDirectory, getRuntimeConfig } from '@/lib/config';
import {
  closeDatabaseConnection,
  ensureDatabase,
  getDatabasePath,
  getSqliteDatabase,
} from '@/lib/db/client';
import { backupIdSchema, backupManifestSchema, type BackupManifest } from '@/lib/domain/backup';
import { getHouseholdState } from '@/lib/services/household-service';

const APPLICATION_VERSION = '0.1.0';
const SCHEMA_VERSION = '0004_recipe_images';
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES = 512 * 1024 * 1024;

type BackupReason = BackupManifest['reason'];

export type BackupSummary = {
  id: string;
  createdAt: Date;
  bytes: number;
};

export type BackupPreview = BackupSummary & {
  manifest: BackupManifest;
};

type ValidatedBackup = {
  archivePath: string;
  stagingDirectory: string;
  manifest: BackupManifest;
};

export class BackupError extends Error {}
export class BackupNotFoundError extends Error {}
export class BackupValidationError extends Error {}

function backupsDirectory(): string {
  return join(/* turbopackIgnore: true */ getDataDirectory(), 'backups');
}

function stageDirectoryPrefix(): string {
  return join(/* turbopackIgnore: true */ getDataDirectory(), '.backup-stage-');
}

function archivePath(id: string): string {
  return join(backupsDirectory(), `${backupIdSchema.parse(id)}.tar.gz`);
}

function pathInside(root: string, candidate: string): boolean {
  const result = relative(root, candidate);
  return result !== '' && !result.startsWith('..') && !isAbsolute(result);
}

function safeArchivePath(path: string): boolean {
  const normalized = path.replace(/\/$/, '');
  return (
    Boolean(normalized) &&
    !path.includes('\\') &&
    !path.startsWith('/') &&
    !path.includes('../') &&
    (normalized === 'database.sqlite' ||
      normalized === 'config.json' ||
      normalized === 'manifest.json' ||
      normalized === 'uploads' ||
      normalized === 'generated' ||
      normalized.startsWith('uploads/') ||
      normalized.startsWith('generated/'))
  );
}

function archiveRelativePath(root: string, filePath: string): string {
  return relative(root, filePath).split(sep).join('/');
}

async function sha256(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function listRegularFiles(
  root: string,
): Promise<Array<{ path: string; absolutePath: string }>> {
  const files: Array<{ path: string; absolutePath: string }> = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      const details = await lstat(entryPath);
      if (details.isSymbolicLink()) {
        throw new BackupValidationError('Backups cannot include symbolic links.');
      }
      if (details.isDirectory()) {
        await visit(entryPath);
      } else if (details.isFile()) {
        files.push({ path: archiveRelativePath(root, entryPath), absolutePath: entryPath });
      } else {
        throw new BackupValidationError('Backups can contain only regular files and directories.');
      }
    }
  }
  await visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function copyDirectoryIfPresent(source: string, destination: string): Promise<void> {
  try {
    const details = await lstat(source);
    if (!details.isDirectory() || details.isSymbolicLink()) {
      throw new BackupError('Media storage must be a real directory, not a link.');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(destination, { recursive: true });
      return;
    }
    throw error;
  }
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    errorOnExist: false,
    force: true,
    verbatimSymlinks: false,
  });
  await listRegularFiles(destination);
}

function assertDatabaseWithinDataDirectory(databasePath: string): void {
  if (databasePath !== ':memory:' && !pathInside(getDataDirectory(), databasePath)) {
    throw new BackupError(
      'DATABASE_URL must point inside DATA_DIR before creating a restorable backup.',
    );
  }
}

function databaseIntegrity(databasePath: string): void {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const result = database.prepare('PRAGMA integrity_check').all() as Array<{
      integrity_check: string;
    }>;
    if (result.length !== 1 || result[0]?.integrity_check !== 'ok') {
      throw new BackupValidationError('SQLite integrity check did not return ok.');
    }
  } finally {
    database.close();
  }
}

async function removeExpiredBackups(): Promise<void> {
  const retentionMs = getRuntimeConfig().backupRetentionDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  for (const entry of await readdir(backupsDirectory(), { withFileTypes: true })) {
    if (!entry.isFile() || !/^[0-9a-f-]{36}\.tar\.gz$/i.test(entry.name)) continue;
    const filePath = join(backupsDirectory(), entry.name);
    if ((await stat(filePath)).mtimeMs < cutoff) await rm(filePath, { force: true });
  }
}

async function validateArchiveEntries(filePath: string): Promise<void> {
  let totalBytes = 0;
  const files = new Set<string>();
  let violation: string | null = null;
  await listTar({
    file: filePath,
    gzip: true,
    strict: true,
    onReadEntry(entry) {
      if (!safeArchivePath(entry.path)) {
        violation = 'The backup archive contains an unsafe path.';
        return;
      }
      if (entry.type !== 'File' && entry.type !== 'Directory') {
        violation = 'The backup archive contains an unsupported entry type.';
        return;
      }
      if (entry.type === 'File') {
        if (files.has(entry.path)) {
          violation = 'The backup archive repeats a file.';
          return;
        }
        files.add(entry.path);
        if (entry.size > MAX_ARCHIVE_ENTRY_BYTES) {
          violation = 'A backup entry exceeds the configured safety limit.';
          return;
        }
        totalBytes += entry.size;
        if (totalBytes > MAX_ARCHIVE_BYTES) {
          violation = 'The backup archive exceeds the configured safety limit.';
        }
      }
    },
  });
  if (violation) throw new BackupValidationError(violation);
}

async function validateBackup(id: string): Promise<ValidatedBackup> {
  const filePath = archivePath(id);
  try {
    await stat(filePath);
  } catch {
    throw new BackupNotFoundError('That backup no longer exists.');
  }
  try {
    await validateArchiveEntries(filePath);
  } catch (error) {
    if (error instanceof BackupValidationError) throw error;
    throw new BackupValidationError('The backup could not be validated safely.');
  }
  const stagingDirectory = await mkdtemp(stageDirectoryPrefix());
  try {
    await extractTar({
      file: filePath,
      cwd: stagingDirectory,
      gzip: true,
      strict: true,
      preservePaths: false,
      noChmod: true,
      filter: (path) => safeArchivePath(path),
    });
    const manifestPath = join(stagingDirectory, 'manifest.json');
    const manifest = backupManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
    if (manifest.id !== id)
      throw new BackupValidationError('The backup filename does not match its manifest.');

    const files = (await listRegularFiles(stagingDirectory)).filter(
      (file) => file.path !== 'manifest.json',
    );
    const manifestFiles = [...manifest.files].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
    if (
      files.length !== manifestFiles.length ||
      files.some((file, index) => file.path !== manifestFiles[index]?.path)
    ) {
      throw new BackupValidationError('The backup contents do not match its manifest.');
    }
    for (const [index, file] of files.entries()) {
      const expected = manifestFiles[index]!;
      const details = await stat(file.absolutePath);
      if (
        details.size !== expected.bytes ||
        (await sha256(file.absolutePath)) !== expected.sha256
      ) {
        throw new BackupValidationError('A backup checksum does not match.');
      }
    }
    databaseIntegrity(join(stagingDirectory, 'database.sqlite'));
    return { archivePath: filePath, stagingDirectory, manifest };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    if (error instanceof BackupValidationError) throw error;
    throw new BackupValidationError('The backup could not be validated safely.');
  }
}

export async function listBackups(): Promise<BackupSummary[]> {
  await mkdir(backupsDirectory(), { recursive: true });
  const backups: BackupSummary[] = [];
  for (const entry of await readdir(backupsDirectory(), { withFileTypes: true })) {
    const match = entry.isFile() && /^([0-9a-f-]{36})\.tar\.gz$/i.exec(entry.name);
    if (!match) continue;
    const details = await stat(join(backupsDirectory(), entry.name));
    backups.push({ id: match[1]!, createdAt: details.mtime, bytes: details.size });
  }
  return backups.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export async function getBackupArchivePath(id: string): Promise<string> {
  const filePath = archivePath(id);
  try {
    await stat(filePath);
    return filePath;
  } catch {
    throw new BackupNotFoundError('That backup no longer exists.');
  }
}

export async function createBackup(reason: BackupReason = 'manual'): Promise<BackupPreview> {
  ensureDatabase();
  const currentDatabasePath = getDatabasePath();
  assertDatabaseWithinDataDirectory(currentDatabasePath);
  const id = randomUUID();
  const createdAt = new Date();
  const stagingDirectory = await mkdtemp(stageDirectoryPrefix());
  const temporaryArchive = join(backupsDirectory(), `.${id}.tmp`);
  const destination = archivePath(id);
  try {
    await mkdir(backupsDirectory(), { recursive: true });
    await getSqliteDatabase().backup(join(stagingDirectory, 'database.sqlite'));
    await copyDirectoryIfPresent(
      join(getDataDirectory(), 'uploads'),
      join(stagingDirectory, 'uploads'),
    );
    await copyDirectoryIfPresent(
      join(getDataDirectory(), 'generated'),
      join(stagingDirectory, 'generated'),
    );
    const household = getHouseholdState().household;
    const safeConfiguration = {
      householdName: household?.name ?? null,
      appName: household?.appName ?? null,
    };
    await writeFile(
      join(stagingDirectory, 'config.json'),
      JSON.stringify(safeConfiguration, null, 2),
    );
    const files = await listRegularFiles(stagingDirectory);
    const manifest: BackupManifest = {
      formatVersion: 1,
      id,
      applicationVersion: APPLICATION_VERSION,
      schemaVersion: SCHEMA_VERSION,
      createdAt: createdAt.toISOString(),
      reason,
      files: await Promise.all(
        files.map(async (file) => ({
          path: file.path,
          bytes: (await stat(file.absolutePath)).size,
          sha256: await sha256(file.absolutePath),
        })),
      ),
      safeConfiguration,
    };
    await writeFile(join(stagingDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await createTar(
      { cwd: stagingDirectory, file: temporaryArchive, gzip: true, portable: true, noMtime: true },
      ['database.sqlite', 'uploads', 'generated', 'config.json', 'manifest.json'],
    );
    await rename(temporaryArchive, destination);
    await removeExpiredBackups();
    return { id, createdAt, bytes: (await stat(destination)).size, manifest };
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
    await rm(temporaryArchive, { force: true });
  }
}

export async function previewBackup(id: string): Promise<BackupPreview> {
  const validated = await validateBackup(id);
  try {
    const details = await stat(validated.archivePath);
    return {
      id,
      createdAt: details.mtime,
      bytes: details.size,
      manifest: validated.manifest,
    };
  } finally {
    await rm(validated.stagingDirectory, { recursive: true, force: true });
  }
}

export async function restoreBackup(id: string): Promise<{ safetyBackup: BackupPreview }> {
  const validated = await validateBackup(id);
  const dataDirectory = getDataDirectory();
  const databasePath = getDatabasePath();
  assertDatabaseWithinDataDirectory(databasePath);
  const databaseRelativePath = relative(dataDirectory, databasePath);
  if (
    !databaseRelativePath ||
    databaseRelativePath.startsWith('..') ||
    isAbsolute(databaseRelativePath)
  ) {
    throw new BackupError('DATABASE_URL must be a file inside DATA_DIR before restoration.');
  }
  const safetyBackup = await createBackup('pre-restore');
  const restoredDirectory = join(
    dirname(dataDirectory),
    `.${basename(dataDirectory)}-restored-${randomUUID()}`,
  );
  const previousDirectory = join(
    dirname(dataDirectory),
    `.${basename(dataDirectory)}-previous-${randomUUID()}`,
  );
  let movedPrevious = false;
  try {
    await mkdir(restoredDirectory, { recursive: true });
    await mkdir(dirname(join(restoredDirectory, databaseRelativePath)), { recursive: true });
    await copyFile(
      join(validated.stagingDirectory, 'database.sqlite'),
      join(restoredDirectory, databaseRelativePath),
    );
    await copyDirectoryIfPresent(
      join(validated.stagingDirectory, 'uploads'),
      join(restoredDirectory, 'uploads'),
    );
    await copyDirectoryIfPresent(
      join(validated.stagingDirectory, 'generated'),
      join(restoredDirectory, 'generated'),
    );
    await mkdir(join(restoredDirectory, 'config'), { recursive: true });
    await copyFile(
      join(validated.stagingDirectory, 'config.json'),
      join(restoredDirectory, 'config', 'backup-export.json'),
    );
    await copyDirectoryIfPresent(
      join(dataDirectory, 'backups'),
      join(restoredDirectory, 'backups'),
    );
    closeDatabaseConnection();
    await rename(dataDirectory, previousDirectory);
    movedPrevious = true;
    await rename(restoredDirectory, dataDirectory);
    ensureDatabase();
    databaseIntegrity(getDatabasePath());
    await rm(previousDirectory, { recursive: true, force: true });
    return { safetyBackup };
  } catch (error) {
    if (movedPrevious) {
      await rm(dataDirectory, { recursive: true, force: true });
      await rename(previousDirectory, dataDirectory).catch(() => undefined);
    }
    closeDatabaseConnection();
    throw error;
  } finally {
    await rm(restoredDirectory, { recursive: true, force: true });
    await rm(validated.stagingDirectory, { recursive: true, force: true });
  }
}

type SchedulerState = typeof globalThis & {
  __ourRecipesBackupTimer?: NodeJS.Timeout;
};

export function ensureBackupScheduler(): void {
  const scheduler = globalThis as SchedulerState;
  if (scheduler.__ourRecipesBackupTimer) return;
  const timer = setInterval(
    () => {
      void createBackup('scheduled').catch(() => undefined);
    },
    getRuntimeConfig().backupIntervalHours * 60 * 60 * 1000,
  );
  timer.unref();
  scheduler.__ourRecipesBackupTimer = timer;
}
