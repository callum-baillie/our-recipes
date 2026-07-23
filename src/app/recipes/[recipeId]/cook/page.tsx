import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { CookingMode } from '@/components/cooking-mode';
import { RecipePantryPanel } from '@/components/recipe-pantry-panel';
import { isFavorite } from '@/lib/services/cooking-service';
import { getLatestRecipeNutritionCalculation } from '@/lib/services/nutrition-foundation-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import { getRecipePantryAvailability } from '@/lib/services/pantry-availability-service';
import { getRecipe } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export default async function CookRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ mealPlanEntryId?: string }>;
}) {
  const recipe = getRecipe((await params).recipeId);
  if (!recipe) notFound();
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const calculation = getLatestRecipeNutritionCalculation(recipe.id);
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
    <>
      <RecipePantryPanel
        initialAvailability={getRecipePantryAvailability(recipe.id)}
        products={[]}
        allowMapping={false}
      />
      <CookingMode
        recipe={recipe}
        initialFavorite={actor.profileId ? isFavorite(recipe.id, actor.profileId) : false}
        mealPlanEntryId={(await searchParams).mealPlanEntryId}
        nutritionPreparation={nutritionPreparation}
      />
    </>
  );
}
