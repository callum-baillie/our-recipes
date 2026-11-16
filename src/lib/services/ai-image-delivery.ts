import 'server-only';
import { getAiReadiness } from './ai-readiness-service';
import { getAiDataPolicy, getAiWorkloadSetting } from './ai-settings-service';
import { taskExecutionMode } from './task-settings-service';

/**
 * What the chat card may offer for recipe images, computed from the same gates the paid
 * operations enforce (provider configured, image workload enabled, recipe sharing allowed).
 * This is advisory presentation data; every paid operation re-checks its gates.
 */
export type ImageDelivery = {
  available: boolean;
  /** Plain-language reason when images cannot be created. */
  reason: string | null;
  /** How many recipes would get an image. */
  count: number;
  /**
   * direct: the preview/job runs now. batch: queued with the provider's batch service, which can
   * take hours, so the person should check back later.
   */
  mode: 'direct' | 'batch';
};

function imageGate(profileId: string): { available: boolean; reason: string | null } {
  try {
    if (!getAiReadiness().enabled)
      return { available: false, reason: 'AI is not configured on this server.' };
    if (!getAiWorkloadSetting(profileId, 'image_generation').enabled)
      return { available: false, reason: 'Recipe image generation is turned off in AI settings.' };
    if (!getAiDataPolicy(profileId).shareSharedRecipes)
      return {
        available: false,
        reason: 'Recipe sharing with AI is turned off, so images cannot be created.',
      };
    return { available: true, reason: null };
  } catch {
    return { available: false, reason: 'Image generation settings could not be read.' };
  }
}

export function newRecipeCount(kind: string, payload: unknown): number {
  const value = payload as Record<string, unknown> | null;
  if (kind === 'recipe_create') return 1;
  if (kind === 'recipe_batch_create')
    return Array.isArray(value?.recipes) ? value.recipes.length : 0;
  if (kind === 'meal_plan_generate') {
    const candidate = value?.candidate as { newRecipes?: unknown } | undefined;
    return Array.isArray(candidate?.newRecipes) ? candidate.newRecipes.length : 0;
  }
  return 0;
}

export function describeImageDelivery(
  profileId: string,
  kind: string,
  payload: unknown,
): ImageDelivery | null {
  const count = newRecipeCount(kind, payload);
  if (!count) return null;
  const gate = imageGate(profileId);
  return {
    ...gate,
    count,
    // A single draft preview is generated immediately; saved-recipe images follow the task mode.
    mode: kind === 'recipe_create' ? 'direct' : taskExecutionMode(profileId, count),
  };
}

export const IMAGE_BATCH_NOTICE =
  'Images are created in the background as a batch. This may take a while — check back later.';
