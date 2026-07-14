import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  assertRecipeImageBytes,
  MAX_RECIPE_IMAGE_OUTPUT_DIMENSION,
  RecipeImageUploadError,
} from '@/lib/domain/recipe-image';
import { normalizeRecipeImage } from '@/lib/storage/recipe-image-storage';

describe('recipe image processing', () => {
  it('rejects an untrusted file that only claims to be an image', () => {
    expect(() =>
      assertRecipeImageBytes(new TextEncoder().encode('<html>not an image</html>')),
    ).toThrow(RecipeImageUploadError);
  });

  it('normalizes a signed source image into a bounded WebP', async () => {
    const source = await sharp({
      create: { width: 2_000, height: 1_000, channels: 3, background: '#9f482f' },
    })
      .png()
      .toBuffer();
    const normalized = await normalizeRecipeImage(source);
    const metadata = await sharp(normalized.data).metadata();
    expect(metadata.format).toBe('webp');
    expect(normalized.width).toBe(MAX_RECIPE_IMAGE_OUTPUT_DIMENSION);
    expect(normalized.height).toBe(800);
  });

  it('rejects a decodable image above the dimension limit', async () => {
    const oversized = await sharp({
      create: { width: 8_001, height: 1, channels: 3, background: '#9f482f' },
    })
      .png()
      .toBuffer();
    await expect(normalizeRecipeImage(oversized)).rejects.toThrow('8,000 pixels');
  });
});
