import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('local OCR Docker packaging', () => {
  it('copies the worker runtime and immutable language data outside the data volume', async () => {
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
    expect(dockerfile).toContain('/app/node_modules/openai ./node_modules/openai');
    expect(dockerfile).toContain('/app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist');
    expect(dockerfile).toContain('/app/node_modules/@napi-rs ./node_modules/@napi-rs');
    expect(dockerignore.split(/\r?\n/u)).toContain('.api_keys');
  });
});
