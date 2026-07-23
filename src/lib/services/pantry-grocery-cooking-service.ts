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
import { parseServingCount } from '@/lib/domain/ingredient-scaling';
import { localIsoDate } from '@/lib/domain/local-date';
import { pantryBatchInputSchema } from '@/lib/domain/pantry';
import {
  pantryPurchaseIntakeSchema,
  pantryShoppingControlSchema,
  pantryShortageGenerationSchema,
  type PantryCookConfirmationInput,
  type PantryPurchaseIntakeInput,
  type PantryShortageGenerationInput,
  type PantryShoppingControlInput,
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
import { getListSettings, resolveShoppingAisle } from '@/lib/services/list-settings-service';

export class PantryGroceryCookingNotFoundError extends Error {}
export class PantryGroceryCookingConflictError extends Error {}

export type ShoppingDetail = typeof pantryShoppingItemDetails.$inferSelect;

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
  recipeId: string;
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
    })
    .from(mealPlanEntries)
    .innerJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
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
    if (!meal.recipeId) continue;
    const baseServings = parseServingCount(meal.baseServingsText);
    for (const ingredient of ingredients) {
      if (ingredient.recipeId !== meal.recipeId || ingredient.isOptional) continue;
      const requiredQuantity =
        ingredient.quantity !== null && ingredient.unit.trim() && baseServings
          ? Number(((ingredient.quantity * meal.servings) / baseServings).toFixed(6))
          : null;
      const contribution: DemandContribution = {
        mealPlanEntryId: meal.id,
        plannedFor: meal.plannedFor,
        recipeId: meal.recipeId,
        recipeTitle: meal.recipeTitle,
        servings: meal.servings,
        baseServings,
        ingredientId: ingredient.id,
        ingredientName: ingredient.ingredientName,
        productId: ingredient.productId,
        requiredQuantity,
        sourceUnit: ingredient.unit,
        contributionQuantity: requiredQuantity,
        contributionUnit: ingredient.unit,
      };
      result.set(meal.id, [...(result.get(meal.id) ?? []), contribution]);
    }
  }
  return result;
}

function sourceRecipeIds(contributions: DemandContribution[]): string[] {
  return [...new Set(contributions.map((contribution) => contribution.recipeId))];
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
    const existingList =
      durableList ??
      transaction.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
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
          name: `Pantry shortages · ${parsedInput.weekStart}`,
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
    }));
    for (const product of transaction
      .select()
      .from(pantryProducts)
      .all()
      .filter(
        (candidate) =>
          candidate.archivedAt === null &&
          candidate.isStaple &&
          candidate.suggestGroceryRestock &&
          candidate.reorderThreshold !== null &&
          candidate.targetStock !== null &&
          candidate.targetStock > 0,
      )) {
      const unit = normalizeInventoryUnit(product.stockUnit || product.defaultInventoryUnit);
      const totalStock = exactStock(product.id, unit);
      if (totalStock.uncertain || totalStock.quantity > product.reorderThreshold!) continue;
      const existing = candidateLines.find(
        (line) => line.productId === product.id && areInventoryUnitsCompatible(line.unit, unit),
      );
      if (existing) {
        existing.stapleTarget = convertInventoryQuantity(product.targetStock!, unit, existing.unit);
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
          stapleTarget: product.targetStock!,
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
        const requiredQuantity = Math.max(line.recipeRequirement, line.stapleTarget);
        // A batch created by this exact shopping item is represented by purchased coverage below.
        // Excluding it here prevents a confirmed intake from being subtracted twice.
        const stock = exactStock(line.productId, line.unit, previous?.shoppingListItemId);
        const usablePantry = previous?.coverageState === 'ignored' ? 0 : stock.quantity;
        const shortageQuantity = Number(
          Math.max(0, requiredQuantity + manualExtra - usablePantry - purchased - covered).toFixed(
            6,
          ),
        );
        const uncertain =
          previous?.coverageState === 'inaccurate' ||
          (shortageQuantity > 0 && (line.state === 'uncertain' || stock.uncertain));
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
                ? previous?.controlNote || line.uncertaintyReason || 'Grocery amount needs review.'
                : previous?.coverageState === 'ignored'
                  ? 'Pantry stock is ignored for this grocery item.'
                  : shortageQuantity > 0
                    ? 'Projected Pantry shortage'
                    : 'Covered by usable Pantry or recorded purchases.',
              state: uncertain
                ? ('uncertain' as const)
                : shortageQuantity > 0
                  ? ('shortage' as const)
                  : ('shortage' as const),
              formulaInputs: {
                version: 'pantry-grocery-v2',
                productId: line.productId,
                recipeRequirement: line.recipeRequirement,
                stapleTarget: line.stapleTarget,
                manualExtra,
                usablePantry,
                purchased,
                covered,
                shortageQuantity: uncertain ? null : shortageQuantity,
                unit: line.unit,
                formula:
                  'max(0, max(recipeRequirement, stapleTarget) + manualExtra - usablePantry - purchased - covered)',
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
      ...demand.unknown.map((line) => {
        const contribution = (contributionsByMeal.get(line.mealPlanEntryId) ?? []).find(
          (candidate) => candidate.ingredientId === line.ingredientId,
        );
        if (!contribution)
          throw new PantryGroceryCookingConflictError(
            'Planned demand changed while grocery provenance was being generated. Try again.',
          );
        return {
          key: `unknown:${line.mealPlanEntryId}:${line.ingredientId}`,
          productId: line.productId,
          item: line.ingredientName,
          quantity: null,
          unit: line.unit,
          note: line.reason ?? 'Demand cannot be calculated exactly.',
          state: 'uncertain' as const,
          formulaInputs: {
            version: 'pantry-shortage-v1',
            productId: line.productId,
            requiredQuantity: null,
            availableQuantity: null,
            shortageQuantity: null,
            unit: line.unit,
            formula: 'not calculated because demand or stock is uncertain',
            uncertaintyReason: line.reason,
            contributions: [contribution],
          },
          provenance: {
            ...provenanceForDemand(demand),
            contributions: [contribution],
          },
        };
      }),
    ];

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
      .set({ updatedAt: now })
      .where(eq(shoppingLists.id, listId))
      .run();
    return { listId, demand };
  });
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
  void actorProfileId; // Preserve the signed ActorContext service seam for future audit history.
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

export function intakePurchasedShoppingItem(
  listId: string,
  itemId: string,
  input: PantryPurchaseIntakeInput,
  actorProfileId: string,
) {
  ensureDatabase();
  const parsedInput = pantryPurchaseIntakeSchema.parse(input);
  return getDatabase().transaction((transaction) => {
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
}

export function getCookSessionPantryPreview(sessionId: string, actorProfileId: string) {
  ensureDatabase();
  const session = getDatabase()
    .select()
    .from(cookSessions)
    .where(and(eq(cookSessions.id, sessionId), eq(cookSessions.profileId, actorProfileId)))
    .get();
  if (!session) throw new PantryGroceryCookingNotFoundError('That cook session no longer exists.');
  const availability = getRecipePantryAvailability(session.recipeId, session.targetServings);
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
  return getDatabase().transaction((transaction) => {
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
}

export function undoCookSessionPantry(sessionId: string, actorProfileId: string) {
  ensureDatabase();
  const db = getDatabase();
  try {
    return db.transaction((transaction) => {
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
