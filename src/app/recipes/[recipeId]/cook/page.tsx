import { restrictionsApply } from '@/lib/domain/cooking-episode';
import { getProfile } from '@/lib/services/household-service';
import { DecisionError } from '@/lib/providers/decisions-provider';
import type { Metadata } from 'next';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { readCookingSessionRecipe } from '@/lib/services/cooking-session-recipe-service';
import { getCookSessionPantryPreview } from '@/lib/services/pantry-grocery-cooking-service';
import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { CookingMode } from '@/components/cooking-mode';
import { isFavorite } from '@/lib/services/cooking-service';
import { getLatestRecipeNutritionCalculation } from '@/lib/services/nutrition-foundation-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import { getRecipePantryAvailability } from '@/lib/services/pantry-availability-service';
import { getRecipeForPlannedMeal, getPlannedMeal } from '@/lib/services/planning-service';
import { getRecipe } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}): Promise<Metadata> {
  const recipe = getRecipe((await params).recipeId);

  return {
    title: recipe ? `Cook ${recipe.title}` : 'Cooking mode',
    description: recipe
      ? `Follow ${recipe.title} step by step in Bòrd cooking mode.`
      : 'Follow a recipe step by step in Bòrd cooking mode.',
  };
}

export default async function CookRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ mealPlanEntryId?: string; sessionId?: string }>;
}) {
  const query = await searchParams;
  const principal = query.sessionId
    ? await getAuthenticatedSessionPrincipal(
        new Request('http://localhost/cook', { headers: await headers() }),
      )
    : null;
  let session: ReturnType<typeof readCookingSessionRecipe> | null = null;
  if (query.sessionId && principal) {
    try {
      session = readCookingSessionRecipe(principal, query.sessionId);
    } catch (error) {
      if (error instanceof DecisionError && error.status === 404) notFound();
      throw error;
    }
  }
  if (query.sessionId && !session) notFound();
  const mealPlanEntryId = session?.mealPlanEntryId ?? query.mealPlanEntryId;
  const meal = mealPlanEntryId ? getPlannedMeal(mealPlanEntryId) : null;
  const recipeId = (await params).recipeId;
  const recipe = session?.effectiveRecipe ?? getRecipeForPlannedMeal(recipeId, mealPlanEntryId);
  if (!recipe || recipe.id !== recipeId) notFound();
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const calculation =
    session?.ingredientReviewRequired || meal?.recipeOverride
      ? null
      : getLatestRecipeNutritionCalculation(recipe.id);
  const nutrition = actor.profileId ? resolveNutritionHouseholdContext(actor) : null;
  const nutritionPreparation =
    nutrition && calculation?.recipeRevision === recipe.currentRevision
      ? {
          profileId: nutrition.activeNutritionProfile.id,
          calculationId: calculation.id,
          finalWeightGrams: calculation.finalWeightGrams,
        }
      : null;
  return (
    <CookingMode
      key={`${session?.id ?? recipe.id}:${session?.effectiveRevision ?? recipe.currentRevision}:${session?.contextRevision ?? 0}`}
      recipe={recipe}
      initialSession={
        session
          ? {
              id: session.id,
              revision: session.effectiveRevision,
              completed: Boolean(session.completedAt),
              contextRevision: session.contextRevision,
              restrictions: session.cookingRestrictions,
              restrictionsActive: restrictionsApply(session.cookingRestrictions),
              timezone: getProfile(session.profileId)?.timezone ?? 'UTC',
              ingredientReviewRequired: session.ingredientReviewRequired,
            }
          : undefined
      }
      initialPantryPreview={
        session && actor.profileId
          ? getCookSessionPantryPreview(session.id, actor.profileId)
          : undefined
      }
      initialServings={session?.targetServings ?? meal?.servings}
      initialFavorite={actor.profileId ? isFavorite(recipe.id, actor.profileId) : false}
      mealPlanEntryId={mealPlanEntryId ?? undefined}
      nutritionPreparation={nutritionPreparation}
      pantryAvailability={getRecipePantryAvailability(
        recipe.id,
        session?.targetServings ?? meal?.servings,
        mealPlanEntryId,
        session?.effectiveRecipe,
      )}
    />
  );
}
