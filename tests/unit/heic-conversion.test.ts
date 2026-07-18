import { describe, expect, it } from 'vitest';

import {
  convertHeicFilesInBrowser,
  HEIC_CLIENT_CONVERSION_TIMEOUT_MS,
  isClientHeicFile,
} from '@/lib/client/heic-conversion';

describe('browser image preparation', () => {
  it('recognizes iPhone image extensions when Safari supplies a blank MIME type', () => {
    expect(isClientHeicFile({ name: 'IMG_1001.HEIC', type: '' })).toBe(true);
    expect(isClientHeicFile({ name: 'recipe.heif', type: 'application/octet-stream' })).toBe(true);
    expect(isClientHeicFile({ name: 'recipe.png', type: 'image/png' })).toBe(false);
  });

  it('passes standard images through without requiring browser canvas APIs', async () => {
    const png = {
      name: 'image.png',
      type: 'image/png',
      size: 1_024,
      lastModified: 1,
    } as File;

    await expect(convertHeicFilesInBrowser([png], 15 * 1024 * 1024)).resolves.toEqual({
      files: [png],
      conversions: [],
    });
  });

  it('rejects an oversized standard-image selection before upload', async () => {
    const png = {
      name: 'image.png',
      type: 'image/png',
      size: 15 * 1024 * 1024 + 1,
      lastModified: 1,
    } as File;

    await expect(convertHeicFilesInBrowser([png], 15 * 1024 * 1024)).rejects.toThrow(
      'exceed this upload’s size limit',
    );
  });

  it('keeps the Safari recovery timeout bounded', () => {
    expect(HEIC_CLIENT_CONVERSION_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(HEIC_CLIENT_CONVERSION_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
