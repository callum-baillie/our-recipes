import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      process.env.V1_RELEASE_ORACLE === 'true'
        ? 'node scripts/start-v1-browser-server.mjs'
        : 'pnpm exec next dev --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/api/v1/health',
    reuseExistingServer: !process.env.CI && process.env.V1_RELEASE_ORACLE !== 'true',
    timeout: 120_000,
    env: {
      ...process.env,
      DATA_DIR: resolve('.test-data/e2e-data'),
      DATABASE_URL: resolve('.test-data/e2e-data/our-recipes.db'),
      COOKIE_SECRET: 'test-cookie-secret-that-is-long-enough-for-hmac',
      APP_ORIGIN: 'http://127.0.0.1:3100',
      NEXT_PUBLIC_ENABLE_PWA_IN_DEVELOPMENT: 'true',
    },
  },
});
