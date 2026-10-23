import { executeAiWorkload } from './ai-execution-service';
import { withAiExecutionContext } from './ai-execution-context';
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { aiOperationAudits, recipeImageCandidates, recipeImages, recipes } from '@/lib/db/schema';
import {
  RECIPE_IMAGE_PROMPT_VERSION,
  recipeImageInput,
  recipeImagePreviewRequestSchema,
  type RecipeImageCandidate,
  type RecipeImagePreviewRequest,
} from '@/lib/domain/recipe-image-generation';
import { assertAiRateLimit, AiOperationError } from './ai-operation-service';
import { getAiProvider, getAiReadiness } from './ai-readiness-service';
import { getAiDataPolicy, getAiWorkloadSetting } from './ai-settings-service';
import { getRecipe, recipePayloadFromDetail, RecipeNotFoundError } from './recipe-service';
import {
  readRegularRecipeImage,
  removeRecipeImage,
  storeRecipeImage,
} from '@/lib/storage/recipe-image-storage';

type Owner = { userId: string; profileId: string; linkedProfileId: string };
type Row = typeof recipeImageCandidates.$inferSelect;
export class RecipeImageCandidateError extends Error {
  constructor(
    readonly status: 403 | 404 | 409 | 422,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function assertOwner(owner: Owner) {
  if (!owner.userId || owner.profileId !== owner.linkedProfileId)
    throw new RecipeImageCandidateError(
      403,
      'image_owner_required',
      'Use your own account profile to review this generated image.',
    );
}
function publicCandidate(row: Row): RecipeImageCandidate {
  return {
    id: row.id,
    recipeId: row.recipeId,
    sourceRevision: row.sourceRevision,
    status: row.status as RecipeImageCandidate['status'],
    altText: row.altText,
    width: row.width,
    height: row.height,
    model: row.model,
    quality: row.quality as RecipeImageCandidate['quality'],
    size: row.size as RecipeImageCandidate['size'],
    promptVersion: row.promptVersion,
    imageId: row.acceptedImageId,
    createdAt: row.createdAt.toISOString(),
  };
}
function find(owner: Owner, recipeId: string, id: string): Row {
  ensureDatabase();
  assertOwner(owner);
  const row = getDatabase()
    .select()
    .from(recipeImageCandidates)
    .where(eq(recipeImageCandidates.id, id))
    .get();
  if (
    !row ||
    row.ownerUserId !== owner.userId ||
    row.profileId !== owner.profileId ||
    row.recipeId !== recipeId
  )
    throw new RecipeImageCandidateError(
      404,
      'image_candidate_not_found',
      'This generated image request is not available for this account and recipe.',
    );
  return row;
}
export function getRecipeImageCandidate(owner: Owner, recipeId: string, id: string) {
  return publicCandidate(find(owner, recipeId, id));
}
export async function getRecipeImageCandidateFile(owner: Owner, recipeId: string, id: string) {
  const row = find(owner, recipeId, id);
  if (!['ready', 'accepted'].includes(row.status) || !row.storageKey)
    throw new RecipeImageCandidateError(
      404,
      'image_not_ready',
      'This request has no image available for review.',
    );
  return readRegularRecipeImage(row.storageKey);
}
export async function prepareRecipeImageCandidate(
  owner: Owner,
  recipeId: string,
  raw: RecipeImagePreviewRequest,
  signal?: AbortSignal,
): Promise<RecipeImageCandidate> {
  ensureDatabase();
  assertOwner(owner);
  const input = recipeImagePreviewRequestSchema.parse(raw);
  const intentHash = createHash('sha256')
    .update(
      JSON.stringify({
        recipeId,
        profileId: owner.profileId,
        expectedRevision: input.expectedRevision,
        quality: input.quality ?? null,
        size: input.size ?? null,
      }),
    )
    .digest('hex');
  const existing = getDatabase()
    .select()
    .from(recipeImageCandidates)
    .where(eq(recipeImageCandidates.id, input.operationId))
    .get();
  // Exact acknowledged replay is local, even if the provider or configuration has since changed.
  if (existing) {
    const row = find(owner, recipeId, input.operationId);
    if (row.intentHash !== intentHash)
      throw new RecipeImageCandidateError(
        409,
        'image_request_changed',
        'This request belongs to different reviewed options. Review a new request explicitly.',
      );
    return publicCandidate(row);
  }
  const recipe = getRecipe(recipeId, owner.profileId);
  if (!recipe) throw new RecipeNotFoundError('That recipe no longer exists.');
  if (recipe.currentRevision !== input.expectedRevision)
    throw new RecipeImageCandidateError(
      409,
      'recipe_changed',
      'The recipe changed. Refresh it and review the current version before generating an image.',
    );
  const setting = getAiWorkloadSetting(owner.profileId, 'image_generation');
  if (!setting.enabled || !getAiReadiness().enabled)
    throw new AiOperationError(
      'ai_not_configured',
      'Recipe image generation is unavailable in the current account or server settings.',
    );
  if (!getAiDataPolicy(owner.profileId).shareSharedRecipes)
    throw new RecipeImageCandidateError(
      403,
      'recipe_sharing_disabled',
      'Allow shared recipes in your AI privacy settings before sending this recipe to OpenAI.',
    );
  const quality = input.quality ?? setting.imageQuality ?? 'low';
  const size = input.size ?? setting.imageSize ?? '1024x1024';
  if (
    !setting.allowPersonalImageOverrides &&
    (quality !== (setting.imageQuality ?? 'low') || size !== (setting.imageSize ?? '1024x1024'))
  )
    throw new RecipeImageCandidateError(
      403,
      'image_override_disabled',
      'Image quality and framing are controlled by the administrator.',
    );
  assertAiRateLimit(owner.profileId);
  const now = new Date();
  const auditId = randomUUID();
  const promptVersion = `${RECIPE_IMAGE_PROMPT_VERSION}:${setting.promptVersion ?? 'default'}`;
  getDatabase().transaction((transaction) => {
    transaction
      .insert(recipeImageCandidates)
      .values({
        id: input.operationId,
        recipeId,
        sourceRevision: input.expectedRevision,
        ownerUserId: owner.userId,
        profileId: owner.profileId,
        intentHash,
        status: 'requested',
        model: setting.model,
        quality,
        size,
        promptVersion,
        auditId,
        createdAt: now,
      })
      .run();
    transaction
      .insert(aiOperationAudits)
      .values({
        id: auditId,
        kind: 'image-generation',
        status: 'requested',
        sourceDigest: intentHash,
        sourceLabel: recipe.title.slice(0, 160),
        provider: 'OpenAI',
        model: setting.model,
        promptVersion,
        profileId: owner.profileId,
        recipeId,
        createdAt: now,
      })
      .run();
  });
  let storageKey: string | null = null;
  let providerStarted = false;
  let providerCompleted = false;
  try {
    const generated = await withAiExecutionContext({ signal }, () =>
      executeAiWorkload(
        owner.profileId,
        'image_generation',
        async (options) => {
          providerStarted = true;
          const result = await getAiProvider().generateRecipeImage(
            recipeImageInput(recipePayloadFromDetail(recipe)),
            options,
          );
          providerCompleted = true;
          return result;
        },
        { ...setting, imageQuality: quality, imageSize: size },
      ),
    );
    signal?.throwIfAborted();
    const stored = await storeRecipeImage(input.operationId, generated.bytes);
    storageKey = stored.storageKey;
    getDatabase().transaction((transaction) => {
      const current = transaction
        .select()
        .from(recipeImageCandidates)
        .where(eq(recipeImageCandidates.id, input.operationId))
        .get();
      if (current?.status !== 'requested') return;
      transaction
        .update(recipeImageCandidates)
        .set({ status: 'ready', ...stored, altText: generated.altText })
        .where(eq(recipeImageCandidates.id, input.operationId))
        .run();
      transaction
        .update(aiOperationAudits)
        .set({ status: 'succeeded', completedAt: new Date() })
        .where(eq(aiOperationAudits.id, auditId))
        .run();
    });
    const result = find(owner, recipeId, input.operationId);
    if (result.status !== 'ready') await removeRecipeImage(storageKey);
    return publicCandidate(result);
  } catch (error) {
    const explicitFailure =
      error instanceof Error &&
      'generationOutcome' in error &&
      error.generationOutcome === 'failed';
    const unknown = providerStarted && !providerCompleted && !explicitFailure;
    if (storageKey) await removeRecipeImage(storageKey).catch(() => undefined);
    getDatabase().transaction((transaction) => {
      const current = transaction
        .select()
        .from(recipeImageCandidates)
        .where(eq(recipeImageCandidates.id, input.operationId))
        .get();
      if (current?.status === 'requested') {
        transaction
          .update(recipeImageCandidates)
          .set({ status: unknown ? 'outcome_unknown' : 'failed' })
          .where(eq(recipeImageCandidates.id, input.operationId))
          .run();
        transaction
          .update(aiOperationAudits)
          .set({
            status: unknown ? 'outcome_unknown' : 'failed',
            errorCode: unknown
              ? 'image_generation_outcome_unknown'
              : signal?.aborted
                ? 'image_request_interrupted'
                : 'image_preview_failed',
            completedAt: new Date(),
          })
          .where(eq(aiOperationAudits.id, auditId))
          .run();
      }
    });
    return publicCandidate(find(owner, recipeId, input.operationId));
  }
}
export function acceptRecipeImageCandidate(
  owner: Owner,
  recipeId: string,
  id: string,
): RecipeImageCandidate {
  const row = find(owner, recipeId, id);
  if (row.status === 'accepted') return publicCandidate(row);
  if (row.status !== 'ready' || !row.storageKey || !row.width || !row.height)
    throw new RecipeImageCandidateError(
      409,
      'image_not_ready',
      'Review an available image before adding it to the recipe.',
    );
  getDatabase().transaction((transaction) => {
    const latest = transaction
      .select()
      .from(recipeImageCandidates)
      .where(eq(recipeImageCandidates.id, id))
      .get();
    if (latest?.status === 'accepted') return;
    if (latest?.status !== 'ready')
      throw new RecipeImageCandidateError(
        409,
        'image_not_ready',
        'The image review state changed. Refresh this request.',
      );
    const recipe = transaction.select().from(recipes).where(eq(recipes.id, recipeId)).get();
    if (recipe?.currentRevision !== row.sourceRevision)
      throw new RecipeImageCandidateError(
        409,
        'recipe_changed',
        'The recipe changed after generation. Keep its current photos and review a new image for the current version.',
      );
    const imageId = randomUUID();
    transaction
      .insert(recipeImages)
      .values({
        id: imageId,
        recipeId,
        storageKey: row.storageKey!,
        altText: row.altText,
        width: row.width!,
        height: row.height!,
        createdByProfileId: owner.profileId,
        createdAt: new Date(),
      })
      .run();
    transaction
      .update(recipeImageCandidates)
      .set({ status: 'accepted', acceptedImageId: imageId })
      .where(eq(recipeImageCandidates.id, id))
      .run();
    transaction
      .update(aiOperationAudits)
      .set({ generatedImageId: imageId })
      .where(eq(aiOperationAudits.id, row.auditId))
      .run();
  });
  return publicCandidate(find(owner, recipeId, id));
}
export async function discardRecipeImageCandidate(owner: Owner, recipeId: string, id: string) {
  const row = find(owner, recipeId, id);
  if (row.status === 'accepted')
    throw new RecipeImageCandidateError(
      409,
      'image_already_accepted',
      'This photo is already saved. Use the recipe photo controls to remove it.',
    );
  getDatabase()
    .update(recipeImageCandidates)
    .set({ status: 'discarded' })
    .where(eq(recipeImageCandidates.id, id))
    .run();
  if (row.status === 'requested' || row.status === 'outcome_unknown')
    getDatabase()
      .update(aiOperationAudits)
      .set({ status: 'failed', errorCode: 'image_preview_discarded', completedAt: new Date() })
      .where(eq(aiOperationAudits.id, row.auditId))
      .run();
  if (row.storageKey) await removeRecipeImage(row.storageKey);
  return publicCandidate(find(owner, recipeId, id));
}
