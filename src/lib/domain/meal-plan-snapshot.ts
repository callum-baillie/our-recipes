import { z } from 'zod';

const ingredientSchema = z.object({
  ingredientId: z.string().min(1),
  item: z.string(),
  quantity: z.number().nullable(),
  unit: z.string(),
  note: z.string(),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  isOptional: z.boolean(),
});

const snapshotSchema = z.object({
  baseServings: z.string(),
  ingredients: z.array(ingredientSchema),
});

export type MealPlanIngredientSnapshot = z.infer<typeof snapshotSchema>;
export const EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT = '{"baseServings":"","ingredients":[]}';

export function serializeMealPlanIngredientSnapshot(snapshot: MealPlanIngredientSnapshot): string {
  return JSON.stringify(snapshotSchema.parse(snapshot));
}

export function parseMealPlanIngredientSnapshot(value: string): MealPlanIngredientSnapshot | null {
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(value));
    if (!parsed.success) return null;
    return parsed.data.baseServings || parsed.data.ingredients.length ? parsed.data : null;
  } catch {
    return null;
  }
}
