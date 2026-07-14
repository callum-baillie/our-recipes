import { z } from 'zod';

import { draftFromText } from '@/lib/domain/capture';
import { recipeInputSchema, type RecipePayload } from '@/lib/domain/recipe';

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_IMPORT_FILES = 4;
export const MAX_IMPORT_PDF_PAGES = 12;
export const MAX_IMPORT_TEXT_CHARACTERS = 100_000;
export const MAX_IMPORT_IMAGE_DIMENSION = 8_000;
export const MAX_IMPORT_IMAGE_PIXELS = 48_000_000;
export const MAX_IMPORT_IMAGE_OUTPUT_DIMENSION = 2_500;

export const importIdSchema = z.string().uuid();
export const importTranscriptionSchema = z.string().trim().min(20).max(MAX_IMPORT_TEXT_CHARACTERS);
export const importConfirmationSchema = z.object({ recipe: recipeInputSchema });
export const importClientConversionSchema = z
  .object({
    originalSourceName: z.string().trim().min(1).max(160),
    convertedSourceName: z.string().trim().min(1).max(160),
  })
  .strict();
export const importClientConversionsSchema = z
  .array(importClientConversionSchema)
  .max(MAX_IMPORT_FILES);

export type ImportKind = 'pdf' | 'image';
export type ImportExtractionMethod = 'pdf-text' | 'manual-transcription' | 'local-ocr';
export type ImportStatus = 'review' | 'confirmed';
export type ImportClientConversion = z.infer<typeof importClientConversionSchema>;

export type ImportOcrProvenance = {
  modelId: string;
  runtimeVersion: string;
  dataVersion: string;
  engineVersion: string | null;
  aggregateConfidence: number | null;
};

export type ImportArtifact = {
  id: string;
  position: number;
  sourceName: string;
  mediaType: string;
  sourceSha256: string;
};

export type ImportOperation = {
  id: string;
  kind: ImportKind;
  status: ImportStatus;
  sourceName: string;
  mediaType: string;
  sourceSha256: string;
  extractionMethod: ImportExtractionMethod;
  extractedText: string;
  ocrProvenance: ImportOcrProvenance | null;
  warnings: string[];
  createdByProfileId: string;
  confirmedByProfileId: string | null;
  confirmedRecipeId: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  artifacts: ImportArtifact[];
};

export type ImportReviewDraft = {
  recipe: RecipePayload;
  originalText: string;
  provenance: {
    kind: ImportKind;
    sourceName: string;
    sourceSha256: string;
    extractionMethod: ImportExtractionMethod;
    ocrProvenance: ImportOcrProvenance | null;
    extractionNotice: string;
    warnings: string[];
  };
};

export class ImportValidationError extends Error {
  constructor(
    readonly code:
      | 'invalid_file'
      | 'unsupported_file'
      | 'file_too_large'
      | 'too_many_pages'
      | 'text_required'
      | 'ocr_busy'
      | 'rate_limited',
    message: string,
  ) {
    super(message);
  }
}

export function safeImportSourceName(name: string): string {
  const normalized = name
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return normalized || 'Recipe import';
}

export function assertImportFileBytes(bytes: Uint8Array): ImportKind {
  if (bytes.byteLength === 0) {
    throw new ImportValidationError('invalid_file', 'Choose a non-empty PDF or recipe image.');
  }
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new ImportValidationError(
      'file_too_large',
      'Choose a PDF or image no larger than 15 MB.',
    );
  }
  if (
    bytes.byteLength >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'pdf';
  }
  if (
    (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (bytes.byteLength >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a) ||
    (bytes.byteLength >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50)
  ) {
    return 'image';
  }
  throw new ImportValidationError(
    'unsupported_file',
    'Only PDF, JPEG, PNG, and WebP recipe files are accepted.',
  );
}

export function assertImportSources(
  sources: Array<{ sourceName: string; bytes: Uint8Array }>,
): ImportKind {
  if (sources.length === 0 || sources.length > MAX_IMPORT_FILES) {
    throw new ImportValidationError(
      'invalid_file',
      `Choose one PDF or between one and ${MAX_IMPORT_FILES} recipe scan images.`,
    );
  }
  const totalBytes = sources.reduce((total, source) => total + source.bytes.byteLength, 0);
  if (totalBytes > MAX_IMPORT_BYTES) {
    throw new ImportValidationError(
      'file_too_large',
      'Keep the combined import files at 15 MB or less.',
    );
  }
  const kinds = sources.map((source) => assertImportFileBytes(source.bytes));
  const firstKind = kinds[0]!;
  if (firstKind === 'pdf' && sources.length !== 1) {
    throw new ImportValidationError(
      'unsupported_file',
      'Import one PDF by itself, or choose up to four JPEG, PNG, or WebP scans.',
    );
  }
  if (kinds.some((kind) => kind !== firstKind)) {
    throw new ImportValidationError(
      'unsupported_file',
      'Do not mix PDF documents and recipe scans in one import.',
    );
  }
  return firstKind;
}

export function importReviewDraft(operation: ImportOperation): ImportReviewDraft {
  const captureDraft = draftFromText(operation.extractedText, { name: operation.sourceName });
  return {
    recipe: recipeInputSchema.parse(captureDraft.recipe),
    originalText: operation.extractedText,
    provenance: {
      kind: operation.kind,
      sourceName: operation.sourceName,
      sourceSha256: operation.sourceSha256,
      extractionMethod: operation.extractionMethod,
      ocrProvenance: operation.ocrProvenance,
      extractionNotice:
        'This import is only a review draft. Check every field before explicitly adding it to the shared cookbook.',
      warnings: operation.warnings,
    },
  };
}
