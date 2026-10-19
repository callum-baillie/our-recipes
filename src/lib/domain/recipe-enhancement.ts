import type { RecipePayload } from './recipe';

const fields = {
  title: 'Title',
  summary: 'Description',
  servings: 'Servings',
  prepMinutes: 'Prep time (minutes)',
  cookMinutes: 'Cook time (minutes)',
  restMinutes: 'Rest time (minutes)',
  ingredientGroups: 'Ingredients',
  instructionSections: 'Steps',
  category: 'Categories',
  cuisine: 'Cuisines',
  tags: 'Tags',
  difficulty: 'Difficulty',
  cookingMethod: 'Cooking method',
  equipment: 'Equipment',
  tips: 'Tips',
  nutritionCalories: 'Calories per serving (kcal)',
  nutritionProteinGrams: 'Protein per serving (g)',
  nutritionCarbohydrateGrams: 'Carbohydrates per serving (g)',
  nutritionFatGrams: 'Fat per serving (g)',
  nutritionSaturatedFatGrams: 'Saturated fat per serving (g)',
  nutritionFiberGrams: 'Fiber per serving (g)',
  nutritionSugarGrams: 'Sugar per serving (g)',
  nutritionSodiumMilligrams: 'Sodium per serving (mg)',
} as const satisfies Partial<Record<keyof RecipePayload, string>>;

export type EnhancementField = keyof typeof fields;

function display(recipe: RecipePayload, field: EnhancementField): string {
  if (field === 'ingredientGroups')
    return recipe.ingredientGroups
      .map((group) =>
        [
          group.name,
          ...group.ingredients.map((ingredient) =>
            [
              ingredient.quantity,
              ingredient.unit,
              ingredient.item,
              ingredient.note,
              `(${ingredient.shoppingCategory})`,
            ]
              .filter((value) => value !== '')
              .join(' '),
          ),
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n');
  if (field === 'instructionSections')
    return recipe.instructionSections
      .map((section) =>
        [section.title, ...section.steps.map((step, index) => `${index + 1}. ${step}`)]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n');
  const value = recipe[field];
  return Array.isArray(value) ? value.join(', ') : String(value);
}

/** Only editable recipe content participates; provenance and shared notes stay intact. */
export function recipeEnhancementDiff(before: RecipePayload, after: RecipePayload) {
  return (Object.keys(fields) as EnhancementField[]).flatMap((field) => {
    const previous = display(before, field);
    const proposed = display(after, field);
    return previous === proposed
      ? []
      : [{ field, label: fields[field], before: previous, after: proposed }];
  });
}

/** Nutrition estimates depend on the proposed ingredient amounts and serving yield. */
export function canApplyEnhancementNutrition(
  before: RecipePayload,
  after: RecipePayload,
  selected: readonly EnhancementField[],
): boolean {
  return recipeEnhancementDiff(before, after)
    .filter((change) => change.field === 'servings' || change.field === 'ingredientGroups')
    .every((change) => selected.includes(change.field));
}

export function applyRecipeEnhancement(
  before: RecipePayload,
  after: RecipePayload,
  selected: readonly EnhancementField[],
): RecipePayload {
  const nutritionAllowed = canApplyEnhancementNutrition(before, after, selected);
  return {
    ...before,
    ...Object.fromEntries(
      selected
        .filter((field) => nutritionAllowed || !field.startsWith('nutrition'))
        .map((field) => [field, after[field]]),
    ),
  };
}
