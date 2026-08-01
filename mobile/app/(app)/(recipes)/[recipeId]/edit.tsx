import { Redirect, useLocalSearchParams } from 'expo-router';
import { RecipeFormScreen } from '@/screens/recipe-screens';
import { useBord } from '@/state/bord-store';
export default function EditRecipe() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const { state } = useBord();
  const recipe = state.recipes.find((entry) => entry.id === recipeId) ?? state.recipes[0];
  return recipe ? <RecipeFormScreen recipe={recipe} /> : <Redirect href="/(app)/(recipes)" />;
}
