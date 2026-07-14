import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@': sourceDirectory } },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@': sourceDirectory } },
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
