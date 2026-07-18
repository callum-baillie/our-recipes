'use client';

export const HEIC_CLIENT_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const MAX_CLIENT_IMAGE_DIMENSION = 8_000;
const MAX_CLIENT_IMAGE_PIXELS = 48_000_000;
export const HEIC_CLIENT_CONVERSION_TIMEOUT_MS = 30_000;

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

function validateImageDimensions(width: number, height: number): void {
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_CLIENT_IMAGE_DIMENSION ||
    height > MAX_CLIENT_IMAGE_DIMENSION ||
    width * height > MAX_CLIENT_IMAGE_PIXELS
  ) {
    throw new ClientHeicConversionError(
      'This HEIC/HEIF image is too large to convert safely in the browser.',
    );
  }
}

async function encodeCanvasAsJpeg(canvas: HTMLCanvasElement, name: string): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  );
  if (!blob || blob.size === 0) {
    throw new ClientHeicConversionError('This browser could not finish the HEIC/HEIF conversion.');
  }
  return new File([blob], jpegName(name), { type: 'image/jpeg', lastModified: Date.now() });
}

async function imageDataToJpeg(image: ImageData, name: string): Promise<File> {
  validateImageDimensions(image.width, image.height);
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
  return encodeCanvasAsJpeg(canvas, name);
}

async function tryNativeBrowserConversion(file: File): Promise<File | null> {
  if (
    typeof Image === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Native image decoding failed.'));
      image.src = objectUrl;
    });
    validateImageDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await encodeCanvasAsJpeg(canvas, file.name);
  } catch (error) {
    if (error instanceof ClientHeicConversionError) throw error;
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function convertOneWithoutTimeout(file: File): Promise<File> {
  const nativeResult = await tryNativeBrowserConversion(file);
  if (nativeResult) return nativeResult;

  const { decode } = await import('@discourse/heic');
  try {
    const image = await decode(await file.arrayBuffer());
    return await imageDataToJpeg(image, file.name);
  } catch (error) {
    if (error instanceof ClientHeicConversionError) throw error;
    throw new ClientHeicConversionError(
      'This HEIC/HEIF image could not be converted in your browser. The original was not uploaded.',
    );
  }
}

async function convertOne(file: File): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    const timeout = window.setTimeout(
      () =>
        reject(
          new ClientHeicConversionError(
            'This HEIC/HEIF image took too long to prepare. Try again, choose a smaller photo, or share it as JPEG.',
          ),
        ),
      HEIC_CLIENT_CONVERSION_TIMEOUT_MS,
    );
    void convertOneWithoutTimeout(file).then(
      (converted) => {
        window.clearTimeout(timeout);
        resolve(converted);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
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
