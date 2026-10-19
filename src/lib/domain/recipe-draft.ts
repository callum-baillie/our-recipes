import { z } from 'zod';
import { recipeInputSchema } from './recipe';

const text = (maximum: number) => z.string().max(maximum);
const draftNumber = z.union([text(40), z.number().finite().min(-1_000_000).max(1_000_000)]);
// Recovery is bounded but deliberately accepts incomplete or invalid fields. Saving stays strict.
export const recipeDraftSchema = recipeInputSchema.extend({
  title: text(1000),
  summary: text(5000),
  servings: text(500),
  prepMinutes: draftNumber,
  cookMinutes: draftNumber,
  restMinutes: draftNumber,
  difficulty: text(500),
  category: text(1000),
  cuisine: text(1000),
  sourceName: text(1000),
  sourceUrl: text(4096),
  originalAuthor: text(1000),
  cookingMethod: text(1000),
  tips: text(10000),
  sharedNotes: text(10000),
  equipment: z.array(text(1000)).max(100),
  equipmentText: text(10000),
  tags: z.array(text(100)).max(40),
  nutritionCalories: draftNumber,
  nutritionProteinGrams: draftNumber,
  nutritionCarbohydrateGrams: draftNumber,
  nutritionFatGrams: draftNumber,
  nutritionSaturatedFatGrams: draftNumber,
  nutritionFiberGrams: draftNumber,
  nutritionSugarGrams: draftNumber,
  nutritionSodiumMilligrams: draftNumber,
  ingredientGroups: z
    .array(
      z.object({
        name: text(1000),
        ingredients: z
          .array(
            z.object({
              quantity: draftNumber,
              unit: text(120),
              item: text(1000),
              note: text(2000),
              shoppingCategory: text(100).default('Other'),
              pantryProductId: text(100).optional(),
            }),
          )
          .min(1)
          .max(160),
      }),
    )
    .min(1)
    .max(40),
  instructionSections: z
    .array(
      z.object({
        title: text(1000),
        steps: z.array(text(10000)).min(1).max(160),
      }),
    )
    .min(1)
    .max(40),
});

export function restoreRecipeDraft(raw: string, defaults: unknown) {
  if (raw.length > 1_000_000) return null;
  try {
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
    const parsed = recipeDraftSchema.safeParse({
      ...(defaults as object),
      ...stored,
      ...(stored.equipmentText === undefined &&
      Array.isArray(stored.equipment) &&
      stored.equipment.every((item: unknown) => typeof item === 'string')
        ? { equipmentText: stored.equipment.join('\n') }
        : {}),
      ...(typeof stored.tagsText === 'string'
        ? {
            tags: stored.tagsText
              .split(',')
              .map((tag: string) => tag.trim())
              .filter(Boolean),
          }
        : {}),
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
