import { Redirect, useLocalSearchParams } from 'expo-router';
import { RecipeDetailScreen } from '@/screens/recipe-screens';
import { useBord } from '@/state/bord-store';
export default function RecipeDetail() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const { state } = useBord();
  const recipe = state.recipes.find((entry) => entry.id === recipeId) ?? state.recipes[0];
  return recipe ? <RecipeDetailScreen recipe={recipe} /> : <Redirect href="/(app)/(recipes)" />;
}
