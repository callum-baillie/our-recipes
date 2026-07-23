import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url));
const serverOnlyStub = fileURLToPath(new URL('./tests/server-only.ts', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@': sourceDirectory, 'server-only': serverOnlyStub } },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@': sourceDirectory, 'server-only': serverOnlyStub } },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
