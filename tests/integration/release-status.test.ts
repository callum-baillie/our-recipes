import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { GET as health } from '@/app/api/v1/health/route';
import { resetDatabaseForTests } from '@/lib/db/client';
import { getReleaseStatus } from '@/lib/release';

beforeEach(() => resetDatabaseForTests());
afterEach(() => resetDatabaseForTests());

it('reports the package version and complete current migration journal after a fresh install', async () => {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries: { tag: string }[];
  };
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const response = health();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: 'ok',
    version,
    schemaVersion: journal.entries.at(-1)!.tag,
    migrationStatus: 'current',
  });
  expect(getReleaseStatus()).toMatchObject({
    applicationVersion: version,
    expectedMigrationCount: journal.entries.length,
    appliedMigrationCount: journal.entries.length,
    databaseIntegrity: 'ok',
  });
});
