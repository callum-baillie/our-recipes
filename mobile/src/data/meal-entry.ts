export type MealIngredient = {
  quantity: number | string;
  unit: string;
  item: string;
  note: string;
  shoppingCategory: string;
  pantryProductId?: string;
};
export type MealAdaptation = {
  title: string;
  summary: string;
  servings: string;
  ingredientGroups: { name: string; ingredients: MealIngredient[] }[];
  instructionSections: { title: string; steps: string[] }[];
};
export type MealEntry = {
  id: string;
  kind: 'recipe' | 'item' | 'takeout' | 'custom' | 'leftover';
  plannedFor: string;
  meal: string;
  recipeId: string | null;
  recipeTitle: string;
  title: string;
  servings: number;
  note: string;
  updatedAt: string;
  status: 'planned' | 'skipped' | 'cancelled';
  effectiveStatus?: string;
  leftoverSourceId: string | null;
  recipeOverride: string | null;
  recipeChangedSincePlanning?: boolean;
  recipeIngredientsSnapshot?: string | null;
};
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function mealEntryPayload(input: {
  kind: MealEntry['kind'];
  date: string;
  meal: string;
  recipeId: string;
  title: string;
  servings: string;
  note: string;
  sourceId: string;
  quantity: string;
  unit: string;
  adaptation: MealAdaptation | null;
  adapt: boolean;
  original?: MealEntry | null;
  pantryProductId?: string;
}) {
  if (!validDate(input.date)) throw new Error('Enter a valid date as YYYY-MM-DD.');
  const servings = Number(input.servings);
  if (!Number.isInteger(servings) || servings < 1 || servings > 100)
    throw new Error('Use 1 to 100 servings.');
  if (input.kind === 'recipe' && !input.recipeId) throw new Error('Choose a recipe.');
  if (input.kind === 'leftover' && !input.sourceId)
    throw new Error('Choose the earlier meal these leftovers come from.');
  if (!['recipe', 'leftover'].includes(input.kind) && !input.title.trim())
    throw new Error('Enter a meal title.');
  const quantity = input.quantity.trim() ? Number(input.quantity) : '';
  if (
    input.kind === 'item' &&
    quantity !== '' &&
    (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000)
  )
    throw new Error('Use a positive food quantity no greater than 10,000.');
  if (input.adapt && !input.adaptation) throw new Error('Wait for the recipe variation to load.');
  const adaptation = input.adaptation
    ? {
        ...input.adaptation,
        ingredientGroups: input.adaptation.ingredientGroups.map((group) => ({
          ...group,
          ingredients: group.ingredients.map((ingredient) => {
            const raw = String(ingredient.quantity).trim();
            const quantity = raw ? Number(raw) : '';
            if (
              quantity !== '' &&
              (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000)
            )
              throw new Error('Ingredient quantities must be positive numbers up to 10,000.');
            return { ...ingredient, quantity };
          }),
        })),
      }
    : null;
  return {
    kind: input.kind,
    plannedFor: input.date,
    meal: input.meal,
    recipeId: input.kind === 'recipe' ? input.recipeId : '',
    title: input.title.trim(),
    servings,
    note: input.note.trim(),
    leftoverSourceId: input.kind === 'leftover' ? input.sourceId : null,
    foodItem:
      input.kind === 'item'
        ? {
            item: input.title.trim(),
            quantity,
            unit: input.unit.trim(),
            note: '',
            shoppingCategory: 'Other',
            pantryProductId: input.pantryProductId ?? '',
          }
        : null,
    ...(input.kind === 'recipe' && (input.adapt || input.original?.recipeOverride)
      ? { recipeOverride: input.adapt ? adaptation : null }
      : {}),
    ...(input.original ? { expectedUpdatedAt: input.original.updatedAt } : {}),
  };
}
