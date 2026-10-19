/** Convert a server detail to an editable payload without losing web-only fields. */
export type EditableDetail = Record<string, unknown> & {
  currentRevision: number;
  equipment: { name: string }[];
  ingredientGroups: {
    name: string;
    ingredients: {
      quantity: number | null;
      unit: string;
      item: string;
      note: string;
      shoppingCategory: string;
      pantryProductId?: string | null;
    }[];
  }[];
  instructionSections: { title: string; steps: { body: string }[] }[];
};

export function preserveRecipeFields(
  detail: EditableDetail,
  edited: Record<string, unknown>,
  original: { revision?: number; ingredients: string[]; steps: string[] },
  lines: { ingredients: string[]; steps: string[] },
): Record<string, unknown> & { expectedRevision: number } {
  if (!original.revision || detail.currentRevision !== original.revision) {
    throw new Error(
      'This recipe changed since you opened it. Refresh and reopen the editor before saving.',
    );
  }
  const fields: Record<string, unknown> = {};
  for (const key of [
    'status',
    'difficulty',
    'cuisine',
    'category',
    'tips',
    'sharedNotes',
    'sourceName',
    'sourceUrl',
    'originalAuthor',
    'cookingMethod',
    'tags',
    'nutritionCalories',
    'nutritionProteinGrams',
    'nutritionCarbohydrateGrams',
    'nutritionFatGrams',
    'nutritionSaturatedFatGrams',
    'nutritionFiberGrams',
    'nutritionSugarGrams',
    'nutritionSodiumMilligrams',
  ])
    fields[key] = detail[key] ?? '';
  fields.equipment = detail.equipment.map((item) => item.name);
  const unchanged = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, i) => value === b[i]);
  const normalizedGroups = detail.ingredientGroups.map((group) => ({
    name: group.name,
    ingredients: group.ingredients.map((ingredient) => ({
      ...ingredient,
      quantity: ingredient.quantity ?? '',
      pantryProductId: ingredient.pantryProductId ?? '',
    })),
  }));
  const normalizedIngredients = normalizedGroups.flatMap((group) => group.ingredients);
  const replacementGroups = edited.ingredientGroups as
    { name: string; ingredients: typeof normalizedIngredients }[] | undefined;
  const replacements = replacementGroups?.flatMap((group) => group.ingredients);
  if (unchanged(original.ingredients, lines.ingredients)) {
    fields.ingredientGroups = normalizedGroups;
  } else if (replacements) {
    // A change to one line must not flatten every other ingredient into unstructured text.
    const ingredients = lines.ingredients.map((line, index) => {
      const originalIndex =
        original.ingredients[index] === line ? index : original.ingredients.indexOf(line);
      return originalIndex >= 0 ? normalizedIngredients[originalIndex] : replacements[index];
    });
    if (ingredients.length === normalizedIngredients.length) {
      let offset = 0;
      fields.ingredientGroups = normalizedGroups.map((group) => {
        const next = {
          name: group.name,
          ingredients: ingredients.slice(offset, offset + group.ingredients.length),
        };
        offset += group.ingredients.length;
        return next;
      });
    } else fields.ingredientGroups = [{ name: '', ingredients }];
  }
  if (unchanged(original.steps, lines.steps) || original.steps.length === lines.steps.length) {
    let offset = 0;
    fields.instructionSections = detail.instructionSections.map((section) => {
      const next = {
        title: section.title,
        steps: lines.steps.slice(offset, offset + section.steps.length),
      };
      offset += section.steps.length;
      return next;
    });
  }
  return { ...edited, ...fields, expectedRevision: original.revision };
}
