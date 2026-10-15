import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Release helper is a plain Node module.
import { sanitizeStandaloneEnvironment } from '../../scripts/sanitize-standalone-environment.mjs';

describe('standalone environment sanitization', () => {
  it('removes copied dotenv variants while preserving application files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bord-release-env-'));
    try {
      for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
        writeFileSync(join(directory, name), 'SYNTHETIC_BUILD_VALUE=example');
      }
      writeFileSync(join(directory, 'server.js'), 'application');
      sanitizeStandaloneEnvironment(directory);
      for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
        expect(existsSync(join(directory, name))).toBe(false);
      }
      expect(readFileSync(join(directory, 'server.js'), 'utf8')).toBe('application');
      expect(() => sanitizeStandaloneEnvironment(directory)).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
