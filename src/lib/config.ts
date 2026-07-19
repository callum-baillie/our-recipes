import { z } from 'zod';
import { join, resolve } from 'node:path';

const configSchema = z.object({
  dataDir: z.string().min(1),
  databaseUrl: z.string().min(1),
  cookieSecret: z.string().min(24),
  appOrigin: z.string().url().optional(),
  trustedOrigins: z.array(z.string().url()),
  homepageIntegrationToken: z.string().min(32).optional(),
  backupRetentionDays: z.number().int().min(1).max(3_650),
  backupIntervalHours: z.number().int().min(1).max(168),
  isProduction: z.boolean(),
});

export type RuntimeConfig = z.infer<typeof configSchema>;

export function getRuntimeConfig(): RuntimeConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const dataDir = process.env.DATA_DIR ?? './data';
  const cookieSecret = process.env.COOKIE_SECRET ?? 'development-only-change-me-before-production';
  const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProduction && (!process.env.COOKIE_SECRET || cookieSecret.length < 32)) {
    throw new Error('COOKIE_SECRET must be set to at least 32 characters in production.');
  }

  return configSchema.parse({
    dataDir,
    databaseUrl: process.env.DATABASE_URL ?? join(dataDir, 'our-recipes.db'),
    cookieSecret,
    appOrigin: process.env.APP_ORIGIN,
    trustedOrigins,
    homepageIntegrationToken: process.env.HOMEPAGE_INTEGRATION_TOKEN,
    backupRetentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? '30'),
    backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS ?? '24'),
    isProduction,
  });
}

export function getDataDirectory(): string {
  return resolve(/* turbopackIgnore: true */ process.cwd(), getRuntimeConfig().dataDir);
}
