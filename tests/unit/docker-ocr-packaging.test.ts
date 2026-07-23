import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('native Docker runtime packaging', () => {
  it('copies Sharp, OCR, and PDF runtime packages outside the data volume', async () => {
    const dockerfile = await readFile(resolve(process.cwd(), 'Dockerfile'), 'utf8');
    const dockerignore = await readFile(resolve(process.cwd(), '.dockerignore'), 'utf8');

    expect(dockerfile).toContain('/app/node_modules/tesseract.js ./node_modules/tesseract.js');
    expect(dockerfile).toContain(
      '/app/node_modules/tesseract.js-core ./node_modules/tesseract.js-core',
    );
    expect(dockerfile).toContain(
      '/app/node_modules/wasm-feature-detect ./node_modules/wasm-feature-detect',
    );
    expect(dockerfile).toContain(
      '/app/node_modules/@tesseract.js-data/eng ./node_modules/@tesseract.js-data/eng',
    );
    expect(dockerfile).toContain('VOLUME ["/data"]');
    expect(dockerfile).not.toContain('/data/ocr-models');
    expect(dockerfile).toContain('/app/node_modules/drizzle-orm ./node_modules/drizzle-orm');
    expect(dockerfile).toContain(
      '/app/scripts/migration-lineage-recovery.cjs ./scripts/migration-lineage-recovery.cjs',
    );
    expect(dockerfile).toContain('/app/node_modules/openai ./node_modules/openai');
    expect(dockerfile).toContain('/app/node_modules/sharp ./node_modules/sharp');
    expect(dockerfile).toContain('/app/node_modules/@img ./node_modules/@img');
    expect(dockerfile).toContain(
      '/app/scripts/verify-container-runtime.mjs ./scripts/verify-container-runtime.mjs',
    );
    expect(dockerfile).toContain('RUN node ./scripts/verify-container-runtime.mjs');
    expect(dockerfile).toContain('/app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist');
    expect(dockerfile).toContain('/app/node_modules/@napi-rs ./node_modules/@napi-rs');
    expect(dockerignore.split(/\r?\n/u)).toContain('.api_keys');
  });
});
