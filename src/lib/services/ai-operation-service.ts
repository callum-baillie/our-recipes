import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { getDatabase, ensureDatabase } from '@/lib/db/client';
import { aiOperationAudits } from '@/lib/db/schema';
import type { AiOperationAudit, AiReviewAction, AiRecipeCandidate } from '@/lib/domain/ai';
import {
  AiProviderRequestError,
  AiProviderUnavailableError,
  OPENAI_IMAGE_MODEL,
  OPENAI_REVIEW_MODEL,
} from '@/lib/providers/ai-provider';
import { getAiProvider, getAiReadiness } from '@/lib/services/ai-readiness-service';
import { getImportArtifact, getImportOperation } from '@/lib/services/import-service';
import { createRecipeImage } from '@/lib/services/recipe-image-service';
import { getRecipe, RecipeNotFoundError } from '@/lib/services/recipe-service';

const AI_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const AI_RATE_LIMIT_MAXIMUM = 4;
const MAX_VISION_BYTES = 6 * 1024 * 1024;
const MAX_VISION_IMAGES = 4;
const aiAttempts = new Map<string, number[]>();

type AiAuditRow = typeof aiOperationAudits.$inferSelect;

export class AiOperationError extends Error {
  constructor(
    readonly code: 'ai_not_configured' | 'rate_limited' | 'invalid_ai_source' | 'ai_request_failed',
    message: string,
  ) {
    super(message);
  }
}

function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function toAudit(row: AiAuditRow): AiOperationAudit {
  return {
    id: row.id,
    kind: row.kind as AiOperationAudit['kind'],
    status: row.status as AiOperationAudit['status'],
    sourceDigest: row.sourceDigest,
    sourceLabel: row.sourceLabel,
    provider: 'OpenAI',
    model: row.model,
    profileId: row.profileId,
    recipeId: row.recipeId,
    importId: row.importId,
    generatedImageId: row.generatedImageId,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function assertAiRateLimit(profileId: string, now = Date.now()): void {
  const recent = (aiAttempts.get(profileId) ?? []).filter(
    (attempt) => attempt > now - AI_RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= AI_RATE_LIMIT_MAXIMUM) {
    aiAttempts.set(profileId, recent);
    throw new AiOperationError(
      'rate_limited',
      'Please wait before using OpenAI again. This household profile can start four AI actions every ten minutes.',
    );
  }
  recent.push(now);
  aiAttempts.set(profileId, recent);
}

function beginAudit(input: {
  kind: AiOperationAudit['kind'];
  sourceDigest: string;
  sourceLabel: string;
  profileId: string;
  recipeId?: string | null;
  importId?: string | null;
  model: string;
}): AiOperationAudit {
  ensureDatabase();
  const audit: AiAuditRow = {
    id: randomUUID(),
    kind: input.kind,
    status: 'requested',
    sourceDigest: input.sourceDigest,
    sourceLabel: input.sourceLabel,
    provider: 'OpenAI',
    model: input.model,
    profileId: input.profileId,
    recipeId: input.recipeId ?? null,
    importId: input.importId ?? null,
    generatedImageId: null,
    createdAt: new Date(),
    completedAt: null,
  };
  getDatabase().insert(aiOperationAudits).values(audit).run();
  return toAudit(audit);
}

function completeAudit(auditId: string, generatedImageId: string | null = null): AiOperationAudit {
  const completedAt = new Date();
  getDatabase()
    .update(aiOperationAudits)
    .set({ status: 'succeeded', completedAt, generatedImageId })
    .where(eq(aiOperationAudits.id, auditId))
    .run();
  const row = getDatabase()
    .select()
    .from(aiOperationAudits)
    .where(eq(aiOperationAudits.id, auditId))
    .get();
  if (!row)
    throw new AiOperationError('ai_request_failed', 'The AI audit record could not be completed.');
  return toAudit(row);
}

function failAudit(auditId: string): void {
  getDatabase()
    .update(aiOperationAudits)
    .set({ status: 'failed', completedAt: new Date() })
    .where(eq(aiOperationAudits.id, auditId))
    .run();
}

function configuredProvider() {
  if (!getAiReadiness().enabled) {
    throw new AiOperationError(
      'ai_not_configured',
      'OpenAI is not configured for this server. Add a server-side key before using it.',
    );
  }
  return getAiProvider();
}

function publicCandidate(candidate: AiRecipeCandidate, sourceLabel: string): AiRecipeCandidate {
  return {
    ...candidate,
    recipe: {
      ...candidate.recipe,
      sourceName: sourceLabel,
    },
  };
}

export function resetAiRateLimitsForTests(): void {
  aiAttempts.clear();
}

export async function createAiReviewCandidate(input: {
  actorProfileId: string;
  action: AiReviewAction;
}): Promise<{ candidate: AiRecipeCandidate; audit: AiOperationAudit }> {
  ensureDatabase();
  assertAiRateLimit(input.actorProfileId);
  const provider = configuredProvider();

  if (input.action.kind === 'text-normalization') {
    const sourceText = input.action.sourceText;
    const sourceLabel = input.action.sourceLabel;
    const audit = beginAudit({
      kind: 'text-normalization',
      sourceDigest: digest(sourceText),
      sourceLabel,
      profileId: input.actorProfileId,
      model: OPENAI_REVIEW_MODEL,
    });
    try {
      const candidate = await provider.createTextReviewCandidate({
        kind: 'text-normalization',
        sourceDigest: audit.sourceDigest,
        sourceLabel,
        sourceText,
      });
      return { candidate: publicCandidate(candidate, sourceLabel), audit: completeAudit(audit.id) };
    } catch (error) {
      failAudit(audit.id);
      if (error instanceof AiProviderUnavailableError)
        throw new AiOperationError(
          'ai_not_configured',
          'OpenAI is not configured for this server.',
        );
      throw new AiOperationError(
        'ai_request_failed',
        'OpenAI could not create a review draft. Your source was not saved as a recipe.',
      );
    }
  }

  const loaded = getImportOperation(input.action.importId);
  if (!loaded || loaded.operation.kind !== 'image') {
    throw new AiOperationError(
      'invalid_ai_source',
      'OpenAI vision can only use an existing image-scan review draft.',
    );
  }
  const artifacts = loaded.operation.artifacts.slice(0, MAX_VISION_IMAGES);
  if (artifacts.length === 0) {
    throw new AiOperationError(
      'invalid_ai_source',
      'This review draft has no safe scan artifacts.',
    );
  }
  const files = await Promise.all(
    artifacts.map(async (artifact) => ({
      artifact,
      file: await getImportArtifact(loaded.operation.id, artifact.id),
    })),
  );
  const byteCount = files.reduce((total, entry) => total + entry.file.bytes.byteLength, 0);
  if (byteCount > MAX_VISION_BYTES) {
    throw new AiOperationError(
      'invalid_ai_source',
      'Those normalized scans are too large for an OpenAI review. Use fewer or smaller scans.',
    );
  }
  const sourceDigest = digest(files.map((entry) => entry.artifact.sourceSha256).join(':'));
  const audit = beginAudit({
    kind: 'vision-extraction',
    sourceDigest,
    sourceLabel: loaded.operation.sourceName,
    profileId: input.actorProfileId,
    importId: loaded.operation.id,
    model: OPENAI_REVIEW_MODEL,
  });
  try {
    const candidate = await provider.createVisionReviewCandidate({
      kind: 'vision-extraction',
      sourceDigest,
      sourceLabel: loaded.operation.sourceName,
      imageDataUrls: files.map(
        (entry) => `data:${entry.file.mediaType};base64,${entry.file.bytes.toString('base64')}`,
      ),
    });
    return {
      candidate: publicCandidate(candidate, loaded.operation.sourceName),
      audit: completeAudit(audit.id),
    };
  } catch (error) {
    failAudit(audit.id);
    if (error instanceof AiProviderUnavailableError)
      throw new AiOperationError('ai_not_configured', 'OpenAI is not configured for this server.');
    throw new AiOperationError(
      'ai_request_failed',
      'OpenAI could not read those scans. Your source was not saved as a recipe.',
    );
  }
}

export async function generateAiRecipeImage(input: {
  actorProfileId: string;
  recipeId: string;
}): Promise<{ imageId: string; audit: AiOperationAudit }> {
  ensureDatabase();
  assertAiRateLimit(input.actorProfileId);
  const provider = configuredProvider();
  const recipe = getRecipe(input.recipeId, input.actorProfileId);
  if (!recipe) throw new RecipeNotFoundError('That recipe no longer exists.');
  const audit = beginAudit({
    kind: 'image-generation',
    sourceDigest: digest(
      `${recipe.id}:${recipe.currentRevision}:${recipe.updatedAt.toISOString()}`,
    ),
    sourceLabel: recipe.title.slice(0, 160),
    profileId: input.actorProfileId,
    recipeId: recipe.id,
    model: OPENAI_IMAGE_MODEL,
  });
  try {
    const generated = await provider.generateRecipeImage({
      recipeTitle: recipe.title,
      recipeSummary: recipe.summary,
      ingredientNames: recipe.ingredientGroups.flatMap((group) =>
        group.ingredients.map((ingredient) => ingredient.item),
      ),
    });
    const image = await createRecipeImage(
      recipe.id,
      input.actorProfileId,
      generated.bytes,
      generated.altText,
    );
    return { imageId: image.id, audit: completeAudit(audit.id, image.id) };
  } catch (error) {
    failAudit(audit.id);
    if (error instanceof AiProviderUnavailableError)
      throw new AiOperationError('ai_not_configured', 'OpenAI is not configured for this server.');
    if (error instanceof RecipeNotFoundError) throw error;
    if (error instanceof AiProviderRequestError)
      throw new AiOperationError('ai_request_failed', 'OpenAI could not generate a recipe image.');
    throw new AiOperationError(
      'ai_request_failed',
      'The generated image could not be stored safely. Nothing was added to the recipe.',
    );
  }
}
