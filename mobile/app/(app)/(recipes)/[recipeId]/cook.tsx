import * as React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { CookScreen } from '@/screens/recipe-screens';
import { useBord } from '@/state/bord-store';
import { useAuth } from '@/auth/auth-context';
import { mapRecipe, type RecipeDetail } from '@/sync/sync-context';
import type { Recipe } from '@/data/types';
import { AppHeader, Body, Screen } from '@/components/ui';
export default function CookRecipe() {
  const { recipeId, mealPlanEntryId } = useLocalSearchParams<{
    recipeId: string;
    mealPlanEntryId?: string;
  }>();
  const { state } = useBord();
  const { request, assetSource } = useAuth();
  const [planned, setPlanned] = React.useState<{ key: string; recipe: Recipe } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!mealPlanEntryId) return;
    let active = true;
    void Promise.all([
      request<{ recipe: RecipeDetail }>(
        `/api/v1/recipes/${encodeURIComponent(recipeId)}?mealPlanEntryId=${encodeURIComponent(mealPlanEntryId)}`,
      ),
      request<{ meal: { servings: number } }>(
        `/api/v1/meal-plan/${encodeURIComponent(mealPlanEntryId)}`,
      ),
    ])
      .then(([detail, meal]) => {
        if (active)
          setPlanned({
            key: mealPlanEntryId,
            recipe: { ...mapRecipe(detail.recipe, assetSource), servings: meal.meal.servings },
          });
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Could not load planned recipe.');
      });
    return () => {
      active = false;
    };
  }, [recipeId, mealPlanEntryId, request, assetSource]);
  const recipe = mealPlanEntryId
    ? planned?.key === mealPlanEntryId
      ? planned.recipe
      : undefined
    : state.recipes.find((entry) => entry.id === recipeId);
  if (!recipe && mealPlanEntryId)
    return (
      <Screen>
        <AppHeader back />
        <Body>{error ?? 'Loading your planned recipe…'}</Body>
      </Screen>
    );
  return recipe ? (
    <CookScreen
      key={mealPlanEntryId ?? recipe.id}
      recipe={recipe}
      mealPlanEntryId={mealPlanEntryId}
    />
  ) : (
    <Redirect href="/(app)/(recipes)" />
  );
}
