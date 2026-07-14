import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import sharp from 'sharp';

import { getDataDirectory } from '@/lib/config';
import {
  assertRecipeImageBytes,
  MAX_RECIPE_IMAGE_DIMENSION,
  MAX_RECIPE_IMAGE_OUTPUT_DIMENSION,
  MAX_RECIPE_IMAGE_PIXELS,
  RecipeImageUploadError,
} from '@/lib/domain/recipe-image';

export type StoredRecipeImage = {
  storageKey: string;
  width: number;
  height: number;
};

export class RecipeImageStorageError extends Error {}

type ImageMetadata = {
  format?: string;
  width?: number;
  height?: number;
  pages?: number;
};

function mediaRoot(): string {
  return resolve(getDataDirectory(), 'uploads');
}

function storagePath(storageKey: string): string {
  const root = mediaRoot();
  const path = resolve(root, storageKey);
  const pathRelativeToRoot = relative(root, path);
  if (
    pathRelativeToRoot === '' ||
    pathRelativeToRoot.startsWith('..') ||
    pathRelativeToRoot.includes(':')
  ) {
    throw new Error('Refusing an image storage path outside the configured data directory.');
  }
  return path;
}

export async function normalizeRecipeImage(bytes: Uint8Array): Promise<{
  data: Buffer;
  width: number;
  height: number;
}> {
  const expectedFormat = assertRecipeImageBytes(bytes);
  let metadata: ImageMetadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: MAX_RECIPE_IMAGE_PIXELS }).metadata();
  } catch {
    throw new RecipeImageUploadError('invalid_image', 'That image could not be decoded safely.');
  }
  if (
    metadata.format !== expectedFormat ||
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_RECIPE_IMAGE_DIMENSION ||
    metadata.height > MAX_RECIPE_IMAGE_DIMENSION ||
    metadata.width * metadata.height > MAX_RECIPE_IMAGE_PIXELS ||
    (metadata.pages && metadata.pages > 1)
  ) {
    throw new RecipeImageUploadError(
      'invalid_image',
      'Choose a single-frame JPEG, PNG, or WebP image no larger than 8,000 pixels on a side.',
    );
  }
  try {
    const normalized = await sharp(bytes, { limitInputPixels: MAX_RECIPE_IMAGE_PIXELS })
      .rotate()
      .resize({
        width: MAX_RECIPE_IMAGE_OUTPUT_DIMENSION,
        height: MAX_RECIPE_IMAGE_OUTPUT_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      data: normalized.data,
      width: normalized.info.width,
      height: normalized.info.height,
    };
  } catch (error) {
    if (error instanceof RecipeImageUploadError) throw error;
    throw new RecipeImageUploadError('invalid_image', 'That image could not be processed safely.');
  }
}

export async function storeRecipeImage(
  imageId: string,
  bytes: Uint8Array,
): Promise<StoredRecipeImage> {
  const normalized = await normalizeRecipeImage(bytes);
  const storageKey = `recipe-images/${imageId}.webp`;
  const destination = storagePath(storageKey);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, normalized.data, { flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return { storageKey, width: normalized.width, height: normalized.height };
}

export async function readRecipeImage(storageKey: string): Promise<Buffer> {
  return readFile(storagePath(storageKey));
}

export async function readRegularRecipeImage(storageKey: string): Promise<Buffer> {
  const source = storagePath(storageKey);
  try {
    const details = await lstat(source);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new RecipeImageStorageError('Recipe image storage must contain a regular file.');
    }
    return await readFile(source);
  } catch (error) {
    if (error instanceof RecipeImageStorageError) throw error;
    throw new RecipeImageStorageError('Recipe image storage could not be read safely.');
  }
}

export async function removeRecipeImage(storageKey: string): Promise<void> {
  await rm(storagePath(storageKey), { force: true });
}
