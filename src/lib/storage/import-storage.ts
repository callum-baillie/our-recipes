import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import sharp from 'sharp';

import { getDataDirectory } from '@/lib/config';
import {
  MAX_IMPORT_IMAGE_DIMENSION,
  MAX_IMPORT_IMAGE_OUTPUT_DIMENSION,
  MAX_IMPORT_IMAGE_PIXELS,
  ImportValidationError,
} from '@/lib/domain/import';

type ImageMetadata = {
  format?: string;
  width?: number;
  height?: number;
  pages?: number;
};

export type StoredImportArtifact = {
  storageKey: string;
  mediaType: 'application/pdf' | 'image/webp';
};

function importsRoot(): string {
  return resolve(getDataDirectory(), 'generated', 'imports');
}

function storagePath(storageKey: string): string {
  const root = importsRoot();
  const path = resolve(root, storageKey.replace(/^imports\//, ''));
  const pathRelativeToRoot = relative(root, path);
  if (
    pathRelativeToRoot === '' ||
    pathRelativeToRoot.startsWith('..') ||
    pathRelativeToRoot.includes(':')
  ) {
    throw new Error('Refusing an import storage path outside the configured data directory.');
  }
  return path;
}

async function writeArtifact(storageKey: string, bytes: Uint8Array): Promise<void> {
  const destination = storagePath(storageKey);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function normalizeImportImage(bytes: Uint8Array): Promise<Buffer> {
  let metadata: ImageMetadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: MAX_IMPORT_IMAGE_PIXELS }).metadata();
  } catch {
    throw new ImportValidationError('invalid_file', 'That image could not be decoded safely.');
  }
  if (
    !metadata.format ||
    !['jpeg', 'png', 'webp'].includes(metadata.format) ||
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_IMPORT_IMAGE_DIMENSION ||
    metadata.height > MAX_IMPORT_IMAGE_DIMENSION ||
    metadata.width * metadata.height > MAX_IMPORT_IMAGE_PIXELS ||
    (metadata.pages && metadata.pages > 1)
  ) {
    throw new ImportValidationError(
      'invalid_file',
      'Choose a single-frame image no larger than 8,000 pixels on a side.',
    );
  }
  try {
    return await sharp(bytes, { limitInputPixels: MAX_IMPORT_IMAGE_PIXELS })
      .rotate()
      .resize({
        width: MAX_IMPORT_IMAGE_OUTPUT_DIMENSION,
        height: MAX_IMPORT_IMAGE_OUTPUT_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 86, effort: 4 })
      .toBuffer();
  } catch {
    throw new ImportValidationError('invalid_file', 'That image could not be normalized safely.');
  }
}

export async function storeNormalizedImportArtifact(
  importId: string,
  normalizedImage: Uint8Array,
): Promise<StoredImportArtifact> {
  const storageKey = `imports/${importId}.webp`;
  await writeArtifact(storageKey, normalizedImage);
  return { storageKey, mediaType: 'image/webp' };
}

export async function storeImportArtifact(
  importId: string,
  kind: 'pdf' | 'image',
  bytes: Uint8Array,
): Promise<StoredImportArtifact> {
  if (kind === 'pdf') {
    const storageKey = `imports/${importId}.pdf`;
    await writeArtifact(storageKey, bytes);
    return { storageKey, mediaType: 'application/pdf' };
  }
  return storeNormalizedImportArtifact(importId, await normalizeImportImage(bytes));
}

export async function readImportArtifact(storageKey: string): Promise<Buffer> {
  return readFile(storagePath(storageKey));
}

export async function removeImportArtifact(storageKey: string): Promise<void> {
  await rm(storagePath(storageKey), { force: true });
}
