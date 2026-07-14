'use client';

export const HEIC_CLIENT_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const MAX_CLIENT_IMAGE_DIMENSION = 8_000;
const MAX_CLIENT_IMAGE_PIXELS = 48_000_000;

export type ClientImageConversion = {
  originalSourceName: string;
  convertedSourceName: string;
};

export type ClientHeicConversionResult = {
  files: File[];
  conversions: ClientImageConversion[];
};

export class ClientHeicConversionError extends Error {}

export function isClientHeicFile(file: Pick<File, 'name' | 'type'>): boolean {
  if (HEIC_CLIENT_MIME_TYPES.has(file.type.toLowerCase())) return true;
  return /\.(?:heic|heif)$/iu.test(file.name);
}

function jpegName(name: string): string {
  const base = name.replace(/\.(?:heic|heif)$/iu, '').trim() || 'recipe-image';
  return `${base}.jpg`;
}

async function canvasToJpeg(image: ImageData, name: string): Promise<File> {
  if (
    image.width < 1 ||
    image.height < 1 ||
    image.width > MAX_CLIENT_IMAGE_DIMENSION ||
    image.height > MAX_CLIENT_IMAGE_DIMENSION ||
    image.width * image.height > MAX_CLIENT_IMAGE_PIXELS
  ) {
    throw new ClientHeicConversionError(
      'This HEIC/HEIF image is too large to convert safely in the browser.',
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new ClientHeicConversionError(
      'This browser cannot prepare a JPEG from that HEIC/HEIF image.',
    );
  }
  context.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  );
  if (!blob || blob.size === 0) {
    throw new ClientHeicConversionError('This browser could not finish the HEIC/HEIF conversion.');
  }
  return new File([blob], jpegName(name), { type: 'image/jpeg', lastModified: Date.now() });
}

async function convertOne(file: File): Promise<File> {
  const { decode } = await import('@discourse/heic');
  try {
    const image = await decode(await file.arrayBuffer());
    return await canvasToJpeg(image, file.name);
  } catch (error) {
    if (error instanceof ClientHeicConversionError) throw error;
    throw new ClientHeicConversionError(
      'This HEIC/HEIF image could not be converted in your browser. The original was not uploaded.',
    );
  }
}

/**
 * Converts only HEIC/HEIF selections in-memory. The caller receives standard
 * JPEG Files suitable for the existing server byte gate; originals never enter
 * FormData.
 */
export async function convertHeicFilesInBrowser(
  selected: File[],
  maximumOutputBytes: number,
): Promise<ClientHeicConversionResult> {
  const files: File[] = [];
  const conversions: ClientImageConversion[] = [];
  for (const selectedFile of selected) {
    if (!isClientHeicFile(selectedFile)) {
      files.push(selectedFile);
      continue;
    }
    const converted = await convertOne(selectedFile);
    files.push(converted);
    conversions.push({
      originalSourceName: selectedFile.name,
      convertedSourceName: converted.name,
    });
  }
  if (files.reduce((total, file) => total + file.size, 0) > maximumOutputBytes) {
    throw new ClientHeicConversionError(
      'The converted JPEG files exceed this upload’s size limit. Choose smaller images.',
    );
  }
  return { files, conversions };
}
