import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url));
const serverOnlyStub = fileURLToPath(new URL('./tests/server-only.ts', import.meta.url));

export default defineConfig({
  test: {
    // Bound jsdom/SQLite workers on developer machines and clean CI installs.
    // Unbounded host CPU discovery can starve short interaction deadlines.
    maxWorkers: 4,
    projects: [
      {
        resolve: { alias: { '@': sourceDirectory, 'server-only': serverOnlyStub } },
        test: {
          name: 'unit',
          env: { DATABASE_URL: ':memory:', DATA_DIR: '.test-data/unit', OPENAI_API_KEY: '' },
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@': sourceDirectory, 'server-only': serverOnlyStub } },
        test: {
          name: 'integration',
          env: {
            DATABASE_URL: ':memory:',
            DATA_DIR: '.test-data/integration-default',
            OPENAI_API_KEY: '',
          },
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
