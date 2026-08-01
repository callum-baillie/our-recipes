import { z } from 'zod';
import { existsSync } from 'node:fs';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';

const configSchema = z.object({
  dataDir: z.string().min(1),
  databaseUrl: z.string().min(1),
  cookieSecret: z.string().min(24),
  appOrigin: z.string().url().optional(),
  trustedOrigins: z.array(z.string().url()),
  auth: z.object({
    secret: z.string().min(32),
    baseUrl: z.string().url(),
    emailFrom: z.string().min(3),
    smtp: z.object({
      configured: z.boolean(),
      host: z.string().min(1).nullable(),
      port: z.number().int().min(1).max(65_535),
      secure: z.boolean(),
      user: z.string().min(1).nullable(),
      password: z.string().min(1).nullable(),
    }),
  }),
  backupDir: z.string().min(1),
  backupRetentionDays: z.number().int().min(1).max(3_650),
  backupIntervalHours: z.number().int().min(1).max(168),
  foodData: z.object({
    openFoodFacts: z.object({
      enabled: z.boolean(),
      baseUrl: z.string().url(),
      apiVersion: z.string().regex(/^v\d+(?:\.\d+)?$/u),
      userAgent: z.string().min(10).max(300),
      timeoutMs: z.number().int().min(1_000).max(30_000),
      requestsPerMinute: z.number().int().min(1).max(15),
    }),
    usda: z.object({
      enabled: z.boolean(),
      apiKey: z.string().min(1).nullable(),
      baseUrl: z.string().url(),
      timeoutMs: z.number().int().min(1_000).max(30_000),
      requestsPerHour: z.number().int().min(1).max(1_000),
      lowQuotaRemaining: z.number().int().min(0).max(1_000),
    }),
    cache: z.object({
      exactTtlSeconds: z.number().int().min(60).max(2_592_000),
      searchTtlSeconds: z.number().int().min(60).max(86_400),
      negativeTtlSeconds: z.number().int().min(10).max(86_400),
      transientTtlSeconds: z.number().int().min(5).max(3_600),
      exactStaleSeconds: z.number().int().min(60).max(7_776_000),
      searchStaleSeconds: z.number().int().min(60).max(604_800),
      rowCap: z.number().int().min(100).max(100_000),
    }),
  }),
  isProduction: z.boolean(),
});

export type RuntimeConfig = z.infer<typeof configSchema>;

function defaultDatabaseUrl(dataDir: string): string {
  const current = join(dataDir, 'bord.db');
  const legacy = join(dataDir, 'our-recipes.db');
  if (!existsSync(legacy)) return current;
  if (existsSync(current)) {
    throw new Error(
      `Both legacy (${legacy}) and Bòrd (${current}) databases exist. Set DATABASE_URL explicitly after reconciling them.`,
    );
  }
  // The container entrypoint performs the atomic filename migration before
  // the app opens SQLite. Local development cannot safely rename a database
  // that another process may already have open, so retain the legacy path.
  return legacy;
}

export function getRuntimeConfig(): RuntimeConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const dataDir = process.env.DATA_DIR ?? './data';
  const cookieSecret = process.env.COOKIE_SECRET ?? 'development-only-change-me-before-production';
  const authSecret =
    process.env.BETTER_AUTH_SECRET ?? 'development-only-better-auth-secret-change-me';
  const authBaseUrl =
    process.env.BETTER_AUTH_URL ??
    process.env.APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000';
  const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const usdaApiKey = process.env.USDA_FDC_API_KEY?.trim() || null;
  const usdaExplicitlyDisabled = process.env.USDA_FDC_ENABLED === 'false';
  const backupDir = process.env.BACKUP_DIR?.trim() || join(dataDir, 'backups');

  if (isProduction && (!process.env.COOKIE_SECRET || cookieSecret.length < 32)) {
    throw new Error('COOKIE_SECRET must be set to at least 32 characters in production.');
  }
  if (isProduction && (!process.env.BETTER_AUTH_SECRET || authSecret.length < 32)) {
    throw new Error('BETTER_AUTH_SECRET must be set to at least 32 characters in production.');
  }
  if (isProduction && !process.env.BETTER_AUTH_URL && !process.env.APP_ORIGIN) {
    throw new Error('BETTER_AUTH_URL or APP_ORIGIN must be set in production.');
  }

  const smtpHost = process.env.AUTH_SMTP_HOST?.trim() || null;
  const smtpUser = process.env.AUTH_SMTP_USER?.trim() || null;
  const smtpPassword = process.env.AUTH_SMTP_PASSWORD?.trim() || null;
  const smtpConfigured = Boolean(smtpHost && smtpUser && smtpPassword);
  if (isProduction && !smtpConfigured) {
    throw new Error(
      'AUTH_SMTP_HOST, AUTH_SMTP_USER, and AUTH_SMTP_PASSWORD are required in production.',
    );
  }

  return configSchema.parse({
    dataDir,
    databaseUrl: process.env.DATABASE_URL ?? defaultDatabaseUrl(dataDir),
    cookieSecret,
    appOrigin: process.env.APP_ORIGIN,
    trustedOrigins,
    auth: {
      secret: authSecret,
      baseUrl: authBaseUrl,
      emailFrom: process.env.AUTH_EMAIL_FROM ?? 'Bòrd <bord@localhost>',
      smtp: {
        configured: smtpConfigured,
        host: smtpHost,
        port: Number(process.env.AUTH_SMTP_PORT ?? '587'),
        secure: process.env.AUTH_SMTP_SECURE === 'true',
        user: smtpUser,
        password: smtpPassword,
      },
    },
    backupDir,
    backupRetentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? '30'),
    backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS ?? '24'),
    foodData: {
      openFoodFacts: {
        enabled: process.env.OPEN_FOOD_FACTS_ENABLED !== 'false',
        baseUrl: process.env.OPEN_FOOD_FACTS_BASE_URL ?? 'https://world.openfoodfacts.org',
        apiVersion: process.env.OPEN_FOOD_FACTS_API_VERSION ?? 'v3.6',
        userAgent:
          process.env.OPEN_FOOD_FACTS_USER_AGENT ??
          'Bord/1.0.0-rc.2 (https://github.com/callum-baillie/bord)',
        timeoutMs: Number(process.env.OPEN_FOOD_FACTS_TIMEOUT_MS ?? '5000'),
        requestsPerMinute: Number(process.env.OPEN_FOOD_FACTS_PRODUCT_RPM ?? '12'),
      },
      usda: {
        enabled: !usdaExplicitlyDisabled && Boolean(usdaApiKey),
        apiKey: usdaApiKey,
        baseUrl: process.env.USDA_FDC_BASE_URL ?? 'https://api.nal.usda.gov/fdc/v1',
        timeoutMs: Number(process.env.USDA_FDC_TIMEOUT_MS ?? '8000'),
        requestsPerHour: Number(process.env.USDA_FDC_REQUESTS_PER_HOUR ?? '900'),
        lowQuotaRemaining: Number(process.env.USDA_FDC_LOW_QUOTA_REMAINING ?? '100'),
      },
      cache: {
        exactTtlSeconds: Number(process.env.FOOD_DATA_EXACT_TTL_SECONDS ?? '604800'),
        searchTtlSeconds: Number(process.env.FOOD_DATA_SEARCH_TTL_SECONDS ?? '900'),
        negativeTtlSeconds: Number(process.env.FOOD_DATA_NEGATIVE_TTL_SECONDS ?? '900'),
        transientTtlSeconds: Number(process.env.FOOD_DATA_TRANSIENT_TTL_SECONDS ?? '30'),
        exactStaleSeconds: Number(process.env.FOOD_DATA_EXACT_STALE_SECONDS ?? '2592000'),
        searchStaleSeconds: Number(process.env.FOOD_DATA_SEARCH_STALE_SECONDS ?? '86400'),
        rowCap: Number(process.env.FOOD_DATA_CACHE_ROW_CAP ?? '5000'),
      },
    },
    isProduction,
  });
}

export function getDataDirectory(): string {
  return resolve(/* turbopackIgnore: true */ process.cwd(), getRuntimeConfig().dataDir);
}

export function getBackupDirectory(): string {
  const dataDirectory = getDataDirectory();
  const backupDirectory = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    getRuntimeConfig().backupDir,
  );
  if (parse(backupDirectory).root === backupDirectory) {
    throw new Error('BACKUP_DIR cannot be the filesystem root.');
  }
  if (backupDirectory === dataDirectory) {
    throw new Error('BACKUP_DIR must not be the same directory as DATA_DIR.');
  }
  return backupDirectory;
}

export function getBackupStorageConfiguration(): {
  directory: string;
  location: 'app-data' | 'dedicated';
  intervalHours: number;
  retentionDays: number;
} {
  const config = getRuntimeConfig();
  const dataDirectory = getDataDirectory();
  const directory = getBackupDirectory();
  const relativePath = relative(dataDirectory, directory);
  const isInsideDataDirectory =
    relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
  return {
    directory,
    location: isInsideDataDirectory ? 'app-data' : 'dedicated',
    intervalHours: config.backupIntervalHours,
    retentionDays: config.backupRetentionDays,
  };
}
