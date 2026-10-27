import 'server-only';

import { createHash } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  cookSessions,
  mealPlanEntries,
  pantryProductIdentifiers,
  pantryProducts,
  recipes,
  scannerOperations,
} from '@/lib/db/schema';
import { normalizeGtin } from '@/lib/domain/food-data';
import { convertInventoryQuantity, inventoryUnitDimension } from '@/lib/domain/inventory-units';
import { pantryBatchInputSchema } from '@/lib/domain/pantry';
import { ScannerError, scannerOperationSchema, type ScannerResult } from '@/lib/domain/scanner';
import { startCookSession } from './cooking-service';
import {
  confirmCookSessionWithPantry,
  getCookSessionPantryPreview,
  reconcileAutomaticRestockPolicies,
  undoCookSessionPantry,
} from './pantry-grocery-cooking-service';
import {
  applyPantryBatchAction,
  consumePantryProductStockInTransaction,
  createPantryBatch,
  listPantryLocations,
  undoPantryConsumptionEventsInTransaction,
} from './pantry-service';

type Actor = { userId: string; profileId: string };

/** A scan, its stock changes and its durable replay receipt share one SQLite transaction. */
export function executeScannerOperation(raw: unknown, actor: Actor) {
  const input = scannerOperationSchema.parse(raw);
  const intentHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  ensureDatabase();
  const db = getDatabase();
  return db.transaction((tx) => {
    const prior = tx
      .select()
      .from(scannerOperations)
      .where(eq(scannerOperations.id, input.operationId))
      .get();
    if (prior) {
      if (
        prior.userId !== actor.userId ||
        prior.profileId !== actor.profileId ||
        prior.intentHash !== intentHash
      )
        throw new ScannerError(
          'scanner_operation_conflict',
          'This operation ID belongs to a different scan or account.',
        );
      return { ...prior.result, replayed: true };
    }
    const command = input.command;
    let result: ScannerResult;
    if (command.type === 'recipe') {
      const recipe = tx.select().from(recipes).where(eq(recipes.id, command.recipeId)).get();
      if (!recipe || recipe.status !== 'active')
        throw new ScannerError(
          'scanner_recipe_unavailable',
          'This recipe is unavailable. Review the recipe card in Bòrd.',
        );
      if (recipe.currentRevision !== command.expectedRevision)
        throw new ScannerError(
          'scanner_recipe_changed',
          'This recipe changed. Print a new recipe card after reviewing it.',
        );
      if (command.mealPlanEntryId) {
        const planned = tx
          .select()
          .from(mealPlanEntries)
          .where(eq(mealPlanEntries.id, command.mealPlanEntryId))
          .get();
        if (
          !planned ||
          planned.recipeId !== recipe.id ||
          planned.recipeOverride ||
          (planned.recipeRevision !== null &&
            planned.recipeRevision !== command.expectedRevision) ||
          planned.servings !== command.servings ||
          ['skipped', 'cancelled'].includes(planned.status)
        )
          throw new ScannerError(
            'scanner_planned_meal_changed',
            'Review the planned recipe, yield or adaptation before printing a new card.',
          );
        const made = tx
          .select({ id: cookSessions.id })
          .from(cookSessions)
          .where(
            and(eq(cookSessions.mealPlanEntryId, planned.id), isNotNull(cookSessions.completedAt)),
          )
          .get();
        if (made)
          throw new ScannerError(
            'scanner_meal_already_made',
            'This planned meal is already marked as made. No ingredients were deducted again.',
          );
      }
      const session = startCookSession(
        recipe.id,
        actor.profileId,
        command.servings,
        command.mealPlanEntryId ?? null,
        actor.userId,
      );
      const preview = getCookSessionPantryPreview(session.id, actor.profileId);
      const required = preview.availability.ingredients.filter(
        (ingredient) => !ingredient.isOptional,
      );
      if (
        !required.length ||
        required.some(
          (ingredient) =>
            ingredient.state !== 'ready' ||
            !ingredient.productId ||
            ingredient.requiredQuantity === null,
        )
      )
        throw new ScannerError(
          'scanner_pantry_review_required',
          'Recipe not recorded: review missing stock, ingredient mappings or quantities in Bòrd.',
        );
      const consumptions = required.map((ingredient) => ({
        productId: ingredient.productId!,
        quantity: ingredient.requiredQuantity!,
        unit: ingredient.unit,
      }));
      confirmCookSessionWithPantry(
        session.id,
        { confirmed: true, consumptions, leftovers: [] },
        actor.profileId,
      );
      result = {
        operationId: input.operationId,
        type: 'recipe',
        cookSessionId: session.id,
        message: `Made ${recipe.title} (${command.servings} servings).`,
      };
    } else if (command.type === 'undo') {
      const target = tx
        .select()
        .from(scannerOperations)
        .where(
          and(
            eq(scannerOperations.id, command.targetOperationId),
            eq(scannerOperations.userId, actor.userId),
            eq(scannerOperations.profileId, actor.profileId),
            eq(scannerOperations.stationId, input.stationId),
          ),
        )
        .get();
      if (!target || target.result.type === 'undo')
        throw new ScannerError(
          'scanner_undo_unavailable',
          'No matching action is available to undo at this station.',
        );
      if (target.undoneBy)
        throw new ScannerError('scanner_already_undone', 'That action has already been undone.');
      if (target.result.type === 'recipe') {
        undoCookSessionPantry(target.result.cookSessionId!, actor.profileId);
        tx.update(cookSessions)
          .set({ completedAt: null })
          .where(eq(cookSessions.id, target.result.cookSessionId!))
          .run();
      } else if (target.result.type === 'pantry_add') {
        applyPantryBatchAction(
          target.result.batchId!,
          {
            type: 'discard',
            expectedVersion: target.result.batchVersion!,
            note: 'Scanner: undo mistaken addition',
            reason: 'Undo scanner addition',
          },
          actor.profileId,
        );
      } else {
        undoPantryConsumptionEventsInTransaction(
          tx,
          target.result.inventoryEventIds!,
          actor.profileId,
          null,
        );
      }
      tx.update(scannerOperations)
        .set({ undoneBy: input.operationId })
        .where(eq(scannerOperations.id, target.id))
        .run();
      reconcileAutomaticRestockPolicies(actor.profileId);
      result = {
        operationId: input.operationId,
        type: 'undo',
        targetOperationId: target.id,
        message: `Undone: ${target.result.message}`,
      };
    } else {
      let gtin: string;
      try {
        gtin = normalizeGtin(command.barcode).canonicalGtin;
      } catch {
        throw new ScannerError(
          'scanner_invalid_barcode',
          'This is not a valid retail barcode.',
          400,
        );
      }
      const matches = tx
        .select({ product: pantryProducts })
        .from(pantryProductIdentifiers)
        .innerJoin(pantryProducts, eq(pantryProducts.id, pantryProductIdentifiers.productId))
        .where(
          and(
            eq(pantryProductIdentifiers.normalizedValue, gtin),
            eq(pantryProductIdentifiers.verified, true),
          ),
        )
        .all()
        .filter(({ product }) => !product.archivedAt);
      const products = [...new Map(matches.map(({ product }) => [product.id, product])).values()];
      if (products.length !== 1)
        throw new ScannerError(
          'scanner_unknown_product',
          'Review and save this barcode as a Pantry product in Bòrd first. No stock changed.',
        );
      const product = products[0]!;
      const hasPackage = !!product.defaultPackageAmount && !!product.defaultPackageUnit;
      if (!hasPackage && inventoryUnitDimension(product.defaultInventoryUnit) !== 'count')
        throw new ScannerError(
          'scanner_package_review_required',
          'Set the product package amount and unit in Bòrd first.',
        );
      const unit = product.defaultInventoryUnit;
      let quantity: number;
      try {
        quantity =
          command.packages *
          (hasPackage
            ? convertInventoryQuantity(
                product.defaultPackageAmount!,
                product.defaultPackageUnit,
                unit,
              )
            : 1);
      } catch {
        throw new ScannerError(
          'scanner_package_review_required',
          'The saved package and inventory units are incompatible. Review them in Bòrd.',
        );
      }
      if (command.type === 'pantry_add') {
        const locations = listPantryLocations().filter((location) =>
          command.locationId
            ? location.id === command.locationId
            : location.storageType === product.defaultStorageType,
        );
        if (locations.length !== 1)
          throw new ScannerError(
            'scanner_location_required',
            'Scan a specific storage location before adding this product.',
          );
        const batch = createPantryBatch(
          pantryBatchInputSchema.parse({
            productId: product.id,
            locationId: locations[0]!.id,
            quantityRemaining: quantity,
            originalQuantity: quantity,
            unit,
            packageCount: command.packages,
            amountPerPackage: hasPackage ? product.defaultPackageAmount : 1,
            packageUnit: hasPackage ? product.defaultPackageUnit : unit,
            source: `scanner:${input.stationId}`,
            notes: 'Added by barcode scan; expiry date unknown.',
          }),
          actor.profileId,
        );
        result = {
          operationId: input.operationId,
          type: command.type,
          batchId: batch.id,
          batchVersion: batch.version,
          message: `Added ${command.packages} package(s) of ${product.displayName}.`,
        };
      } else {
        // V1 removal uses Bòrd's product-wide FEFO allocation. Location filtering must not be implied.
        if (command.locationId)
          throw new ScannerError(
            'scanner_remove_location_unsupported',
            'Reset the location filter before removing stock. V1 removal uses earliest expiry across locations.',
          );
        const deductions = consumePantryProductStockInTransaction(
          tx,
          product.id,
          quantity,
          unit,
          actor.profileId,
          { reason: `Scanner removal:${input.stationId}` },
        );
        result = {
          operationId: input.operationId,
          type: command.type,
          inventoryEventIds: deductions.map((deduction) => deduction.inventoryEventId),
          message: `Removed ${command.packages} package(s) of ${product.displayName}.`,
        };
      }
      reconcileAutomaticRestockPolicies(actor.profileId);
    }
    tx.insert(scannerOperations)
      .values({
        id: input.operationId,
        userId: actor.userId,
        profileId: actor.profileId,
        stationId: input.stationId,
        intentHash,
        result,
        createdAt: new Date(),
      })
      .run();
    return { ...result, replayed: false };
  });
}
