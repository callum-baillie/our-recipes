import { executeAiWorkload } from './ai-execution-service';
import 'server-only';
import { getEffectiveAiPolicy, aiUserIdForProfile } from './ai-access-service';

import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { getDatabase, ensureDatabase } from '@/lib/db/client';
import { aiOperationAudits } from '@/lib/db/schema';
import type {
  AiNutritionEstimate,
  AiOperationAudit,
  AiReviewAction,
  AiRecipeCandidate,
} from '@/lib/domain/ai';
import type { RecipePayload } from '@/lib/domain/recipe';
import { AiProviderRequestError, AiProviderUnavailableError } from '@/lib/providers/ai-provider';
import { getAiProvider, getAiReadiness } from '@/lib/services/ai-readiness-service';
import { getAiWorkloadSetting } from '@/lib/services/ai-settings-service';
import { getImportArtifact, getImportOperation } from '@/lib/services/import-service';
import {
  getRecipe,
  RecipeConflictError,
  RecipeNotFoundError,
  updateRecipeNutritionEstimateWithIntegrations,
} from '@/lib/services/recipe-service';

const AI_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;

const MAX_VISION_BYTES = 6 * 1024 * 1024;
const MAX_VISION_IMAGES = 4;
const aiAttempts = new Map<string, number[]>();

type AiAuditRow = typeof aiOperationAudits.$inferSelect;

export class AiOperationError extends Error {
  constructor(
    readonly code:
      | 'ai_not_configured'
      | 'rate_limited'
      | 'invalid_ai_source'
      | 'ai_request_failed'
      | 'ai_sharing_disabled',
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

export function assertAiRateLimit(profileId: string, now = Date.now()): void {
  if (!getEffectiveAiPolicy(profileId).enabled)
    throw new AiOperationError('ai_not_configured', 'AI is disabled for this account.');
  const limit = getEffectiveAiPolicy(profileId).generationsPerTenMinutes;
  const rateKey = aiUserIdForProfile(profileId) ?? profileId;
  const recent = (aiAttempts.get(rateKey) ?? []).filter(
    (attempt) => attempt > now - AI_RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= limit) {
    aiAttempts.set(rateKey, recent);
    throw new AiOperationError(
      'rate_limited',
      `Please wait before using OpenAI again. This account can start ${limit} AI actions every ten minutes.`,
    );
  }
  recent.push(now);
  aiAttempts.set(rateKey, recent);
}

function beginAudit(input: {
  kind: AiOperationAudit['kind'];
  sourceDigest: string;
  sourceLabel: string;
  profileId: string;
  recipeId?: string | null;
  importId?: string | null;
  model: string;
  reasoningEffort?: string | null;
  promptVersion?: string;
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
    reasoningEffort: input.reasoningEffort ?? null,
    promptVersion: input.promptVersion ?? null,
    inputTokens: null,
    outputTokens: null,
    profileId: input.profileId,
    recipeId: input.recipeId ?? null,
    importId: input.importId ?? null,
    generatedImageId: null,
    threadId: null,
    actionId: null,
    summaryId: null,
    errorCode: null,
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
    const setting = getAiWorkloadSetting(input.actorProfileId, 'recipe_review');
    if (!setting.enabled)
      throw new AiOperationError('ai_not_configured', 'This AI task is disabled in AI settings.');
    const audit = beginAudit({
      kind: 'text-normalization',
      sourceDigest: digest(sourceText),
      sourceLabel,
      profileId: input.actorProfileId,
      model: setting.model,
      reasoningEffort: setting.reasoningEffort,
      promptVersion: setting.promptVersion,
    });
    try {
      const candidate = await executeAiWorkload(input.actorProfileId, 'recipe_review', (options) =>
        provider.createTextReviewCandidate(
          {
            kind: 'text-normalization',
            sourceDigest: audit.sourceDigest,
            sourceLabel,
            sourceText,
            improve: input.action.improve,
          },
          options,
        ),
      );
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
  const setting = getAiWorkloadSetting(input.actorProfileId, 'recipe_review');
  if (!setting.enabled)
    throw new AiOperationError('ai_not_configured', 'This AI task is disabled in AI settings.');
  const audit = beginAudit({
    kind: 'vision-extraction',
    sourceDigest,
    sourceLabel: loaded.operation.sourceName,
    profileId: input.actorProfileId,
    importId: loaded.operation.id,
    model: setting.model,
    reasoningEffort: setting.reasoningEffort,
    promptVersion: setting.promptVersion,
  });
  try {
    const candidate = await executeAiWorkload(input.actorProfileId, 'recipe_review', (options) =>
      provider.createVisionReviewCandidate(
        {
          kind: 'vision-extraction',
          sourceDigest,
          sourceLabel: loaded.operation.sourceName,
          imageDataUrls: files.map(
            (entry) => `data:${entry.file.mediaType};base64,${entry.file.bytes.toString('base64')}`,
          ),
          improve: input.action.improve,
        },
        options,
      ),
    );
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

export async function improveAiRecipe(input: {
  actorProfileId: string;
  recipeId: string;
  expectedRevision: number;
  recipe: RecipePayload;
  mode?: 'enhance' | 'improve';
}): Promise<{ candidate: AiRecipeCandidate; audit: AiOperationAudit }> {
  ensureDatabase();
  const savedRecipe = getRecipe(input.recipeId, input.actorProfileId);
  if (!savedRecipe) throw new RecipeNotFoundError('That recipe no longer exists.');
  if (savedRecipe.currentRevision !== input.expectedRevision) {
    throw new RecipeConflictError(
      'This recipe changed in another tab. Refresh the editor before using AI Improve.',
    );
  }
  assertAiRateLimit(input.actorProfileId);
  const provider = configuredProvider();
  const setting = getAiWorkloadSetting(input.actorProfileId, 'recipe_review');
  if (!setting.enabled)
    throw new AiOperationError('ai_not_configured', 'This AI task is disabled in AI settings.');
  const audit = beginAudit({
    kind: 'recipe-improvement',
    sourceDigest: digest(JSON.stringify(input.recipe)),
    sourceLabel: input.recipe.title.slice(0, 160),
    profileId: input.actorProfileId,
    recipeId: input.recipeId,
    model: setting.model,
    reasoningEffort: setting.reasoningEffort,
    promptVersion: setting.promptVersion,
  });
  try {
    const candidate = await executeAiWorkload(input.actorProfileId, 'recipe_review', (options) =>
      provider.improveRecipe(
        { recipe: input.recipe, ...(input.mode === 'enhance' ? { mode: 'enhance' as const } : {}) },
        options,
      ),
    );
    return {
      candidate: {
        ...candidate,
        recipe: {
          ...candidate.recipe,
          status: input.recipe.status,
          sourceName: input.recipe.sourceName,
          sourceUrl: input.recipe.sourceUrl,
          originalAuthor: input.recipe.originalAuthor,
          sharedNotes: input.recipe.sharedNotes,
          // The editor's existing Improve action preserves ingredients. The
          // explicit Enhance mode may normalize them in a review-only draft.
          ingredientGroups:
            input.mode === 'enhance'
              ? candidate.recipe.ingredientGroups
              : input.recipe.ingredientGroups,
        },
      },
      audit: completeAudit(audit.id),
    };
  } catch (error) {
    failAudit(audit.id);
    if (error instanceof AiProviderUnavailableError) {
      throw new AiOperationError('ai_not_configured', 'OpenAI is not configured for this server.');
    }
    throw new AiOperationError(
      'ai_request_failed',
      error instanceof AiProviderRequestError
        ? error.message
        : 'OpenAI could not prepare an improved recipe draft.',
    );
  }
}

/** @deprecated Use the owned candidate service and explicit acceptance. */
export async function generateAiRecipeImage(_input: {
  actorProfileId: string;
  recipeId: string;
}): Promise<{ imageId: string; audit: AiOperationAudit }> {
  void _input; // Compatibility entry point intentionally refuses direct attachment.
  throw new AiOperationError(
    'ai_request_failed',
    'Direct image attachment is no longer supported. Prepare and accept a reviewed image candidate.',
  );
}

export async function estimateAiRecipeNutrition(input: {
  actorProfileId: string;
  recipeId: string;
  expectedRevision: number;
}): Promise<{
  recipe: NonNullable<ReturnType<typeof getRecipe>>;
  integration: Omit<ReturnType<typeof updateRecipeNutritionEstimateWithIntegrations>, 'recipe'>;
  estimate: AiNutritionEstimate;
  audit: AiOperationAudit;
}> {
  ensureDatabase();
  assertAiRateLimit(input.actorProfileId);
  const provider = configuredProvider();
  const recipe = getRecipe(input.recipeId, input.actorProfileId);
  if (!recipe) throw new RecipeNotFoundError('That recipe no longer exists.');
  if (recipe.currentRevision !== input.expectedRevision) {
    throw new RecipeConflictError(
      'This recipe changed in another tab. Refresh the card before estimating nutrition.',
    );
  }
  const setting = getAiWorkloadSetting(input.actorProfileId, 'nutrition_estimation');
  if (!setting.enabled)
    throw new AiOperationError('ai_not_configured', 'This AI task is disabled in AI settings.');
  const audit = beginAudit({
    kind: 'nutrition-estimation',
    sourceDigest: digest(
      `${recipe.id}:${recipe.currentRevision}:${recipe.updatedAt.toISOString()}`,
    ),
    sourceLabel: recipe.title.slice(0, 160),
    profileId: input.actorProfileId,
    recipeId: recipe.id,
    model: setting.model,
    reasoningEffort: setting.reasoningEffort,
    promptVersion: setting.promptVersion,
  });
  try {
    const estimate = await executeAiWorkload(
      input.actorProfileId,
      'nutrition_estimation',
      (options) =>
        provider.estimateRecipeNutrition(
          {
            recipeTitle: recipe.title,
            recipeSummary: recipe.summary,
            servings: recipe.servings,
            ingredientGroups: recipe.ingredientGroups.map((group) => ({
              name: group.name,
              ingredients: group.ingredients.map(({ quantity, unit, item, note }) => ({
                quantity,
                unit,
                item,
                note,
              })),
            })),
            instructionSteps: recipe.instructionSections.flatMap((section) =>
              section.steps.map((step) => step.body),
            ),
          },
          options,
        ),
    );
    const updated = updateRecipeNutritionEstimateWithIntegrations(
      recipe.id,
      estimate,
      input.actorProfileId,
      input.expectedRevision,
    );
    return {
      recipe: updated.recipe,
      integration: {
        nutritionMappingRestore: updated.nutritionMappingRestore,
        nutritionRecalculation: updated.nutritionRecalculation,
      },
      estimate,
      audit: completeAudit(audit.id),
    };
  } catch (error) {
    failAudit(audit.id);
    if (error instanceof AiProviderUnavailableError) {
      throw new AiOperationError('ai_not_configured', 'OpenAI is not configured for this server.');
    }
    if (error instanceof RecipeNotFoundError || error instanceof RecipeConflictError) throw error;
    throw new AiOperationError(
      'ai_request_failed',
      error instanceof AiProviderRequestError
        ? error.message
        : 'OpenAI returned an estimate, but it could not be saved safely.',
    );
  }
}
