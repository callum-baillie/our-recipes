import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

it('closes separate server-bundle connections together and reopens their cached clients', async () => {
  const directory = resolve('.test-data/db-bundle-reconnection');
  vi.stubEnv('DATA_DIR', directory);
  vi.stubEnv('DATABASE_URL', resolve(directory, 'bord.db'));
  const first = await import('@/lib/db/client');
  first.resetDatabaseForTests();
  try {
    first.ensureDatabase();
    const firstConnection = first.getSqliteDatabase();
    vi.resetModules();
    const second = await import('@/lib/db/client');
    second.ensureDatabase();
    const secondConnection = second.getSqliteDatabase();
    expect(secondConnection).not.toBe(firstConnection);
    first.closeDatabaseConnection();
    expect(firstConnection.open).toBe(false);
    expect(secondConnection.open).toBe(false);
    const reopened = second.getSqliteDatabase();
    expect(reopened).not.toBe(secondConnection);
    expect(reopened.open).toBe(true);
    expect(reopened.prepare('PRAGMA quick_check').pluck().get()).toBe('ok');
    second.closeDatabaseConnection();
  } finally {
    first.closeDatabaseConnection();
    rmSync(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});
