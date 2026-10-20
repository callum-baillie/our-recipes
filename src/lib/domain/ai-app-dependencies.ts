import { z } from 'zod';

/** These names are the actual response envelopes returned by the application APIs. */
export const aiDependencyResultSchema = z.enum([
  'list.id',
  'recipe.id',
  'collection.id',
  'product.id',
  'meal.id',
]);
export const aiDependencyTargetSchema = z.enum([
  'parameters.listId',
  'parameters.recipeId',
  'parameters.collectionId',
  'parameters.productId',
  'parameters.entryId',
  'body.recipeId',
  'body.productId',
  'body.pantryProductId',
  'body.collectionId',
]);
export const aiDependencySchema = z
  .object({
    fromStep: z.number().int().min(0).max(19),
    result: aiDependencyResultSchema,
    target: aiDependencyTargetSchema,
  })
  .strict();
export const aiProducedIds: Record<string, z.infer<typeof aiDependencyResultSchema>> = {
  createOrGenerateShoppingList: 'list.id',
  createRecipe: 'recipe.id',
  createCollection: 'collection.id',
  createPantryProduct: 'product.id',
  addMealPlanEntry: 'meal.id',
};
export const aiDependencyTargets: Record<
  z.infer<typeof aiDependencyResultSchema>,
  readonly string[]
> = {
  'list.id': ['parameters.listId'],
  'recipe.id': ['parameters.recipeId', 'body.recipeId'],
  'collection.id': ['parameters.collectionId', 'body.collectionId'],
  'product.id': ['parameters.productId', 'body.productId', 'body.pantryProductId'],
  'meal.id': ['parameters.entryId'],
};
