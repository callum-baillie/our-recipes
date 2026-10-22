import { z } from 'zod';
import { recipeInputSchema } from './recipe';

/** A review supplies every method field together; omitted ingredients preserve identity. */
export const cookingSessionRecipeChangeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('adapt'),
      operationId: z.uuid(),
      expectedRevision: z.number().int().positive(),
      expectedKitchenRevision: z.number().int().nonnegative(),
      change: recipeInputSchema
        .pick({
          cookingMethod: true,
          equipment: true,
          equipmentRequirements: true,
          instructionSections: true,
          prepMinutes: true,
          cookMinutes: true,
          restMinutes: true,
        })
        .extend({
          cookingMethod: recipeInputSchema.shape.cookingMethod.removeDefault(),
          equipment: recipeInputSchema.shape.equipment.removeDefault(),
          restMinutes: recipeInputSchema.shape.restMinutes.removeDefault(),
          // Required even when empty: leaving old requirements behind is never implicit.
          equipmentRequirements: recipeInputSchema.shape.equipmentRequirements.unwrap(),
          ingredientGroups: recipeInputSchema.shape.ingredientGroups.optional(),
          servings: recipeInputSchema.shape.servings.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('undo'),
      operationId: z.uuid(),
      expectedRevision: z.number().int().positive(),
      expectedKitchenRevision: z.number().int().nonnegative(),
      undoOperationId: z.uuid(),
    })
    .strict(),
]);
