import 'server-only';

import { accessSync, constants } from 'node:fs';

import { getDataDirectory, getRuntimeConfig } from '@/lib/config';
import { ensureDatabase, getSqliteDatabase } from '@/lib/db/client';

export const APPLICATION_VERSION = '1.0.0-rc.1';
export const SCHEMA_VERSION = '0040_food_data_providers';
export const EXPECTED_MIGRATION_COUNT = 42;

export type ReleaseStatus = {
  applicationVersion: string;
  schemaVersion: string;
  migrationStatus: 'current' | 'incomplete';
  appliedMigrationCount: number;
  expectedMigrationCount: number;
  databaseIntegrity: 'ok' | 'error';
};

export function getReleaseStatus(): ReleaseStatus {
  ensureDatabase();
  const sqlite = getSqliteDatabase();
  const migration = sqlite.prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations').get() as {
    count: number;
  };
  const integrity = sqlite.pragma('quick_check', { simple: true });
  const databaseIntegrity = integrity === 'ok' ? 'ok' : 'error';
  return {
    applicationVersion: APPLICATION_VERSION,
    schemaVersion: SCHEMA_VERSION,
    migrationStatus:
      migration.count >= EXPECTED_MIGRATION_COUNT && databaseIntegrity === 'ok'
        ? 'current'
        : 'incomplete',
    appliedMigrationCount: migration.count,
    expectedMigrationCount: EXPECTED_MIGRATION_COUNT,
    databaseIntegrity,
  };
}

export function getRedactedRuntimeDiagnostics() {
  const config = getRuntimeConfig();
  let dataDirectoryWritable = false;
  try {
    accessSync(getDataDirectory(), constants.R_OK | constants.W_OK);
    dataDirectoryWritable = true;
  } catch {
    dataDirectoryWritable = false;
  }
  return {
    nodeVersion: process.version,
    productionMode: config.isProduction,
    dataDirectoryWritable,
    configuration: {
      cookieSecretPresent: Boolean(process.env.COOKIE_SECRET),
      appOriginPresent: Boolean(process.env.APP_ORIGIN),
      trustedOriginsConfigured: config.trustedOrigins.length > 0,
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
      openFoodFactsEnabled: config.foodData.openFoodFacts.enabled,
      usdaFoodDataConfigured: config.foodData.usda.enabled,
      databaseOverridePresent: Boolean(process.env.DATABASE_URL),
      dataDirectoryOverridePresent: Boolean(process.env.DATA_DIR),
    },
  };
}
