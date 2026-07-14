import { z } from 'zod';

export const MAX_RECIPE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_RECIPE_IMAGE_DIMENSION = 8_000;
export const MAX_RECIPE_IMAGE_PIXELS = 40_000_000;
export const MAX_RECIPE_IMAGE_OUTPUT_DIMENSION = 1_600;

export const recipeImageAltTextSchema = z.string().trim().max(180);

export class RecipeImageUploadError extends Error {
  constructor(
    public readonly code: 'file_too_large' | 'invalid_image',
    message: string,
  ) {
    super(message);
  }
}

export type SupportedRecipeImageFormat = 'jpeg' | 'png' | 'webp';

export function detectRecipeImageFormat(bytes: Uint8Array): SupportedRecipeImageFormat | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export function assertRecipeImageBytes(bytes: Uint8Array): SupportedRecipeImageFormat {
  if (bytes.length === 0) {
    throw new RecipeImageUploadError('invalid_image', 'Choose a JPEG, PNG, or WebP image to add.');
  }
  if (bytes.length > MAX_RECIPE_IMAGE_BYTES) {
    throw new RecipeImageUploadError('file_too_large', 'Recipe photos must be 10 MB or smaller.');
  }
  const format = detectRecipeImageFormat(bytes);
  if (!format) {
    throw new RecipeImageUploadError(
      'invalid_image',
      'Recipe photos must be JPEG, PNG, or WebP files with a valid image signature.',
    );
  }
  return format;
}
