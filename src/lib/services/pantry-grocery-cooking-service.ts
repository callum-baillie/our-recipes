import { parseMealPlanIngredientSnapshot } from '@/lib/domain/meal-plan-snapshot';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  cookSessions,
  pantryCookSessionDeductions,
  pantryCookSessionLeftovers,
  pantryCookSessionPlans,
  pantryPurchaseIntakes,
  pantryShoppingItemDetails,
  pantryBatches,
  pantryProducts,
  shoppingPolicyInstances,
  profiles,
  mealPlanEntries,
  nutritionPreparedRecipeInstances,
  recipeIngredientProductMappings,
  recipeIngredients,
  recipes,
  shoppingListItems,
  shoppingLists,
} from '@/lib/db/schema';
import {
  areInventoryUnitsCompatible,
  convertInventoryQuantity,
  normalizeInventoryUnit,
} from '@/lib/domain/inventory-units';
import { calculatePantryRestock } from '@/lib/domain/pantry-restock';
import { parseServingCount } from '@/lib/domain/ingredient-scaling';
import { localIsoDate } from '@/lib/domain/local-date';
import {
  preferredShoppingItemLabel,
  shoppingItemIdentity,
} from '@/lib/domain/shopping-item-identity';
import { pantryBatchInputSchema } from '@/lib/domain/pantry';
import {
  pantryPurchaseIntakeSchema,
  pantryShoppingControlSchema,
  pantryShoppingMatchSchema,
  pantryShortageGenerationSchema,
  type PantryCookConfirmationInput,
  type PantryPurchaseIntakeInput,
  type PantryShortageGenerationInput,
  type PantryShoppingControlInput,
  type PantryShoppingMatchInput,
} from '@/lib/domain/pantry-grocery-cooking';
import {
  getProjectedPantryDemand,
  getRecipePantryAvailability,
} from '@/lib/services/pantry-availability-service';
import {
  consumePantryProductStockInTransaction,
  createPantryBatchInTransaction,
  getPantryDashboard,
  PantryConflictError,
  PantryNotFoundError,
  previewPantryProductConsumption,
  type AppTransaction,
  undoPantryConsumptionEventsInTransaction,
} from '@/lib/services/pantry-service';
import {
  getListSettings,
  resolveShoppingAisle,
  setAutomaticRestockList,
} from '@/lib/services/list-settings-service';

export class PantryGroceryCookingNotFoundError extends Error {}
export class PantryGroceryCookingConflictError extends Error {}
export class PantryGroceryCookingPrerequisiteError extends Error {}

export type ShoppingDetail = typeof pantryShoppingItemDetails.$inferSelect;

export type ShoppingPolicyBreakdown = {
  mode: 'always_have' | 'always_buy';
  trigger: 'below_target' | 'reorder_point' | 'empty';
  recipeRequirement: number;
  targetStock: number | null;
  purchaseIncrement: number | null;
  policyContribution: number | null;
  usablePantry: number;
  pendingCoverage: number;
  recordedCoverage: number;
  unroundedPurchaseGoal: number | null;
  roundedPurchaseGoal: number | null;
  finalBuyQuantity: number | null;
  unit: string;
  needsReview: boolean;
  reviewReason: string | null;
};

export function shoppingPolicyBreakdown(
  detail: ShoppingDetail | null,
): ShoppingPolicyBreakdown | null {
  if (!detail) return null;
  try {
    const value = JSON.parse(detail.formulaInputs) as Record<string, unknown>;
    if (value.restockMode !== 'always_have' && value.restockMode !== 'always_buy') return null;
    const numberOrNull = (input: unknown) =>
      typeof input === 'number' && Number.isFinite(input) ? input : null;
    return {
      mode: value.restockMode,
      trigger:
        value.restockTrigger === 'reorder_point' || value.restockTrigger === 'empty'
          ? value.restockTrigger
          : 'below_target',
      recipeRequirement: numberOrNull(value.recipeRequirement) ?? 0,
      targetStock: numberOrNull(value.targetStock),
      purchaseIncrement: numberOrNull(value.purchaseIncrement),
      policyContribution: numberOrNull(value.policyContribution),
      usablePantry: numberOrNull(value.usablePantry) ?? 0,
      pendingCoverage: numberOrNull(value.pendingCoverage) ?? 0,
      recordedCoverage: (numberOrNull(value.purchased) ?? 0) + (numberOrNull(value.covered) ?? 0),
      unroundedPurchaseGoal: numberOrNull(value.unroundedPurchaseGoal),
      roundedPurchaseGoal: numberOrNull(value.roundedPurchaseGoal),
      finalBuyQuantity: detail.shortageQuantity,
      unit: typeof value.unit === 'string' ? value.unit : detail.generatedUnit,
      needsReview: value.needsReview === true,
      reviewReason: typeof value.reviewReason === 'string' ? value.reviewReason : null,
    };
  } catch {
    return null;
  }
}

function provenanceForDemand(demand: ReturnType<typeof getProjectedPantryDemand>) {
  return {
    weekStart: demand.weekStart,
    weekEnd: demand.weekEnd,
    generatedFrom: 'projected-pantry-demand-v1',
  } as const;
}

type DemandContribution = {
  mealPlanEntryId: string;
  plannedFor: string;
  recipeId: string | null;
  recipeTitle: string;
  servings: number;
  baseServings: number | null;
  ingredientId: string;
  ingredientName: string;
  productId: string | null;
  requiredQuantity: number | null;
  sourceUnit: string;
  contributionQuantity: number | null;
  contributionUnit: string;
};

function demandContributionIndex(demand: ReturnType<typeof getProjectedPantryDemand>) {
  const mealIds = [
    ...new Set([
      ...demand.lines.flatMap((line) => line.meals.map((meal) => meal.mealPlanEntryId)),
      ...demand.unknown.map((line) => line.mealPlanEntryId),
    ]),
  ];
  if (!mealIds.length) return new Map<string, DemandContribution[]>();
  const db = getDatabase();
  const meals = db
    .select({
      id: mealPlanEntries.id,
      plannedFor: mealPlanEntries.plannedFor,
      servings: mealPlanEntries.servings,
      recipeId: mealPlanEntries.recipeId,
      recipeTitle: recipes.title,
      baseServingsText: recipes.servings,
      snapshot: mealPlanEntries.recipeIngredientsSnapshot,
      title: mealPlanEntries.title,
      recipeTitleSnapshot: mealPlanEntries.recipeTitleSnapshot,
    })
    .from(mealPlanEntries)
    .leftJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
    .where(inArray(mealPlanEntries.id, mealIds))
    .all();
  const recipeIds = [...new Set(meals.map((meal) => meal.recipeId).filter(Boolean))] as string[];
  const ingredients = recipeIds.length
    ? db
        .select({
          id: recipeIngredients.id,
          recipeId: recipeIngredients.recipeId,
          ingredientName: recipeIngredients.item,
          quantity: recipeIngredients.quantity,
          unit: recipeIngredients.unit,
          productId: recipeIngredientProductMappings.productId,
          isOptional: recipeIngredientProductMappings.isOptional,
        })
        .from(recipeIngredients)
        .leftJoin(
          recipeIngredientProductMappings,
          eq(recipeIngredientProductMappings.recipeIngredientId, recipeIngredients.id),
        )
        .where(inArray(recipeIngredients.recipeId, recipeIds))
        .all()
    : [];
  const result = new Map<string, DemandContribution[]>();
  for (const meal of meals) {
    const snapshot = parseMealPlanIngredientSnapshot(meal.snapshot);
    const baseServings = parseServingCount(snapshot?.baseServings ?? meal.baseServingsText ?? '');
    const mealIngredients = snapshot
      ? snapshot.ingredients.map((item) => ({
          ...item,
          id: item.ingredientId,
          ingredientName: item.item,
        }))
      : ingredients.filter((item) => item.recipeId === meal.recipeId);
    for (const ingredient of mealIngredients) {
      if (ingredient.isOptional) continue;
      const ingredientUnit = ingredient.unit.trim() || (ingredient.quantity !== null ? 'each' : '');
      const requiredQuantity =
        ingredient.quantity !== null && ingredientUnit && baseServings
          ? Number(((ingredient.quantity * meal.servings) / baseServings).toFixed(6))
          : null;
      const contribution: DemandContribution = {
        mealPlanEntryId: meal.id,
        plannedFor: meal.plannedFor,
        recipeId: meal.recipeId,
        recipeTitle: meal.recipeTitleSnapshot || meal.recipeTitle || meal.title,
        servings: meal.servings,
        baseServings,
        ingredientId: ingredient.id,
        ingredientName: ingredient.ingredientName,
        productId: ingredient.productId,
        requiredQuantity,
        sourceUnit: ingredientUnit,
        contributionQuantity: requiredQuantity,
        contributionUnit: ingredientUnit,
      };
      result.set(meal.id, [...(result.get(meal.id) ?? []), contribution]);
    }
  }
  return result;
}

function retireInactivePolicyInstances(
  listId: string,
  actorProfileId: string,
  transaction: AppTransaction,
) {
  const rows = transaction
    .select({ instance: shoppingPolicyInstances, product: pantryProducts, item: shoppingListItems })
    .from(shoppingPolicyInstances)
    .innerJoin(pantryProducts, eq(pantryProducts.id, shoppingPolicyInstances.productId))
    .leftJoin(
      shoppingListItems,
      eq(shoppingListItems.id, shoppingPolicyInstances.shoppingListItemId),
    )
    .where(eq(shoppingPolicyInstances.listId, listId))
    .all()
    .filter(({ product }) => product.archivedAt !== null || product.restockMode === 'none');
  for (const { instance, item } of rows) {
    const detail = item
      ? transaction
          .select()
          .from(pantryShoppingItemDetails)
          .where(eq(pantryShoppingItemDetails.shoppingListItemId, item.id))
          .get()
      : null;
    let sources: unknown = ['protected'];
    try {
      sources = JSON.parse(item?.sourceRecipeIds || '[]');
    } catch {
      /* preserve malformed rows */
    }
    const autoOnly =
      Boolean(item) &&
      Array.isArray(sources) &&
      sources.length === 0 &&
      !detail?.manualQuantityOverride &&
      !detail?.manualUnitOverride &&
      !detail?.manualItemOverride &&
      !detail?.manualNoteOverride;
    transaction
      .update(shoppingPolicyInstances)
      .set({
        state: 'moved',
        shoppingListItemId: autoOnly ? null : instance.shoppingListItemId,
        updatedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(eq(shoppingPolicyInstances.id, instance.id))
      .run();
    if (autoOnly && item)
      transaction.delete(shoppingListItems).where(eq(shoppingListItems.id, item.id)).run();
  }
}

function sourceRecipeIds(contributions: DemandContribution[]): string[] {
  return [
    ...new Set(
      contributions.flatMap((contribution) =>
        contribution.recipeId ? [contribution.recipeId] : [],
      ),
    ),
  ];
}

export function formatMealPlanShoppingListName(weekStart: string, weekEnd: string): string {
  const shortDate = (value: string) => {
    const [, month, day] = value.split('-');
    return month && day ? `${month}/${day}` : value;
  };
  return `Meal Plan ${shortDate(weekStart)} - ${shortDate(weekEnd)}`;
}

export function generatePantryShortageList(
  input: PantryShortageGenerationInput,
  actorProfileId: string,
) {
  ensureDatabase();
  const parsedInput = pantryShortageGenerationSchema.parse(input);
  const demand = getProjectedPantryDemand(parsedInput.weekStart, parsedInput.weekEnd, {
    groceryOnly: true,
  });
  const contributionsByMeal = demandContributionIndex(demand);
  const db = getDatabase();
  const defaultSupermarketProfileId = getListSettings().defaultSupermarketProfileId;
  return db.transaction((transaction) => {
    const now = new Date();
    const sourceKey = `meal-plan:${parsedInput.weekStart}:${parsedInput.weekEnd}:${parsedInput.mode}`;
    const durableList = parsedInput.listId
      ? null
      : transaction
          .select()
          .from(shoppingLists)
          .where(eq(shoppingLists.sourceKey, sourceKey))
          .get();
    const listId = parsedInput.listId ?? durableList?.id ?? randomUUID();
    retireInactivePolicyInstances(listId, actorProfileId, transaction);
    const existingList =
      durableList ??
      transaction.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
    const restored = Boolean(existingList?.archivedAt);
    if (!existingList && !demand.lines.length && !demand.unknown.length) {
      throw new PantryGroceryCookingPrerequisiteError(
        'Plan at least one recipe meal before generating a shopping list.',
      );
    }
    if (parsedInput.listId && !existingList)
      throw new PantryGroceryCookingNotFoundError('That shopping list no longer exists.');
    if (
      existingList &&
      (existingList.weekStart !== parsedInput.weekStart ||
        existingList.weekEnd !== parsedInput.weekEnd)
    )
      throw new PantryGroceryCookingConflictError(
        'Regenerate this list with its original week range.',
      );
    if (!existingList) {
      transaction
        .insert(shoppingLists)
        .values({
          id: listId,
          name: formatMealPlanShoppingListName(parsedInput.weekStart, parsedInput.weekEnd),
          weekStart: parsedInput.weekStart,
          weekEnd: parsedInput.weekEnd,
          sourceMode: parsedInput.mode === 'missing' ? 'pantry_missing' : 'pantry_all',
          sourceKey,
          archivedAt: null,
          supermarketProfileId: defaultSupermarketProfileId,
          createdByProfileId: actorProfileId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    const supermarketProfileId = existingList?.supermarketProfileId ?? defaultSupermarketProfileId;

    const existingDetails = transaction
      .select()
      .from(pantryShoppingItemDetails)
      .innerJoin(
        shoppingListItems,
        eq(shoppingListItems.id, pantryShoppingItemDetails.shoppingListItemId),
      )
      .where(eq(shoppingListItems.listId, listId))
      .all();
    const byKey = new Map(
      existingDetails.map((row) => [row.pantry_shopping_item_details.generationKey, row]),
    );
    let nextPosition =
      transaction
        .select({ position: shoppingListItems.position })
        .from(shoppingListItems)
        .where(eq(shoppingListItems.listId, listId))
        .orderBy(asc(shoppingListItems.position))
        .all()
        .at(-1)?.position ?? -1;
    const activeKeys = new Set<string>();
    const activeBatches = transaction
      .select()
      .from(pantryBatches)
      .all()
      .filter(
        (batch) =>
          !['depleted', 'discarded', 'donated'].includes(batch.status) &&
          !batch.excludeFromGrocery &&
          (batch.quantityRemaining === null || batch.quantityRemaining > 0),
      );
    const exactStock = (productId: string, unit: string, purchasedForItemId?: string) => {
      let quantity = 0;
      let uncertain = false;
      for (const batch of activeBatches.filter((candidate) => candidate.productId === productId)) {
        if (purchasedForItemId && batch.sourceShoppingListItemId === purchasedForItemId) continue;
        if (
          batch.quantityRemaining === null ||
          batch.approximateState !== null ||
          !areInventoryUnitsCompatible(batch.unit, unit)
        ) {
          uncertain = true;
          continue;
        }
        quantity += convertInventoryQuantity(batch.quantityRemaining, batch.unit, unit);
      }
      return { quantity: Number(quantity.toFixed(6)), uncertain };
    };
    const candidateLines = demand.lines.map((line) => ({
      ...line,
      recipeRequirement: line.requiredQuantity,
      stapleTarget: 0,
      restockMode: 'none' as 'none' | 'always_have' | 'always_buy',
      restockTrigger: 'below_target' as 'below_target' | 'reorder_point' | 'empty',
      restockTarget: null as number | null,
      restockReorder: null as number | null,
      purchaseIncrement: null as number | null,
    }));
    const includeRestockPolicies = getListSettings().automaticRestockListId === listId;
    const policyInstances = new Map(
      transaction
        .select()
        .from(shoppingPolicyInstances)
        .where(eq(shoppingPolicyInstances.listId, listId))
        .all()
        .map((instance) => [instance.productId, instance]),
    );
    for (const product of transaction
      .select()
      .from(pantryProducts)
      .all()
      .filter(
        (candidate) =>
          includeRestockPolicies &&
          candidate.archivedAt === null &&
          candidate.restockMode !== 'none' &&
          Boolean(candidate.stockUnit),
      )) {
      const unit = normalizeInventoryUnit(product.stockUnit || product.defaultInventoryUnit);
      const existing = candidateLines.find(
        (line) => line.productId === product.id && areInventoryUnitsCompatible(line.unit, unit),
      );
      if (existing) {
        existing.restockMode = product.restockMode;
        existing.restockTrigger = product.restockTrigger;
        existing.restockTarget =
          product.targetStock === null
            ? null
            : convertInventoryQuantity(product.targetStock, unit, existing.unit);
        existing.restockReorder =
          product.reorderThreshold === null
            ? null
            : convertInventoryQuantity(product.reorderThreshold, unit, existing.unit);
        existing.purchaseIncrement =
          product.preferredPurchaseQuantity === null
            ? null
            : convertInventoryQuantity(product.preferredPurchaseQuantity, unit, existing.unit);
      } else {
        const stock = exactStock(product.id, unit);
        candidateLines.push({
          productId: product.id,
          productName: product.displayName,
          unit,
          requiredQuantity: 0,
          availableQuantity: stock.quantity,
          shortageQuantity: Math.max(0, product.targetStock! - stock.quantity),
          state: stock.uncertain
            ? 'uncertain'
            : stock.quantity >= product.targetStock!
              ? 'covered'
              : 'shortage',
          uncertaintyReason: stock.uncertain
            ? 'Exact compatible grocery stock is insufficient; excluded, approximate, or incompatible batches are not counted.'
            : null,
          projectedRemainderQuantity: stock.quantity - product.targetStock!,
          exhaustionDate: null,
          earliestExpiryDate: null,
          expiryConflicts: [],
          meals: [],
          recipeRequirement: 0,
          stapleTarget: 0,
          restockMode: product.restockMode,
          restockTrigger: product.restockTrigger,
          restockTarget: product.targetStock,
          restockReorder: product.reorderThreshold,
          purchaseIncrement: product.preferredPurchaseQuantity,
        });
      }
    }
    const groupedUnknown: Array<{
      identity: string;
      productId: string | null;
      item: string;
      quantity: number | null;
      unit: string;
      reasons: Set<string>;
      contributions: DemandContribution[];
    }> = [];
    for (const line of demand.unknown) {
      const contribution = (contributionsByMeal.get(line.mealPlanEntryId) ?? []).find(
        (candidate) => candidate.ingredientId === line.ingredientId,
      );
      if (!contribution)
        throw new PantryGroceryCookingConflictError(
          'Planned demand changed while grocery provenance was being generated. Try again.',
        );
      const identity = shoppingItemIdentity(line.ingredientName);
      const existing = groupedUnknown.find(
        (candidate) =>
          candidate.identity === identity &&
          candidate.productId === line.productId &&
          areInventoryUnitsCompatible(candidate.unit, line.unit),
      );
      if (existing) {
        existing.item = preferredShoppingItemLabel(existing.item, line.ingredientName);
        existing.quantity =
          existing.quantity === null || line.quantity === null
            ? null
            : Number(
                (
                  existing.quantity +
                  convertInventoryQuantity(line.quantity, line.unit, existing.unit)
                ).toFixed(6),
              );
        if (line.reason) existing.reasons.add(line.reason);
        existing.contributions.push(contribution);
      } else {
        groupedUnknown.push({
          identity,
          productId: line.productId,
          item: line.ingredientName.trim(),
          quantity: line.quantity,
          unit: normalizeInventoryUnit(line.unit),
          reasons: new Set(line.reason ? [line.reason] : []),
          contributions: [contribution],
        });
      }
    }
    const desired = [
      ...candidateLines.flatMap((line) => {
        const previous = existingDetails.find(
          (row) =>
            row.pantry_shopping_item_details.productId === line.productId &&
            areInventoryUnitsCompatible(
              row.pantry_shopping_item_details.generatedUnit || line.unit,
              line.unit,
            ),
        )?.pantry_shopping_item_details;
        const convertStored = (quantity: number, unit: string) =>
          quantity > 0 && unit && areInventoryUnitsCompatible(unit, line.unit)
            ? convertInventoryQuantity(quantity, unit, line.unit)
            : 0;
        const manualExtra = previous
          ? convertStored(previous.manualExtraQuantity, previous.manualExtraUnit)
          : 0;
        const purchased = previous
          ? convertStored(previous.purchasedQuantity, previous.purchasedUnit)
          : 0;
        const covered = previous
          ? convertStored(previous.coveredQuantity, previous.coveredUnit)
          : 0;
        // A batch created by this exact shopping item is represented by purchased coverage below.
        // Excluding it here prevents a confirmed intake from being subtracted twice.
        const policyInstance = policyInstances.get(line.productId);
        const assumedEmpty = policyInstance?.assumedEmpty ?? false;
        const stock = assumedEmpty
          ? { quantity: 0, uncertain: false }
          : exactStock(line.productId, line.unit, previous?.shoppingListItemId);
        const usablePantry = previous?.coverageState === 'ignored' ? 0 : stock.quantity;
        const policySuppressed =
          policyInstance?.state === 'dismissed' ||
          (line.restockMode === 'always_buy' && policyInstance?.state === 'satisfied');
        const effectiveRestockMode = policySuppressed ? 'none' : line.restockMode;
        const pendingCoverage =
          effectiveRestockMode === 'always_have'
            ? pendingAutomaticCoverage(line.productId, line.unit, listId)
            : 0;
        const restock = calculatePantryRestock({
          mode: effectiveRestockMode,
          trigger: line.restockTrigger,
          recipeRequirement: line.recipeRequirement,
          usablePantry,
          pendingCoverage,
          purchasedCoverage: purchased + covered,
          manualExtra,
          targetStock: line.restockTarget,
          reorderThreshold: line.restockReorder,
          purchaseIncrement: line.purchaseIncrement,
          stockCertain: !stock.uncertain,
        });
        const shortageQuantity = restock.remainingToBuy ?? 0;
        const uncertain =
          previous?.coverageState === 'inaccurate' ||
          (effectiveRestockMode === 'always_have' && restock.needsReview) ||
          (effectiveRestockMode === 'none' &&
            shortageQuantity > 0 &&
            (line.state === 'uncertain' || stock.uncertain));
        return [
          (() => {
            const contributions = [
              ...new Set(line.meals.map((meal) => meal.mealPlanEntryId)),
            ].flatMap((mealPlanEntryId) =>
              (contributionsByMeal.get(mealPlanEntryId) ?? [])
                .filter(
                  (contribution) =>
                    contribution.productId === line.productId &&
                    contribution.contributionQuantity !== null &&
                    contribution.contributionUnit.trim() &&
                    areInventoryUnitsCompatible(contribution.contributionUnit, line.unit),
                )
                .map((contribution) => ({
                  ...contribution,
                  contributionQuantity: convertInventoryQuantity(
                    contribution.contributionQuantity!,
                    contribution.contributionUnit,
                    line.unit,
                  ),
                  contributionUnit: line.unit,
                })),
            );
            return {
              key: `product:${line.productId}:${line.unit}`,
              productId: line.productId,
              item: line.productName,
              quantity: uncertain ? null : shortageQuantity,
              unit: line.unit,
              note: uncertain
                ? previous?.controlNote ||
                  restock.reviewReason ||
                  line.uncertaintyReason ||
                  'Grocery amount needs review.'
                : previous?.coverageState === 'ignored'
                  ? 'Pantry stock is ignored for this grocery item.'
                  : shortageQuantity > 0
                    ? effectiveRestockMode === 'always_buy'
                      ? 'Always buy amount for this shopping trip'
                      : effectiveRestockMode === 'always_have'
                        ? 'Meal-plan demand plus Pantry reserve'
                        : 'Projected Pantry shortage'
                    : 'Covered by usable Pantry or recorded purchases.',
              state: uncertain
                ? ('uncertain' as const)
                : shortageQuantity > 0
                  ? ('shortage' as const)
                  : ('shortage' as const),
              formulaInputs: {
                version: 'pantry-grocery-v3',
                productId: line.productId,
                recipeRequirement: line.recipeRequirement,
                restockMode: effectiveRestockMode,
                restockTrigger: line.restockTrigger,
                targetStock: line.restockTarget,
                purchaseIncrement: line.purchaseIncrement,
                policyTriggered: restock.triggered,
                policyContribution: restock.policyContribution,
                projectedRemainder: restock.projectedRemainder,
                recipeShortage: restock.recipeShortage,
                unroundedPurchaseGoal: restock.unroundedPurchaseGoal,
                roundedPurchaseGoal: restock.roundedPurchaseGoal,
                manualExtra,
                usablePantry,
                pendingCoverage,
                purchased,
                covered,
                shortageQuantity: uncertain ? null : shortageQuantity,
                needsReview: restock.needsReview,
                reviewReason: restock.reviewReason,
                assumedEmpty,
                unit: line.unit,
                formula:
                  effectiveRestockMode === 'always_have'
                    ? 'trigger ? roundUp(recipeRequirement + targetStock - usablePantry + manualExtra) - purchasedCoverage : recipe shortage'
                    : effectiveRestockMode === 'always_buy'
                      ? 'roundUp(max(alwaysBuyAmount, recipeShortage) + manualExtra) - purchasedCoverage'
                      : 'max(0, recipeRequirement + manualExtra - usablePantry - purchasedCoverage)',
                excludedBatchPolicy:
                  'excludeFromGrocery and inactive batches are not usable Pantry',
                coverageState: previous?.coverageState ?? 'active',
                contributions,
              },
              provenance: { ...provenanceForDemand(demand), contributions },
            };
          })(),
        ];
      }),
      ...groupedUnknown.map((group) => {
        const uncertaintyReason =
          [...group.reasons].join(' ') || 'Demand cannot be calculated exactly.';
        const demandSummary =
          group.quantity === null
            ? uncertaintyReason
            : `${uncertaintyReason} Combined recipe demand is ${group.quantity} ${group.unit}; the Pantry-adjusted shortage still needs review.`;
        return {
          key: `unknown:${group.productId ?? 'unmapped'}:${group.identity}:${group.unit}`,
          productId: group.productId,
          item: group.item,
          quantity: null,
          unit: group.unit,
          note: demandSummary.slice(0, 240),
          state: 'uncertain' as const,
          formulaInputs: {
            version: 'pantry-shortage-v1',
            productId: group.productId,
            requiredQuantity: group.quantity,
            availableQuantity: null,
            shortageQuantity: null,
            unit: group.unit,
            formula: 'not calculated because demand or stock is uncertain',
            uncertaintyReason,
            contributions: group.contributions,
          },
          provenance: {
            ...provenanceForDemand(demand),
            contributions: group.contributions,
          },
        };
      }),
    ];

    const recordPolicyInstance = (item: (typeof desired)[number], shoppingListItemId: string) => {
      if (!item.productId) return;
      const formula = item.formulaInputs as Record<string, unknown>;
      const mode = formula.restockMode;
      if (mode !== 'always_have' && mode !== 'always_buy') return;
      const existingInstance = policyInstances.get(item.productId);
      const calculatedState =
        formula.needsReview === true && mode === 'always_have'
          ? ('needs_review' as const)
          : (item.quantity ?? 0) > 0
            ? ('active' as const)
            : ('satisfied' as const);
      const state =
        existingInstance?.state === 'dismissed' ||
        (mode === 'always_buy' && existingInstance?.state === 'satisfied')
          ? existingInstance.state
          : calculatedState;
      const values = {
        id: existingInstance?.id ?? randomUUID(),
        listId,
        productId: item.productId,
        shoppingListItemId,
        mode,
        trigger:
          formula.restockTrigger === 'reorder_point' || formula.restockTrigger === 'empty'
            ? formula.restockTrigger
            : ('below_target' as const),
        state,
        assumedEmpty: existingInstance?.assumedEmpty ?? false,
        policyQuantity:
          typeof formula.policyContribution === 'number' ? formula.policyContribution : null,
        unit: item.unit,
        reviewReason: typeof formula.reviewReason === 'string' ? formula.reviewReason : null,
        createdByProfileId: existingInstance?.createdByProfileId ?? actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: existingInstance?.createdAt ?? now,
        updatedAt: now,
      } satisfies typeof shoppingPolicyInstances.$inferInsert;
      transaction
        .insert(shoppingPolicyInstances)
        .values(values)
        .onConflictDoUpdate({
          target: [shoppingPolicyInstances.listId, shoppingPolicyInstances.productId],
          set: {
            shoppingListItemId: values.shoppingListItemId,
            mode: values.mode,
            trigger: values.trigger,
            state: values.state,
            policyQuantity: values.policyQuantity,
            unit: values.unit,
            reviewReason: values.reviewReason,
            updatedByProfileId: actorProfileId,
            updatedAt: now,
          },
        })
        .run();
    };

    for (const item of desired) {
      activeKeys.add(item.key);
      const existing = byKey.get(item.key);
      if (existing) {
        const detail = existing.pantry_shopping_item_details;
        const current = existing.shopping_list_items;
        transaction
          .update(shoppingListItems)
          .set({
            quantity: detail.manualQuantityOverride ? current.quantity : item.quantity,
            unit: detail.manualUnitOverride ? current.unit : item.unit,
            item: detail.manualItemOverride ? current.item : item.item,
            note: detail.manualNoteOverride ? current.note : item.note,
            aisleId: resolveShoppingAisle(
              supermarketProfileId,
              {
                item: detail.manualItemOverride ? current.item : item.item,
                productId: item.productId,
              },
              transaction,
            ),
            sourceRecipeIds: JSON.stringify(sourceRecipeIds(item.provenance.contributions)),
            updatedAt: now,
          })
          .where(eq(shoppingListItems.id, current.id))
          .run();
        transaction
          .update(pantryShoppingItemDetails)
          .set({
            productId: item.productId,
            demandState: item.state,
            generatedQuantity: item.quantity,
            generatedUnit: item.unit,
            shortageQuantity: item.quantity,
            uncertaintyReason: item.state === 'uncertain' ? item.note : null,
            formulaInputs: JSON.stringify(item.formulaInputs),
            provenance: JSON.stringify(item.provenance),
            generationMode: parsedInput.mode,
            generatedAt: now,
            updatedAt: now,
          })
          .where(eq(pantryShoppingItemDetails.shoppingListItemId, current.id))
          .run();
        recordPolicyInstance(item, current.id);
        continue;
      }
      const shoppingListItemId = randomUUID();
      transaction
        .insert(shoppingListItems)
        .values({
          id: shoppingListItemId,
          listId,
          position: ++nextPosition,
          quantity: item.quantity,
          unit: item.unit,
          item: item.item,
          note: item.note,
          aisleId: resolveShoppingAisle(
            supermarketProfileId,
            { item: item.item, productId: item.productId },
            transaction,
          ),
          checked: false,
          sourceRecipeIds: JSON.stringify(sourceRecipeIds(item.provenance.contributions)),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      transaction
        .insert(pantryShoppingItemDetails)
        .values({
          shoppingListItemId,
          productId: item.productId,
          demandState: item.state,
          generatedQuantity: item.quantity,
          generatedUnit: item.unit,
          shortageQuantity: item.quantity,
          uncertaintyReason: item.state === 'uncertain' ? item.note : null,
          formulaInputs: JSON.stringify(item.formulaInputs),
          provenance: JSON.stringify(item.provenance),
          generationKey: item.key,
          generationMode: parsedInput.mode,
          generatedAt: now,
          updatedAt: now,
        })
        .run();
      recordPolicyInstance(item, shoppingListItemId);
    }

    for (const row of existingDetails) {
      const detail = row.pantry_shopping_item_details;
      if (activeKeys.has(detail.generationKey)) continue;
      if (
        detail.manualQuantityOverride ||
        detail.manualUnitOverride ||
        detail.manualItemOverride ||
        detail.manualNoteOverride
      ) {
        transaction
          .update(shoppingListItems)
          .set({ sourceRecipeIds: '[]', updatedAt: now })
          .where(eq(shoppingListItems.id, detail.shoppingListItemId))
          .run();
        transaction
          .update(pantryShoppingItemDetails)
          .set({
            demandState: 'manual',
            generatedQuantity: null,
            generatedUnit: '',
            shortageQuantity: null,
            uncertaintyReason: null,
            formulaInputs: '{}',
            provenance: '{}',
            updatedAt: now,
          })
          .where(eq(pantryShoppingItemDetails.shoppingListItemId, detail.shoppingListItemId))
          .run();
      } else {
        transaction
          .delete(shoppingListItems)
          .where(eq(shoppingListItems.id, detail.shoppingListItemId))
          .run();
      }
    }
    transaction
      .update(shoppingLists)
      .set({ archivedAt: null, updatedAt: now })
      .where(eq(shoppingLists.id, listId))
      .run();
    return { listId, demand, restored };
  });
}

function pendingAutomaticCoverage(productId: string, unit: string, currentListId: string) {
  return Number(
    getDatabase()
      .select({
        instance: shoppingPolicyInstances,
        list: shoppingLists,
        item: shoppingListItems,
      })
      .from(shoppingPolicyInstances)
      .innerJoin(shoppingLists, eq(shoppingLists.id, shoppingPolicyInstances.listId))
      .innerJoin(
        shoppingListItems,
        eq(shoppingListItems.id, shoppingPolicyInstances.shoppingListItemId),
      )
      .where(
        and(
          eq(shoppingPolicyInstances.productId, productId),
          eq(shoppingPolicyInstances.mode, 'always_have'),
          eq(shoppingPolicyInstances.state, 'satisfied'),
        ),
      )
      .all()
      .filter(
        ({ list, item }) =>
          list.id !== currentListId &&
          list.archivedAt === null &&
          (item.checked || item.shoppingState === 'sourced') &&
          item.quantity !== null &&
          areInventoryUnitsCompatible(item.unit, unit),
      )
      .reduce(
        (total, { item }) => total + convertInventoryQuantity(item.quantity!, item.unit, unit),
        0,
      )
      .toFixed(6),
  );
}

function exactPolicyStock(productId: string, unit: string, excludeShoppingItemId?: string) {
  let quantity = 0;
  let uncertain = false;
  for (const batch of getDatabase()
    .select()
    .from(pantryBatches)
    .where(eq(pantryBatches.productId, productId))
    .all()
    .filter(
      (candidate) =>
        !['depleted', 'discarded', 'donated'].includes(candidate.status) &&
        !candidate.excludeFromGrocery &&
        candidate.sourceShoppingListItemId !== excludeShoppingItemId &&
        (candidate.quantityRemaining === null || candidate.quantityRemaining > 0),
    )) {
    if (
      batch.quantityRemaining === null ||
      batch.approximateState !== null ||
      !areInventoryUnitsCompatible(batch.unit, unit)
    ) {
      uncertain = true;
      continue;
    }
    quantity += convertInventoryQuantity(batch.quantityRemaining, batch.unit, unit);
  }
  return { quantity: Number(quantity.toFixed(6)), uncertain };
}

function policyCalculationForProduct(
  product: typeof pantryProducts.$inferSelect,
  assumedEmpty = false,
  excludeShoppingItemId?: string,
  purchasedCoverage = 0,
  manualExtra = 0,
  pendingCoverage = 0,
) {
  const unit = normalizeInventoryUnit(product.stockUnit || product.defaultInventoryUnit);
  const stock = assumedEmpty
    ? { quantity: 0, uncertain: false }
    : exactPolicyStock(product.id, unit, excludeShoppingItemId);
  return {
    unit,
    stock,
    calculation: calculatePantryRestock({
      mode: product.restockMode,
      trigger: product.restockTrigger,
      recipeRequirement: 0,
      usablePantry: stock.quantity,
      pendingCoverage,
      purchasedCoverage,
      manualExtra,
      targetStock: product.targetStock,
      reorderThreshold: product.reorderThreshold,
      purchaseIncrement: product.preferredPurchaseQuantity,
      stockCertain: !stock.uncertain,
    }),
  };
}

export function reconcileRestockPoliciesForList(listId: string, actorProfileId: string) {
  ensureDatabase();
  const db = getDatabase();
  const list = db.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
  if (!list || list.archivedAt) {
    throw new PantryGroceryCookingNotFoundError('Choose an active shopping list as Next shop.');
  }
  if (getListSettings().automaticRestockListId !== listId) return getShoppingPolicyReviews(listId);
  const products = db
    .select()
    .from(pantryProducts)
    .all()
    .filter(
      (product) =>
        product.archivedAt === null && product.restockMode !== 'none' && Boolean(product.stockUnit),
    );
  db.transaction((transaction) => {
    const now = new Date();
    retireInactivePolicyInstances(listId, actorProfileId, transaction);
    let nextPosition =
      transaction
        .select({ position: shoppingListItems.position })
        .from(shoppingListItems)
        .where(eq(shoppingListItems.listId, listId))
        .all()
        .reduce((highest, row) => Math.max(highest, row.position), -1) + 1;
    for (const product of products) {
      const policyMode = product.restockMode;
      if (policyMode === 'none') continue;
      const instance = transaction
        .select()
        .from(shoppingPolicyInstances)
        .where(
          and(
            eq(shoppingPolicyInstances.listId, listId),
            eq(shoppingPolicyInstances.productId, product.id),
          ),
        )
        .get();
      if (
        instance?.state === 'dismissed' ||
        (product.restockMode === 'always_buy' && instance?.state === 'satisfied')
      ) {
        continue;
      }
      const existing = transaction
        .select({ item: shoppingListItems, detail: pantryShoppingItemDetails })
        .from(shoppingListItems)
        .innerJoin(
          pantryShoppingItemDetails,
          eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItems.id),
        )
        .where(
          and(
            eq(shoppingListItems.listId, listId),
            eq(pantryShoppingItemDetails.productId, product.id),
          ),
        )
        .get();
      const unit = normalizeInventoryUnit(product.stockUnit || product.defaultInventoryUnit);
      const purchased =
        existing?.detail.purchasedQuantity &&
        existing.detail.purchasedUnit &&
        areInventoryUnitsCompatible(existing.detail.purchasedUnit, unit)
          ? convertInventoryQuantity(
              existing.detail.purchasedQuantity,
              existing.detail.purchasedUnit,
              unit,
            )
          : 0;
      const manualExtra =
        existing?.detail.manualExtraQuantity &&
        existing.detail.manualExtraUnit &&
        areInventoryUnitsCompatible(existing.detail.manualExtraUnit, unit)
          ? convertInventoryQuantity(
              existing.detail.manualExtraQuantity,
              existing.detail.manualExtraUnit,
              unit,
            )
          : 0;
      const policyResult = policyCalculationForProduct(
        product,
        instance?.assumedEmpty ?? false,
        existing?.item.id,
        purchased,
        manualExtra,
        product.restockMode === 'always_have'
          ? pendingAutomaticCoverage(product.id, unit, listId)
          : 0,
      );
      const stock = policyResult.stock;
      const calculation = policyResult.calculation;
      const needsReview = product.restockMode === 'always_have' && calculation.needsReview;
      const due = needsReview || (calculation.remainingToBuy ?? 0) > 0;
      if (!due) {
        if (
          existing &&
          !existing.detail.manualQuantityOverride &&
          !existing.detail.manualUnitOverride &&
          !existing.detail.manualItemOverride &&
          !existing.detail.manualNoteOverride &&
          JSON.parse(existing.item.sourceRecipeIds || '[]').length === 0
        ) {
          transaction
            .delete(shoppingListItems)
            .where(eq(shoppingListItems.id, existing.item.id))
            .run();
        }
        if (instance) {
          transaction
            .update(shoppingPolicyInstances)
            .set({
              shoppingListItemId: null,
              state: 'satisfied',
              policyQuantity: 0,
              unit,
              reviewReason: null,
              updatedByProfileId: actorProfileId,
              updatedAt: now,
            })
            .where(eq(shoppingPolicyInstances.id, instance.id))
            .run();
        }
        continue;
      }
      const quantity = needsReview ? null : calculation.remainingToBuy;
      const note = needsReview
        ? calculation.reviewReason!
        : product.restockMode === 'always_buy'
          ? 'Always buy amount for this shopping trip'
          : 'Maintain the household Pantry reserve';
      const formulaInputs = JSON.stringify({
        version: 'pantry-grocery-v3',
        productId: product.id,
        restockMode: product.restockMode,
        restockTrigger: product.restockTrigger,
        recipeRequirement: 0,
        targetStock: product.targetStock,
        purchaseIncrement: product.preferredPurchaseQuantity,
        policyTriggered: calculation.triggered,
        policyContribution: calculation.policyContribution,
        projectedRemainder: calculation.projectedRemainder,
        recipeShortage: calculation.recipeShortage,
        unroundedPurchaseGoal: calculation.unroundedPurchaseGoal,
        roundedPurchaseGoal: calculation.roundedPurchaseGoal,
        usablePantry: stock.quantity,
        purchased,
        covered: 0,
        pendingCoverage:
          product.restockMode === 'always_have'
            ? pendingAutomaticCoverage(product.id, unit, listId)
            : 0,
        manualExtra,
        shortageQuantity: quantity,
        needsReview,
        reviewReason: calculation.reviewReason,
        assumedEmpty: instance?.assumedEmpty ?? false,
        unit,
        formula:
          product.restockMode === 'always_buy'
            ? 'roundUp(max(alwaysBuyAmount, recipeShortage))'
            : 'trigger ? roundUp(recipeRequirement + targetStock - usablePantry) : recipe shortage',
        contributions: [],
      });
      const shoppingListItemId = existing?.item.id ?? randomUUID();
      if (existing) {
        transaction
          .update(shoppingListItems)
          .set({
            quantity: existing.detail.manualQuantityOverride ? existing.item.quantity : quantity,
            unit: existing.detail.manualUnitOverride ? existing.item.unit : unit,
            item: existing.detail.manualItemOverride ? existing.item.item : product.displayName,
            note: existing.detail.manualNoteOverride ? existing.item.note : note,
            aisleId: resolveShoppingAisle(
              list.supermarketProfileId,
              { item: product.displayName, productId: product.id },
              transaction,
            ),
            updatedAt: now,
          })
          .where(eq(shoppingListItems.id, shoppingListItemId))
          .run();
        transaction
          .update(pantryShoppingItemDetails)
          .set({
            demandState: needsReview ? 'uncertain' : 'shortage',
            generatedQuantity: quantity,
            generatedUnit: unit,
            shortageQuantity: quantity,
            uncertaintyReason: needsReview ? note : null,
            formulaInputs,
            provenance: JSON.stringify({
              generatedFrom: 'pantry-restock-policy-v1',
              contributions: [],
            }),
            generationMode: 'all',
            generatedAt: now,
            updatedAt: now,
          })
          .where(eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItemId))
          .run();
      } else {
        transaction
          .insert(shoppingListItems)
          .values({
            id: shoppingListItemId,
            listId,
            position: nextPosition++,
            quantity,
            unit,
            item: product.displayName,
            note,
            aisleId: resolveShoppingAisle(
              list.supermarketProfileId,
              { item: product.displayName, productId: product.id },
              transaction,
            ),
            checked: false,
            shoppingState: 'to_buy',
            sourceRecipeIds: '[]',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        transaction
          .insert(pantryShoppingItemDetails)
          .values({
            shoppingListItemId,
            productId: product.id,
            demandState: needsReview ? 'uncertain' : 'shortage',
            generatedQuantity: quantity,
            generatedUnit: unit,
            shortageQuantity: quantity,
            uncertaintyReason: needsReview ? note : null,
            formulaInputs,
            provenance: JSON.stringify({
              generatedFrom: 'pantry-restock-policy-v1',
              contributions: [],
            }),
            generationKey: `policy:${product.id}:${unit}`,
            generationMode: 'all',
            generatedAt: now,
            updatedAt: now,
          })
          .run();
      }
      const policyState = needsReview ? ('needs_review' as const) : ('active' as const);
      transaction
        .insert(shoppingPolicyInstances)
        .values({
          id: instance?.id ?? randomUUID(),
          listId,
          productId: product.id,
          shoppingListItemId,
          mode: policyMode,
          trigger: product.restockTrigger,
          state: policyState,
          assumedEmpty: instance?.assumedEmpty ?? false,
          policyQuantity: calculation.policyContribution,
          unit,
          reviewReason: calculation.reviewReason,
          createdByProfileId: instance?.createdByProfileId ?? actorProfileId,
          updatedByProfileId: actorProfileId,
          createdAt: instance?.createdAt ?? now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [shoppingPolicyInstances.listId, shoppingPolicyInstances.productId],
          set: {
            shoppingListItemId,
            mode: policyMode,
            trigger: product.restockTrigger,
            state: policyState,
            policyQuantity: calculation.policyContribution,
            unit,
            reviewReason: calculation.reviewReason,
            updatedByProfileId: actorProfileId,
            updatedAt: now,
          },
        })
        .run();
    }
    transaction
      .update(shoppingLists)
      .set({ updatedAt: now })
      .where(eq(shoppingLists.id, listId))
      .run();
  });
  return getShoppingPolicyReviews(listId);
}

export function reconcileAutomaticRestockPolicies(actorProfileId: string) {
  ensureDatabase();
  const settings = getListSettings();
  if (settings.automaticRestockListId) {
    reconcileListPoliciesBySource(settings.automaticRestockListId, actorProfileId);
    return settings.automaticRestockListId;
  }
  const dueAlwaysHave = getDatabase()
    .select()
    .from(pantryProducts)
    .all()
    .filter(
      (product) =>
        product.archivedAt === null &&
        product.restockMode === 'always_have' &&
        Boolean(product.stockUnit),
    )
    .some((product) => {
      const result = policyCalculationForProduct(product);
      return !result.calculation.needsReview && (result.calculation.remainingToBuy ?? 0) > 0;
    });
  if (!dueAlwaysHave) return null;
  const now = new Date();
  const listId = randomUUID();
  getDatabase()
    .insert(shoppingLists)
    .values({
      id: listId,
      name: 'Next shop',
      weekStart: '',
      weekEnd: '',
      sourceMode: 'manual',
      sourceKey: null,
      archivedAt: null,
      supermarketProfileId: settings.defaultSupermarketProfileId,
      createdByProfileId: actorProfileId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  setAutomaticRestockList(listId, actorProfileId);
  reconcileRestockPoliciesForList(listId, actorProfileId);
  return listId;
}

/** Changes the household's Next shop without moving recipe or manual work. */
export function switchAutomaticRestockTarget(listId: string | null, actorProfileId: string) {
  ensureDatabase();
  const database = getDatabase();
  const previousListId = getListSettings().automaticRestockListId;
  if (previousListId === listId) {
    if (listId) reconcileListPoliciesBySource(listId, actorProfileId);
    return getListSettings();
  }

  let previousList: typeof shoppingLists.$inferSelect | null = null;
  if (previousListId) {
    previousList =
      database.select().from(shoppingLists).where(eq(shoppingLists.id, previousListId)).get() ??
      null;
    database.transaction((transaction) => {
      const instances = transaction
        .select({ instance: shoppingPolicyInstances, item: shoppingListItems })
        .from(shoppingPolicyInstances)
        .leftJoin(
          shoppingListItems,
          eq(shoppingPolicyInstances.shoppingListItemId, shoppingListItems.id),
        )
        .where(eq(shoppingPolicyInstances.listId, previousListId))
        .all();
      for (const { instance, item } of instances) {
        if (item && (item.checked || item.shoppingState === 'sourced')) {
          transaction
            .update(shoppingPolicyInstances)
            .set({ state: 'satisfied', updatedByProfileId: actorProfileId, updatedAt: new Date() })
            .where(eq(shoppingPolicyInstances.id, instance.id))
            .run();
          continue;
        }
        const detail = item
          ? transaction
              .select()
              .from(pantryShoppingItemDetails)
              .where(eq(pantryShoppingItemDetails.shoppingListItemId, item.id))
              .get()
          : null;
        let recipeSources: unknown = [];
        try {
          recipeSources = item ? JSON.parse(item.sourceRecipeIds || '[]') : [];
        } catch {
          recipeSources = ['protected'];
        }
        const autoOnly =
          Boolean(item) &&
          Array.isArray(recipeSources) &&
          recipeSources.length === 0 &&
          (detail?.manualExtraQuantity ?? 0) === 0 &&
          !detail?.manualQuantityOverride &&
          !detail?.manualUnitOverride &&
          !detail?.manualItemOverride &&
          !detail?.manualNoteOverride;
        transaction
          .update(shoppingPolicyInstances)
          .set({
            state: 'moved',
            shoppingListItemId: autoOnly ? null : instance.shoppingListItemId,
            updatedByProfileId: actorProfileId,
            updatedAt: new Date(),
          })
          .where(eq(shoppingPolicyInstances.id, instance.id))
          .run();
        if (autoOnly && item) {
          transaction.delete(shoppingListItems).where(eq(shoppingListItems.id, item.id)).run();
        }
      }
    });
  }

  setAutomaticRestockList(listId, actorProfileId);
  if (previousList?.weekStart && previousList.weekEnd && !previousList.archivedAt) {
    generatePantryShortageList(
      {
        weekStart: previousList.weekStart,
        weekEnd: previousList.weekEnd,
        listId: previousList.id,
        mode: previousList.sourceMode === 'pantry_missing' ? 'missing' : 'all',
      },
      actorProfileId,
    );
  }
  if (listId) reconcileListPoliciesBySource(listId, actorProfileId);
  return getListSettings();
}

function reconcileListPoliciesBySource(listId: string, actorProfileId: string) {
  const list = getDatabase().select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
  if (!list || list.archivedAt) {
    throw new PantryGroceryCookingNotFoundError('Choose an active shopping list as Next shop.');
  }
  if (list.weekStart && list.weekEnd) {
    generatePantryShortageList(
      {
        weekStart: list.weekStart,
        weekEnd: list.weekEnd,
        listId,
        mode: list.sourceMode === 'pantry_missing' ? 'missing' : 'all',
      },
      actorProfileId,
    );
    return;
  }
  reconcileRestockPoliciesForList(listId, actorProfileId);
}

export type ShoppingPolicyReview = {
  productId: string;
  productName: string;
  shoppingListItemId: string | null;
  mode: 'always_have' | 'always_buy';
  trigger: 'below_target' | 'reorder_point' | 'empty';
  state: 'active' | 'needs_review' | 'satisfied' | 'dismissed' | 'moved';
  reviewReason: string | null;
  assumedEmpty: boolean;
  policyQuantity: number | null;
  unit: string;
};

export function getShoppingPolicyReviews(listId: string): ShoppingPolicyReview[] {
  ensureDatabase();
  return getDatabase()
    .select({ instance: shoppingPolicyInstances, productName: pantryProducts.displayName })
    .from(shoppingPolicyInstances)
    .innerJoin(pantryProducts, eq(pantryProducts.id, shoppingPolicyInstances.productId))
    .where(eq(shoppingPolicyInstances.listId, listId))
    .all()
    .map(({ instance, productName }) => ({
      productId: instance.productId,
      productName,
      shoppingListItemId: instance.shoppingListItemId,
      mode: instance.mode,
      trigger: instance.trigger,
      state: instance.state,
      reviewReason: instance.reviewReason,
      assumedEmpty: instance.assumedEmpty,
      policyQuantity: instance.policyQuantity,
      unit: instance.unit,
    }));
}

export function updateShoppingPolicyForTrip(
  listId: string,
  productId: string,
  action: 'skip_policy' | 'restore_policy' | 'assume_empty_for_trip',
  actorProfileId: string,
) {
  ensureDatabase();
  const database = getDatabase();
  const instance = database
    .select()
    .from(shoppingPolicyInstances)
    .where(
      and(
        eq(shoppingPolicyInstances.listId, listId),
        eq(shoppingPolicyInstances.productId, productId),
      ),
    )
    .get();
  if (!instance) {
    throw new PantryGroceryCookingNotFoundError(
      'That product does not have a recurring policy on this shopping trip.',
    );
  }
  database
    .update(shoppingPolicyInstances)
    .set({
      state: action === 'skip_policy' ? 'dismissed' : 'active',
      assumedEmpty: action === 'assume_empty_for_trip' ? true : instance.assumedEmpty,
      reviewReason: action === 'assume_empty_for_trip' ? null : instance.reviewReason,
      updatedByProfileId: actorProfileId,
      updatedAt: new Date(),
    })
    .where(eq(shoppingPolicyInstances.id, instance.id))
    .run();
  if (action === 'skip_policy' && instance.shoppingListItemId) {
    const item = database
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.id, instance.shoppingListItemId))
      .get();
    const detail = database
      .select()
      .from(pantryShoppingItemDetails)
      .where(eq(pantryShoppingItemDetails.shoppingListItemId, instance.shoppingListItemId))
      .get();
    let sources: unknown = ['protected'];
    try {
      sources = JSON.parse(item?.sourceRecipeIds || '[]');
    } catch {
      /* protect malformed rows */
    }
    if (
      item &&
      Array.isArray(sources) &&
      sources.length === 0 &&
      !detail?.manualQuantityOverride &&
      !detail?.manualUnitOverride &&
      !detail?.manualItemOverride &&
      !detail?.manualNoteOverride
    ) {
      database
        .update(shoppingPolicyInstances)
        .set({ shoppingListItemId: null, updatedAt: new Date() })
        .where(eq(shoppingPolicyInstances.id, instance.id))
        .run();
      database.delete(shoppingListItems).where(eq(shoppingListItems.id, item.id)).run();
    }
  }
  reconcileListPoliciesBySource(listId, actorProfileId);
  return getShoppingPolicyReviews(listId);
}

export function recordShoppingItemManualOverrides(
  shoppingListItemId: string,
  previous: Pick<typeof shoppingListItems.$inferSelect, 'quantity' | 'unit' | 'item' | 'note'>,
  next: Pick<typeof shoppingListItems.$inferSelect, 'quantity' | 'unit' | 'item' | 'note'>,
  transaction?: AppTransaction,
): void {
  const executor = transaction ?? getDatabase();
  const detail = executor
    .select()
    .from(pantryShoppingItemDetails)
    .where(eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItemId))
    .get();
  if (!detail) return;
  executor
    .update(pantryShoppingItemDetails)
    .set({
      manualQuantityOverride: detail.manualQuantityOverride || previous.quantity !== next.quantity,
      manualUnitOverride: detail.manualUnitOverride || previous.unit !== next.unit,
      manualItemOverride: detail.manualItemOverride || previous.item !== next.item,
      manualNoteOverride: detail.manualNoteOverride || previous.note !== next.note,
      updatedAt: new Date(),
    })
    .where(eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItemId))
    .run();
}

export function updateShoppingItemPantryControl(
  listId: string,
  itemId: string,
  input: PantryShoppingControlInput,
  actorProfileId: string,
) {
  ensureDatabase();
  const parsedInput = pantryShoppingControlSchema.parse(input);
  const db = getDatabase();
  const row = db
    .select({ item: shoppingListItems, detail: pantryShoppingItemDetails })
    .from(shoppingListItems)
    .innerJoin(
      pantryShoppingItemDetails,
      eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItems.id),
    )
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
    .get();
  if (!row)
    throw new PantryGroceryCookingNotFoundError('That generated shopping item no longer exists.');
  const now = new Date();
  if (
    parsedInput.action === 'skip_policy' ||
    parsedInput.action === 'restore_policy' ||
    parsedInput.action === 'assume_empty_for_trip'
  ) {
    const instance = db
      .select()
      .from(shoppingPolicyInstances)
      .where(
        and(
          eq(shoppingPolicyInstances.listId, listId),
          eq(shoppingPolicyInstances.shoppingListItemId, itemId),
        ),
      )
      .get();
    if (!instance) {
      throw new PantryGroceryCookingNotFoundError(
        'That item does not have an automatic shopping policy for this trip.',
      );
    }
    db.update(shoppingPolicyInstances)
      .set({
        state: parsedInput.action === 'skip_policy' ? 'dismissed' : 'active',
        assumedEmpty: parsedInput.action === 'assume_empty_for_trip' ? true : instance.assumedEmpty,
        reviewReason: parsedInput.action === 'assume_empty_for_trip' ? null : instance.reviewReason,
        updatedByProfileId: actorProfileId,
        updatedAt: now,
      })
      .where(eq(shoppingPolicyInstances.id, instance.id))
      .run();
    const list = db.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
    if (
      parsedInput.action === 'skip_policy' &&
      JSON.parse(row.item.sourceRecipeIds || '[]').length === 0 &&
      !row.detail.manualQuantityOverride &&
      !row.detail.manualUnitOverride &&
      !row.detail.manualItemOverride &&
      !row.detail.manualNoteOverride
    ) {
      db.update(shoppingPolicyInstances)
        .set({ shoppingListItemId: null, updatedAt: now })
        .where(eq(shoppingPolicyInstances.id, instance.id))
        .run();
      db.delete(shoppingListItems).where(eq(shoppingListItems.id, itemId)).run();
    }
    if (list?.weekStart && list.weekEnd) {
      generatePantryShortageList(
        {
          weekStart: list.weekStart,
          weekEnd: list.weekEnd,
          listId,
          mode: list.sourceMode === 'pantry_all' ? 'all' : 'missing',
        },
        actorProfileId,
      );
    } else if (list && getListSettings().automaticRestockListId === listId) {
      reconcileRestockPoliciesForList(listId, actorProfileId);
    }
    return db
      .select()
      .from(pantryShoppingItemDetails)
      .where(eq(pantryShoppingItemDetails.shoppingListItemId, itemId))
      .get();
  }
  const updates =
    parsedInput.action === 'reset'
      ? {
          coverageState: 'active' as const,
          manualExtraQuantity: 0,
          manualExtraUnit: '',
          coveredQuantity: 0,
          coveredUnit: '',
          purchasedQuantity: 0,
          purchasedUnit: '',
          controlNote: '',
          manualQuantityOverride: false,
          manualUnitOverride: false,
          manualItemOverride: false,
          manualNoteOverride: false,
        }
      : parsedInput.action === 'extra'
        ? {
            coverageState: 'active' as const,
            manualExtraQuantity: parsedInput.quantity!,
            manualExtraUnit: parsedInput.unit,
            controlNote: parsedInput.note,
          }
        : parsedInput.action === 'covered'
          ? {
              coverageState: 'covered' as const,
              coveredQuantity: row.detail.generatedQuantity ?? row.item.quantity ?? 0,
              coveredUnit: row.detail.generatedUnit || row.item.unit,
              controlNote: parsedInput.note,
            }
          : parsedInput.action === 'ignore'
            ? { coverageState: 'ignored' as const, controlNote: parsedInput.note }
            : { coverageState: 'inaccurate' as const, controlNote: parsedInput.note };
  db.update(pantryShoppingItemDetails)
    .set({ ...updates, updatedAt: now })
    .where(eq(pantryShoppingItemDetails.shoppingListItemId, itemId))
    .run();
  return db
    .select()
    .from(pantryShoppingItemDetails)
    .where(eq(pantryShoppingItemDetails.shoppingListItemId, itemId))
    .get()!;
}

export function matchShoppingItemToPantryProduct(
  listId: string,
  itemId: string,
  input: PantryShoppingMatchInput,
  actorProfileId: string,
) {
  ensureDatabase();
  const parsedInput = pantryShoppingMatchSchema.parse(input);
  const db = getDatabase();
  return db.transaction((transaction) => {
    const row = transaction
      .select({ item: shoppingListItems, detail: pantryShoppingItemDetails })
      .from(shoppingListItems)
      .leftJoin(
        pantryShoppingItemDetails,
        eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItems.id),
      )
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
      .get();
    if (!row)
      throw new PantryGroceryCookingNotFoundError('That generated shopping item no longer exists.');
    const product = transaction
      .select({ id: pantryProducts.id, archivedAt: pantryProducts.archivedAt })
      .from(pantryProducts)
      .where(eq(pantryProducts.id, parsedInput.productId))
      .get();
    if (!product || product.archivedAt)
      throw new PantryGroceryCookingNotFoundError('That Pantry item is no longer available.');

    let formulaInputs: Record<string, unknown> = {};
    let provenance: { contributions?: Array<{ ingredientId?: unknown }> } = {};
    try {
      formulaInputs = JSON.parse(row.detail?.formulaInputs ?? '{}') as Record<string, unknown>;
    } catch {
      formulaInputs = {};
    }
    try {
      provenance = JSON.parse(row.detail?.provenance ?? '{}') as typeof provenance;
    } catch {
      provenance = {};
    }
    const ingredientIds = [
      ...new Set(
        (provenance.contributions ?? [])
          .map(({ ingredientId }) => ingredientId)
          .filter((ingredientId): ingredientId is string => typeof ingredientId === 'string'),
      ),
    ];
    const validIngredientIds = new Set(
      ingredientIds.length
        ? transaction
            .select({ id: recipeIngredients.id })
            .from(recipeIngredients)
            .where(inArray(recipeIngredients.id, ingredientIds))
            .all()
            .map(({ id }) => id)
        : [],
    );
    const now = new Date();
    for (const ingredientId of validIngredientIds) {
      transaction
        .insert(recipeIngredientProductMappings)
        .values({
          recipeIngredientId: ingredientId,
          productId: product.id,
          matchType: parsedInput.matchType,
          compatibleVariant: false,
          isOptional: false,
          mappedByProfileId: actorProfileId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: recipeIngredientProductMappings.recipeIngredientId,
          set: {
            productId: product.id,
            matchType: parsedInput.matchType,
            mappedByProfileId: actorProfileId,
            updatedAt: now,
          },
        })
        .run();
    }
    if (row.detail) {
      transaction
        .update(pantryShoppingItemDetails)
        .set({
          productId: product.id,
          formulaInputs: JSON.stringify({ ...formulaInputs, productId: product.id }),
          uncertaintyReason: null,
          updatedAt: now,
        })
        .where(eq(pantryShoppingItemDetails.shoppingListItemId, itemId))
        .run();
    } else {
      transaction
        .insert(pantryShoppingItemDetails)
        .values({
          shoppingListItemId: itemId,
          productId: product.id,
          demandState: 'manual',
          generatedQuantity: row.item.quantity,
          generatedUnit: row.item.unit,
          shortageQuantity: row.item.quantity,
          uncertaintyReason: null,
          formulaInputs: JSON.stringify({ source: 'shopping_unpack', productId: product.id }),
          provenance: JSON.stringify({ source: 'shopping_unpack', actorProfileId }),
          generationKey: `shopping-unpack:${itemId}`,
          manualQuantityOverride: false,
          manualUnitOverride: false,
          manualItemOverride: false,
          manualNoteOverride: false,
          generationMode: 'all',
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
    return transaction
      .select()
      .from(pantryShoppingItemDetails)
      .where(eq(pantryShoppingItemDetails.shoppingListItemId, itemId))
      .get()!;
  });
}

export function intakePurchasedShoppingItem(
  listId: string,
  itemId: string,
  input: PantryPurchaseIntakeInput,
  actorProfileId: string,
) {
  ensureDatabase();
  const parsedInput = pantryPurchaseIntakeSchema.parse(input);
  const result = getDatabase().transaction((transaction) => {
    const item = transaction
      .select()
      .from(shoppingListItems)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
      .get();
    if (!item) throw new PantryGroceryCookingNotFoundError('That shopping item no longer exists.');
    const existing = transaction
      .select()
      .from(pantryPurchaseIntakes)
      .where(
        and(
          eq(pantryPurchaseIntakes.shoppingListItemId, itemId),
          eq(pantryPurchaseIntakes.idempotencyKey, parsedInput.operationKey),
        ),
      )
      .get();
    if (existing) return { batchId: existing.batchId, replayed: true };
    const detail = transaction
      .select()
      .from(pantryShoppingItemDetails)
      .where(eq(pantryShoppingItemDetails.shoppingListItemId, itemId))
      .get();
    if (detail?.productId && detail.productId !== parsedInput.productId)
      throw new PantryGroceryCookingConflictError(
        'This generated item is linked to a different Pantry product.',
      );
    const { batch } = createPantryBatchInTransaction(
      transaction,
      pantryBatchInputSchema.parse({
        productId: parsedInput.productId,
        quantityRemaining: parsedInput.quantity,
        originalQuantity: parsedInput.quantity,
        unit: parsedInput.unit,
        packageCount: parsedInput.packageCount,
        amountPerPackage: parsedInput.amountPerPackage,
        packageUnit: parsedInput.packageUnit,
        locationId: parsedInput.locationId,
        sublocation: parsedInput.sublocation,
        purchaseDate: parsedInput.purchaseDate,
        bestBeforeDate: parsedInput.bestBeforeDate,
        useByDate: parsedInput.useByDate,
        sellByDate: parsedInput.sellByDate,
        openedDate: parsedInput.openedDate,
        frozenDate: parsedInput.frozenDate,
        thawedDate: parsedInput.thawedDate,
        preparedDate: parsedInput.preparedDate,
        expiryPrecision: parsedInput.expiryPrecision,
        purchasePriceCents: parsedInput.purchasePriceCents,
        source: parsedInput.store || parsedInput.source,
        notes: parsedInput.notes,
        sourceShoppingListItemId: itemId,
      }),
      actorProfileId,
    );
    transaction
      .insert(pantryPurchaseIntakes)
      .values({
        id: randomUUID(),
        shoppingListItemId: itemId,
        idempotencyKey: parsedInput.operationKey,
        batchId: batch.id,
        locationId: parsedInput.locationId,
        actorProfileId,
        createdAt: new Date(),
      })
      .run();
    if (
      detail &&
      detail.generatedUnit &&
      areInventoryUnitsCompatible(parsedInput.unit, detail.generatedUnit)
    ) {
      const added = convertInventoryQuantity(
        parsedInput.quantity,
        parsedInput.unit,
        detail.generatedUnit,
      );
      const existingPurchased =
        detail.purchasedQuantity > 0 && detail.purchasedUnit
          ? convertInventoryQuantity(
              detail.purchasedQuantity,
              detail.purchasedUnit,
              detail.generatedUnit,
            )
          : 0;
      transaction
        .update(pantryShoppingItemDetails)
        .set({
          purchasedQuantity: Number((existingPurchased + added).toFixed(6)),
          purchasedUnit: detail.generatedUnit,
          updatedAt: new Date(),
        })
        .where(eq(pantryShoppingItemDetails.shoppingListItemId, itemId))
        .run();
    }
    if (parsedInput.intakeMode === 'complete') {
      transaction
        .update(shoppingListItems)
        .set({ checked: true, updatedAt: new Date() })
        .where(eq(shoppingListItems.id, itemId))
        .run();
    }
    return { batchId: batch.id, replayed: false };
  });
  reconcileAutomaticRestockPolicies(actorProfileId);
  return result;
}

export function getCookSessionPantryPreview(sessionId: string, actorProfileId: string) {
  ensureDatabase();
  const session = getDatabase()
    .select()
    .from(cookSessions)
    .where(and(eq(cookSessions.id, sessionId), eq(cookSessions.profileId, actorProfileId)))
    .get();
  if (!session) throw new PantryGroceryCookingNotFoundError('That cook session no longer exists.');
  const availability = getRecipePantryAvailability(
    session.recipeId,
    session.targetServings,
    session.mealPlanEntryId,
  );
  const plannedMeal = session.mealPlanEntryId
    ? (getDatabase()
        .select({
          id: mealPlanEntries.id,
          plannedFor: mealPlanEntries.plannedFor,
          meal: mealPlanEntries.meal,
          title: recipes.title,
          servings: mealPlanEntries.servings,
        })
        .from(mealPlanEntries)
        .innerJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
        .where(eq(mealPlanEntries.id, session.mealPlanEntryId))
        .get() ?? null)
    : null;
  const products = getPantryDashboard({
    q: '',
    view: 'all',
    sort: 'expiry',
    includeInactive: true,
  }).products.filter((product) => product.archivedAt === null);
  return {
    session,
    plannedMeal,
    availability,
    recommendedConsumptions: availability.ingredients.flatMap((ingredient) =>
      ingredient.productId && ingredient.requiredQuantity !== null
        ? [
            {
              ingredientId: ingredient.id,
              ingredientName: ingredient.item,
              productId: ingredient.productId,
              quantity: ingredient.requiredQuantity,
              unit: ingredient.unit,
              preview: previewPantryProductConsumption(
                ingredient.productId,
                ingredient.requiredQuantity,
                ingredient.unit,
              ),
              compatibleProducts: products.flatMap((product) => {
                try {
                  const candidate = previewPantryProductConsumption(
                    product.id,
                    ingredient.requiredQuantity!,
                    ingredient.unit,
                  );
                  return candidate.deductions.length ? [candidate] : [];
                } catch {
                  return [];
                }
              }),
            },
          ]
        : [],
    ),
  };
}

export function confirmCookSessionWithPantry(
  sessionId: string,
  input: PantryCookConfirmationInput,
  actorProfileId: string,
) {
  ensureDatabase();
  const preview = getCookSessionPantryPreview(sessionId, actorProfileId);
  const result = getDatabase().transaction((transaction) => {
    const session = transaction
      .select()
      .from(cookSessions)
      .where(and(eq(cookSessions.id, sessionId), eq(cookSessions.profileId, actorProfileId)))
      .get();
    if (!session)
      throw new PantryGroceryCookingNotFoundError('That cook session no longer exists.');
    if (session.completedAt)
      throw new PantryGroceryCookingConflictError('This cook session is already complete.');
    const existingPlan = transaction
      .select()
      .from(pantryCookSessionPlans)
      .where(eq(pantryCookSessionPlans.cookSessionId, sessionId))
      .get();
    if (existingPlan?.state === 'confirmed')
      throw new PantryGroceryCookingConflictError('Pantry deductions were already confirmed.');
    const now = new Date();
    const actorTimeZone =
      transaction
        .select({ timezone: profiles.timezone })
        .from(profiles)
        .where(eq(profiles.id, actorProfileId))
        .get()?.timezone ?? 'UTC';
    const deductions = input.consumptions.flatMap((consumption) =>
      consumePantryProductStockInTransaction(
        transaction,
        consumption.productId,
        consumption.quantity,
        consumption.unit,
        actorProfileId,
        {
          reason: 'Confirmed cooking deduction',
          relatedRecipeId: session.recipeId,
          relatedMealPlanEntryId: session.mealPlanEntryId,
          relatedCookSessionId: session.id,
        },
      ).map((deduction) => ({ ...deduction, productId: consumption.productId })),
    );
    const leftovers = input.leftovers.map((leftover) => {
      const { batch } = createPantryBatchInTransaction(
        transaction,
        pantryBatchInputSchema.parse({
          productId: leftover.productId,
          quantityRemaining: leftover.quantity,
          originalQuantity: leftover.quantity,
          unit: leftover.unit,
          locationId: leftover.locationId,
          useByDate: leftover.useByDate,
          preparedDate: localIsoDate(now, actorTimeZone),
          expiryPrecision: leftover.useByDate ? 'exact' : 'unknown',
          status: 'opened',
          source: 'cooking-leftover',
          notes: leftover.notes,
          sourceRecipeId: session.recipeId,
          sourceMealPlanEntryId: session.mealPlanEntryId ?? undefined,
        }),
        actorProfileId,
        { relatedCookSessionId: session.id },
      );
      return batch;
    });
    transaction
      .insert(pantryCookSessionPlans)
      .values({
        cookSessionId: session.id,
        state: 'confirmed',
        formulaInputs: JSON.stringify({
          targetServings: session.targetServings,
          recommended: preview.recommendedConsumptions,
          confirmed: input.consumptions,
        }),
        provenance: JSON.stringify({
          recipeId: session.recipeId,
          mealPlanEntryId: session.mealPlanEntryId,
          actorProfileId,
          availability: preview.availability,
        }),
        actorProfileId,
        confirmedAt: now,
        undoneAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pantryCookSessionPlans.cookSessionId,
        set: { state: 'confirmed', confirmedAt: now, updatedAt: now },
      })
      .run();
    if (deductions.length)
      transaction
        .insert(pantryCookSessionDeductions)
        .values(
          deductions.map((deduction) => ({
            id: randomUUID(),
            cookSessionId: session.id,
            batchId: deduction.batchId,
            inventoryEventId: deduction.inventoryEventId,
            productId: deduction.productId,
            quantity: deduction.quantity,
            unit: deduction.unit,
            batchVersionAfter: deduction.batchVersionAfter,
            createdAt: now,
          })),
        )
        .run();
    if (leftovers.length)
      transaction
        .insert(pantryCookSessionLeftovers)
        .values(
          leftovers.map((batch) => ({
            id: randomUUID(),
            cookSessionId: session.id,
            batchId: batch.id,
            createdAt: now,
          })),
        )
        .run();
    transaction
      .update(cookSessions)
      .set({ completedAt: now })
      .where(and(eq(cookSessions.id, session.id), eq(cookSessions.profileId, actorProfileId)))
      .run();
    return { deductions, leftovers };
  });
  reconcileAutomaticRestockPolicies(actorProfileId);
  return result;
}

export function undoCookSessionPantry(sessionId: string, actorProfileId: string) {
  ensureDatabase();
  const db = getDatabase();
  try {
    const result = db.transaction((transaction) => {
      const plan = transaction
        .select()
        .from(pantryCookSessionPlans)
        .where(eq(pantryCookSessionPlans.cookSessionId, sessionId))
        .get();
      if (!plan) throw new PantryGroceryCookingNotFoundError('No Pantry cooking deduction exists.');
      if (plan.state !== 'confirmed')
        throw new PantryGroceryCookingConflictError(
          'This Pantry cooking deduction is not reversible.',
        );
      const leftovers = transaction
        .select()
        .from(pantryCookSessionLeftovers)
        .where(eq(pantryCookSessionLeftovers.cookSessionId, sessionId))
        .all();
      const preparedNutrition = transaction
        .select({ id: nutritionPreparedRecipeInstances.id })
        .from(nutritionPreparedRecipeInstances)
        .where(eq(nutritionPreparedRecipeInstances.cookSessionId, sessionId))
        .get();
      if (preparedNutrition)
        throw new PantryGroceryCookingConflictError(
          'Review the linked prepared Nutrition batch before undoing the cooking deduction.',
        );
      if (leftovers.length)
        throw new PantryGroceryCookingConflictError(
          'Review or remove linked leftovers before undoing the cooking deduction.',
        );
      const deductions = transaction
        .select()
        .from(pantryCookSessionDeductions)
        .where(eq(pantryCookSessionDeductions.cookSessionId, sessionId))
        .all();
      const undoEventIds = undoPantryConsumptionEventsInTransaction(
        transaction,
        deductions.map((deduction) => deduction.inventoryEventId),
        actorProfileId,
        sessionId,
      );
      const now = new Date();
      const result = transaction
        .update(pantryCookSessionPlans)
        .set({ state: 'undone', undoneAt: now, updatedAt: now })
        .where(
          and(
            eq(pantryCookSessionPlans.cookSessionId, sessionId),
            eq(pantryCookSessionPlans.state, 'confirmed'),
          ),
        )
        .run();
      if (result.changes !== 1)
        throw new PantryGroceryCookingConflictError(
          'This Pantry cooking deduction changed during undo.',
        );
      return { undoEventIds };
    });
    reconcileAutomaticRestockPolicies(actorProfileId);
    return result;
  } catch (error) {
    if (error instanceof PantryConflictError || error instanceof PantryNotFoundError)
      throw new PantryGroceryCookingConflictError(error.message);
    throw error;
  }
}

export function getShoppingItemPantryDetails(itemIds: string[]): Map<string, ShoppingDetail> {
  if (!itemIds.length) return new Map();
  return new Map(
    getDatabase()
      .select()
      .from(pantryShoppingItemDetails)
      .where(inArray(pantryShoppingItemDetails.shoppingListItemId, itemIds))
      .all()
      .map((detail) => [detail.shoppingListItemId, detail]),
  );
}
