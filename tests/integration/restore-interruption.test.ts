import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import { BACKUP_RESTORE_MARKER } from '@/lib/domain/backup-recovery';

let database: typeof import('@/lib/db/client');
const directories: string[] = [];
afterAll(() => {
  database?.closeDatabaseConnection();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it.each(['before', 'after'])(
  'fails closed after process interruption %s credential invalidation',
  async (phase) => {
    const directory = resolve(`.test-data/restore-interruption-${phase}`);
    directories.push(directory);
    const file = resolve(directory, 'bord.db');
    vi.stubEnv('DATA_DIR', directory);
    vi.stubEnv('DATABASE_URL', file);
    vi.stubEnv('BETTER_AUTH_SECRET', 'restore-interruption-secret-at-least-thirty-two');
    vi.stubEnv('COOKIE_SECRET', 'restore-interruption-cookie-at-least-thirty-two');
    database = await import('@/lib/db/client');
    database.closeDatabaseConnection();
    database.ensureDatabase();
    await database.getSqliteDatabase().backup(resolve(directory, 'fixture-snapshot.sqlite'));
    database.closeDatabaseConnection();
    const child = spawnSync(
      process.execPath,
      [
        '--conditions=react-server',
        '--import',
        'tsx',
        'tests/fixtures/recovery/crash-swap.ts',
        directory,
        phase,
      ],
      { env: process.env, encoding: 'utf8', timeout: 15_000 },
    );
    expect(child.status, child.stderr).toBe(phase === 'before' ? 42 : 43);
    expect(existsSync(resolve(directory, BACKUP_RESTORE_MARKER))).toBe(true);
    expect(() => database.ensureDatabase()).toThrow(/recovery is incomplete/i);
    const health = await import('@/app/api/v1/health/route');
    expect((await health.GET()).status).toBe(503);
    // A new process (not an inherited in-memory lock) also refuses startup.
    const restarted = spawnSync(process.execPath, ['scripts/container-migrate.mjs'], {
      env: process.env,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(restarted.status).not.toBe(0);
    expect(restarted.stderr).toMatch(/recovery|restore/i);
  },
  40_000,
);
