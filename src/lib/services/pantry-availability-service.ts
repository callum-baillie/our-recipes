import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  mealPlanEntries,
  mealPlanLeftoverLinks,
  cookSessions,
  pantryBatches,
  pantryLocations,
  pantryProducts,
  recipeIngredientGroups,
  recipeIngredientProductMappings,
  recipeIngredients,
  recipes,
} from '@/lib/db/schema';
import {
  calculateProjectedDemand,
  calculateRecipeAvailability,
  type AvailabilityIngredient,
  type AvailabilityStock,
  type PantryMappingInput,
  type PantryProjectedDemand,
  type PantryRecipeAvailability,
} from '@/lib/domain/pantry-availability';
import { parseServingCount } from '@/lib/domain/ingredient-scaling';
import { parseMealPlanIngredientSnapshot } from '@/lib/domain/meal-plan-snapshot';
import { getRecipe } from '@/lib/services/recipe-service';

export class PantryAvailabilityNotFoundError extends Error {}
export class PantryAvailabilityConflictError extends Error {}

const INACTIVE_BATCH_STATUSES = new Set(['depleted', 'discarded', 'donated']);

function availableStock(forGrocery = false): AvailabilityStock[] {
  return getDatabase()
    .select({
      batchId: pantryBatches.id,
      productId: pantryBatches.productId,
      quantity: pantryBatches.quantityRemaining,
      unit: pantryBatches.unit,
      approximateState: pantryBatches.approximateState,
      status: pantryBatches.status,
      excludeFromGrocery: pantryBatches.excludeFromGrocery,
      locationName: pantryLocations.name,
      bestBeforeDate: pantryBatches.bestBeforeDate,
      useByDate: pantryBatches.useByDate,
    })
    .from(pantryBatches)
    .leftJoin(pantryLocations, eq(pantryLocations.id, pantryBatches.locationId))
    .all()
    .filter(
      (batch) =>
        !INACTIVE_BATCH_STATUSES.has(batch.status) &&
        (!forGrocery || !batch.excludeFromGrocery) &&
        (batch.quantity === null || batch.quantity > 0 || batch.approximateState !== null),
    )
    .map((batch) => ({
      batchId: batch.batchId,
      productId: batch.productId,
      quantity: batch.quantity,
      unit: batch.unit,
      approximateState: batch.approximateState,
      locationName: batch.locationName,
      expiryDate: batch.useByDate || batch.bestBeforeDate || null,
    }))
    .sort(
      (left, right) =>
        (left.expiryDate ?? '9999-12-31').localeCompare(right.expiryDate ?? '9999-12-31') ||
        left.batchId.localeCompare(right.batchId),
    );
}

function plannedCommitments(recipeId: string) {
  const db = getDatabase();
  const cookedIds = new Set(
    db
      .select({
        mealPlanEntryId: cookSessions.mealPlanEntryId,
        completedAt: cookSessions.completedAt,
      })
      .from(cookSessions)
      .all()
      .filter((session) => session.mealPlanEntryId && session.completedAt)
      .map((session) => session.mealPlanEntryId!),
  );
  const recipe = getRecipe(recipeId);
  const baseServings = recipe ? parseServingCount(recipe.servings) : null;
  if (!recipe || !baseServings) return [];
  const ingredients = recipeIngredientsWithMappings(recipeId);
  return db
    .select()
    .from(mealPlanEntries)
    .where(eq(mealPlanEntries.recipeId, recipeId))
    .all()
    .filter((meal) => meal.status === 'planned' && !cookedIds.has(meal.id))
    .flatMap((meal) =>
      ingredients.flatMap((ingredient) =>
        ingredient.productId && ingredient.quantity !== null && ingredient.unit.trim()
          ? [
              {
                productId: ingredient.productId,
                quantity: Number(((ingredient.quantity * meal.servings) / baseServings).toFixed(6)),
                unit: ingredient.unit,
              },
            ]
          : [],
      ),
    );
}

function recipeIngredientsWithMappings(recipeId: string): AvailabilityIngredient[] {
  const db = getDatabase();
  return db
    .select({
      id: recipeIngredients.id,
      item: recipeIngredients.item,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      productId: recipeIngredientProductMappings.productId,
      productName: pantryProducts.displayName,
      isOptional: recipeIngredientProductMappings.isOptional,
    })
    .from(recipeIngredients)
    .innerJoin(recipeIngredientGroups, eq(recipeIngredientGroups.id, recipeIngredients.groupId))
    .leftJoin(
      recipeIngredientProductMappings,
      eq(recipeIngredientProductMappings.recipeIngredientId, recipeIngredients.id),
    )
    .leftJoin(pantryProducts, eq(pantryProducts.id, recipeIngredientProductMappings.productId))
    .where(eq(recipeIngredients.recipeId, recipeId))
    .orderBy(
      asc(recipeIngredientGroups.position),
      asc(recipeIngredients.position),
      asc(recipeIngredients.id),
    )
    .all()
    .map((ingredient) => ({ ...ingredient, isOptional: ingredient.isOptional ?? false }));
}

export function setRecipeIngredientPantryMapping(
  ingredientId: string,
  input: PantryMappingInput,
  actorProfileId: string,
) {
  ensureDatabase();
  const db = getDatabase();
  const ingredient = db
    .select({ id: recipeIngredients.id })
    .from(recipeIngredients)
    .where(eq(recipeIngredients.id, ingredientId))
    .get();
  if (!ingredient)
    throw new PantryAvailabilityNotFoundError('That recipe ingredient no longer exists.');
  const product = db
    .select({ id: pantryProducts.id, archivedAt: pantryProducts.archivedAt })
    .from(pantryProducts)
    .where(eq(pantryProducts.id, input.productId))
    .get();
  if (!product || product.archivedAt)
    throw new PantryAvailabilityNotFoundError('Choose an active Pantry product.');
  const now = new Date();
  db.insert(recipeIngredientProductMappings)
    .values({
      recipeIngredientId: ingredientId,
      productId: input.productId,
      matchType: 'manual',
      compatibleVariant: input.compatibleVariant,
      isOptional: input.isOptional,
      mappedByProfileId: actorProfileId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: recipeIngredientProductMappings.recipeIngredientId,
      set: {
        productId: input.productId,
        matchType: 'manual',
        compatibleVariant: input.compatibleVariant,
        isOptional: input.isOptional,
        mappedByProfileId: actorProfileId,
        updatedAt: now,
      },
    })
    .run();
  return db
    .select()
    .from(recipeIngredientProductMappings)
    .where(eq(recipeIngredientProductMappings.recipeIngredientId, ingredientId))
    .get()!;
}

export function removeRecipeIngredientPantryMapping(ingredientId: string): void {
  ensureDatabase();
  const result = getDatabase()
    .delete(recipeIngredientProductMappings)
    .where(eq(recipeIngredientProductMappings.recipeIngredientId, ingredientId))
    .run();
  if (!result.changes)
    throw new PantryAvailabilityNotFoundError('That Pantry ingredient mapping no longer exists.');
}

export function getRecipePantryAvailability(
  recipeId: string,
  targetServings?: number,
): PantryRecipeAvailability {
  ensureDatabase();
  const recipe = getRecipe(recipeId);
  if (!recipe) throw new PantryAvailabilityNotFoundError('That recipe no longer exists.');
  return calculateRecipeAvailability({
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    baseServings: parseServingCount(recipe.servings),
    targetServings,
    ingredients: recipeIngredientsWithMappings(recipe.id),
    stock: availableStock(),
    plannedCommitments: plannedCommitments(recipe.id),
  });
}

export function listRecipePantryAvailability(
  recipeIds: string[],
): Record<string, PantryRecipeAvailability> {
  ensureDatabase();
  const ids = [...new Set(recipeIds)];
  if (!ids.length) return {};
  const db = getDatabase();
  const recipeRows = db
    .select({
      id: recipes.id,
      title: recipes.title,
      servings: recipes.servings,
    })
    .from(recipes)
    .where(inArray(recipes.id, ids))
    .all();
  const ingredients = db
    .select({
      id: recipeIngredients.id,
      recipeId: recipeIngredients.recipeId,
      item: recipeIngredients.item,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      productId: recipeIngredientProductMappings.productId,
      productName: pantryProducts.displayName,
      isOptional: recipeIngredientProductMappings.isOptional,
    })
    .from(recipeIngredients)
    .innerJoin(recipeIngredientGroups, eq(recipeIngredientGroups.id, recipeIngredients.groupId))
    .leftJoin(
      recipeIngredientProductMappings,
      eq(recipeIngredientProductMappings.recipeIngredientId, recipeIngredients.id),
    )
    .leftJoin(pantryProducts, eq(pantryProducts.id, recipeIngredientProductMappings.productId))
    .where(inArray(recipeIngredients.recipeId, ids))
    .orderBy(
      asc(recipeIngredientGroups.position),
      asc(recipeIngredients.position),
      asc(recipeIngredients.id),
    )
    .all()
    .map((ingredient) => ({ ...ingredient, isOptional: ingredient.isOptional ?? false }));
  const meals = db
    .select()
    .from(mealPlanEntries)
    .where(inArray(mealPlanEntries.recipeId, ids))
    .all();
  const leftoverDestinationIds = new Set(
    db
      .select({ id: mealPlanLeftoverLinks.destinationEntryId })
      .from(mealPlanLeftoverLinks)
      .all()
      .map(({ id }) => id),
  );
  const cookedIds = new Set(
    meals.length
      ? db
          .select({ mealPlanEntryId: cookSessions.mealPlanEntryId })
          .from(cookSessions)
          .where(
            inArray(
              cookSessions.mealPlanEntryId,
              meals.map((meal) => meal.id),
            ),
          )
          .all()
          .flatMap(({ mealPlanEntryId }) => (mealPlanEntryId ? [mealPlanEntryId] : []))
      : [],
  );
  const stock = availableStock();
  return Object.fromEntries(
    recipeRows.map((recipe) => {
      const baseServings = parseServingCount(recipe.servings);
      const recipeIngredients = ingredients.filter(
        (ingredient) => ingredient.recipeId === recipe.id,
      );
      const commitments =
        baseServings === null
          ? []
          : meals
              .filter(
                (meal) =>
                  meal.recipeId === recipe.id &&
                  meal.status === 'planned' &&
                  !leftoverDestinationIds.has(meal.id) &&
                  !cookedIds.has(meal.id),
              )
              .flatMap((meal) => {
                const snapshot = parseMealPlanIngredientSnapshot(meal.recipeIngredientsSnapshot);
                const commitmentIngredients = snapshot?.ingredients ?? recipeIngredients;
                const commitmentBaseServings = snapshot
                  ? parseServingCount(snapshot.baseServings)
                  : baseServings;
                return commitmentIngredients.flatMap((ingredient) =>
                  ingredient.productId && ingredient.quantity !== null && ingredient.unit.trim()
                    ? [
                        {
                          productId: ingredient.productId,
                          quantity: Number(
                            (
                              (ingredient.quantity * meal.servings) /
                              (commitmentBaseServings ?? baseServings)
                            ).toFixed(6),
                          ),
                          unit: ingredient.unit,
                        },
                      ]
                    : [],
                );
              });
      return [
        recipe.id,
        calculateRecipeAvailability({
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          baseServings,
          ingredients: recipeIngredients,
          stock,
          plannedCommitments: commitments,
        }),
      ];
    }),
  );
}

export function getProjectedPantryDemand(
  weekStart: string,
  weekEnd: string,
  options: { groceryOnly?: boolean } = {},
): PantryProjectedDemand {
  ensureDatabase();
  const db = getDatabase();
  const meals = db
    .select()
    .from(mealPlanEntries)
    .where(
      and(gte(mealPlanEntries.plannedFor, weekStart), lte(mealPlanEntries.plannedFor, weekEnd)),
    )
    .all();
  const completedMealIds = new Set(
    db
      .select({
        mealPlanEntryId: cookSessions.mealPlanEntryId,
        completedAt: cookSessions.completedAt,
      })
      .from(cookSessions)
      .all()
      .filter((session) => session.mealPlanEntryId && session.completedAt)
      .map((session) => session.mealPlanEntryId!),
  );
  const leftoverDestinationIds = new Set(
    db
      .select({ id: mealPlanLeftoverLinks.destinationEntryId })
      .from(mealPlanLeftoverLinks)
      .all()
      .map(({ id }) => id),
  );
  const activeMeals = meals.filter(
    (meal) =>
      meal.recipeId !== null &&
      meal.status === 'planned' &&
      !leftoverDestinationIds.has(meal.id) &&
      !completedMealIds.has(meal.id),
  );
  const recipeIds = [
    ...new Set(activeMeals.flatMap((meal) => (meal.recipeId ? [meal.recipeId] : []))),
  ];
  const ingredients = recipeIds.length
    ? db
        .select({
          id: recipeIngredients.id,
          recipeId: recipeIngredients.recipeId,
          item: recipeIngredients.item,
          quantity: recipeIngredients.quantity,
          unit: recipeIngredients.unit,
          productId: recipeIngredientProductMappings.productId,
          productName: pantryProducts.displayName,
          isOptional: recipeIngredientProductMappings.isOptional,
        })
        .from(recipeIngredients)
        .innerJoin(recipeIngredientGroups, eq(recipeIngredientGroups.id, recipeIngredients.groupId))
        .leftJoin(
          recipeIngredientProductMappings,
          eq(recipeIngredientProductMappings.recipeIngredientId, recipeIngredients.id),
        )
        .leftJoin(pantryProducts, eq(pantryProducts.id, recipeIngredientProductMappings.productId))
        .where(inArray(recipeIngredients.recipeId, recipeIds))
        .orderBy(
          asc(recipeIngredientGroups.position),
          asc(recipeIngredients.position),
          asc(recipeIngredients.id),
        )
        .all()
    : [];
  const recipes = new Map(
    recipeIds.flatMap((recipeId) => {
      const recipe = getRecipe(recipeId);
      return recipe ? [[recipeId, recipe] as const] : [];
    }),
  );
  const requirements = activeMeals.flatMap((meal) => {
    const recipe = meal.recipeId ? recipes.get(meal.recipeId) : null;
    const snapshot = parseMealPlanIngredientSnapshot(meal.recipeIngredientsSnapshot);
    if (!snapshot && !recipe) return [];
    const baseServings = parseServingCount(snapshot?.baseServings ?? recipe!.servings);
    const demandIngredients =
      snapshot?.ingredients ??
      ingredients.filter((ingredient) => ingredient.recipeId === recipe!.id);
    return demandIngredients
      .filter((ingredient) => !ingredient.isOptional)
      .map((ingredient) => {
        let reason: string | null = null;
        let quantity: number | null = null;
        if (!ingredient.productId) reason = 'Not mapped to a Pantry product.';
        else if (ingredient.quantity === null)
          reason = 'The recipe does not specify an exact quantity.';
        else if (!ingredient.unit.trim()) reason = 'The recipe does not specify a unit.';
        else if (!baseServings) reason = 'The recipe serving yield cannot be scaled exactly.';
        else quantity = Number(((ingredient.quantity * meal.servings) / baseServings).toFixed(6));
        return {
          mealPlanEntryId: meal.id,
          plannedFor: meal.plannedFor,
          recipeId: meal.recipeId!,
          recipeTitle: meal.recipeTitleSnapshot || recipe?.title || 'Deleted recipe',
          ingredientId: 'ingredientId' in ingredient ? ingredient.ingredientId : ingredient.id,
          ingredientName: ingredient.item,
          productId: ingredient.productId,
          productName: ingredient.productName,
          quantity,
          unit: ingredient.unit,
          reason,
        };
      });
  });
  return calculateProjectedDemand({
    weekStart,
    weekEnd,
    requirements,
    stock: availableStock(Boolean(options.groceryOnly)),
  });
}
