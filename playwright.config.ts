import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const origin = process.env.BORD_E2E_ORIGIN ?? 'http://127.0.0.1:3100';
if (!['http://127.0.0.1:3100', 'http://localhost:3100'].includes(origin))
  throw new Error('Browser fixtures require a loopback origin.');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: origin,
    trace: 'on-first-retry',
    actionTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      process.env.V1_RELEASE_ORACLE === 'true'
        ? 'node scripts/start-v1-browser-server.mjs'
        : 'pnpm exec next dev --hostname 127.0.0.1 --port 3100',
    url: `${origin}/api/v1/health`,
    reuseExistingServer: !process.env.CI && process.env.V1_RELEASE_ORACLE !== 'true',
    timeout: 120_000,
    env: {
      ...process.env,
      DATA_DIR: resolve('.test-data/e2e-data'),
      DATABASE_URL: resolve('.test-data/e2e-data/our-recipes.db'),
      COOKIE_SECRET: 'test-cookie-secret-that-is-long-enough-for-hmac',
      BETTER_AUTH_SECRET: 'browser-test-auth-secret-with-at-least-32-characters',
      BETTER_AUTH_URL: origin,
      AUTH_SMTP_HOST: 'smtp.example.invalid',
      AUTH_SMTP_USER: 'browser-test',
      AUTH_SMTP_PASSWORD: 'browser-test-password',
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
      OPENAI_API_KEY: '',
      APP_ORIGIN: origin,
      NEXT_PUBLIC_ENABLE_PWA_IN_DEVELOPMENT: 'true',
    },
  },
});
