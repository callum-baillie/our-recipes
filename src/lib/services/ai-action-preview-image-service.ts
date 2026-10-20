import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { aiActionPreviewImages, aiActionProposals, aiOperationAudits } from '@/lib/db/schema';
import { recipeInputSchema, type RecipePayload } from '@/lib/domain/recipe';
import {
  recipeImageInput,
  RECIPE_IMAGE_PROMPT_VERSION,
} from '@/lib/domain/recipe-image-generation';
import { getAiProvider, getAiReadiness } from './ai-readiness-service';
import {
  getAiActionProposal,
  AiActionConflictError,
  AiActionForbiddenError,
} from './ai-action-service';
import { aiUserIdForProfile } from './ai-access-service';
import { getAiDataPolicy, getAiWorkloadSetting } from './ai-settings-service';
import { executeAiWorkload } from './ai-execution-service';
import { assertAiExecutionActive, withAiExecutionContext } from './ai-execution-context';
import {
  readRegularRecipeImage,
  removeRecipeImage,
  storeRecipeImage,
} from '@/lib/storage/recipe-image-storage';

export const draftImageRequestSchema = z
  .object({
    confirm: z.literal(true),
    operationId: z.uuid(),
    expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export function recipeDraftImageDigest(recipe: RecipePayload) {
  return createHash('sha256')
    .update(JSON.stringify(recipeInputSchema.parse(recipe)))
    .digest('hex');
}

type Review = {
  operationId: string;
  sourceDigest: string;
  ownerUserId: string;
  status: string;
  quality: string;
  size: string;
  promptVersion: string;
  auditId: string;
  altText?: string;
};
function readReview(preview: string): Review | null {
  const image = (JSON.parse(preview) as { image?: Review }).image;
  return image?.operationId ? image : null;
}
function updateReview(actionId: string, review: Review, expectedStatus?: string) {
  const current = getDatabase()
    .select()
    .from(aiActionProposals)
    .where(eq(aiActionProposals.id, actionId))
    .get();
  if (!current || (expectedStatus && current.status !== expectedStatus)) return false;
  const previous = readReview(current.preview);
  if (previous && previous.operationId !== review.operationId) return false;
  getDatabase()
    .update(aiActionProposals)
    .set({ preview: JSON.stringify({ ...JSON.parse(current.preview), image: review }) })
    .where(eq(aiActionProposals.id, actionId))
    .run();
  return true;
}
/** A separate, explicit image request. Text generation never invokes this operation. */
export async function generateAiActionPreviewImage(input: {
  actionId: string;
  profileId: string;
  ownerUserId?: string;
  recipe?: RecipePayload;
  confirm?: true;
  operationId?: string;
  expectedSourceDigest?: string;
  signal?: AbortSignal;
}) {
  ensureDatabase();
  const request = draftImageRequestSchema.parse({
    confirm: input.confirm,
    operationId: input.operationId,
    expectedSourceDigest: input.expectedSourceDigest,
  });
  const { row } = getAiActionProposal(input.actionId, input.profileId);
  const owner =
    aiUserIdForProfile(input.profileId) ??
    (process.env.NODE_ENV === 'test' ? `profile:${input.profileId}` : null);
  if (!owner || (input.ownerUserId && input.ownerUserId !== owner))
    throw new AiActionForbiddenError('Use the account that owns this recipe draft.');
  if (row.kind !== 'recipe_create')
    throw new AiActionConflictError('This draft does not support a separate recipe image.');
  const recipe = recipeInputSchema.parse(JSON.parse(row.payload).recipe);
  const sourceDigest = recipeDraftImageDigest(recipe);
  if (
    request.expectedSourceDigest !== sourceDigest ||
    (input.recipe && recipeDraftImageDigest(input.recipe) !== sourceDigest)
  )
    throw new AiActionConflictError(
      'The recipe draft changed. Review it before requesting an image.',
    );
  const previous = readReview(row.preview);
  if (previous) {
    if (
      previous.operationId === request.operationId &&
      previous.sourceDigest === sourceDigest &&
      previous.ownerUserId === owner
    )
      return getAiActionProposal(input.actionId, input.profileId).action;
    if (['requested', 'ready'].includes(previous.status))
      throw new AiActionConflictError('Review the existing image request before starting another.');
  }
  if (row.status !== 'pending')
    throw new AiActionConflictError('That recipe draft is no longer open for image generation.');
  const setting = getAiWorkloadSetting(input.profileId, 'image_generation');
  if (
    !setting.enabled ||
    !getAiReadiness().enabled ||
    !getAiDataPolicy(input.profileId).shareSharedRecipes
  )
    throw new AiActionForbiddenError(
      'Enable recipe image generation and shared recipe permission before requesting this image.',
    );
  input.signal?.throwIfAborted();
  assertAiExecutionActive();
  const auditId = randomUUID();
  const review: Review = {
    operationId: request.operationId,
    sourceDigest,
    ownerUserId: owner,
    status: 'requested',
    quality: setting.imageQuality ?? 'low',
    size: setting.imageSize ?? '1024x1024',
    promptVersion: `${RECIPE_IMAGE_PROMPT_VERSION}:${setting.promptVersion ?? 'default'}`,
    auditId,
  };
  const claimed = getDatabase().transaction(
    (tx) => {
      const current = tx
        .select()
        .from(aiActionProposals)
        .where(eq(aiActionProposals.id, row.id))
        .get();
      if (
        !current ||
        current.status !== 'pending' ||
        recipeDraftImageDigest(recipeInputSchema.parse(JSON.parse(current.payload).recipe)) !==
          sourceDigest
      )
        throw new AiActionConflictError(
          'The draft changed or closed before this request could start.',
        );
      const receipt = readReview(current.preview);
      if (
        receipt?.operationId === request.operationId &&
        receipt.sourceDigest === sourceDigest &&
        receipt.ownerUserId === owner
      )
        return false;
      if (receipt && ['requested', 'ready'].includes(receipt.status))
        throw new AiActionConflictError(
          'Review the existing image request before starting another.',
        );
      tx.insert(aiOperationAudits)
        .values({
          id: auditId,
          kind: 'image-generation',
          status: 'requested',
          sourceDigest,
          sourceLabel: recipe.title.slice(0, 160),
          provider: 'OpenAI',
          model: setting.model,
          promptVersion: review.promptVersion,
          profileId: input.profileId,
          threadId: row.threadId,
          actionId: row.id,
          createdAt: new Date(),
        })
        .run();
      // New explicit requests replace only a terminal receipt. An uncertain request is never rerun.
      tx.update(aiActionProposals)
        .set({ preview: JSON.stringify({ ...JSON.parse(current.preview), image: review }) })
        .where(eq(aiActionProposals.id, row.id))
        .run();
      return true;
    },
    { behavior: 'immediate' },
  );
  if (!claimed) return getAiActionProposal(input.actionId, input.profileId).action;
  let storageKey: string | null = null;
  try {
    const generated = await withAiExecutionContext({ signal: input.signal }, () =>
      executeAiWorkload(
        input.profileId,
        'image_generation',
        (options) => getAiProvider().generateRecipeImage(recipeImageInput(recipe), options),
        setting,
      ),
    );
    input.signal?.throwIfAborted();
    assertAiExecutionActive();
    const current = getAiActionProposal(input.actionId, input.profileId).row;
    if (
      current.status !== 'pending' ||
      recipeDraftImageDigest(recipeInputSchema.parse(JSON.parse(current.payload).recipe)) !==
        sourceDigest ||
      readReview(current.preview)?.operationId !== request.operationId
    )
      throw new AiActionConflictError(
        'The draft changed or closed while the image was being prepared.',
      );
    const imageId = randomUUID();
    const stored = await storeRecipeImage(imageId, generated.bytes);
    storageKey = stored.storageKey;
    input.signal?.throwIfAborted();
    assertAiExecutionActive();
    getDatabase().transaction((tx) => {
      if (
        !updateReview(row.id, { ...review, status: 'ready', altText: generated.altText }, 'pending')
      )
        throw new AiActionConflictError('The draft closed while the image was being prepared.');
      tx.insert(aiActionPreviewImages)
        .values({
          actionId: row.id,
          imageId,
          storageKey: stored.storageKey,
          altText: generated.altText,
          width: stored.width,
          height: stored.height,
          model: setting.model,
          sourceDigest,
          ownerUserId: owner,
          createdAt: new Date(),
        })
        .run();
      tx.update(aiOperationAudits)
        .set({ status: 'succeeded', completedAt: new Date() })
        .where(eq(aiOperationAudits.id, auditId))
        .run();
    });
    return getAiActionProposal(input.actionId, input.profileId).action;
  } catch (error) {
    if (storageKey) await removeRecipeImage(storageKey).catch(() => undefined);
    updateReview(
      row.id,
      { ...review, status: input.signal?.aborted ? 'cancelled' : 'failed' },
      'pending',
    );
    getDatabase()
      .update(aiOperationAudits)
      .set({ status: 'failed', errorCode: 'preview_image_failed', completedAt: new Date() })
      .where(eq(aiOperationAudits.id, auditId))
      .run();
    throw error;
  }
}
export async function getAiActionPreviewImageFile(actionId: string, profileId: string) {
  ensureDatabase();
  const { row } = getAiActionProposal(actionId, profileId);
  const image = getDatabase()
    .select()
    .from(aiActionPreviewImages)
    .where(eq(aiActionPreviewImages.actionId, actionId))
    .get();
  const owner =
    aiUserIdForProfile(profileId) ??
    (process.env.NODE_ENV === 'test' ? `profile:${profileId}` : null);
  if (
    !image ||
    !image.sourceDigest ||
    image.ownerUserId !== owner ||
    row.kind !== 'recipe_create' ||
    recipeDraftImageDigest(recipeInputSchema.parse(JSON.parse(row.payload).recipe)) !==
      image.sourceDigest
  )
    return null;
  try {
    return { image, data: await readRegularRecipeImage(image.storageKey) };
  } catch {
    return null;
  }
}
