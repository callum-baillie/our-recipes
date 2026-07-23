import { createHash } from 'node:crypto';

import { ZXING_WASM_SHA256 } from 'barcode-detector/ponyfill';
import { describe, expect, it } from 'vitest';

import { GET } from '@/app/barcode-decoder/route';

describe('barcode decoder asset', () => {
  it('serves the decoder version used by the browser scanner', async () => {
    const response = await GET();
    const bytes = await response.arrayBuffer();
    const digest = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/wasm');
    expect(Number(response.headers.get('content-length'))).toBe(bytes.byteLength);
    expect(digest).toBe(ZXING_WASM_SHA256);
  });
});
