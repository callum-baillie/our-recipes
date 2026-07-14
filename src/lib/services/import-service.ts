import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { getDatabase, ensureDatabase } from '@/lib/db/client';
import { importArtifacts, importOperations } from '@/lib/db/schema';
import {
  MAX_IMPORT_PDF_PAGES,
  MAX_IMPORT_TEXT_CHARACTERS,
  ImportValidationError,
  assertImportSources,
  importIdSchema,
  safeImportSourceName,
  importReviewDraft,
  importTranscriptionSchema,
  type ImportArtifact,
  type ImportClientConversion,
  type ImportExtractionMethod,
  type ImportKind,
  type ImportOcrProvenance,
  type ImportOperation,
  type ImportReviewDraft,
} from '@/lib/domain/import';
import {
  LocalOcrError,
  localOcrNeedsManualTranscription,
  recognizeLocalEnglishScans,
  type LocalOcrResult,
} from '@/lib/ocr/local-ocr';
import { createRecipe } from '@/lib/services/recipe-service';
import {
  normalizeImportImage,
  readImportArtifact,
  removeImportArtifact,
  storeImportArtifact,
  storeNormalizedImportArtifact,
} from '@/lib/storage/import-storage';

const IMPORT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const IMPORT_RATE_LIMIT_MAXIMUM = 6;
const importAttempts = new Map<string, number[]>();
let scanOcrRecognizer: (images: Buffer[]) => Promise<LocalOcrResult> = recognizeLocalEnglishScans;

type ImportRow = typeof importOperations.$inferSelect;
type ImportArtifactRow = typeof importArtifacts.$inferSelect;

type ImportSource = {
  sourceName: string;
  bytes: Uint8Array;
};

function parseOcrProvenance(value: string | null): ImportOcrProvenance | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ImportOcrProvenance>;
    if (
      typeof parsed.modelId === 'string' &&
      typeof parsed.runtimeVersion === 'string' &&
      typeof parsed.dataVersion === 'string' &&
      (typeof parsed.engineVersion === 'string' || parsed.engineVersion === null) &&
      (typeof parsed.aggregateConfidence === 'number' || parsed.aggregateConfidence === null)
    ) {
      return {
        modelId: parsed.modelId,
        runtimeVersion: parsed.runtimeVersion,
        dataVersion: parsed.dataVersion,
        engineVersion: parsed.engineVersion,
        aggregateConfidence: parsed.aggregateConfidence,
      };
    }
  } catch {
    // Preserve the import and surface a bounded warning below rather than failing a read.
  }
  return null;
}

function toArtifact(row: ImportArtifactRow): ImportArtifact {
  return {
    id: row.id,
    position: row.position,
    sourceName: row.sourceName,
    mediaType: row.mediaType,
    sourceSha256: row.sourceSha256,
  };
}

function listOperationArtifacts(importOperationId: string): ImportArtifact[] {
  return getDatabase()
    .select()
    .from(importArtifacts)
    .where(eq(importArtifacts.importOperationId, importOperationId))
    .orderBy(asc(importArtifacts.position))
    .all()
    .map(toArtifact);
}

export class ImportNotFoundError extends Error {}
export class ImportStateError extends Error {}

function toOperation(row: ImportRow): ImportOperation {
  let warnings: string[] = [];
  try {
    const parsed = JSON.parse(row.warnings) as unknown;
    if (Array.isArray(parsed) && parsed.every((warning) => typeof warning === 'string')) {
      warnings = parsed;
    }
  } catch {
    warnings = ['The saved import warning data could not be read. Review the source carefully.'];
  }
  const ocrProvenance = parseOcrProvenance(row.ocrProvenance);
  if (row.ocrProvenance && !ocrProvenance) {
    warnings.push(
      'The saved local OCR model details could not be read. Review the source carefully.',
    );
  }
  return {
    id: row.id,
    kind: row.kind as ImportKind,
    status: row.status as ImportOperation['status'],
    sourceName: row.sourceName,
    mediaType: row.mediaType,
    sourceSha256: row.sourceSha256,
    extractionMethod: row.extractionMethod as ImportExtractionMethod,
    extractedText: row.extractedText,
    ocrProvenance,
    warnings,
    createdByProfileId: row.createdByProfileId,
    confirmedByProfileId: row.confirmedByProfileId,
    confirmedRecipeId: row.confirmedRecipeId,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
    artifacts: listOperationArtifacts(row.id),
  };
}

function operationOrThrow(importId: string): ImportOperation {
  const id = importIdSchema.parse(importId);
  const row = getDatabase()
    .select()
    .from(importOperations)
    .where(eq(importOperations.id, id))
    .get();
  if (!row) throw new ImportNotFoundError('That import draft no longer exists.');
  return toOperation(row);
}

function boundedPdfText(value: string): string {
  const normalized = value
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (normalized.length > MAX_IMPORT_TEXT_CHARACTERS) {
    throw new ImportValidationError(
      'invalid_file',
      'The extracted PDF text exceeds the 100,000-character safety limit.',
    );
  }
  return normalized;
}

async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  let task: ReturnType<typeof getDocument> | undefined;
  try {
    task = getDocument({
      data: new Uint8Array(bytes),
      disableFontFace: true,
      useWorkerFetch: false,
      stopAtErrors: true,
      useSystemFonts: true,
    });
    const document = await task.promise;
    try {
      if (document.numPages > MAX_IMPORT_PDF_PAGES) {
        throw new ImportValidationError(
          'too_many_pages',
          `Choose a recipe PDF with at most ${MAX_IMPORT_PDF_PAGES} pages.`,
        );
      }
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent({ includeMarkedContent: false });
        pages.push(
          content.items
            .flatMap((item) => ('str' in item && typeof item.str === 'string' ? [item] : []))
            .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
            .join(''),
        );
        page.cleanup();
      }
      return { text: boundedPdfText(pages.join('\n\n')), pages: document.numPages };
    } finally {
      document.cleanup();
    }
  } catch (error) {
    if (error instanceof ImportValidationError) throw error;
    const message = error instanceof Error ? error.message.toLocaleLowerCase() : '';
    if (message.includes('password')) {
      throw new ImportValidationError(
        'invalid_file',
        'Password-protected PDFs cannot be imported. Export an unlocked recipe copy instead.',
      );
    }
    throw new ImportValidationError(
      'invalid_file',
      'That PDF could not be parsed safely. Try a smaller, unlocked recipe PDF.',
    );
  } finally {
    await task?.destroy();
  }
}

function rateLimitKey(profileId: string): string {
  return profileId;
}

export function assertImportRateLimit(profileId: string, now = Date.now()): void {
  const key = rateLimitKey(profileId);
  const recent = (importAttempts.get(key) ?? []).filter(
    (attempt) => attempt > now - IMPORT_RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= IMPORT_RATE_LIMIT_MAXIMUM) {
    importAttempts.set(key, recent);
    throw new ImportValidationError(
      'rate_limited',
      'Please wait before starting another import. This household profile can start six imports every ten minutes.',
    );
  }
  recent.push(now);
  importAttempts.set(key, recent);
}

export function resetImportRateLimitsForTests(): void {
  importAttempts.clear();
}

export function setImportScanOcrRecognizerForTests(
  recognizer: ((images: Buffer[]) => Promise<LocalOcrResult>) | null,
): void {
  scanOcrRecognizer = recognizer ?? recognizeLocalEnglishScans;
}

function manualOcrFallbackError(): ImportValidationError {
  return new ImportValidationError(
    'text_required',
    'Local OCR could not produce a confident readable transcription. Add at least 20 characters of manual transcription before creating a review draft.',
  );
}

export async function createImportOperation(input: {
  actorProfileId: string;
  sources?: ImportSource[];
  sourceName?: string;
  bytes?: Uint8Array;
  manualTranscription?: string;
  clientConversions?: ImportClientConversion[];
}): Promise<{ operation: ImportOperation; draft: ImportReviewDraft }> {
  ensureDatabase();
  const sources =
    input.sources ??
    (input.sourceName && input.bytes ? [{ sourceName: input.sourceName, bytes: input.bytes }] : []);
  const kind = assertImportSources(sources);
  const normalizedSources = sources.map((source) => ({
    sourceName: safeImportSourceName(source.sourceName),
    bytes: source.bytes,
  }));
  const firstSource = normalizedSources[0]!;
  const manualTranscription = input.manualTranscription?.trim();
  const importId = randomUUID();
  let extractedText: string;
  let extractionMethod: ImportExtractionMethod;
  let ocrProvenance: ImportOcrProvenance | null = null;
  const warnings: string[] = [];
  const clientConversions = new Map(
    (input.clientConversions ?? []).map((conversion) => [
      safeImportSourceName(conversion.convertedSourceName),
      safeImportSourceName(conversion.originalSourceName),
    ]),
  );
  for (const source of normalizedSources) {
    const originalSourceName = clientConversions.get(source.sourceName);
    if (originalSourceName) {
      warnings.push(
        `The browser converted ${originalSourceName} to JPEG before upload; the original HEIC/HEIF file was not sent to this server. Review the converted scan carefully.`,
      );
    }
  }
  const normalizedImages =
    kind === 'image'
      ? await Promise.all(normalizedSources.map((source) => normalizeImportImage(source.bytes)))
      : [];

  if (kind === 'pdf') {
    const extracted = await extractPdfText(firstSource.bytes);
    if (extracted.text.length >= 20) {
      extractedText = extracted.text;
      extractionMethod = 'pdf-text';
      if (extracted.pages > 1) {
        warnings.push(
          `Embedded text was extracted from ${extracted.pages} PDF pages; review page order.`,
        );
      }
    } else {
      const transcription = importTranscriptionSchema.safeParse(manualTranscription);
      if (!transcription.success) {
        throw new ImportValidationError(
          'text_required',
          'This PDF has no usable embedded text. Add a manual transcription before importing it.',
        );
      }
      extractedText = transcription.data;
      extractionMethod = 'manual-transcription';
      warnings.push(
        'This PDF had no usable embedded text; the review draft uses your manual transcription.',
      );
    }
  } else {
    const transcription = importTranscriptionSchema.safeParse(manualTranscription);
    if (transcription.success) {
      extractedText = transcription.data;
      extractionMethod = 'manual-transcription';
      warnings.push(
        'This scan uses your manual transcription. No file or text was sent to a network service.',
      );
    } else {
      try {
        const ocrResult = await scanOcrRecognizer(normalizedImages);
        if (localOcrNeedsManualTranscription(ocrResult)) throw manualOcrFallbackError();
        const recognizedText = importTranscriptionSchema.safeParse(ocrResult.text);
        if (!recognizedText.success) throw manualOcrFallbackError();
        extractedText = recognizedText.data;
        extractionMethod = 'local-ocr';
        ocrProvenance = ocrResult.provenance;
        warnings.push(
          `Local English OCR suggested this review text (rounded confidence ${ocrResult.provenance.aggregateConfidence}%). Check every field before saving; no file or text was sent to a network service.`,
        );
      } catch (error) {
        if (error instanceof ImportValidationError) throw error;
        if (error instanceof LocalOcrError && error.code === 'busy') {
          throw new ImportValidationError(
            'ocr_busy',
            'Local OCR is busy with other recipe scans. Please try again in a moment or add a manual transcription.',
          );
        }
        if (error instanceof LocalOcrError) throw manualOcrFallbackError();
        throw manualOcrFallbackError();
      }
    }
  }

  const storedArtifacts: Array<{
    id: string;
    position: number;
    sourceName: string;
    storageKey: string;
    mediaType: string;
    sourceSha256: string;
  }> = [];
  try {
    for (const [position, source] of normalizedSources.entries()) {
      const id = position === 0 ? importId : randomUUID();
      const artifact =
        kind === 'image'
          ? await storeNormalizedImportArtifact(id, normalizedImages[position]!)
          : await storeImportArtifact(id, kind, source.bytes);
      storedArtifacts.push({
        id,
        position,
        sourceName: source.sourceName,
        storageKey: artifact.storageKey,
        mediaType: artifact.mediaType,
        sourceSha256: createHash('sha256').update(source.bytes).digest('hex'),
      });
    }
    const firstArtifact = storedArtifacts[0]!;
    const now = new Date();
    getDatabase().transaction((transaction) => {
      transaction
        .insert(importOperations)
        .values({
          id: importId,
          kind,
          status: 'review',
          sourceName: firstArtifact.sourceName,
          storageKey: firstArtifact.storageKey,
          mediaType: firstArtifact.mediaType,
          sourceSha256: firstArtifact.sourceSha256,
          extractionMethod,
          extractedText,
          ocrProvenance: ocrProvenance ? JSON.stringify(ocrProvenance) : null,
          warnings: JSON.stringify(warnings),
          createdByProfileId: input.actorProfileId,
          confirmedByProfileId: null,
          confirmedRecipeId: null,
          createdAt: now,
          confirmedAt: null,
        })
        .run();
      transaction
        .insert(importArtifacts)
        .values(
          storedArtifacts.map((artifact) => ({
            ...artifact,
            importOperationId: importId,
            createdAt: now,
          })),
        )
        .run();
    });
    const operation = operationOrThrow(importId);
    return { operation, draft: importReviewDraft(operation) };
  } catch (error) {
    await Promise.all(storedArtifacts.map((artifact) => removeImportArtifact(artifact.storageKey)));
    throw error;
  }
}

export function getImportOperation(importId: string): {
  operation: ImportOperation;
  draft: ImportReviewDraft;
} | null {
  ensureDatabase();
  try {
    const operation = operationOrThrow(importId);
    return { operation, draft: importReviewDraft(operation) };
  } catch (error) {
    if (error instanceof ImportNotFoundError) return null;
    throw error;
  }
}

export function listImportOperations(limit = 30): ImportOperation[] {
  ensureDatabase();
  return getDatabase()
    .select()
    .from(importOperations)
    .orderBy(desc(importOperations.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)))
    .all()
    .map(toOperation);
}

export async function getImportArtifact(
  importId: string,
  artifactId = importId,
): Promise<{
  bytes: Buffer;
  mediaType: string;
}> {
  ensureDatabase();
  const id = importIdSchema.parse(importId);
  const artifact = getDatabase()
    .select()
    .from(importArtifacts)
    .where(and(eq(importArtifacts.importOperationId, id), eq(importArtifacts.id, artifactId)))
    .get();
  if (!artifact) throw new ImportNotFoundError('That import artifact no longer exists.');
  return {
    bytes: await readImportArtifact(artifact.storageKey),
    mediaType: artifact.mediaType,
  };
}

export function confirmImportOperation(
  importId: string,
  recipe: Parameters<typeof createRecipe>[0],
  actorProfileId: string,
): { operation: ImportOperation; recipe: ReturnType<typeof createRecipe> } {
  ensureDatabase();
  const operation = operationOrThrow(importId);
  if (operation.status !== 'review') {
    throw new ImportStateError(
      'This import has already been confirmed and cannot create another recipe.',
    );
  }
  const createdRecipe = createRecipe(recipe, actorProfileId);
  const confirmedAt = new Date();
  getDatabase()
    .update(importOperations)
    .set({
      status: 'confirmed',
      confirmedByProfileId: actorProfileId,
      confirmedRecipeId: createdRecipe.id,
      confirmedAt,
    })
    .where(eq(importOperations.id, operation.id))
    .run();
  return { operation: operationOrThrow(operation.id), recipe: createdRecipe };
}
