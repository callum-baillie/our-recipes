import type { RecipePayload } from '@/lib/domain/recipe';
import type { RecipeDetail } from './recipe-service';

/** Project portable content consistently; resource assignments stay outside recipe content. */
export function projectEffectiveRecipe(
  recipe: RecipeDetail,
  baseline: RecipePayload,
  override: RecipePayload,
  namespace: string,
  revision = recipe.currentRevision,
): RecipeDetail {
  const nutritionChanged =
    JSON.stringify(override.ingredientGroups) !== JSON.stringify(baseline.ingredientGroups) ||
    override.servings !== baseline.servings;
  return {
    ...recipe,
    currentRevision: revision,
    title: override.title,
    summary: override.summary,
    servings: override.servings,
    cookingMethod: override.cookingMethod,
    prepMinutes: override.prepMinutes,
    cookMinutes: override.cookMinutes,
    restMinutes: override.restMinutes,
    equipment: override.equipment.map((name, index) => ({ id: `meal-equipment-${index}`, name })),
    equipmentRequirements: override.equipmentRequirements ?? [],
    nutritionCalories: nutritionChanged
      ? null
      : baseline.nutritionCalories === ''
        ? null
        : baseline.nutritionCalories,
    nutritionProteinGrams: nutritionChanged
      ? null
      : baseline.nutritionProteinGrams === ''
        ? null
        : baseline.nutritionProteinGrams,
    nutritionCarbohydrateGrams: nutritionChanged
      ? null
      : baseline.nutritionCarbohydrateGrams === ''
        ? null
        : baseline.nutritionCarbohydrateGrams,
    nutritionFatGrams: nutritionChanged
      ? null
      : baseline.nutritionFatGrams === ''
        ? null
        : baseline.nutritionFatGrams,
    nutritionSaturatedFatGrams: nutritionChanged
      ? null
      : baseline.nutritionSaturatedFatGrams === ''
        ? null
        : baseline.nutritionSaturatedFatGrams,
    nutritionFiberGrams: nutritionChanged
      ? null
      : baseline.nutritionFiberGrams === ''
        ? null
        : baseline.nutritionFiberGrams,
    nutritionSugarGrams: nutritionChanged
      ? null
      : baseline.nutritionSugarGrams === ''
        ? null
        : baseline.nutritionSugarGrams,
    nutritionSodiumMilligrams: nutritionChanged
      ? null
      : baseline.nutritionSodiumMilligrams === ''
        ? null
        : baseline.nutritionSodiumMilligrams,
    ingredientGroups: override.ingredientGroups.map((group, g) => ({
      id: `${namespace}-g${g}`,
      name: group.name,
      ingredients: group.ingredients.map((item, i) => ({
        ...item,
        id: `${namespace}-g${g}-i${i}`,
        quantity: item.quantity === '' ? null : item.quantity,
      })),
    })),
    instructionSections: override.instructionSections.map((section, i) => ({
      id: `${namespace}-s${i}`,
      title: section.title,
      steps: section.steps.map((body, j) => ({ id: `${namespace}-s${i}-${j}`, body })),
    })),
  };
}
