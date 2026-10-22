import 'server-only';
import { z } from 'zod';
import type { RequestPrincipal } from './auth-service';
import { getRecipe } from './recipe-service';
import { getRecipeForPlannedMeal, getPlannedMeal } from './planning-service';
import { readCookingSessionRecipe } from './cooking-session-recipe-service';
import { DecisionError } from '@/lib/providers/decisions-provider';
const scopeSchema = z
  .object({ sessionId: z.uuid().optional(), mealEntryId: z.uuid().optional() })
  .refine((value) => !(value.sessionId && value.mealEntryId), 'Choose one effective recipe scope.');
/** Resolve private effective content before passing portable recipe content to an exporter. */
export function resolveRecipeForExport(
  principal: RequestPrincipal,
  recipeId: string,
  query: URLSearchParams,
) {
  const scope = scopeSchema.parse({
    sessionId: query.get('sessionId') ?? undefined,
    mealEntryId: query.get('mealEntryId') ?? undefined,
  });
  if (scope.sessionId) {
    const session = readCookingSessionRecipe(principal, scope.sessionId);
    if (session.recipeId !== recipeId)
      throw new DecisionError('That session belongs to another recipe.', 404);
    return session.effectiveRecipe;
  }
  if (scope.mealEntryId) {
    if (principal.kind === 'api-key' && !principal.apiPermissions?.mealPlans?.includes('read'))
      throw new DecisionError('Planned-meal export also requires mealPlans:read.', 403);
    const meal = getPlannedMeal(scope.mealEntryId);
    if (!meal || meal.recipeId !== recipeId)
      throw new DecisionError('That planned meal belongs to another recipe.', 404);
    return getRecipeForPlannedMeal(recipeId, scope.mealEntryId);
  }
  return getRecipe(recipeId);
}
