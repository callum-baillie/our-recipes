import 'server-only';

import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { getDatabase, ensureDatabase } from '@/lib/db/client';
import {
  profiles,
  mealPlanEntries,
  mealPlanLeftoverLinks,
  pantryPurchaseIntakes,
  pantryShoppingItemDetails,
  cookSessions,
  nutritionMealAllocationVersions,
  recipeNutritionCalculations,
  recipeIngredientProductMappings,
  recipeIngredients,
  pantryProducts,
  recipes,
  recipeRevisions,
  shoppingPolicyInstances,
  shoppingAisles,
  shoppingListItems,
  shoppingLists,
  shoppingListNotes,
} from '@/lib/db/schema';
import type {
  DuplicateWeekInput,
  MealPlanBatchInput,
  MealPlanEntryInput,
  ShoppingAisleInput,
  ShoppingListItemInput,
  MealPlanStatus,
  MealPlanEntryUpdateInput,
  SwapMealPlanEntriesInput,
} from '@/lib/domain/planning';
import { shoppingListSourceKind, type ShoppingListSourceKind } from '@/lib/domain/planning';
import {
  EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
  parseMealPlanIngredientSnapshot,
  serializeMealPlanIngredientSnapshot,
} from '@/lib/domain/meal-plan-snapshot';
import { comparePlannedMeals, isPlannedMealActive } from '@/lib/domain/meal-plan-policy';
import type { ShoppingCategory } from '@/lib/domain/list-settings';
import {
  mergeShoppingItemNotes,
  preferredShoppingItemLabel,
  shoppingItemIdentity,
} from '@/lib/domain/shopping-item-identity';
import {
  areInventoryUnitsCompatible,
  convertInventoryQuantity,
} from '@/lib/domain/inventory-units';
import {
  getShoppingItemPantryDetails,
  getShoppingPolicyReviews,
  recordShoppingItemManualOverrides,
  shoppingPolicyBreakdown,
  switchAutomaticRestockTarget,
  type ShoppingDetail,
  type ShoppingPolicyBreakdown,
  type ShoppingPolicyReview,
} from '@/lib/services/pantry-grocery-cooking-service';
import {
  getListSettings,
  getShoppingListProductId,
  getSupermarketProfile,
  listAislesForSupermarket,
  listSupermarketProfiles,
  rememberShoppingAisle,
  resolveShoppingAisle,
  setAutomaticRestockList,
  type ListSettingsView,
  type SupermarketProfileView,
} from '@/lib/services/list-settings-service';
import { recipeInputSchema } from '@/lib/domain/recipe';
import { getRecipe, recipePayloadFromDetail } from '@/lib/services/recipe-service';

export class PlanningNotFoundError extends Error {}

export type PlanningTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['transaction']>[0]
>[0];
export type MealPlanEntriesInserted = (
  transaction: PlanningTransaction,
  entries: Array<typeof mealPlanEntries.$inferInsert>,
) => void;
export type MealPlanEntryChanged = (
  transaction: PlanningTransaction,
  previous: typeof mealPlanEntries.$inferSelect,
  next: typeof mealPlanEntries.$inferSelect | null,
) => void;

export type PlannedMeal = Omit<
  typeof mealPlanEntries.$inferSelect,
  'kind' | 'recipeOverride' | 'options' | 'profileIds'
> & {
  kind?: string;
  recipeOverride?: string | null;
  options?: string;
  profileIds?: string;
  leftoverSourceId?: string | null;
  leftoverSourceTitle?: string | null;
  recipeTitle: string;
  recipeChangedSincePlanning: boolean;
  effectiveStatus: MealPlanStatus | 'cooked';
};

function recipePlanSnapshot(
  executor: PlanningTransaction | ReturnType<typeof getDatabase>,
  recipeId: string,
) {
  const recipe = executor
    .select({
      title: recipes.title,
      currentRevision: recipes.currentRevision,
      servings: recipes.servings,
    })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .get();
  if (!recipe)
    throw new PlanningNotFoundError('Choose a recipe that still exists in this household.');
  const calculation = executor
    .select({ id: recipeNutritionCalculations.id })
    .from(recipeNutritionCalculations)
    .where(
      and(
        eq(recipeNutritionCalculations.recipeId, recipeId),
        eq(recipeNutritionCalculations.recipeRevision, recipe.currentRevision),
      ),
    )
    .orderBy(desc(recipeNutritionCalculations.revision))
    .get();
  const ingredients = executor
    .select({
      ingredientId: recipeIngredients.id,
      item: recipeIngredients.item,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      note: recipeIngredients.note,
      shoppingCategory: recipeIngredients.shoppingCategory,
      productId: recipeIngredientProductMappings.productId,
      productName: pantryProducts.displayName,
      isOptional: recipeIngredientProductMappings.isOptional,
    })
    .from(recipeIngredients)
    .leftJoin(
      recipeIngredientProductMappings,
      eq(recipeIngredientProductMappings.recipeIngredientId, recipeIngredients.id),
    )
    .leftJoin(pantryProducts, eq(pantryProducts.id, recipeIngredientProductMappings.productId))
    .where(eq(recipeIngredients.recipeId, recipeId))
    .all();
  return {
    recipeRevision: recipe.currentRevision,
    recipeCalculationId: calculation?.id ?? null,
    recipeTitleSnapshot: recipe.title,
    recipeIngredientsSnapshot: serializeMealPlanIngredientSnapshot({
      baseServings: recipe.servings,
      ingredients: ingredients.map((ingredient) => ({
        ...ingredient,
        isOptional: ingredient.isOptional ?? false,
      })),
    }),
  };
}
// A planned adaptation never writes to the recipe library or its revision history.
function mealDetails(
  tx: PlanningTransaction | ReturnType<typeof getDatabase>,
  input: MealPlanEntryInput,
  entryId: string,
  previous?: typeof mealPlanEntries.$inferSelect,
) {
  const priorLink = previous
    ? tx
        .select()
        .from(mealPlanLeftoverLinks)
        .where(eq(mealPlanLeftoverLinks.destinationEntryId, entryId))
        .get()
    : null;
  const kind =
    input.kind ??
    (priorLink
      ? 'leftover'
      : (input.recipeId || null) !== previous?.recipeId
        ? input.recipeId
          ? 'recipe'
          : 'custom'
        : previous?.kind) ??
    (input.recipeId ? 'recipe' : 'custom');
  const sourceId =
    input.leftoverSourceId === undefined ? priorLink?.sourceEntryId : input.leftoverSourceId;
  if (kind === 'recipe' && !input.recipeId) throw new PlanningNotFoundError('Choose a recipe.');
  if (kind !== 'recipe' && kind !== 'leftover' && input.recipeId)
    throw new PlanningNotFoundError('Only recipe or leftover meals can reference a recipe.');
  if (kind !== 'leftover' && input.leftoverSourceId)
    throw new PlanningNotFoundError('Choose the leftover meal type to link a source.');
  if (previous && kind !== previous.kind && !['recipe', 'item'].includes(kind))
    guardSourceChange(tx as PlanningTransaction, entryId);
  if (input.profileIds?.length) {
    const found = tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(inArray(profiles.id, input.profileIds))
      .all();
    if (found.length !== input.profileIds.length)
      throw new PlanningNotFoundError('Choose household members that still exist.');
  }
  let details = {
    kind,
    profileIds:
      input.profileIds === undefined
        ? (previous?.profileIds ?? '[]')
        : JSON.stringify(input.profileIds),
    options: kind === 'options' ? (previous?.options ?? '[]') : '[]',
    recipeOverride: previous?.recipeOverride ?? null,
  } as Partial<typeof mealPlanEntries.$inferSelect>;
  if (kind === 'leftover') {
    const source = sourceId
      ? tx.select().from(mealPlanEntries).where(eq(mealPlanEntries.id, sourceId)).get()
      : null;
    if (
      !source ||
      source.id === entryId ||
      source.status !== 'planned' ||
      comparePlannedMeals(source, input) > 0
    )
      throw new PlanningNotFoundError('Choose an earlier active meal for these leftovers.');
    const sourceLink = tx
      .select()
      .from(mealPlanLeftoverLinks)
      .where(eq(mealPlanLeftoverLinks.destinationEntryId, source.id))
      .get();
    if (sourceLink || source.kind === 'takeout' || (!source.recipeId && source.kind !== 'item'))
      throw new PlanningNotFoundError(
        'Choose the original cooked meal, not another leftover or takeout.',
      );
    details = {
      ...details,
      recipeId: source.recipeId,
      recipeRevision: source.recipeRevision,
      recipeCalculationId: source.recipeCalculationId,
      recipeTitleSnapshot: source.recipeTitleSnapshot,
      recipeIngredientsSnapshot: source.recipeIngredientsSnapshot,
      recipeOverride: source.recipeOverride,
      title: source.title || source.recipeTitleSnapshot,
    };
  } else if (kind === 'item') {
    const item = input.foodItem;
    const product = item?.pantryProductId
      ? tx.select().from(pantryProducts).where(eq(pantryProducts.id, item.pantryProductId)).get()
      : null;
    if (item?.pantryProductId && !product)
      throw new PlanningNotFoundError('Choose a pantry product that still exists.');
    if (item)
      details = {
        ...details,
        recipeId: null,
        recipeCalculationId: null,
        recipeOverride: null,
        recipeTitleSnapshot: input.title || item.item,
        recipeIngredientsSnapshot: serializeMealPlanIngredientSnapshot({
          baseServings: '1',
          ingredients: [
            {
              ingredientId: entryId,
              item: item.item,
              quantity: item.quantity === '' ? null : item.quantity,
              unit: item.unit,
              note: item.note,
              shoppingCategory: item.shoppingCategory,
              productId: item.pantryProductId || null,
              productName: product?.displayName ?? null,
              isOptional: false,
            },
          ],
        }),
      };
    else if (previous?.kind === 'item')
      details.recipeIngredientsSnapshot = previous.recipeIngredientsSnapshot;
    else throw new PlanningNotFoundError('Add the food and quantity per serving.');
  } else if (kind === 'options') {
    const choices = input.options ?? [];
    if (choices.length < 2) throw new PlanningNotFoundError('Add at least two meal options.');
    const recipeIds = [
      ...new Set(choices.flatMap((choice) => (choice.kind === 'recipe' ? [choice.recipeId] : []))),
    ];
    const productIds = [
      ...new Set(choices.flatMap((choice) => (choice.kind === 'pantry' ? [choice.productId] : []))),
    ];
    const savedRecipes = recipeIds.length
      ? tx
          .select({ id: recipes.id, title: recipes.title })
          .from(recipes)
          .where(inArray(recipes.id, recipeIds))
          .all()
      : [];
    const savedProducts = productIds.length
      ? tx
          .select({ id: pantryProducts.id, title: pantryProducts.displayName })
          .from(pantryProducts)
          .where(inArray(pantryProducts.id, productIds))
          .all()
      : [];
    if (savedRecipes.length !== recipeIds.length)
      throw new PlanningNotFoundError('Choose recipes that still exist in this household.');
    if (savedProducts.length !== productIds.length)
      throw new PlanningNotFoundError('Choose Pantry items that still exist in this household.');
    const recipeNames = new Map(savedRecipes.map((recipe) => [recipe.id, recipe.title]));
    const productNames = new Map(savedProducts.map((product) => [product.id, product.title]));
    const normalizedChoices = choices.map((choice) =>
      choice.kind === 'recipe'
        ? { ...choice, label: recipeNames.get(choice.recipeId)! }
        : { ...choice, label: productNames.get(choice.productId)! },
    );
    const title = normalizedChoices.map((choice) => choice.label).join(' or ');
    details = {
      ...details,
      recipeId: null,
      recipeRevision: null,
      recipeCalculationId: null,
      recipeTitleSnapshot: title,
      recipeIngredientsSnapshot: EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
      recipeOverride: null,
      options: JSON.stringify(normalizedChoices),
      title,
    };
  } else if (kind === 'fast') {
    details = {
      ...details,
      recipeId: null,
      recipeRevision: null,
      recipeCalculationId: null,
      recipeTitleSnapshot: input.title || 'Fasting',
      recipeIngredientsSnapshot: EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
      recipeOverride: null,
      title: input.title || 'Fasting',
    };
  }
  if (kind !== 'leftover') {
    if (input.recipeOverride === null || input.recipeId !== previous?.recipeId)
      details.recipeOverride = null;
    if (input.recipeOverride) {
      if (!input.recipeId || kind !== 'recipe')
        throw new PlanningNotFoundError('Only recipe meals can have a recipe adaptation.');
      const override = input.recipeOverride;
      const oldSnapshot =
        previous?.recipeId === input.recipeId
          ? parseMealPlanIngredientSnapshot(previous.recipeIngredientsSnapshot)
          : parseMealPlanIngredientSnapshot(
              recipePlanSnapshot(tx, input.recipeId).recipeIngredientsSnapshot,
            );
      details = {
        ...details,
        recipeOverride: JSON.stringify(override),
        recipeTitleSnapshot: override.title,
        recipeCalculationId: null,
        recipeIngredientsSnapshot: serializeMealPlanIngredientSnapshot({
          baseServings: override.servings,
          ingredients: override.ingredientGroups.flatMap((group) =>
            group.ingredients.map((item) => {
              const old = oldSnapshot?.ingredients.find(
                (old) => old.item === item.item && old.unit === item.unit,
              );
              const productId =
                item.pantryProductId === undefined
                  ? (old?.productId ?? null)
                  : item.pantryProductId || null;
              const product = productId
                ? tx.select().from(pantryProducts).where(eq(pantryProducts.id, productId)).get()
                : null;
              if (productId && !product)
                throw new PlanningNotFoundError('Choose a pantry product that still exists.');
              return {
                ingredientId: old?.ingredientId ?? randomUUID(),
                item: item.item,
                quantity: item.quantity === '' ? null : item.quantity,
                unit: item.unit,
                note: item.note,
                shoppingCategory: item.shoppingCategory,
                productId,
                productName: product?.displayName ?? null,
                isOptional: old?.isOptional ?? false,
              };
            }),
          ),
        }),
      };
    } else if (input.recipeOverride === null && input.recipeId)
      Object.assign(details, recipePlanSnapshot(tx, input.recipeId));
  }
  return { details, sourceId: kind === 'leftover' ? sourceId : null };
}

function saveLeftoverLink(
  tx: PlanningTransaction,
  entryId: string,
  sourceId: string | null | undefined,
  servings: number,
  actor: string,
) {
  tx.delete(mealPlanLeftoverLinks)
    .where(eq(mealPlanLeftoverLinks.destinationEntryId, entryId))
    .run();
  if (sourceId) {
    const source = tx.select().from(mealPlanEntries).where(eq(mealPlanEntries.id, sourceId)).get();
    const allocations = tx
      .select({ servings: mealPlanLeftoverLinks.servings })
      .from(mealPlanLeftoverLinks)
      .innerJoin(mealPlanEntries, eq(mealPlanEntries.id, mealPlanLeftoverLinks.destinationEntryId))
      .where(
        and(
          eq(mealPlanLeftoverLinks.sourceEntryId, sourceId),
          eq(mealPlanEntries.status, 'planned'),
        ),
      )
      .all();
    if (
      !source ||
      servings + allocations.reduce((total, item) => total + item.servings, 0) > source.servings
    )
      throw new PlanningNotFoundError(
        'Increase the original meal’s servings first so there are enough portions for these leftovers.',
      );
    tx.insert(mealPlanLeftoverLinks)
      .values({
        id: randomUUID(),
        sourceEntryId: sourceId,
        destinationEntryId: entryId,
        servings,
        createdByProfileId: actor,
        createdAt: new Date(),
      })
      .run();
  }
}

function guardSourceChange(
  tx: PlanningTransaction,
  entryId: string,
  date?: string,
  slot?: string,
  servings?: number,
) {
  const dependents = tx
    .select({
      date: mealPlanEntries.plannedFor,
      meal: mealPlanEntries.meal,
      servings: mealPlanLeftoverLinks.servings,
    })
    .from(mealPlanLeftoverLinks)
    .innerJoin(mealPlanEntries, eq(mealPlanEntries.id, mealPlanLeftoverLinks.destinationEntryId))
    .where(
      and(eq(mealPlanLeftoverLinks.sourceEntryId, entryId), eq(mealPlanEntries.status, 'planned')),
    )
    .all();
  if (
    dependents.some(
      (item) =>
        !date ||
        (slot
          ? comparePlannedMeals(
              { plannedFor: item.date, meal: item.meal },
              { plannedFor: date, meal: slot },
            ) < 0
          : item.date < date),
    )
  )
    throw new PlanningNotFoundError(
      'Update the linked leftovers before removing or moving their source meal after them.',
    );
  if (
    servings !== undefined &&
    dependents.reduce((total, item) => total + item.servings, 0) > servings
  )
    throw new PlanningNotFoundError(
      'The original meal needs enough servings for its linked leftovers.',
    );
}

export function getRecipeForPlannedMeal(recipeId: string, entryId?: string) {
  const recipe = getRecipe(recipeId);
  if (!recipe || !entryId) return recipe;
  const meal = getPlannedMeal(entryId);
  if (!meal || meal.recipeId !== recipeId)
    throw new PlanningNotFoundError('That meal does not use this recipe.');
  let baseline = recipePayloadFromDetail(recipe);
  if (meal.recipeRevision && meal.recipeRevision !== recipe.currentRevision) {
    const revision = getDatabase()
      .select()
      .from(recipeRevisions)
      .where(
        and(
          eq(recipeRevisions.recipeId, recipeId),
          eq(recipeRevisions.revision, meal.recipeRevision),
        ),
      )
      .get();
    if (!revision)
      throw new PlanningNotFoundError(
        'The planned recipe revision is unavailable. Refresh this meal before cooking.',
      );
    baseline = recipeInputSchema.parse(JSON.parse(revision.snapshot));
  }
  const override = meal.recipeOverride
    ? recipeInputSchema
        .pick({
          title: true,
          summary: true,
          servings: true,
          ingredientGroups: true,
          instructionSections: true,
        })
        .parse(JSON.parse(meal.recipeOverride))
    : baseline;
  return {
    ...recipe,
    currentRevision: meal.recipeRevision ?? recipe.currentRevision,
    title: override.title,
    summary: override.summary,
    servings: override.servings,
    nutritionCalories: meal.recipeOverride
      ? null
      : baseline.nutritionCalories === ''
        ? null
        : baseline.nutritionCalories,
    nutritionProteinGrams: meal.recipeOverride
      ? null
      : baseline.nutritionProteinGrams === ''
        ? null
        : baseline.nutritionProteinGrams,
    nutritionCarbohydrateGrams: meal.recipeOverride
      ? null
      : baseline.nutritionCarbohydrateGrams === ''
        ? null
        : baseline.nutritionCarbohydrateGrams,
    nutritionFatGrams: meal.recipeOverride
      ? null
      : baseline.nutritionFatGrams === ''
        ? null
        : baseline.nutritionFatGrams,
    nutritionSaturatedFatGrams: meal.recipeOverride
      ? null
      : baseline.nutritionSaturatedFatGrams === ''
        ? null
        : baseline.nutritionSaturatedFatGrams,
    nutritionFiberGrams: meal.recipeOverride
      ? null
      : baseline.nutritionFiberGrams === ''
        ? null
        : baseline.nutritionFiberGrams,
    nutritionSugarGrams: meal.recipeOverride
      ? null
      : baseline.nutritionSugarGrams === ''
        ? null
        : baseline.nutritionSugarGrams,
    nutritionSodiumMilligrams: meal.recipeOverride
      ? null
      : baseline.nutritionSodiumMilligrams === ''
        ? null
        : baseline.nutritionSodiumMilligrams,
    ingredientGroups: override.ingredientGroups.map((group, g) => ({
      id: `${entryId}-g${g}`,
      name: group.name,
      ingredients: group.ingredients.map((item, i) => ({
        ...item,
        id: `${entryId}-g${g}-i${i}`,
        quantity: item.quantity === '' ? null : item.quantity,
      })),
    })),
    instructionSections: override.instructionSections.map((section, i) => ({
      id: `${entryId}-s${i}`,
      title: section.title,
      steps: section.steps.map((body, j) => ({ id: `${entryId}-s${i}-${j}`, body })),
    })),
  };
}

export type ShoppingListDetail = typeof shoppingLists.$inferSelect & {
  notes?: string;
  notesVersion?: number;
  items: Array<
    typeof shoppingListItems.$inferSelect & {
      pantry: ShoppingDetail | null;
      policyBreakdown: ShoppingPolicyBreakdown | null;
    }
  >;
  aisles: Array<typeof shoppingAisles.$inferSelect>;
  settings: ListSettingsView;
  supermarketProfile: SupermarketProfileView | null;
  supermarketProfiles: SupermarketProfileView[];
  policyReviews: ShoppingPolicyReview[];
  isAutomaticRestockTarget: boolean;
};

export type ShoppingListSummary = typeof shoppingLists.$inferSelect & {
  itemCount: number;
  checkedCount: number;
  toBuyCount: number;
  inCartCount: number;
  cantFindCount: number;
  sourcedCount: number;
  openCount: number;
  needsAttentionCount: number;
  sourceKind: ShoppingListSourceKind;
  supermarketName: string | null;
  supermarketLocation: string;
  isAutomaticRestockTarget: boolean;
};

export function listPlannedMeals(weekStart: string, weekEnd: string): PlannedMeal[] {
  ensureDatabase();
  const db = getDatabase();
  const entries = db
    .select()
    .from(mealPlanEntries)
    .where(
      and(gte(mealPlanEntries.plannedFor, weekStart), lte(mealPlanEntries.plannedFor, weekEnd)),
    )
    .orderBy(asc(mealPlanEntries.plannedFor), asc(mealPlanEntries.meal))
    .all();
  if (!entries.length) return [];
  const recipeIds = entries.flatMap((entry) => (entry.recipeId ? [entry.recipeId] : []));
  const titles = recipeIds.length
    ? db
        .select({ id: recipes.id, title: recipes.title, currentRevision: recipes.currentRevision })
        .from(recipes)
        .where(inArray(recipes.id, recipeIds))
        .all()
    : [];
  const calculations = recipeIds.length
    ? db
        .select({
          id: recipeNutritionCalculations.id,
          recipeId: recipeNutritionCalculations.recipeId,
          recipeRevision: recipeNutritionCalculations.recipeRevision,
          revision: recipeNutritionCalculations.revision,
        })
        .from(recipeNutritionCalculations)
        .where(inArray(recipeNutritionCalculations.recipeId, recipeIds))
        .orderBy(desc(recipeNutritionCalculations.revision))
        .all()
    : [];
  const cookedEntryIds = new Set(
    db
      .select({ mealPlanEntryId: cookSessions.mealPlanEntryId })
      .from(cookSessions)
      .where(isNotNull(cookSessions.completedAt))
      .all()
      .flatMap(({ mealPlanEntryId }) => (mealPlanEntryId ? [mealPlanEntryId] : [])),
  );
  const links = db
    .select()
    .from(mealPlanLeftoverLinks)
    .where(
      inArray(
        mealPlanLeftoverLinks.destinationEntryId,
        entries.map((e) => e.id),
      ),
    )
    .all();
  return entries
    .map((entry) => {
      const currentRecipe = entry.recipeId
        ? titles.find((recipe) => recipe.id === entry.recipeId)
        : null;
      const currentCalculation = currentRecipe
        ? calculations.find(
            (calculation) =>
              calculation.recipeId === currentRecipe.id &&
              calculation.recipeRevision === currentRecipe.currentRevision,
          )
        : null;
      return {
        ...entry,
        kind: links.some((link) => link.destinationEntryId === entry.id) ? 'leftover' : entry.kind,
        leftoverSourceId:
          links.find((link) => link.destinationEntryId === entry.id)?.sourceEntryId ?? null,
        recipeTitle: entry.recipeId
          ? entry.recipeTitleSnapshot || currentRecipe?.title || 'Deleted recipe'
          : entry.title,
        recipeChangedSincePlanning: Boolean(
          !entry.recipeOverride &&
          currentRecipe &&
          entry.recipeRevision !== null &&
          (currentRecipe.currentRevision !== entry.recipeRevision ||
            (entry.recipeCalculationId ?? null) !== (currentCalculation?.id ?? null)),
        ),
        effectiveStatus: cookedEntryIds.has(entry.id) ? ('cooked' as const) : entry.status,
      };
    })
    .sort(comparePlannedMeals);
}

export function getPlannedMeal(entryId: string): PlannedMeal | null {
  ensureDatabase();
  const entry = getDatabase()
    .select({ plannedFor: mealPlanEntries.plannedFor })
    .from(mealPlanEntries)
    .where(eq(mealPlanEntries.id, entryId))
    .get();
  if (!entry) return null;
  return (
    listPlannedMeals(entry.plannedFor, entry.plannedFor).find((meal) => meal.id === entryId) ?? null
  );
}

export function refreshMealPlanRecipeSnapshot(
  entryId: string,
  actorProfileId: string,
): PlannedMeal {
  const existing = getPlannedMeal(entryId);
  if (!existing?.recipeId) throw new PlanningNotFoundError('That meal has no recipe to refresh.');
  if (existing.leftoverSourceId)
    throw new PlanningNotFoundError('Refresh the original meal to update its linked leftovers.');
  return updateMealPlanEntry(
    entryId,
    {
      plannedFor: existing.plannedFor,
      meal: existing.meal,
      recipeId: existing.recipeId,
      title: existing.title,
      servings: existing.servings,
      note: existing.note,
      recipeOverride: null,
      expectedUpdatedAt: existing.updatedAt.toISOString(),
    },
    actorProfileId,
  );
}

export function updateMealPlanEntryStatus(
  entryId: string,
  status: MealPlanStatus,
  actorProfileId: string,
  onChanged?: MealPlanEntryChanged,
): PlannedMeal {
  ensureDatabase();
  const database = getDatabase();
  const existing = database.transaction((transaction) => {
    const previous = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryId))
      .get();
    if (!previous) throw new PlanningNotFoundError('That planned meal no longer exists.');
    if (status !== 'planned') guardSourceChange(transaction, entryId);
    const next = { ...previous, status, updatedByProfileId: actorProfileId, updatedAt: new Date() };
    transaction.update(mealPlanEntries).set(next).where(eq(mealPlanEntries.id, entryId)).run();
    onChanged?.(transaction, previous, next);
    return next;
  });
  return listPlannedMeals(existing.plannedFor, existing.plannedFor).find(
    (meal) => meal.id === entryId,
  )!;
}

export function updateMealPlanEntry(
  entryId: string,
  input: MealPlanEntryUpdateInput,
  actorProfileId: string,
  onChanged?: MealPlanEntryChanged,
): PlannedMeal {
  ensureDatabase();
  const database = getDatabase();
  const recipe = input.recipeId ? getRecipe(input.recipeId) : null;
  if (input.recipeId && !recipe) {
    throw new PlanningNotFoundError('Choose a recipe that still exists in this household.');
  }
  database.transaction((transaction) => {
    const existing = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryId))
      .get();
    if (!existing) throw new PlanningNotFoundError('That planned meal no longer exists.');
    if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new PlanningNotFoundError('That planned meal changed. Refresh before saving.');
    }
    guardSourceChange(transaction, entryId, input.plannedFor, input.meal, input.servings);
    const { details, sourceId } = mealDetails(transaction, input, entryId, existing);
    const next = {
      ...existing,
      plannedFor: input.plannedFor,
      meal: input.meal,
      recipeId: input.recipeId || null,
      title: input.title,
      servings: input.servings,
      note: input.note,
      updatedByProfileId: actorProfileId,
      updatedAt: new Date(),
      ...(input.recipeId && input.recipeId !== existing.recipeId
        ? recipePlanSnapshot(transaction, input.recipeId)
        : input.recipeId
          ? {}
          : {
              recipeRevision: null,
              recipeCalculationId: null,
              recipeTitleSnapshot: '',
              recipeIngredientsSnapshot: EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
            }),
    };
    Object.assign(next, details);
    transaction.update(mealPlanEntries).set(next).where(eq(mealPlanEntries.id, entryId)).run();
    saveLeftoverLink(transaction, entryId, sourceId, input.servings, actorProfileId);
    // Keep linked meals aligned with their source adaptation.
    const destinations = transaction
      .select()
      .from(mealPlanLeftoverLinks)
      .where(eq(mealPlanLeftoverLinks.sourceEntryId, entryId))
      .all();
    for (const link of destinations)
      transaction
        .update(mealPlanEntries)
        .set({
          recipeId: next.recipeId,
          recipeRevision: next.recipeRevision,
          recipeCalculationId: next.recipeCalculationId,
          recipeTitleSnapshot: next.recipeTitleSnapshot,
          title: next.title,
          recipeIngredientsSnapshot: next.recipeIngredientsSnapshot,
          recipeOverride: next.recipeOverride,
          updatedAt: next.updatedAt,
        })
        .where(eq(mealPlanEntries.id, link.destinationEntryId))
        .run();
    onChanged?.(transaction, existing, next);
  });
  return listPlannedMeals(input.plannedFor, input.plannedFor).find((meal) => meal.id === entryId)!;
}

export function swapMealPlanEntries(
  input: SwapMealPlanEntriesInput,
  actorProfileId: string,
): [PlannedMeal, PlannedMeal] {
  ensureDatabase();
  const database = getDatabase();
  database.transaction((transaction) => {
    const source = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, input.sourceId))
      .get();
    const target = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, input.targetId))
      .get();
    if (!source || !target)
      throw new PlanningNotFoundError('Choose two planned meals that still exist.');
    if (
      source.updatedAt.toISOString() !== input.sourceExpectedUpdatedAt ||
      target.updatedAt.toISOString() !== input.targetExpectedUpdatedAt
    ) {
      throw new PlanningNotFoundError('One of those meals changed. Refresh before swapping.');
    }
    const now = new Date();
    transaction
      .update(mealPlanEntries)
      .set({
        plannedFor: target.plannedFor,
        meal: target.meal,
        updatedByProfileId: actorProfileId,
        updatedAt: now,
      })
      .where(eq(mealPlanEntries.id, source.id))
      .run();
    transaction
      .update(mealPlanEntries)
      .set({
        plannedFor: source.plannedFor,
        meal: source.meal,
        updatedByProfileId: actorProfileId,
        updatedAt: now,
      })
      .where(eq(mealPlanEntries.id, target.id))
      .run();
    guardSourceChange(transaction, source.id, target.plannedFor, target.meal);
    guardSourceChange(transaction, target.id, source.plannedFor, source.meal);
    for (const entry of [source, target]) {
      const link = transaction
        .select()
        .from(mealPlanLeftoverLinks)
        .where(eq(mealPlanLeftoverLinks.destinationEntryId, entry.id))
        .get();
      if (link) {
        const original = transaction
          .select()
          .from(mealPlanEntries)
          .where(eq(mealPlanEntries.id, link.sourceEntryId))
          .get();
        const date = entry.id === source.id ? target.plannedFor : source.plannedFor;
        if (
          !original ||
          comparePlannedMeals(original, {
            plannedFor: date,
            meal: entry.id === source.id ? target.meal : source.meal,
          }) > 0
        )
          throw new PlanningNotFoundError('Leftovers cannot be moved before their original meal.');
      }
    }
  });
  const range = [
    ...new Set(
      getDatabase()
        .select({ plannedFor: mealPlanEntries.plannedFor })
        .from(mealPlanEntries)
        .where(inArray(mealPlanEntries.id, [input.sourceId, input.targetId]))
        .all()
        .map((entry) => entry.plannedFor),
    ),
  ].sort();
  const meals = listPlannedMeals(range[0]!, range.at(-1)!);
  return [
    meals.find((meal) => meal.id === input.sourceId)!,
    meals.find((meal) => meal.id === input.targetId)!,
  ];
}

export function addMealPlanEntry(
  input: MealPlanEntryInput,
  actorProfileId: string,
  onInserted?: MealPlanEntriesInserted,
): PlannedMeal {
  ensureDatabase();
  const recipeId = input.recipeId ?? '';
  const title = input.title ?? '';
  const recipe = recipeId ? getRecipe(recipeId) : null;
  if (recipeId && !recipe)
    throw new PlanningNotFoundError('Choose a recipe that still exists in this household.');
  const now = new Date();
  const entry: typeof mealPlanEntries.$inferInsert = {
    id: randomUUID(),
    plannedFor: input.plannedFor,
    meal: input.meal,
    recipeId: recipeId || null,
    ...(recipeId
      ? recipePlanSnapshot(getDatabase(), recipeId)
      : {
          recipeRevision: null,
          recipeCalculationId: null,
          recipeTitleSnapshot: '',
          recipeIngredientsSnapshot: EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
        }),
    title,
    servings: input.servings,
    note: input.note,
    status: 'planned',
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  };
  const database = getDatabase();
  database.transaction((transaction) => {
    const { details, sourceId } = mealDetails(transaction, input, entry.id!);
    Object.assign(entry, details);
    transaction.insert(mealPlanEntries).values(entry).run();
    saveLeftoverLink(transaction, entry.id!, sourceId, input.servings, actorProfileId);
    onInserted?.(transaction, [entry]);
  });
  return listPlannedMeals(entry.plannedFor, entry.plannedFor).find((meal) => meal.id === entry.id)!;
}

export function addMealPlanEntries(
  input: MealPlanBatchInput,
  actorProfileId: string,
  onInserted?: MealPlanEntriesInserted,
): PlannedMeal[] {
  ensureDatabase();
  let entries: Array<typeof mealPlanEntries.$inferInsert> = [];
  getDatabase().transaction((transaction) => {
    entries = insertMealPlanEntriesInTransaction(transaction, input, actorProfileId, onInserted);
  });

  const dates = entries.map((entry) => entry.plannedFor).sort();
  const insertedIds = new Set(entries.map((entry) => entry.id));
  return listPlannedMeals(dates[0]!, dates.at(-1)!).filter((meal) => insertedIds.has(meal.id));
}

export function insertMealPlanEntriesInTransaction(
  transaction: PlanningTransaction,
  input: MealPlanBatchInput,
  actorProfileId: string,
  onInserted?: MealPlanEntriesInserted,
): Array<typeof mealPlanEntries.$inferInsert> {
  const recipeIds = [...new Set(input.entries.map((entry) => entry.recipeId).filter(Boolean))];
  const savedRecipeIds = recipeIds.length
    ? new Set(
        transaction
          .select({ id: recipes.id })
          .from(recipes)
          .where(inArray(recipes.id, recipeIds))
          .all()
          .map(({ id }) => id),
      )
    : new Set<string>();
  if (recipeIds.some((recipeId) => !savedRecipeIds.has(recipeId))) {
    throw new PlanningNotFoundError('Choose recipes that still exist in this household.');
  }
  const now = new Date();
  const entries: Array<typeof mealPlanEntries.$inferInsert> = input.entries.map((entry) => ({
    id: randomUUID(),
    plannedFor: entry.plannedFor,
    meal: entry.meal,
    recipeId: entry.recipeId || null,
    ...(entry.recipeId
      ? recipePlanSnapshot(transaction, entry.recipeId)
      : {
          recipeRevision: null,
          recipeCalculationId: null,
          recipeTitleSnapshot: '',
          recipeIngredientsSnapshot: EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
        }),
    title: entry.title,
    servings: entry.servings,
    note: entry.note,
    status: 'planned',
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  }));
  const sources = entries.map((entry, index) => {
    const result = mealDetails(transaction, input.entries[index]!, entry.id!);
    Object.assign(entry, result.details);
    return result.sourceId;
  });
  transaction.insert(mealPlanEntries).values(entries).run();
  entries.forEach((entry, index) =>
    saveLeftoverLink(transaction, entry.id!, sources[index], entry.servings, actorProfileId),
  );
  onInserted?.(transaction, entries);
  return entries;
}

function addDays(isoDate: string, days: number): string {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function duplicateWeek(
  input: DuplicateWeekInput,
  actorProfileId: string,
  onInserted?: MealPlanEntriesInserted,
): PlannedMeal[] {
  ensureDatabase();
  const sourceWeekEnd = addDays(input.weekStart, 6);
  const copied = listPlannedMeals(input.weekStart, sourceWeekEnd);
  const offsetDays = Math.round(
    (Date.parse(`${input.destinationWeekStart}T00:00:00Z`) -
      Date.parse(`${input.weekStart}T00:00:00Z`)) /
      86_400_000,
  );
  const now = new Date();
  const entries = copied.map((entry) => ({
    id: randomUUID(),
    plannedFor: addDays(entry.plannedFor, offsetDays),
    meal: entry.meal,
    recipeId: entry.recipeId,
    kind: entry.kind,
    profileIds: entry.profileIds,
    options: entry.options,
    recipeOverride: entry.recipeOverride,
    recipeRevision: entry.recipeRevision,
    recipeCalculationId: entry.recipeCalculationId,
    recipeTitleSnapshot: entry.recipeTitleSnapshot,
    recipeIngredientsSnapshot: entry.recipeIngredientsSnapshot,
    title: entry.title,
    servings: entry.servings,
    note: entry.note,
    status: 'planned' as const,
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  }));
  if (entries.length) {
    getDatabase().transaction((transaction) => {
      transaction.insert(mealPlanEntries).values(entries).run();
      copied.forEach((entry, index) => {
        if (!entry.leftoverSourceId) return;
        const sourceIndex = copied.findIndex((source) => source.id === entry.leftoverSourceId);
        if (sourceIndex < 0)
          throw new PlanningNotFoundError(
            'Include the original meal when copying a week with leftovers.',
          );
        saveLeftoverLink(
          transaction,
          entries[index]!.id,
          entries[sourceIndex]!.id,
          entry.servings,
          actorProfileId,
        );
      });
      onInserted?.(transaction, entries);
    });
  }
  return listPlannedMeals(input.destinationWeekStart, addDays(input.destinationWeekStart, 6));
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(isoDate: string): string {
  return isoDate.replaceAll('-', '');
}

export function plannedMealsAsIcs(weekStart: string, weekEnd: string): string {
  const events = listPlannedMeals(weekStart, weekEnd)
    .filter(isPlannedMealActive)
    .flatMap((meal) => {
      const description = [
        `${meal.servings} servings`,
        meal.note,
        meal.recipeId ? 'Recipe planned in Bòrd.' : 'Free-form household meal.',
      ]
        .filter(Boolean)
        .join('\n');
      return [
        'BEGIN:VEVENT',
        `UID:${meal.id}@bord.local`,
        `DTSTART;VALUE=DATE:${icsDate(meal.plannedFor)}`,
        `DTEND;VALUE=DATE:${icsDate(addDays(meal.plannedFor, 1))}`,
        `SUMMARY:${icsEscape(`${meal.meal}: ${meal.recipeTitle}`)}`,
        `DESCRIPTION:${icsEscape(description)}`,
        'END:VEVENT',
      ];
    });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bord//Meal Plan//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function removeMealPlanEntry(
  entryId: string,
  actorProfileId: string,
  onChanged?: MealPlanEntryChanged,
): void {
  ensureDatabase();
  const database = getDatabase();
  database.transaction((transaction) => {
    const existing = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryId))
      .get();
    if (!existing) throw new PlanningNotFoundError('That planned meal no longer exists.');
    guardSourceChange(transaction, entryId);
    onChanged?.(transaction, existing, null);
    const allocation = transaction
      .select({ id: nutritionMealAllocationVersions.id })
      .from(nutritionMealAllocationVersions)
      .where(eq(nutritionMealAllocationVersions.mealPlanEntryId, entryId))
      .limit(1)
      .get();
    if (allocation) {
      transaction
        .update(mealPlanEntries)
        .set({ status: 'cancelled', updatedByProfileId: actorProfileId, updatedAt: new Date() })
        .where(eq(mealPlanEntries.id, entryId))
        .run();
      return;
    }
    transaction.delete(mealPlanEntries).where(eq(mealPlanEntries.id, entryId)).run();
  });
}

function numericServings(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type GeneratedItem = {
  identity: string;
  quantity: number | null;
  unit: string;
  item: string;
  note: string;
  shoppingCategory: ShoppingCategory;
  sourceRecipeIds: Set<string>;
};

export function generateShoppingList(
  weekStart: string,
  weekEnd: string,
  actorProfileId: string,
): ShoppingListDetail {
  ensureDatabase();
  const plannedMeals = listPlannedMeals(weekStart, weekEnd).filter(isPlannedMealActive);
  if (!plannedMeals.length)
    throw new PlanningNotFoundError('Plan at least one meal before generating a shopping list.');
  const combined: GeneratedItem[] = [];

  plannedMeals.forEach((plannedMeal) => {
    if (['leftover', 'takeout', 'fast', 'options'].includes(plannedMeal.kind ?? '')) return;
    const snapshot = parseMealPlanIngredientSnapshot(plannedMeal.recipeIngredientsSnapshot);
    const recipe = snapshot || !plannedMeal.recipeId ? null : getRecipe(plannedMeal.recipeId);
    if (!snapshot && !recipe) return;
    const recipeServings = numericServings(snapshot?.baseServings ?? recipe!.servings);
    const multiplier = recipeServings ? plannedMeal.servings / recipeServings : 1;
    const ingredients =
      snapshot?.ingredients ?? recipe!.ingredientGroups.flatMap((group) => group.ingredients);
    ingredients.forEach((ingredient) => {
      const quantity =
        ingredient.quantity === null ? null : Number((ingredient.quantity * multiplier).toFixed(3));
      const identity = shoppingItemIdentity(ingredient.item);
      const existing = combined.find(
        (candidate) =>
          candidate.identity === identity &&
          areInventoryUnitsCompatible(candidate.unit, ingredient.unit),
      );
      if (existing) {
        existing.quantity =
          existing.quantity === null || quantity === null
            ? null
            : Number(
                (
                  existing.quantity +
                  convertInventoryQuantity(quantity, ingredient.unit, existing.unit)
                ).toFixed(3),
              );
        existing.item = preferredShoppingItemLabel(existing.item, ingredient.item);
        existing.note = mergeShoppingItemNotes(existing.note, ingredient.note);
        if (plannedMeal.recipeId) existing.sourceRecipeIds.add(plannedMeal.recipeId);
        if (existing.shoppingCategory === 'Other' && ingredient.shoppingCategory !== 'Other') {
          existing.shoppingCategory = ingredient.shoppingCategory;
        }
      } else {
        combined.push({
          identity,
          quantity,
          unit: ingredient.unit,
          item: ingredient.item,
          note: ingredient.note,
          shoppingCategory: ingredient.shoppingCategory,
          sourceRecipeIds: new Set(plannedMeal.recipeId ? [plannedMeal.recipeId] : []),
        });
      }
    });
  });

  const now = new Date();
  const listId = randomUUID();
  const db = getDatabase();
  const supermarketProfileId = getListSettings().defaultSupermarketProfileId;
  db.transaction(() => {
    db.insert(shoppingLists)
      .values({
        id: listId,
        name: `Week of ${weekStart}`,
        weekStart,
        weekEnd,
        sourceMode: 'planned_all',
        sourceKey: null,
        archivedAt: null,
        supermarketProfileId,
        createdByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    combined
      .sort((a, b) => a.item.localeCompare(b.item))
      .forEach((item, position) => {
        db.insert(shoppingListItems)
          .values({
            id: randomUUID(),
            listId,
            position,
            quantity: item.quantity,
            unit: item.unit,
            item: item.item,
            note: item.note,
            aisleId: resolveShoppingAisle(
              supermarketProfileId,
              { item: item.item, shoppingCategory: item.shoppingCategory },
              db,
            ),
            checked: false,
            shoppingState: 'to_buy',
            sourceRecipeIds: JSON.stringify([...item.sourceRecipeIds]),
            createdAt: now,
            updatedAt: now,
          })
          .run();
      });
  });
  return getShoppingList(listId) as ShoppingListDetail;
}

export function listShoppingLists(includeArchived = false): ShoppingListSummary[] {
  ensureDatabase();
  const database = getDatabase();
  const profiles = new Map(listSupermarketProfiles(true).map((profile) => [profile.id, profile]));
  const automaticRestockListId = getListSettings().automaticRestockListId;
  const itemCounts = new Map(
    database
      .select({
        listId: shoppingListItems.listId,
        itemCount: sql<number>`count(*)`,
        checkedCount: sql<number>`sum(case when ${shoppingListItems.checked} = 1 then 1 else 0 end)`,
        toBuyCount: sql<number>`sum(case when ${shoppingListItems.shoppingState} = 'to_buy' then 1 else 0 end)`,
        inCartCount: sql<number>`sum(case when ${shoppingListItems.shoppingState} = 'in_cart' then 1 else 0 end)`,
        cantFindCount: sql<number>`sum(case when ${shoppingListItems.shoppingState} = 'cant_find' then 1 else 0 end)`,
        sourcedCount: sql<number>`sum(case when ${shoppingListItems.shoppingState} = 'sourced' then 1 else 0 end)`,
      })
      .from(shoppingListItems)
      .groupBy(shoppingListItems.listId)
      .all()
      .map((row) => [row.listId, row] as const),
  );
  return database
    .select()
    .from(shoppingLists)
    .orderBy(desc(shoppingLists.createdAt))
    .all()
    .filter((list) => includeArchived || list.archivedAt === null)
    .map((list) => {
      const counts = itemCounts.get(list.id);
      const toBuyCount = Number(counts?.toBuyCount ?? 0);
      const inCartCount = Number(counts?.inCartCount ?? 0);
      const cantFindCount = Number(counts?.cantFindCount ?? 0);
      const sourcedCount = Number(counts?.sourcedCount ?? 0);
      const profile = list.supermarketProfileId
        ? (profiles.get(list.supermarketProfileId) ?? null)
        : null;
      return {
        ...list,
        itemCount: Number(counts?.itemCount ?? 0),
        checkedCount: Number(counts?.checkedCount ?? 0),
        toBuyCount,
        inCartCount,
        cantFindCount,
        sourcedCount,
        openCount: toBuyCount + inCartCount + cantFindCount,
        needsAttentionCount: toBuyCount + cantFindCount,
        sourceKind: shoppingListSourceKind(list.sourceMode),
        supermarketName: profile?.name ?? null,
        supermarketLocation: profile?.locationLabel ?? '',
        isAutomaticRestockTarget: list.id === automaticRestockListId,
      };
    });
}

export function createManualShoppingList(
  name: string,
  actorProfileId: string,
  makeAutomaticRestockTarget = false,
): ShoppingListDetail {
  ensureDatabase();
  const now = new Date();
  const id = randomUUID();
  getDatabase()
    .insert(shoppingLists)
    .values({
      id,
      name,
      weekStart: '',
      weekEnd: '',
      sourceMode: 'manual',
      sourceKey: null,
      archivedAt: null,
      supermarketProfileId: getListSettings().defaultSupermarketProfileId,
      createdByProfileId: actorProfileId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  if (makeAutomaticRestockTarget) setAutomaticRestockList(id, actorProfileId);
  return getShoppingList(id)!;
}

export function manageShoppingList(
  listId: string,
  action:
    | { action: 'rename'; name: string }
    | { action: 'set_notes'; note: string; expectedVersion: number }
    | {
        action: 'archive' | 'restore' | 'duplicate' | 'set_restock_target' | 'complete';
      },
  actorProfileId: string,
) {
  ensureDatabase();
  const database = getDatabase();
  const list = database.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
  if (!list) throw new PlanningNotFoundError('That shopping list no longer exists.');
  if (action.action === 'set_notes') {
    database.transaction((transaction) => {
      const current = transaction
        .select()
        .from(shoppingListNotes)
        .where(eq(shoppingListNotes.listId, listId))
        .get();
      if ((current?.version ?? 0) !== action.expectedVersion)
        throw new PlanningNotFoundError('These notes changed. Reload before saving your changes.');
      transaction
        .insert(shoppingListNotes)
        .values({
          listId,
          note: action.note,
          version: action.expectedVersion + 1,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: shoppingListNotes.listId,
          set: { note: action.note, version: action.expectedVersion + 1, updatedAt: new Date() },
        })
        .run();
    });
    return getShoppingList(listId)!;
  }
  if (action.action === 'rename') {
    database
      .update(shoppingLists)
      .set({ name: action.name, updatedAt: new Date() })
      .where(eq(shoppingLists.id, listId))
      .run();
    return getShoppingList(listId)!;
  }
  if (action.action === 'set_restock_target') {
    switchAutomaticRestockTarget(listId, actorProfileId);
    return getShoppingList(listId)!;
  }
  if (action.action === 'complete') {
    database.transaction((transaction) => {
      const now = new Date();
      const inCartIds = transaction
        .select({ id: shoppingListItems.id })
        .from(shoppingListItems)
        .where(
          and(eq(shoppingListItems.listId, listId), eq(shoppingListItems.shoppingState, 'in_cart')),
        )
        .all()
        .map((item) => item.id);
      if (inCartIds.length) {
        transaction
          .update(shoppingPolicyInstances)
          .set({ state: 'satisfied', updatedByProfileId: actorProfileId, updatedAt: now })
          .where(inArray(shoppingPolicyInstances.shoppingListItemId, inCartIds))
          .run();
      }
      transaction
        .update(shoppingListItems)
        .set({ checked: true, shoppingState: 'sourced', updatedAt: now })
        .where(
          and(eq(shoppingListItems.listId, listId), eq(shoppingListItems.shoppingState, 'in_cart')),
        )
        .run();
      transaction
        .update(shoppingLists)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(shoppingLists.id, listId))
        .run();
    });
    if (getListSettings().automaticRestockListId === listId) {
      setAutomaticRestockList(null, actorProfileId);
    }
    return getShoppingList(listId)!;
  }
  if (action.action === 'archive' || action.action === 'restore') {
    const archived = action.action === 'archive';
    database
      .update(shoppingLists)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(shoppingLists.id, listId))
      .run();
    if (archived && getListSettings().automaticRestockListId === listId) {
      setAutomaticRestockList(null, actorProfileId);
    }
    return getShoppingList(listId)!;
  }
  const duplicateId = randomUUID();
  database.transaction((transaction) => {
    const now = new Date();
    transaction
      .insert(shoppingLists)
      .values({
        ...list,
        id: duplicateId,
        name: `Copy of ${list.name}`.slice(0, 120),
        sourceMode: 'manual',
        sourceKey: null,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const notes = transaction
      .select()
      .from(shoppingListNotes)
      .where(eq(shoppingListNotes.listId, listId))
      .get();
    if (notes)
      transaction
        .insert(shoppingListNotes)
        .values({ listId: duplicateId, note: notes.note, version: 1, updatedAt: now })
        .run();
    const items = transaction
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, listId))
      .orderBy(asc(shoppingListItems.position))
      .all();
    for (const item of items) {
      const nextItemId = randomUUID();
      transaction
        .insert(shoppingListItems)
        .values({ ...item, id: nextItemId, listId: duplicateId, createdAt: now, updatedAt: now })
        .run();
      const pantry = transaction
        .select()
        .from(pantryShoppingItemDetails)
        .where(eq(pantryShoppingItemDetails.shoppingListItemId, item.id))
        .get();
      if (pantry) {
        transaction
          .insert(pantryShoppingItemDetails)
          .values({
            ...pantry,
            shoppingListItemId: nextItemId,
            generationKey: `duplicate:${duplicateId}:${pantry.generationKey}`,
            generatedAt: now,
            updatedAt: now,
          })
          .run();
      }
    }
  });
  return getShoppingList(duplicateId)!;
}

export function deleteShoppingList(listId: string): void {
  ensureDatabase();
  const database = getDatabase();
  const itemIds = database
    .select({ id: shoppingListItems.id })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId))
    .all()
    .map(({ id }) => id);
  if (
    !database
      .select({ id: shoppingLists.id })
      .from(shoppingLists)
      .where(eq(shoppingLists.id, listId))
      .get()
  ) {
    throw new PlanningNotFoundError('That shopping list no longer exists.');
  }
  if (
    itemIds.length &&
    database
      .select({ id: pantryPurchaseIntakes.id })
      .from(pantryPurchaseIntakes)
      .where(inArray(pantryPurchaseIntakes.shoppingListItemId, itemIds))
      .get()
  ) {
    throw new PlanningNotFoundError(
      'Archive this list instead because it has Pantry purchase history.',
    );
  }
  database.delete(shoppingLists).where(eq(shoppingLists.id, listId)).run();
}

export function getShoppingList(listId: string): ShoppingListDetail | null {
  ensureDatabase();
  const list = getDatabase().select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
  if (!list) return null;
  const items = getDatabase()
    .select()
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId))
    .orderBy(asc(shoppingListItems.position))
    .all();
  const pantryDetails = getShoppingItemPantryDetails(items.map((item) => item.id));
  const notes = getDatabase()
    .select()
    .from(shoppingListNotes)
    .where(eq(shoppingListNotes.listId, listId))
    .get();
  return {
    ...list,
    notes: notes?.note ?? '',
    notesVersion: notes?.version ?? 0,
    aisles: list.supermarketProfileId
      ? listAislesForSupermarket(list.supermarketProfileId)
      : listShoppingAisles(),
    settings: getListSettings(),
    supermarketProfile: getSupermarketProfile(list.supermarketProfileId),
    supermarketProfiles: listSupermarketProfiles(false),
    policyReviews: getShoppingPolicyReviews(listId),
    isAutomaticRestockTarget: getListSettings().automaticRestockListId === listId,
    items: items
      .map((item) => {
        const pantry = pantryDetails.get(item.id) ?? null;
        return { ...item, pantry, policyBreakdown: shoppingPolicyBreakdown(pantry) };
      })
      .filter(
        (item) =>
          !item.pantry ||
          item.pantry.generationMode === 'all' ||
          item.pantry.demandState === 'uncertain' ||
          item.pantry.demandState === 'manual' ||
          item.pantry.shortageQuantity !== 0,
      ),
  };
}

export function listShoppingAisles(): Array<typeof shoppingAisles.$inferSelect> {
  ensureDatabase();
  return getDatabase().select().from(shoppingAisles).orderBy(asc(shoppingAisles.position)).all();
}

function aisleIdOrNull(aisleId: string): string | null {
  if (!aisleId) return null;
  const aisle = getDatabase()
    .select({ id: shoppingAisles.id })
    .from(shoppingAisles)
    .where(eq(shoppingAisles.id, aisleId))
    .get();
  if (!aisle) throw new PlanningNotFoundError('That shopping aisle no longer exists.');
  return aisle.id;
}

export function createShoppingAisle(input: ShoppingAisleInput): typeof shoppingAisles.$inferSelect {
  ensureDatabase();
  const db = getDatabase();
  if (
    db
      .select({ id: shoppingAisles.id })
      .from(shoppingAisles)
      .where(eq(shoppingAisles.name, input.name))
      .get()
  )
    throw new PlanningNotFoundError('That shopping aisle already exists.');
  const last = db
    .select({ position: shoppingAisles.position })
    .from(shoppingAisles)
    .orderBy(desc(shoppingAisles.position))
    .limit(1)
    .get();
  const now = new Date();
  const aisle = {
    id: randomUUID(),
    name: input.name,
    position: (last?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(shoppingAisles).values(aisle).run();
  return aisle;
}

export function reorderShoppingAisles(aisleIds: string[]): void {
  ensureDatabase();
  const current = listShoppingAisles();
  if (current.length !== aisleIds.length || current.some((aisle) => !aisleIds.includes(aisle.id)))
    throw new PlanningNotFoundError('Use the current set of shopping aisles.');
  const db = getDatabase();
  db.transaction(() =>
    aisleIds.forEach((id, position) =>
      db
        .update(shoppingAisles)
        .set({ position, updatedAt: new Date() })
        .where(eq(shoppingAisles.id, id))
        .run(),
    ),
  );
}

export function removeShoppingAisle(aisleId: string): void {
  ensureDatabase();
  const result = getDatabase().delete(shoppingAisles).where(eq(shoppingAisles.id, aisleId)).run();
  if (!result.changes) throw new PlanningNotFoundError('That shopping aisle no longer exists.');
}

function parsedJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function addShoppingListItem(
  listId: string,
  input: ShoppingListItemInput,
  actorProfileId?: string,
): typeof shoppingListItems.$inferSelect {
  ensureDatabase();
  const list = getDatabase().select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
  if (!list) throw new PlanningNotFoundError('That shopping list no longer exists.');
  const db = getDatabase();
  if (input.productId) {
    const existing = db
      .select({ item: shoppingListItems, pantry: pantryShoppingItemDetails })
      .from(shoppingListItems)
      .innerJoin(
        pantryShoppingItemDetails,
        eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItems.id),
      )
      .where(
        and(
          eq(shoppingListItems.listId, listId),
          eq(pantryShoppingItemDetails.productId, input.productId),
        ),
      )
      .get();
    if (existing) {
      const formula = parsedJsonObject(existing.pantry.formulaInputs);
      if (input.recommendationKey && formula.recommendationKey === input.recommendationKey) {
        return existing.item;
      }
      const quantity = input.quantity === '' ? null : input.quantity;
      const compatible =
        quantity !== null &&
        existing.item.quantity !== null &&
        existing.item.unit.toLocaleLowerCase() === input.unit.toLocaleLowerCase();
      const mergedQuantity = compatible
        ? Number((existing.item.quantity! + quantity).toFixed(6))
        : existing.item.quantity;
      const provenance = parsedJsonObject(existing.pantry.provenance);
      const recommendationKeys = [
        ...new Set(
          [
            ...(Array.isArray(provenance.recommendationKeys)
              ? provenance.recommendationKeys.filter(
                  (value): value is string => typeof value === 'string',
                )
              : []),
            typeof provenance.recommendationKey === 'string' ? provenance.recommendationKey : null,
            input.recommendationKey ?? null,
          ].filter((value): value is string => Boolean(value)),
        ),
      ];
      db.transaction((transaction) => {
        transaction
          .update(shoppingListItems)
          .set({
            quantity: mergedQuantity,
            note: [
              existing.item.note,
              input.note,
              compatible || quantity === null ? '' : `Review additional ${quantity} ${input.unit}`,
            ]
              .filter(Boolean)
              .join(' · ')
              .slice(0, 240),
            updatedAt: new Date(),
          })
          .where(eq(shoppingListItems.id, existing.item.id))
          .run();
        transaction
          .update(pantryShoppingItemDetails)
          .set({
            generatedQuantity: compatible ? mergedQuantity : existing.pantry.generatedQuantity,
            shortageQuantity: compatible ? mergedQuantity : existing.pantry.shortageQuantity,
            formulaInputs: JSON.stringify({
              ...formula,
              recommendationKeys,
            }),
            provenance: JSON.stringify({ ...provenance, recommendationKeys }),
            updatedAt: new Date(),
          })
          .where(eq(pantryShoppingItemDetails.shoppingListItemId, existing.item.id))
          .run();
      });
      return db
        .select()
        .from(shoppingListItems)
        .where(eq(shoppingListItems.id, existing.item.id))
        .get()!;
    }
  }
  const lastItem = db
    .select({ position: shoppingListItems.position })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId))
    .orderBy(desc(shoppingListItems.position))
    .limit(1)
    .get();
  const now = new Date();
  const item: typeof shoppingListItems.$inferInsert = {
    id: randomUUID(),
    listId,
    position: (lastItem?.position ?? -1) + 1,
    quantity: input.quantity === '' ? null : input.quantity,
    unit: input.unit,
    item: input.item,
    note: input.note,
    aisleId:
      input.aisleId === undefined
        ? resolveShoppingAisle(list.supermarketProfileId, { item: input.item }, db)
        : aisleIdOrNull(input.aisleId),
    checked: input.checked,
    shoppingState: input.checked ? 'sourced' : (input.shoppingState ?? 'to_buy'),
    cartQuantity: input.cartQuantity ?? 0,
    cartLabel: input.cartLabel ?? '',
    sourceRecipeIds: JSON.stringify(input.recipeId ? [input.recipeId] : []),
    createdAt: now,
    updatedAt: now,
  };
  db.transaction((transaction) => {
    transaction.insert(shoppingListItems).values(item).run();
    if (input.productId) {
      transaction
        .insert(pantryShoppingItemDetails)
        .values({
          shoppingListItemId: item.id,
          productId: input.productId,
          demandState: 'manual',
          generatedQuantity: input.quantity === '' ? null : input.quantity,
          generatedUnit: input.unit,
          shortageQuantity: input.quantity === '' ? null : input.quantity,
          uncertaintyReason: null,
          formulaInputs: JSON.stringify({
            source: 'nutrition_recommendation',
            recommendationKey: input.recommendationKey ?? null,
          }),
          provenance: JSON.stringify({
            source: 'nutrition_recommendation',
            recommendationKey: input.recommendationKey ?? null,
            recipeId: input.recipeId ?? null,
            productId: input.productId,
            actorProfileId: actorProfileId ?? null,
          }),
          generationKey: `nutrition:${input.recommendationKey ?? item.id}:${input.productId}`,
          manualQuantityOverride: false,
          manualUnitOverride: false,
          manualItemOverride: false,
          manualNoteOverride: false,
          generationMode: 'missing',
          coverageState: 'active',
          manualExtraQuantity: 0,
          manualExtraUnit: '',
          coveredQuantity: 0,
          coveredUnit: '',
          purchasedQuantity: 0,
          purchasedUnit: '',
          controlNote: '',
          generatedAt: now,
          updatedAt: now,
        })
        .run();
    }
  });
  if (actorProfileId && input.aisleId !== undefined)
    rememberShoppingAisle(
      list.supermarketProfileId,
      input.item,
      input.productId ?? null,
      item.aisleId ?? null,
      actorProfileId,
      db,
    );
  return db.select().from(shoppingListItems).where(eq(shoppingListItems.id, item.id)).get()!;
}

export function updateShoppingListItem(
  listId: string,
  itemId: string,
  input: ShoppingListItemInput,
  actorProfileId?: string,
): void {
  ensureDatabase();
  getDatabase().transaction((transaction) => {
    const previous = transaction
      .select()
      .from(shoppingListItems)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
      .get();
    if (!previous) throw new PlanningNotFoundError('That shopping-list item no longer exists.');
    const list = transaction.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
    if (!list) throw new PlanningNotFoundError('That shopping list no longer exists.');
    const next = {
      quantity: input.quantity === '' ? null : input.quantity,
      unit: input.unit,
      item: input.item,
      note: input.note,
    };
    const result = transaction
      .update(shoppingListItems)
      .set({
        ...next,
        aisleId:
          input.aisleId === undefined
            ? resolveShoppingAisle(list.supermarketProfileId, { item: input.item }, transaction)
            : aisleIdOrNull(input.aisleId),
        checked: input.checked,
        cartQuantity: input.cartQuantity ?? previous.cartQuantity,
        cartLabel: input.cartLabel ?? previous.cartLabel,
        shoppingState:
          input.checked || input.shoppingState === 'sourced'
            ? 'sourced'
            : (input.shoppingState ?? 'to_buy'),
        updatedAt: new Date(),
      })
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
      .run();
    if (!result.changes)
      throw new PlanningNotFoundError('That shopping-list item no longer exists.');
    recordShoppingItemManualOverrides(itemId, previous, next, transaction);
    if (shoppingItemIdentity(previous.item) !== shoppingItemIdentity(next.item)) {
      transaction
        .update(pantryShoppingItemDetails)
        .set({
          productId: null,
          demandState: 'uncertain',
          uncertaintyReason:
            'Food changed. Match the replacement to a pantry product before recording a purchase.',
          updatedAt: new Date(),
        })
        .where(eq(pantryShoppingItemDetails.shoppingListItemId, itemId))
        .run();
    }
    const policyInstance = transaction
      .select()
      .from(shoppingPolicyInstances)
      .where(eq(shoppingPolicyInstances.shoppingListItemId, itemId))
      .get();
    if (policyInstance) {
      const sourced = input.checked || input.shoppingState === 'sourced';
      transaction
        .update(shoppingPolicyInstances)
        .set({
          state: sourced
            ? 'satisfied'
            : policyInstance.state === 'satisfied'
              ? 'active'
              : policyInstance.state,
          updatedByProfileId: actorProfileId ?? policyInstance.updatedByProfileId,
          updatedAt: new Date(),
        })
        .where(eq(shoppingPolicyInstances.id, policyInstance.id))
        .run();
    }
    if (actorProfileId && input.aisleId !== undefined)
      rememberShoppingAisle(
        list.supermarketProfileId,
        input.item,
        getShoppingListProductId(itemId),
        aisleIdOrNull(input.aisleId),
        actorProfileId,
        transaction,
      );
  });
}

export function createRetryShoppingList(
  sourceListId: string,
  supermarketProfileId: string,
  actorProfileId: string,
): ShoppingListDetail {
  ensureDatabase();
  const database = getDatabase();
  const source = database
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.id, sourceListId))
    .get();
  if (!source) throw new PlanningNotFoundError('That shopping list no longer exists.');
  if (source.supermarketProfileId === supermarketProfileId)
    throw new PlanningNotFoundError('Choose a different supermarket for these items.');
  const profile = getSupermarketProfile(supermarketProfileId, false);
  if (!profile) throw new PlanningNotFoundError('Choose an active supermarket profile.');

  const missing = database
    .select({ item: shoppingListItems, pantry: pantryShoppingItemDetails })
    .from(shoppingListItems)
    .leftJoin(
      pantryShoppingItemDetails,
      eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItems.id),
    )
    .where(
      and(
        eq(shoppingListItems.listId, sourceListId),
        eq(shoppingListItems.shoppingState, 'cant_find'),
      ),
    )
    .all();
  if (!missing.length)
    throw new PlanningNotFoundError('Mark at least one item as can’t find first.');

  const sectionPosition = new Map(
    profile.sections.map((section) => [section.aisleId, section.position]),
  );
  const routed = missing
    .map((entry) => ({
      ...entry,
      aisleId: resolveShoppingAisle(
        supermarketProfileId,
        { item: entry.item.item, productId: entry.pantry?.productId ?? null },
        database,
      ),
    }))
    .sort(
      (left, right) =>
        (sectionPosition.get(left.aisleId ?? '') ?? Number.MAX_SAFE_INTEGER) -
          (sectionPosition.get(right.aisleId ?? '') ?? Number.MAX_SAFE_INTEGER) ||
        left.item.item.localeCompare(right.item.item),
    );

  const now = new Date();
  const listId = randomUUID();
  database.transaction((transaction) => {
    transaction
      .insert(shoppingLists)
      .values({
        id: listId,
        name: `${source.name} · ${profile.name}`.slice(0, 120),
        weekStart: '',
        weekEnd: '',
        sourceMode: 'manual',
        sourceKey: null,
        archivedAt: null,
        supermarketProfileId,
        createdByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    routed.forEach((entry, position) => {
      const itemId = randomUUID();
      transaction
        .insert(shoppingListItems)
        .values({
          ...entry.item,
          id: itemId,
          listId,
          position,
          aisleId: entry.aisleId,
          checked: false,
          shoppingState: 'to_buy',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      if (entry.pantry) {
        transaction
          .insert(pantryShoppingItemDetails)
          .values({
            ...entry.pantry,
            shoppingListItemId: itemId,
            generationKey: `retry:${listId}:${entry.pantry.generationKey}`,
            generatedAt: now,
            updatedAt: now,
          })
          .run();
      }
    });
  });
  return getShoppingList(listId)!;
}

export function removeShoppingListItem(listId: string, itemId: string): void {
  ensureDatabase();
  getDatabase().transaction((transaction) => {
    const instance = transaction
      .select()
      .from(shoppingPolicyInstances)
      .where(
        and(
          eq(shoppingPolicyInstances.listId, listId),
          eq(shoppingPolicyInstances.shoppingListItemId, itemId),
        ),
      )
      .get();
    if (instance) {
      transaction
        .update(shoppingPolicyInstances)
        .set({ state: 'dismissed', shoppingListItemId: null, updatedAt: new Date() })
        .where(eq(shoppingPolicyInstances.id, instance.id))
        .run();
    }
    const result = transaction
      .delete(shoppingListItems)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
      .run();
    if (!result.changes)
      throw new PlanningNotFoundError('That shopping-list item no longer exists.');
  });
}

export function reorderShoppingListItems(listId: string, itemIds: string[]): void {
  ensureDatabase();
  const current = getShoppingList(listId);
  if (
    !current ||
    current.items.length !== itemIds.length ||
    current.items.some((item) => !itemIds.includes(item.id))
  )
    throw new PlanningNotFoundError('Use the current list item order.');
  const db = getDatabase();
  db.transaction(() =>
    itemIds.forEach((itemId, position) =>
      db
        .update(shoppingListItems)
        .set({ position, updatedAt: new Date() })
        .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
        .run(),
    ),
  );
}
