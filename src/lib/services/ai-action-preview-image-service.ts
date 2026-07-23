import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { aiActionPreviewImages, aiActionProposals, aiOperationAudits } from '@/lib/db/schema';
import type { RecipePayload } from '@/lib/domain/recipe';
import { getAiProvider, getAiReadiness } from '@/lib/services/ai-readiness-service';
import { getAiActionProposal } from '@/lib/services/ai-action-service';
import { getAiWorkloadSetting } from '@/lib/services/ai-settings-service';
import {
  readRegularRecipeImage,
  removeRecipeImage,
  storeRecipeImage,
} from '@/lib/storage/recipe-image-storage';

type PreviewImageStatus = 'ready' | 'unavailable' | 'failed';

function setPreviewImageStatus(
  actionId: string,
  status: PreviewImageStatus,
  altText?: string,
): void {
  const row = getDatabase()
    .select({ preview: aiActionProposals.preview })
    .from(aiActionProposals)
    .where(eq(aiActionProposals.id, actionId))
    .get();
  if (!row) return;
  const preview = JSON.parse(row.preview) as Record<string, unknown>;
  getDatabase()
    .update(aiActionProposals)
    .set({
      preview: JSON.stringify({
        ...preview,
        image: { status, ...(altText ? { altText } : {}) },
      }),
    })
    .where(eq(aiActionProposals.id, actionId))
    .run();
}

export async function generateAiActionPreviewImage(input: {
  actionId: string;
  profileId: string;
  recipe: RecipePayload;
}) {
  ensureDatabase();
  const { row } = getAiActionProposal(input.actionId, input.profileId);
  if (row.kind !== 'recipe_create' || row.status !== 'pending') {
    return getAiActionProposal(input.actionId, input.profileId).action;
  }
  const setting = getAiWorkloadSetting(input.profileId, 'image_generation');
  if (!setting.enabled) {
    setPreviewImageStatus(input.actionId, 'unavailable');
    return getAiActionProposal(input.actionId, input.profileId).action;
  }
  if (!getAiReadiness().enabled) {
    setPreviewImageStatus(input.actionId, 'unavailable');
    return getAiActionProposal(input.actionId, input.profileId).action;
  }

  const now = new Date();
  const auditId = randomUUID();
  getDatabase()
    .insert(aiOperationAudits)
    .values({
      id: auditId,
      kind: 'image-generation',
      status: 'requested',
      sourceDigest: createHash('sha256').update(JSON.stringify(input.recipe)).digest('hex'),
      sourceLabel: input.recipe.title.slice(0, 160),
      provider: 'OpenAI',
      model: setting.model,
      reasoningEffort: null,
      inputTokens: null,
      outputTokens: null,
      threadId: row.threadId,
      actionId: row.id,
      summaryId: null,
      errorCode: null,
      profileId: input.profileId,
      recipeId: null,
      importId: null,
      generatedImageId: null,
      createdAt: now,
      completedAt: null,
    })
    .run();

  let storageKey: string | null = null;
  try {
    const generated = await getAiProvider().generateRecipeImage(
      {
        recipeTitle: input.recipe.title,
        recipeSummary: input.recipe.summary,
        ingredientNames: input.recipe.ingredientGroups.flatMap((group) =>
          group.ingredients.map((ingredient) => ingredient.item),
        ),
      },
      setting,
    );
    const imageId = randomUUID();
    const stored = await storeRecipeImage(imageId, generated.bytes);
    storageKey = stored.storageKey;
    getDatabase().transaction((transaction) => {
      transaction
        .insert(aiActionPreviewImages)
        .values({
          actionId: row.id,
          imageId,
          storageKey: stored.storageKey,
          altText: generated.altText,
          width: stored.width,
          height: stored.height,
          model: setting.model,
          createdAt: new Date(),
        })
        .run();
      const preview = JSON.parse(row.preview) as Record<string, unknown>;
      transaction
        .update(aiActionProposals)
        .set({
          preview: JSON.stringify({
            ...preview,
            image: { status: 'ready', altText: generated.altText },
          }),
        })
        .where(eq(aiActionProposals.id, row.id))
        .run();
      transaction
        .update(aiOperationAudits)
        .set({ status: 'succeeded', completedAt: new Date() })
        .where(eq(aiOperationAudits.id, auditId))
        .run();
    });
    return getAiActionProposal(input.actionId, input.profileId).action;
  } catch {
    if (storageKey) await removeRecipeImage(storageKey).catch(() => undefined);
    getDatabase()
      .update(aiOperationAudits)
      .set({ status: 'failed', errorCode: 'preview_image_failed', completedAt: new Date() })
      .where(eq(aiOperationAudits.id, auditId))
      .run();
    setPreviewImageStatus(input.actionId, 'failed');
    return getAiActionProposal(input.actionId, input.profileId).action;
  }
}

export async function getAiActionPreviewImageFile(actionId: string, profileId: string) {
  ensureDatabase();
  getAiActionProposal(actionId, profileId);
  const image = getDatabase()
    .select()
    .from(aiActionPreviewImages)
    .where(eq(aiActionPreviewImages.actionId, actionId))
    .get();
  if (!image) return null;
  try {
    return { image, data: await readRegularRecipeImage(image.storageKey) };
  } catch {
    return null;
  }
}
