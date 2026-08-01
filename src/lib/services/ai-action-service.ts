import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  aiActionPreviewImages,
  aiActionProposals,
  aiOperationAudits,
  mealPlanEntries,
  mealPlanLeftoverLinks,
  nutritionMealAllocationVersions,
  recipeImages,
} from '@/lib/db/schema';
import {
  aiActionKindSchema,
  aiMealPlanCandidateSchema,
  type AiMealPlanCandidate,
} from '@/lib/domain/ai-assistant';
import { manualConsumptionRequestSchema } from '@/lib/domain/nutrition-food-diary';
import {
  mealPlanEntrySchema,
  mealPlanEntryUpdateSchema,
  type MealPlanBatchInput,
} from '@/lib/domain/planning';
import { recipeInputSchema } from '@/lib/domain/recipe';
import { appendManualConsumption } from '@/lib/services/nutrition-food-diary-service';
import { appendNutritionMealAllocationVersionInTransaction } from '@/lib/services/nutrition-intake-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import {
  addMealPlanEntryWithNutrition,
  automaticAllocationHook,
  removeMealPlanEntryWithNutrition,
  updateMealPlanEntryWithNutrition,
} from '@/lib/services/nutrition-planning-orchestration-service';
import { insertMealPlanEntriesInTransaction } from '@/lib/services/planning-service';
import {
  createRecipeInTransaction,
  updateRecipeWithIntegrations,
} from '@/lib/services/recipe-service';
import { removeRecipeImage } from '@/lib/storage/recipe-image-storage';

const ACTION_LIFETIME_MS = 24 * 60 * 60 * 1_000;

const recipeCreatePayloadSchema = z.object({ recipe: recipeInputSchema }).strict();
const recipeBatchCreatePayloadSchema = z
  .object({
    recipes: z.array(recipeInputSchema).min(1).max(12),
    generateRecipeImages: z.boolean().default(false),
  })
  .strict();
const recipeUpdatePayloadSchema = z
  .object({
    recipeId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    recipe: recipeInputSchema,
  })
  .strict();
const mealPlanChangePayloadSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('add'), entry: mealPlanEntrySchema }).strict(),
  z
    .object({
      operation: z.literal('edit'),
      entryId: z.string().uuid(),
      entry: mealPlanEntryUpdateSchema,
    })
    .strict(),
  z.object({ operation: z.literal('remove'), entryId: z.string().uuid() }).strict(),
]);
const generatedPlanPayloadSchema = z
  .object({
    candidate: aiMealPlanCandidateSchema,
    occupiedSlotMode: z.enum(['keep', 'replace', 'review']),
    selectedProfileIds: z.array(z.string().uuid()).max(20).default([]),
    generateRecipeImages: z.boolean().default(false),
    conflicts: z
      .array(
        z
          .object({
            entryId: z.string().uuid(),
            plannedFor: z.string(),
            meal: z.string(),
            title: z.string(),
            expectedUpdatedAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(35)
      .default([]),
  })
  .strict();
const nutritionEntryPayloadSchema = z.object({ entry: manualConsumptionRequestSchema }).strict();

export class AiActionNotFoundError extends Error {}
export class AiActionConflictError extends Error {}
export class AiActionForbiddenError extends Error {}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function publicAction(row: typeof aiActionProposals.$inferSelect) {
  return {
    id: row.id,
    threadId: row.threadId,
    profileId: row.profileId,
    kind: aiActionKindSchema.parse(row.kind),
    status: row.status,
    preview: JSON.parse(row.preview) as unknown,
    result: row.result ? (JSON.parse(row.result) as unknown) : null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

export function createAiActionProposal(input: {
  threadId?: string | null;
  profileId: string;
  kind: z.infer<typeof aiActionKindSchema>;
  payload: unknown;
  preview: unknown;
}) {
  ensureDatabase();
  const now = new Date();
  const row: typeof aiActionProposals.$inferInsert = {
    id: randomUUID(),
    threadId: input.threadId ?? null,
    profileId: input.profileId,
    kind: input.kind,
    status: 'pending',
    payload: JSON.stringify(input.payload),
    preview: JSON.stringify(input.preview),
    sourceDigest: digest(input.payload),
    result: null,
    expiresAt: new Date(now.getTime() + ACTION_LIFETIME_MS),
    createdAt: now,
    decidedAt: null,
  };
  getDatabase().insert(aiActionProposals).values(row).run();
  return publicAction(row as typeof aiActionProposals.$inferSelect);
}

export function getAiActionProposal(actionId: string, profileId: string) {
  ensureDatabase();
  const row = getDatabase()
    .select()
    .from(aiActionProposals)
    .where(eq(aiActionProposals.id, actionId))
    .get();
  if (!row) throw new AiActionNotFoundError('That AI action no longer exists.');
  if (row.profileId !== profileId) {
    throw new AiActionForbiddenError('That AI action belongs to another profile.');
  }
  return { row, action: publicAction(row) };
}

export function listAiActionProposals(threadId: string, profileId: string) {
  ensureDatabase();
  return getDatabase()
    .select()
    .from(aiActionProposals)
    .where(
      and(eq(aiActionProposals.threadId, threadId), eq(aiActionProposals.profileId, profileId)),
    )
    .orderBy(aiActionProposals.createdAt)
    .all()
    .map(publicAction);
}

function commitGeneratedPlan(
  candidate: AiMealPlanCandidate,
  occupiedSlotMode: 'keep' | 'replace' | 'review',
  selectedProfileIds: string[],
  previewConflicts: Array<{ entryId: string; expectedUpdatedAt: string }>,
  conflictResolutions: Array<{ entryId: string; resolution: 'keep' | 'replace' }>,
  profileId: string,
) {
  const database = getDatabase();
  const result = {
    recipeIds: [] as string[],
    mealIds: [] as string[],
    leftoverLinkIds: [] as string[],
    imageInputs: [] as Array<{
      recipeId: string;
      recipeTitle: string;
      recipeSummary: string;
      ingredientNames: string[];
    }>,
  };
  database.transaction((transaction) => {
    const targetSlots = new Set(
      candidate.entries.map((entry) => `${entry.plannedFor}:${entry.meal}`),
    );
    const start = candidate.entries.map((entry) => entry.plannedFor).sort()[0]!;
    const end = candidate.entries
      .map((entry) => entry.plannedFor)
      .sort()
      .at(-1)!;
    const meals = [...new Set(candidate.entries.map((entry) => entry.meal))];
    const occupied = transaction
      .select({
        id: mealPlanEntries.id,
        plannedFor: mealPlanEntries.plannedFor,
        meal: mealPlanEntries.meal,
      })
      .from(mealPlanEntries)
      .where(
        and(
          gte(mealPlanEntries.plannedFor, start),
          lte(mealPlanEntries.plannedFor, end),
          inArray(mealPlanEntries.meal, meals),
        ),
      )
      .all()
      .filter((entry) => targetSlots.has(`${entry.plannedFor}:${entry.meal}`));
    if (occupiedSlotMode === 'keep' && occupied.length) {
      throw new AiActionConflictError(
        'A meal was added after this preview was generated. Review a fresh plan.',
      );
    }
    const previewConflictById = new Map(
      previewConflicts.map((conflict) => [conflict.entryId, conflict]),
    );
    const resolutionById = new Map(
      conflictResolutions.map((resolution) => [resolution.entryId, resolution.resolution]),
    );
    if (occupiedSlotMode === 'review') {
      for (const entry of occupied) {
        const preview = previewConflictById.get(entry.id);
        if (!preview) {
          throw new AiActionConflictError(
            'A meal was added after this preview was generated. Review a fresh plan.',
          );
        }
        const current = transaction
          .select({ updatedAt: mealPlanEntries.updatedAt })
          .from(mealPlanEntries)
          .where(eq(mealPlanEntries.id, entry.id))
          .get();
        if (!current || current.updatedAt.toISOString() !== preview.expectedUpdatedAt) {
          throw new AiActionConflictError(
            'A planned meal changed after this preview was generated. Review a fresh plan.',
          );
        }
        if (!resolutionById.has(entry.id)) {
          throw new AiActionConflictError('Choose keep or replace for every occupied meal slot.');
        }
      }
    }
    const keptSlots = new Set(
      occupied.flatMap((entry) =>
        occupiedSlotMode === 'review' && resolutionById.get(entry.id) === 'keep'
          ? [`${entry.plannedFor}:${entry.meal}`]
          : [],
      ),
    );
    const entriesToCreate = candidate.entries.filter(
      (entry) => !keptSlots.has(`${entry.plannedFor}:${entry.meal}`),
    );
    const referencedGeneratedKeys = new Set(
      entriesToCreate.flatMap((entry) => (entry.newRecipeKey ? [entry.newRecipeKey] : [])),
    );
    const recipeIdsByKey = new Map<string, string>();
    for (const generated of candidate.newRecipes.filter((recipe) =>
      referencedGeneratedKeys.has(recipe.key),
    )) {
      if (recipeIdsByKey.has(generated.key)) {
        throw new AiActionConflictError('The generated plan repeated a recipe key.');
      }
      const recipeId = createRecipeInTransaction(transaction, generated.recipe, profileId);
      recipeIdsByKey.set(generated.key, recipeId);
      result.recipeIds.push(recipeId);
      result.imageInputs.push({
        recipeId,
        recipeTitle: generated.recipe.title,
        recipeSummary: generated.recipe.summary,
        ingredientNames: generated.recipe.ingredientGroups.flatMap((group) =>
          group.ingredients.map((ingredient) => ingredient.item),
        ),
      });
    }
    if (occupiedSlotMode === 'replace' || occupiedSlotMode === 'review') {
      for (const entry of occupied) {
        if (occupiedSlotMode === 'review' && resolutionById.get(entry.id) !== 'replace') continue;
        const allocated = transaction
          .select({ id: nutritionMealAllocationVersions.id })
          .from(nutritionMealAllocationVersions)
          .where(eq(nutritionMealAllocationVersions.mealPlanEntryId, entry.id))
          .get();
        if (allocated) {
          transaction
            .update(mealPlanEntries)
            .set({ status: 'cancelled', updatedByProfileId: profileId, updatedAt: new Date() })
            .where(eq(mealPlanEntries.id, entry.id))
            .run();
        } else {
          transaction.delete(mealPlanEntries).where(eq(mealPlanEntries.id, entry.id)).run();
        }
      }
    }
    const input: MealPlanBatchInput = {
      entries: entriesToCreate.map((entry) => ({
        plannedFor: entry.plannedFor,
        meal: entry.meal,
        recipeId: entry.existingRecipeId ?? recipeIdsByKey.get(entry.newRecipeKey ?? '') ?? '',
        title: entry.title,
        servings: entry.servings,
        note: entry.note,
      })),
    };
    if (!input.entries.length) return;
    const entries = insertMealPlanEntriesInTransaction(transaction, input, profileId);
    result.mealIds.push(...entries.map((entry) => entry.id));
    const insertedByKey = new Map(
      entriesToCreate.map((entry, index) => [
        entry.entryKey ?? `${entry.plannedFor}:${entry.meal}`,
        entries[index]!,
      ]),
    );
    if (selectedProfileIds.length) {
      const household = resolveNutritionHouseholdContext({
        profileId,
        source: 'profile-cookie',
      });
      const nutritionByHouseholdId = new Map(
        household.householdNutritionProfiles.flatMap((nutritionProfile) =>
          nutritionProfile.linkedHouseholdProfileId
            ? [[nutritionProfile.linkedHouseholdProfileId, nutritionProfile] as const]
            : [],
        ),
      );
      for (const allocation of candidate.allocations) {
        const meal = insertedByKey.get(allocation.entryKey);
        if (!meal) continue;
        const nutritionProfile = nutritionByHouseholdId.get(allocation.householdProfileId);
        if (!nutritionProfile || !selectedProfileIds.includes(allocation.householdProfileId)) {
          throw new AiActionConflictError('A selected Nutrition profile is no longer available.');
        }
        appendNutritionMealAllocationVersionInTransaction(
          transaction,
          nutritionProfile.id,
          {
            householdProfileId: profileId,
            compatibilityPrincipalId: household.compatibilityPrincipalId,
          },
          {
            mealPlanEntryId: meal.id,
            cookSessionId: null,
            state: 'planned',
            servings: allocation.servings,
            portionWeightGrams: null,
            intakeSeriesId: null,
            supersedesAllocationVersionId: null,
            note: 'Allocated by the reviewed meal-plan proposal.',
          },
        );
      }
    } else {
      automaticAllocationHook()?.(transaction, entries);
    }
    for (const link of candidate.leftoverLinks) {
      const source = insertedByKey.get(link.sourceEntryKey);
      const destination = insertedByKey.get(link.destinationEntryKey);
      if (!source || !destination) continue;
      const id = randomUUID();
      transaction
        .insert(mealPlanLeftoverLinks)
        .values({
          id,
          sourceEntryId: source.id,
          destinationEntryId: destination.id,
          servings: link.servings,
          createdByProfileId: profileId,
          createdAt: new Date(),
        })
        .run();
      result.leftoverLinkIds.push(id);
    }
  });
  return result;
}

function execute(
  row: typeof aiActionProposals.$inferSelect,
  conflictResolutions: Array<{ entryId: string; resolution: 'keep' | 'replace' }> = [],
): unknown {
  const payload = JSON.parse(row.payload) as unknown;
  switch (aiActionKindSchema.parse(row.kind)) {
    case 'recipe_create': {
      const parsed = recipeCreatePayloadSchema.parse(payload);
      let recipeId = '';
      let imageId: string | null = null;
      getDatabase().transaction((transaction) => {
        recipeId = createRecipeInTransaction(transaction, parsed.recipe, row.profileId);
        const previewImage = transaction
          .select()
          .from(aiActionPreviewImages)
          .where(eq(aiActionPreviewImages.actionId, row.id))
          .get();
        if (previewImage) {
          imageId = previewImage.imageId;
          transaction
            .insert(recipeImages)
            .values({
              id: previewImage.imageId,
              recipeId,
              storageKey: previewImage.storageKey,
              altText: previewImage.altText,
              width: previewImage.width,
              height: previewImage.height,
              createdByProfileId: row.profileId,
              createdAt: previewImage.createdAt,
            })
            .run();
          transaction
            .delete(aiActionPreviewImages)
            .where(eq(aiActionPreviewImages.actionId, row.id))
            .run();
          transaction
            .update(aiOperationAudits)
            .set({ recipeId, generatedImageId: previewImage.imageId })
            .where(eq(aiOperationAudits.actionId, row.id))
            .run();
        }
      });
      return { recipeId, imageId };
    }
    case 'recipe_batch_create': {
      const parsed = recipeBatchCreatePayloadSchema.parse(payload);
      const recipeIds: string[] = [];
      getDatabase().transaction((transaction) => {
        for (const recipe of parsed.recipes) {
          recipeIds.push(createRecipeInTransaction(transaction, recipe, row.profileId));
        }
      });
      return {
        recipeIds,
        imageInputs: parsed.generateRecipeImages
          ? parsed.recipes.map((recipe, index) => ({
              recipeId: recipeIds[index]!,
              recipeTitle: recipe.title,
              recipeSummary: recipe.summary,
              ingredientNames: recipe.ingredientGroups.flatMap((group) =>
                group.ingredients.map((ingredient) => ingredient.item),
              ),
            }))
          : [],
      };
    }
    case 'recipe_update': {
      const parsed = recipeUpdatePayloadSchema.parse(payload);
      return {
        recipeId: updateRecipeWithIntegrations(
          parsed.recipeId,
          parsed.recipe,
          row.profileId,
          parsed.expectedRevision,
        ).recipe.id,
      };
    }
    case 'meal_plan_change': {
      const parsed = mealPlanChangePayloadSchema.parse(payload);
      if (parsed.operation === 'add') {
        return { mealId: addMealPlanEntryWithNutrition(parsed.entry, row.profileId).id };
      }
      if (parsed.operation === 'edit') {
        return {
          mealId: updateMealPlanEntryWithNutrition(parsed.entryId, parsed.entry, row.profileId).id,
        };
      }
      removeMealPlanEntryWithNutrition(parsed.entryId, row.profileId);
      return { mealId: parsed.entryId, removed: true };
    }
    case 'meal_plan_generate': {
      const parsed = generatedPlanPayloadSchema.parse(payload);
      return commitGeneratedPlan(
        parsed.candidate,
        parsed.occupiedSlotMode,
        parsed.selectedProfileIds,
        parsed.conflicts,
        conflictResolutions,
        row.profileId,
      );
    }
    case 'nutrition_entry': {
      const parsed = nutritionEntryPayloadSchema.parse(payload);
      const household = resolveNutritionHouseholdContext({
        profileId: row.profileId,
        source: 'profile-cookie',
      });
      const revision = appendManualConsumption(
        household.activeNutritionProfile.id,
        {
          householdProfileId: household.actor.profileId,
          compatibilityPrincipalId: household.compatibilityPrincipalId,
        },
        parsed.entry,
      );
      return { nutritionRevisionId: revision.id };
    }
  }
}

function detachPreviewImage(actionId: string): string | null {
  const image = getDatabase()
    .select({ storageKey: aiActionPreviewImages.storageKey })
    .from(aiActionPreviewImages)
    .where(eq(aiActionPreviewImages.actionId, actionId))
    .get();
  if (image) {
    getDatabase()
      .delete(aiActionPreviewImages)
      .where(eq(aiActionPreviewImages.actionId, actionId))
      .run();
  }
  return image?.storageKey ?? null;
}

async function removeDetachedPreview(storageKey: string | null): Promise<void> {
  if (storageKey) await removeRecipeImage(storageKey).catch(() => undefined);
}

export async function decideAiAction(
  actionId: string,
  profileId: string,
  decision: 'confirm' | 'cancel',
  conflictResolutions: Array<{ entryId: string; resolution: 'keep' | 'replace' }> = [],
) {
  const { row, action } = getAiActionProposal(actionId, profileId);
  if (row.status !== 'pending') return action;
  if (row.expiresAt.getTime() <= Date.now()) {
    const expired = getDatabase()
      .update(aiActionProposals)
      .set({ status: 'expired', decidedAt: new Date() })
      .where(and(eq(aiActionProposals.id, row.id), eq(aiActionProposals.status, 'pending')))
      .run();
    if (expired.changes === 1) {
      await removeDetachedPreview(detachPreviewImage(row.id));
    }
    throw new AiActionConflictError('That AI preview expired. Generate it again.');
  }
  if (digest(JSON.parse(row.payload)) !== row.sourceDigest) {
    throw new AiActionConflictError('That AI preview failed its integrity check.');
  }
  if (decision === 'cancel') {
    const cancelled = getDatabase()
      .update(aiActionProposals)
      .set({ status: 'cancelled', decidedAt: new Date() })
      .where(and(eq(aiActionProposals.id, row.id), eq(aiActionProposals.status, 'pending')))
      .run();
    if (cancelled.changes === 1) {
      await removeDetachedPreview(detachPreviewImage(row.id));
    }
    return getAiActionProposal(actionId, profileId).action;
  }
  let claimed = false;
  try {
    // Keep the compare-and-set claim observable to concurrent confirmations.
    await Promise.resolve();
    const claim = getDatabase()
      .update(aiActionProposals)
      .set({ status: 'executing' })
      .where(and(eq(aiActionProposals.id, row.id), eq(aiActionProposals.status, 'pending')))
      .run();
    if (claim.changes !== 1) {
      throw new AiActionConflictError('That AI action was already decided.');
    }
    claimed = true;
    const result = execute(row, conflictResolutions);
    let storedResult = result;
    if (row.kind === 'meal_plan_generate') {
      const payload = generatedPlanPayloadSchema.parse(JSON.parse(row.payload));
      const planResult = result as {
        recipeIds: string[];
        mealIds: string[];
        leftoverLinkIds: string[];
        imageInputs: Array<{
          recipeId: string;
          recipeTitle: string;
          recipeSummary: string;
          ingredientNames: string[];
        }>;
      };
      const { imageInputs, ...persistedPlanResult } = planResult;
      let imageJobId: string | null = null;
      if (payload.generateRecipeImages && imageInputs.length) {
        try {
          const { enqueueRecipeImageJob } = await import('@/lib/services/ai-job-service');
          imageJobId =
            enqueueRecipeImageJob({
              profileId: row.profileId,
              threadId: row.threadId,
              actionId: row.id,
              images: imageInputs,
            })?.id ?? null;
        } catch {
          // The reviewed plan is already committed. A later retry can regenerate images.
        }
      }
      storedResult = { ...persistedPlanResult, imageJobId };
    }
    if (row.kind === 'recipe_batch_create') {
      const batchResult = result as {
        recipeIds: string[];
        imageInputs: Array<{
          recipeId: string;
          recipeTitle: string;
          recipeSummary: string;
          ingredientNames: string[];
        }>;
      };
      const { imageInputs, ...persistedBatchResult } = batchResult;
      let imageJobId: string | null = null;
      if (imageInputs.length) {
        try {
          const { enqueueRecipeImageJob } = await import('@/lib/services/ai-job-service');
          imageJobId =
            enqueueRecipeImageJob({
              profileId: row.profileId,
              threadId: row.threadId,
              actionId: row.id,
              images: imageInputs,
            })?.id ?? null;
        } catch {
          // Recipes remain saved even if creating the optional image task fails.
        }
      }
      storedResult = { ...persistedBatchResult, imageJobId };
    }
    const updated = getDatabase()
      .update(aiActionProposals)
      .set({ status: 'confirmed', result: JSON.stringify(storedResult), decidedAt: new Date() })
      .where(and(eq(aiActionProposals.id, row.id), eq(aiActionProposals.status, 'executing')))
      .run();
    if (updated.changes !== 1) {
      throw new AiActionConflictError('That AI action was already decided.');
    }
    return getAiActionProposal(actionId, profileId).action;
  } catch (error) {
    if (claimed) {
      getDatabase()
        .update(aiActionProposals)
        .set({ status: 'failed', decidedAt: new Date() })
        .where(and(eq(aiActionProposals.id, row.id), eq(aiActionProposals.status, 'executing')))
        .run();
      await removeDetachedPreview(detachPreviewImage(row.id));
    }
    if (error instanceof AiActionConflictError) throw error;
    throw error;
  }
}
