import 'server-only';
import {
  NutritionIntakeConflictError,
  NutritionIntakeIntegrityError,
} from './nutrition-intake-service';
import { NutritionRecipeIntegrityError } from './nutrition-recipe-calculation-service';
import {
  NutritionFoundationIntegrityError,
  NutritionFoundationNotFoundError,
} from './nutrition-foundation-service';
import { completeScannedRecipeLink } from './scanned-meal-service';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  apikey,
  households,
  profiles,
  cookSessions,
  pantryCookSessionLeftovers,
  scannerOperations,
  scannerStations,
  scannerStationEvents,
  scannerStationControls,
  shoppingListItems,
} from '@/lib/db/schema';
import type { RequestPrincipal } from './auth-service';
import type { ApiAction, ApiResource } from '@/lib/domain/auth';
import { ScannerError, scannerOperationSchema, type ScannerResult } from '@/lib/domain/scanner';
import {
  boundScannerOperationSchema,
  scannerControlSchema,
  scannerSyncSchema,
  stationIdSchema,
  type BoundScannerOperation,
} from '@/lib/domain/scanner-station';
import {
  normalizeGtin,
  FoodDataError,
  foodCatalogImportInputSchema,
  type FoodRecord,
} from '@/lib/domain/food-data';
import { localIsoDate } from '@/lib/domain/local-date';
import { inventoryUnitDimension, convertInventoryQuantity } from '@/lib/domain/inventory-units';
import { pantryBatchInputSchema } from '@/lib/domain/pantry';
import { shoppingListItemSchema } from '@/lib/domain/planning';
import {
  applyPantryBatchAction,
  getPantryBatch,
  getPantryDashboard,
  getPantryProduct,
  createPantryBatchInTransaction,
  listPantryLocations,
  listPantryProducts,
  PantryConflictError,
  PantryNotFoundError,
  PantryValidationError,
  type AppTransaction,
} from './pantry-service';
import { executeScannerOperation } from './scanner-service';
import { importFoodCatalogRecord } from './food-catalog-import-service';
import { lookupFoodByBarcode, getFoodDetails } from './food-data-service';
import { addShoppingListItem, PlanningNotFoundError } from './planning-service';
import {
  intakePurchasedShoppingItem,
  PantryGroceryCookingConflictError,
  PantryGroceryCookingNotFoundError,
} from './pantry-grocery-cooking-service';
import { CookingNotFoundError } from './cooking-service';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function scannerDigest(value: unknown) {
  return createHash('sha256').update(stable(value)).digest('hex');
}
function permission(p: RequestPrincipal, resource: ApiResource, action: ApiAction) {
  if (p.role === 'child' && action !== 'read')
    throw new ScannerError('scanner_forbidden', 'This account cannot change household stock.', 403);
  if (p.kind === 'api-key' && !p.apiPermissions?.[resource]?.includes(action))
    throw new ScannerError(
      'scanner_scope_required',
      `The station key needs ${resource}:${action}.`,
      403,
    );
}
export function scannerInstanceId() {
  ensureDatabase();
  const household = getDatabase().select().from(households).get();
  if (!household) throw new ScannerError('scanner_setup_required', 'Set up a household first.');
  return household.id;
}
export function ownedStation(p: RequestPrincipal, id: string) {
  stationIdSchema.parse(id);
  ensureDatabase();
  const station = getDatabase()
    .select()
    .from(scannerStations)
    .where(eq(scannerStations.id, id))
    .get();
  if (
    !station ||
    !station.active ||
    station.userId !== p.userId ||
    station.profileId !== p.profileId ||
    (p.kind === 'api-key' && station.apiKeyId !== p.apiKeyId)
  )
    throw new ScannerError(
      'scanner_binding_required',
      'Use the account, profile and key registered for this station.',
      403,
    );
  return station;
}
export function registerScannerStation(p: RequestPrincipal, raw: unknown) {
  if (p.kind !== 'session' || p.role !== 'admin' || p.profileId !== p.linkedProfileId)
    throw new ScannerError(
      'scanner_admin_required',
      'Use your signed-in admin account to register a station.',
      403,
    );
  const input = z
    .object({
      id: stationIdSchema,
      name: z.string().trim().min(1).max(80),
      apiKeyId: z.string().min(1).max(256),
      scannerQuota: z.boolean().default(false),
    })
    .strict()
    .parse(raw);
  ensureDatabase();
  return getDatabase().transaction(
    (tx) => {
      const key = tx
        .select()
        .from(apikey)
        .where(and(eq(apikey.id, input.apiKeyId), eq(apikey.referenceId, p.userId)))
        .get();
      if (!key?.enabled || (key.expiresAt && key.expiresAt <= new Date()))
        throw new ScannerError(
          'scanner_key_required',
          'Choose an enabled, unexpired key owned by this account.',
        );
      if (input.scannerQuota)
        tx.update(apikey)
          .set({ rateLimitMax: 600, rateLimitTimeWindow: 60000, updatedAt: new Date() })
          .where(eq(apikey.id, key.id))
          .run();
      const old = tx.select().from(scannerStations).where(eq(scannerStations.id, input.id)).get();
      if (old) {
        if (
          old.userId !== p.userId ||
          old.profileId !== p.profileId ||
          old.apiKeyId !== input.apiKeyId
        )
          throw new ScannerError(
            'scanner_station_exists',
            'This station already has a different binding. Reconcile its queue before rotating or replacing it.',
          );
        return { id: old.id, bindingId: old.bindingId };
      }
      if (tx.select().from(scannerStations).where(eq(scannerStations.apiKeyId, key.id)).get())
        throw new ScannerError('scanner_key_in_use', 'Use a separate key for each station.');
      const bindingId = randomUUID();
      tx.insert(scannerStations)
        .values({
          id: input.id,
          name: input.name,
          apiKeyId: input.apiKeyId,
          userId: p.userId,
          profileId: p.profileId,
          bindingId,
          createdAt: new Date(),
        })
        .run();
      return { id: input.id, bindingId };
    },
    { behavior: 'immediate' },
  );
}
export function scannerContext(p: RequestPrincipal, id: string) {
  permission(p, 'pantry', 'read');
  const station = ownedStation(p, id);
  return {
    contractVersion: 2 as const,
    instanceId: scannerInstanceId(),
    stationId: station.id,
    bindingId: station.bindingId,
    userId: station.userId,
    profileId: station.profileId,
    stationName: station.name,
    defaultLocationId: (() => {
      const locations = listPantryLocations().filter((l) => l.storageType === 'pantry');
      return locations.length === 1 ? locations[0]!.id : null;
    })(),
    locations: listPantryLocations().map((l) => ({
      id: l.id,
      name: l.path,
      storageType: l.storageType,
    })),
    capabilities: [
      'lookup',
      'pantry_add',
      'pantry_catalog_add',
      'pantry_remove',
      'recipe',
      'recipe_link',
      'undo_session',
      'undo',
      'batch_action',
      'stocktake',
      'shopping_add',
      'shopping_intake',
      'leftover',
    ],
    modeTimeout: 60,
  };
}
function preparedProduct(barcode: string, locationId?: string) {
  const gtin = normalizeGtin(barcode).canonicalGtin;
  const matches = listPantryProducts().filter((p) =>
    p.identifiers.some((i) => {
      if (!i.verified) return false;
      try {
        return i.normalizedValue === gtin || normalizeGtin(i.value).canonicalGtin === gtin;
      } catch {
        return false;
      }
    }),
  );
  if (matches.length !== 1)
    throw new ScannerError(
      'scanner_product_review',
      matches.length
        ? 'This barcode matches more than one saved product. Review its identifiers in Bòrd.'
        : 'Review and save this barcode as a Pantry product in Bòrd first. No stock changed.',
    );
  const product = matches[0]!;
  const packageAmount =
    product.defaultPackageAmount ||
    (inventoryUnitDimension(product.defaultInventoryUnit) === 'count' ? 1 : null);
  const packageUnit =
    product.defaultPackageUnit ||
    (inventoryUnitDimension(product.defaultInventoryUnit) === 'count'
      ? product.defaultInventoryUnit
      : '');
  if (!packageAmount || !packageUnit)
    throw new ScannerError(
      'scanner_package_review_required',
      'Set the product package amount and unit in Bòrd first.',
    );
  convertInventoryQuantity(packageAmount, packageUnit, product.defaultInventoryUnit);
  const locations = listPantryLocations().filter((l) =>
    locationId ? l.id === locationId : l.storageType === product.defaultStorageType,
  );
  const prepared = {
    productId: product.id,
    packageAmount,
    packageUnit,
    defaultsRevision: scannerDigest({
      productId: product.id,
      packageAmount,
      packageUnit,
      inventoryUnit: product.defaultInventoryUnit,
      storage: product.defaultStorageType,
      identifiers: product.identifiers
        .filter((i) => i.verified)
        .map((i) => i.normalizedValue)
        .sort(),
    }),
    ...(locations.length === 1 ? { locationId: locations[0]!.id } : {}),
  };
  return { product, prepared };
}
export async function lookupScanner(p: RequestPrincipal, raw: unknown) {
  permission(p, 'pantry', 'read');
  const input = z
    .object({
      stationId: stationIdSchema,
      barcode: z.string().max(512).optional(),
      batchId: z.string().uuid().optional(),
      locationId: z.string().uuid().optional(),
    })
    .strict()
    .parse(raw);
  ownedStation(p, input.stationId);
  if (Boolean(input.barcode) === Boolean(input.batchId))
    throw new ScannerError(
      'scanner_lookup_invalid',
      'Choose one product barcode or batch label.',
      400,
    );
  if (input.batchId) {
    const batch = getPantryBatch(input.batchId);
    if (!batch) throw new ScannerError('scanner_batch_missing', 'This batch no longer exists.');
    return {
      kind: 'batch',
      batch: {
        id: batch.id,
        version: batch.version,
        productId: batch.productId,
        name: batch.product.displayName,
        quantity: batch.quantityRemaining,
        unit: batch.unit,
        locationId: batch.locationId,
        location: batch.location.path,
        status: batch.status,
        expiry: batch.expiry,
      },
      prepared: null,
    };
  }
  const gtin = normalizeGtin(input.barcode!).canonicalGtin;
  const dashboard = getPantryDashboard({
    q: '',
    view: 'all',
    sort: 'expiry',
    includeInactive: false,
  });
  const matching = dashboard.products.filter((product) =>
    product.identifiers.some((i) => {
      try {
        return (
          i.verified &&
          (i.normalizedValue === gtin || normalizeGtin(i.value).canonicalGtin === gtin)
        );
      } catch {
        return false;
      }
    }),
  );
  if (matching.length > 1)
    return {
      kind: 'review',
      message: 'This barcode has multiple saved matches. Review product identifiers in Bòrd.',
      prepared: null,
    };
  if (matching.length === 1) {
    const product = matching[0]!;
    let prepared = null;
    let message = '';
    try {
      prepared = preparedProduct(input.barcode!, input.locationId).prepared;
    } catch (error) {
      if (error instanceof ScannerError || error instanceof Error) message = error.message;
      else throw error;
    }
    return {
      kind: 'local',
      product: {
        id: product.id,
        name: product.displayName,
        packageAmount: product.defaultPackageAmount,
        packageUnit: product.defaultPackageUnit,
      },
      stock: dashboard.productStock[product.id] ?? null,
      batches: dashboard.batches
        .filter((b) => b.productId === product.id)
        .slice(0, 50)
        .map((b) => ({
          id: b.id,
          version: b.version,
          quantity: b.quantityRemaining,
          unit: b.unit,
          location: b.location.path,
          locationId: b.locationId,
          expiry: b.expiry,
          status: b.status,
        })),
      prepared,
      message,
    };
  }
  const food = await lookupFoodByBarcode(gtin, 'en');
  const exact = Array.from(
    new Map(
      [food.preferred, ...food.alternatives]
        .filter((r): r is FoodRecord => Boolean(r && r.canonicalGtin === gtin && r.catalogRef))
        .map((r) => [`${r.provider}:${r.providerRecordId}`, r]),
    ).values(),
  );
  const selected = exact.length === 1 ? exact[0] : null;
  const destination = listPantryLocations().filter((l) =>
    input.locationId ? l.id === input.locationId : l.storageType === 'pantry',
  );
  const catalogAdd =
    selected && destination.length === 1
      ? {
          locationId: destination[0]!.id,
          selection: {
            provider: selected.provider,
            recordId: selected.providerRecordId,
            catalogRef: selected.catalogRef,
            expectedCanonicalGtin: gtin,
          },
        }
      : null;
  return {
    kind: 'review',
    prepared: null,
    message: food.preferred
      ? `Found ${food.preferred.displayName}. Review this catalog match, package amount and destination in Bòrd before adding stock.`
      : 'No reviewed local product. Search the catalog or enter the product manually.',
    barcode: input.barcode,
    catalogAdd,
    catalog: {
      preferred: food.preferred
        ? {
            provider: food.preferred.provider,
            providerRecordId: food.preferred.providerRecordId,
            displayName: food.preferred.displayName,
            brand: food.preferred.brand,
            canonicalGtin: food.preferred.canonicalGtin,
          }
        : null,
      alternatives: food.alternatives.slice(0, 5).map((r) => ({
        provider: r.provider,
        providerRecordId: r.providerRecordId,
        displayName: r.displayName,
        brand: r.brand,
        canonicalGtin: r.canonicalGtin,
      })),
      providerStatuses: food.providerStatuses,
    },
  };
}
function commandPermissions(p: RequestPrincipal, command: BoundScannerOperation['command']) {
  permission(p, 'pantry', 'read');
  if (command.type === 'recipe_link') {
    permission(p, 'recipes', 'read');
    permission(p, 'mealPlans', 'update');
    permission(p, 'pantry', 'update');
  } else if (command.type === 'recipe') {
    permission(p, 'recipes', 'read');
    permission(p, 'recipes', 'create');
    permission(p, 'recipes', 'update');
    permission(p, 'pantry', 'update');
    if (command.mealPlanEntryId) permission(p, 'mealPlans', 'read');
  } else if (command.type === 'shopping_add') {
    permission(p, 'shoppingLists', 'create');
  } else {
    permission(
      p,
      'pantry',
      command.type === 'pantry_add' ||
        command.type === 'pantry_catalog_add' ||
        command.type === 'leftover' ||
        command.type === 'shopping_intake'
        ? 'create'
        : 'update',
    );
  }
  if (command.type === 'shopping_intake') permission(p, 'shoppingLists', 'update');
}
function domainError(error: unknown): ScannerError | null {
  if (error instanceof ScannerError) return error;
  if (
    error instanceof NutritionIntakeConflictError ||
    error instanceof NutritionIntakeIntegrityError ||
    error instanceof NutritionRecipeIntegrityError ||
    error instanceof NutritionFoundationIntegrityError ||
    error instanceof NutritionFoundationNotFoundError ||
    error instanceof PantryConflictError ||
    error instanceof PantryValidationError ||
    error instanceof PantryNotFoundError ||
    error instanceof PantryGroceryCookingConflictError ||
    error instanceof PantryGroceryCookingNotFoundError ||
    error instanceof CookingNotFoundError ||
    error instanceof PlanningNotFoundError
  )
    return new ScannerError('scanner_review_required', error.message);
  return null;
}
function runCommand(
  input: BoundScannerOperation,
  p: RequestPrincipal,
  db: AppTransaction,
  catalogRecord?: FoodRecord | ScannerError,
): ScannerResult {
  const command = input.command;
  if (
    db
      .select({ id: scannerOperations.id })
      .from(scannerOperations)
      .where(
        and(
          eq(scannerOperations.stationId, input.stationId),
          eq(scannerOperations.outcome, 'succeeded'),
          sql`json_extract(${scannerOperations.command}, '$.supersedesOperationId') = ${input.operationId}`,
        ),
      )
      .get()
  )
    throw new ScannerError(
      'scanner_original_superseded',
      'A reviewed correction already fulfilled this scan. The original was not applied again.',
    );
  if (command.type === 'pantry_catalog_add') {
    if (catalogRecord instanceof ScannerError) throw catalogRecord;
    if (!catalogRecord) throw new Error('Catalog preflight is required.');
    const gtin = normalizeGtin(command.barcode).canonicalGtin;
    if (command.selection.expectedCanonicalGtin !== gtin || catalogRecord.canonicalGtin !== gtin)
      throw new ScannerError(
        'scanner_catalog_changed',
        'The exact barcode match changed. No stock added.',
      );
    const matches = listPantryProducts(true).filter((product) =>
      product.identifiers.some((i) => i.normalizedValue === gtin),
    );
    if (
      matches.length > 1 ||
      matches.some(
        (product) =>
          product.archivedAt ||
          product.identifiers.some((i) => i.normalizedValue === gtin && !i.verified) ||
          product.defaultInventoryUnit !== 'package' ||
          product.defaultPackageAmount !== 1 ||
          product.defaultPackageUnit !== 'package',
      )
    )
      throw new ScannerError(
        'scanner_product_changed',
        'This barcode now has a different saved product or package unit. Capture it again after review.',
      );
    const imported = importFoodCatalogRecord({
      input: foodCatalogImportInputSchema.parse({
        operationId: input.operationId,
        selection: command.selection,
        product: {
          displayName: catalogRecord.displayName.slice(0, 160),
          brand: catalogRecord.brand.slice(0, 120),
          defaultInventoryUnit: 'package',
          defaultPackageAmount: 1,
          defaultPackageUnit: 'package',
          allergens: catalogRecord.allergens.filter((t) => t.length <= 60).slice(0, 30),
          dietaryTags: catalogRecord.labels.filter((t) => t.length <= 60).slice(0, 30),
        },
      }),
      record: catalogRecord,
      actorProfileId: p.profileId,
      actorUserId: p.userId,
      destination: 'pantry',
      batches: [
        {
          locationId: command.locationId,
          quantityRemaining: command.packages,
          originalQuantity: command.packages,
          unit: 'package',
          source: 'barcode-scanner',
          notes: 'Counted packages. Weight, volume and expiry were not inferred.',
        },
      ],
    });
    return {
      operationId: input.operationId,
      type: command.type,
      message: `Added ${command.packages} package(s) of ${catalogRecord.displayName}. Package weight and volume remain unknown.`,
      productName: catalogRecord.displayName,
      quantity: command.packages,
      unit: 'package',
      batchId: imported.batchIds[0],
      undoable: false,
    };
  }
  if (command.type === 'pantry_add' || command.type === 'pantry_remove') {
    if (!input.prepared)
      throw new ScannerError(
        'scanner_preparation_required',
        'Resolve and freeze the reviewed package defaults before delivery.',
      );
    const current = preparedProduct(command.barcode, command.locationId);
    if (
      current.prepared.defaultsRevision !== input.prepared.defaultsRevision ||
      current.product.id !== input.prepared.productId ||
      current.prepared.packageAmount !== input.prepared.packageAmount ||
      current.prepared.packageUnit !== input.prepared.packageUnit
    )
      throw new ScannerError(
        'scanner_defaults_changed',
        'The saved product/package changed. Review this scan; its original amount has not been changed.',
      );
    if (
      command.type === 'pantry_add' &&
      (!command.locationId || command.locationId !== input.prepared.locationId)
    )
      throw new ScannerError(
        'scanner_location_required',
        'Resolve a single addition location before delivery.',
      );
    const result = executeScannerOperation(
      { operationId: input.operationId, stationId: input.stationId, command },
      p,
    );
    return {
      ...result,
      productName: current.product.displayName,
      quantity: convertInventoryQuantity(
        input.prepared.packageAmount * command.packages,
        input.prepared.packageUnit,
        current.product.defaultInventoryUnit,
      ),
      unit: current.product.defaultInventoryUnit,
      undoable: true,
    };
  }
  if (command.type === 'undo_session') {
    for (const id of command.targetOperationIds) {
      const target = db.select().from(scannerOperations).where(eq(scannerOperations.id, id)).get();
      if (
        !target ||
        target.stationId !== input.stationId ||
        target.userId !== p.userId ||
        target.profileId !== p.profileId ||
        target.outcome !== 'succeeded' ||
        target.undoneBy ||
        !['pantry_add', 'pantry_catalog_add'].includes(target.result.type) ||
        !target.result.batchId ||
        !target.result.batchVersion
      )
        throw new ScannerError(
          'scanner_session_clear_review',
          'This grocery session contains an action that cannot be safely cleared. No items were removed.',
        );
      applyPantryBatchAction(
        target.result.batchId,
        {
          type: 'discard',
          expectedVersion: target.result.batchVersion,
          reason: 'Undo scanner session addition',
          note: '',
        },
        p.profileId,
      );
      db.update(scannerOperations)
        .set({ undoneBy: input.operationId })
        .where(eq(scannerOperations.id, id))
        .run();
    }
    return {
      operationId: input.operationId,
      type: 'undo_session',
      message: `Cleared ${command.targetOperationIds.length} unchanged grocery additions.`,
      undoable: false,
    };
  }
  if (command.type === 'recipe_link')
    return {
      operationId: input.operationId,
      type: 'recipe_link',
      ...completeScannedRecipeLink(command, p),
      undoable: false,
    };
  if (command.type === 'recipe')
    return {
      ...executeScannerOperation(
        { operationId: input.operationId, stationId: input.stationId, command },
        p,
      ),
      undoable: true,
    };
  if (command.type === 'undo') {
    const target = db
      .select()
      .from(scannerOperations)
      .where(eq(scannerOperations.id, command.targetOperationId))
      .get();
    if (
      !target ||
      target.stationId !== input.stationId ||
      target.userId !== p.userId ||
      target.profileId !== p.profileId ||
      target.outcome !== 'succeeded' ||
      target.undoneBy ||
      target.result.undoable === false
    )
      throw new ScannerError(
        'scanner_undo_unavailable',
        'This exact station action is not eligible for undo.',
      );
    if (target.command) {
      const original = boundScannerOperationSchema.safeParse(target.command);
      if (original.success) commandPermissions(p, original.data.command);
    }
    if (target.result.type === 'batch_action' || target.result.type === 'stocktake') {
      for (const change of target.result.batchChanges ?? [])
        applyPantryBatchAction(
          change.batchId,
          { type: 'undo', expectedVersion: change.version, note: 'Undo scanner action' },
          p.profileId,
        );
      db.update(scannerOperations)
        .set({ undoneBy: input.operationId })
        .where(eq(scannerOperations.id, target.id))
        .run();
      return {
        operationId: input.operationId,
        type: 'undo',
        targetOperationId: target.id,
        message: `Undone: ${target.result.message}`,
        undoable: false,
      };
    }
    return {
      ...executeScannerOperation(
        { operationId: input.operationId, stationId: input.stationId, command },
        p,
      ),
      undoable: false,
    };
  }
  if (command.type === 'batch_action') {
    // Split/combine/restore have their own review UI; scanner lifecycle is explicitly bounded.
    if (
      ![
        'consume',
        'consume_one',
        'mark_empty',
        'open',
        'move',
        'freeze',
        'thaw',
        'correct',
        'discard',
        'donate',
      ].includes(command.action.type)
    )
      throw new ScannerError('scanner_action_unsupported', 'Use the batch editor for this action.');
    const before = getPantryBatch(command.batchId);
    if (!before) throw new ScannerError('scanner_batch_missing', 'This batch no longer exists.');
    const changed = applyPantryBatchAction(command.batchId, command.action, p.profileId);
    return {
      operationId: input.operationId,
      type: command.type,
      message: `${command.action.type.replaceAll('_', ' ')}: ${before.product.displayName}.`,
      batchId: changed.id,
      batchChanges: [{ batchId: changed.id, version: changed.version }],
      undoable: true,
    };
  }
  if (command.type === 'stocktake') {
    if (new Set(command.counts.map((c) => c.batchId)).size !== command.counts.length)
      throw new ScannerError('scanner_duplicate_batch', 'Each counted batch must appear once.');
    const batchChanges = command.counts.map((c) => {
      const changed = applyPantryBatchAction(
        c.batchId,
        {
          type: 'correct',
          expectedVersion: c.expectedVersion,
          quantityRemaining: c.quantityRemaining,
          unit: c.unit,
          approximateState: null,
          reason: 'Reviewed scanner stocktake',
          note: '',
        },
        p.profileId,
      );
      return { batchId: changed.id, version: changed.version };
    });
    return {
      operationId: input.operationId,
      type: command.type,
      message: `Saved ${batchChanges.length} reviewed batch counts. Unobserved stock is unchanged.`,
      batchChanges,
      undoable: true,
    };
  }
  if (command.type === 'shopping_add') {
    const product = getPantryProduct(command.productId, false);
    if (!product)
      throw new ScannerError('scanner_product_missing', 'Choose an active saved product.');
    const item = addShoppingListItem(
      command.listId,
      shoppingListItemSchema.parse({
        item: product.displayName,
        quantity: command.quantity,
        unit: command.unit,
        productId: product.id,
        note: 'Requested from scanner station',
      }),
      p.profileId,
      { separateEntry: true },
    );
    return {
      operationId: input.operationId,
      type: command.type,
      message: `Added ${product.displayName} to the selected shopping list. No stock changed.`,
      shoppingItemId: item.id,
      undoable: false,
    };
  }
  if (command.type === 'shopping_intake') {
    const item = db
      .select()
      .from(shoppingListItems)
      .where(
        and(eq(shoppingListItems.id, command.itemId), eq(shoppingListItems.listId, command.listId)),
      )
      .get();
    if (!item || item.updatedAt.toISOString() !== command.expectedUpdatedAt)
      throw new ScannerError(
        'scanner_shopping_changed',
        'The shopping item changed. Review the purchase again.',
      );
    const result = intakePurchasedShoppingItem(
      command.listId,
      command.itemId,
      {
        operationKey: input.operationId,
        productId: command.productId,
        locationId: command.locationId,
        quantity: command.quantity,
        unit: command.unit,
        intakeMode: command.complete ? 'complete' : 'partial',
      },
      p.profileId,
    );
    return {
      operationId: input.operationId,
      type: command.type,
      message: 'Purchase added to stock once. Review the linked shopping intake for corrections.',
      batchId: result.batchId,
      undoable: false,
    };
  }
  if (command.type !== 'leftover')
    throw new ScannerError('scanner_command_unsupported', 'Unsupported scanner command.', 400);
  const session = db
    .select()
    .from(cookSessions)
    .where(
      and(
        eq(cookSessions.id, command.cookSessionId),
        eq(cookSessions.ownerUserId, p.userId),
        eq(cookSessions.profileId, p.profileId),
      ),
    )
    .get();
  if (!session?.completedAt)
    throw new ScannerError(
      'scanner_cooking_required',
      'Choose a completed cooking session owned by this account.',
    );
  const profile = db.select().from(profiles).where(eq(profiles.id, p.profileId)).get();
  const { batch } = createPantryBatchInTransaction(
    db,
    pantryBatchInputSchema.parse({
      productId: command.productId,
      locationId: command.locationId,
      quantityRemaining: command.quantity,
      originalQuantity: command.quantity,
      unit: command.unit,
      useByDate: command.useByDate,
      preparedDate: localIsoDate(new Date(), profile?.timezone ?? 'UTC'),
      status: 'opened',
      source: 'cooking-leftover',
      sourceRecipeId: session.recipeId,
      sourceMealPlanEntryId: session.mealPlanEntryId ?? '',
      notes: 'Reviewed prepared portions; no raw ingredients deducted.',
    }),
    p.profileId,
    { relatedCookSessionId: session.id },
  );
  db.insert(pantryCookSessionLeftovers)
    .values({
      id: randomUUID(),
      cookSessionId: session.id,
      batchId: batch.id,
      createdAt: new Date(),
    })
    .run();
  return {
    operationId: input.operationId,
    type: command.type,
    message: 'Leftover portions saved. No raw ingredients deducted; personal intake is separate.',
    batchId: batch.id,
    undoable: false,
  };
}
/** Resolve immutable catalog provenance before opening the stock transaction. */
export async function executeScannerRequest(p: RequestPrincipal, raw: unknown) {
  const input = boundScannerOperationSchema.parse(raw);
  const station = ownedStation(p, input.stationId);
  if (input.bindingId !== station.bindingId || input.instanceId !== scannerInstanceId())
    throw new ScannerError(
      'scanner_binding_changed',
      'This queue belongs to another station or household.',
      403,
    );
  commandPermissions(p, input.command);
  if (
    input.command.type !== 'pantry_catalog_add' ||
    getDatabase()
      .select({ id: scannerOperations.id })
      .from(scannerOperations)
      .where(eq(scannerOperations.id, input.operationId))
      .get()
  )
    return executeBoundScannerOperation(p, input);
  let record: FoodRecord | ScannerError;
  try {
    record = (
      await getFoodDetails(
        input.command.selection.provider,
        input.command.selection.recordId,
        'en',
        input.command.selection.catalogRef,
        true,
      )
    ).record;
  } catch (error) {
    if (error instanceof FoodDataError && ['REVISION_EXPIRED', 'NOT_FOUND'].includes(error.code))
      record = new ScannerError(
        'scanner_catalog_changed',
        'This catalog match changed or disappeared. No stock added.',
      );
    else throw error;
  }
  return executeBoundScannerOperation(p, input, record);
}
export function executeBoundScannerOperation(
  p: RequestPrincipal,
  raw: unknown,
  catalogRecord?: FoodRecord | ScannerError,
) {
  const input = boundScannerOperationSchema.parse(raw),
    station = ownedStation(p, input.stationId);
  if (input.bindingId !== station.bindingId || input.instanceId !== scannerInstanceId())
    throw new ScannerError(
      'scanner_binding_changed',
      'This queue belongs to a different station, actor or Bòrd instance.',
      403,
    );
  commandPermissions(p, input.command);
  const intentHash = scannerDigest(input),
    db = getDatabase();
  return db.transaction(
    (tx) => {
      const prior = tx
        .select()
        .from(scannerOperations)
        .where(eq(scannerOperations.id, input.operationId))
        .get();
      if (prior) {
        if (
          prior.intentHash !== intentHash ||
          prior.userId !== p.userId ||
          prior.profileId !== p.profileId ||
          prior.stationId !== station.id ||
          prior.bindingId !== station.bindingId
        )
          throw new ScannerError(
            'scanner_operation_conflict',
            'This UUID belongs to another frozen operation.',
          );
        return { status: prior.httpStatus, result: { ...prior.result, replayed: true } };
      }
      if (input.supersedesOperationId) {
        const original = tx
          .select()
          .from(scannerOperations)
          .where(eq(scannerOperations.id, input.supersedesOperationId))
          .get();
        const capture = tx
          .select()
          .from(scannerStationEvents)
          .where(eq(scannerStationEvents.stationId, station.id))
          .all()
          .find(
            (e) =>
              e.payload.operationId === input.supersedesOperationId &&
              e.payload.status === 'review' &&
              e.payload.submission === 'not_submitted',
          );
        if (
          original
            ? original.stationId !== station.id ||
              original.outcome !== 'needs_review' ||
              original.userId !== p.userId ||
              original.profileId !== p.profileId
            : !capture
        )
          throw new ScannerError(
            'scanner_original_uncertain',
            'Resolve the original outcome before creating a correction.',
          );
        const rejectedCorrection = original
          ? boundScannerOperationSchema.safeParse(original.command)
          : null;
        if (rejectedCorrection?.success && rejectedCorrection.data.supersedesOperationId)
          throw new ScannerError(
            'scanner_correction_root',
            'Correct the original scan, using its original superseded operation ID.',
          );
        const already = tx
          .select()
          .from(scannerOperations)
          .where(eq(scannerOperations.stationId, station.id))
          .all()
          .find((o) => {
            const data = boundScannerOperationSchema.safeParse(o.command);
            return (
              o.outcome === 'succeeded' &&
              data.success &&
              data.data.supersedesOperationId === input.supersedesOperationId
            );
          });
        if (already)
          throw new ScannerError(
            'scanner_already_corrected',
            'This captured scan already has a saved correction.',
          );
      }
      let status = 200,
        result: ScannerResult;
      try {
        result = tx.transaction((inner) => {
          const executed = runCommand(input, p, inner, catalogRecord);
          if (Buffer.byteLength(JSON.stringify(executed)) > 48000)
            throw new ScannerError(
              'scanner_result_too_large',
              'This operation exceeds scanner feedback limits. Use the reviewed Bòrd workflow instead.',
            );
          return executed;
        });
      } catch (error) {
        const failure = domainError(error);
        if (!failure || failure.status === 403) throw error;
        status = failure.status;
        result = {
          operationId: input.operationId,
          type: input.command.type,
          message: failure.message,
          error: { code: failure.code, message: failure.message },
          undoable: false,
        };
      }
      result = {
        ...result,
        contractVersion: 2,
        stationId: station.id,
        bindingId: station.bindingId,
        instanceId: input.instanceId,
        outcome: status === 200 ? 'succeeded' : 'needs_review',
        recordedAt: new Date().toISOString(),
      };
      tx.insert(scannerOperations)
        .values({
          id: input.operationId,
          stationId: station.id,
          userId: p.userId,
          profileId: p.profileId,
          bindingId: station.bindingId,
          intentHash,
          result,
          command: input,
          outcome: result.outcome,
          httpStatus: status,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: scannerOperations.id,
          set: {
            intentHash,
            result,
            command: input,
            bindingId: station.bindingId,
            outcome: result.outcome,
            httpStatus: status,
          },
        })
        .run();
      return { status, result: { ...result, replayed: false } };
    },
    { behavior: 'immediate' },
  );
}
export function scannerReceipt(p: RequestPrincipal, id: string) {
  z.string().uuid().parse(id);
  permission(p, 'pantry', 'read');
  const row = getDatabase()
    .select()
    .from(scannerOperations)
    .where(eq(scannerOperations.id, id))
    .get();
  if (!row)
    throw new ScannerError(
      'scanner_receipt_missing',
      'No receipt is recorded. An in-flight operation may still complete.',
      404,
    );
  ownedStation(p, row.stationId);
  return { status: row.httpStatus, result: row.result };
}
export function replayLegacyScanner(p: RequestPrincipal, raw: unknown) {
  const input = scannerOperationSchema.parse(raw);
  permission(p, 'pantry', 'read');
  ownedStation(p, input.stationId);
  const row = getDatabase()
    .select()
    .from(scannerOperations)
    .where(eq(scannerOperations.id, input.operationId))
    .get();
  if (
    !row ||
    row.bindingId ||
    row.userId !== p.userId ||
    row.profileId !== p.profileId ||
    row.intentHash !== createHash('sha256').update(JSON.stringify(input)).digest('hex')
  )
    throw new ScannerError(
      'scanner_legacy_blocked',
      'Legacy delivery is blocked. Reconcile the original queue before preparing new commands.',
    );
  return { status: row.httpStatus, result: { ...row.result, replayed: true } };
}
export function scannerStationList(p: RequestPrincipal) {
  if (p.kind !== 'session')
    throw new ScannerError('scanner_session_required', 'Sign in to view stations.', 403);
  ensureDatabase();
  return getDatabase()
    .select()
    .from(scannerStations)
    .where(and(eq(scannerStations.userId, p.userId), eq(scannerStations.profileId, p.profileId)))
    .all()
    .map((s) => ({
      id: s.id,
      name: s.name,
      active: s.active,
      lastSeenAt: s.lastSeenAt,
      state: s.state,
      stale: !s.lastSeenAt || Date.now() - s.lastSeenAt.getTime() > 15000,
    }));
}
export function boundedRows<T>(rows: T[], maximum = 23000) {
  const selected: T[] = [];
  let bytes = 2;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (bytes + size > maximum) break;
    selected.push(row);
    bytes += size;
  }
  return selected;
}
export function scannerStationDetail(p: RequestPrincipal, id: string) {
  const station = ownedStation(p, id),
    db = getDatabase();
  const operations = db
    .select()
    .from(scannerOperations)
    .where(eq(scannerOperations.stationId, id))
    .orderBy(desc(scannerOperations.createdAt))
    .limit(100)
    .all();
  const events = db
    .select()
    .from(scannerStationEvents)
    .where(eq(scannerStationEvents.stationId, id))
    .orderBy(desc(scannerStationEvents.createdAt), desc(scannerStationEvents.sequence))
    .limit(100)
    .all();
  return {
    ...scannerStationList(p).find((s) => s.id === id),
    bindingId: station.bindingId,
    instanceId: scannerInstanceId(),
    userId: station.userId,
    profileId: station.profileId,
    controls: db
      .select({
        id: scannerStationControls.id,
        status: scannerStationControls.status,
        expiresAt: scannerStationControls.expiresAt,
      })
      .from(scannerStationControls)
      .where(eq(scannerStationControls.stationId, id))
      .orderBy(desc(scannerStationControls.createdAt))
      .limit(8)
      .all()
      .map((c) => ({
        ...c,
        status: c.status === 'pending' && c.expiresAt.getTime() < Date.now() ? 'expired' : c.status,
      })),
    operations: boundedRows(
      operations.map((o) => ({
        id: o.id,
        request: o.command,
        result: o.result,
        status: o.outcome,
        undoneBy: o.undoneBy,
        createdAt: o.createdAt,
      })),
    ),
    events: boundedRows(events.map((e) => ({ ...e.payload, bootId: e.bootId }))),
    historyLimited: true,
    locations: listPantryLocations().map((l) => ({ id: l.id, name: l.path })),
  };
}
export function createScannerControl(p: RequestPrincipal, id: string, raw: unknown) {
  if (p.kind !== 'session')
    throw new ScannerError(
      'scanner_session_required',
      'Use the station page to change controls.',
      403,
    );
  const station = ownedStation(p, id);
  const input = z
    .object({
      id: z.string().uuid(),
      bootId: z.string().uuid(),
      stateRevision: z.number().int().min(0),
      command: scannerControlSchema,
    })
    .strict()
    .parse(raw);
  if (
    station.state?.profile === 'add-only' &&
    (input.command.control === 'action' ||
      input.command.control === 'meal_date' ||
      (input.command.control === 'mode' && !['idle', 'add'].includes(input.command.mode)))
  )
    throw new ScannerError(
      'scanner_control_unsupported',
      'This companion supports pantry additions only.',
    );
  const db = getDatabase();
  return db.transaction(
    (tx) => {
      const prior = tx
        .select()
        .from(scannerStationControls)
        .where(eq(scannerStationControls.id, input.id))
        .get();
      if (prior) {
        if (
          prior.stationId !== id ||
          prior.bootId !== input.bootId ||
          prior.stateRevision !== input.stateRevision ||
          stable(prior.command) !== stable(input.command)
        )
          throw new ScannerError(
            'scanner_control_conflict',
            'Control UUID belongs to another intent.',
          );
        return { id: prior.id, status: prior.status };
      }
      if (
        !station.lastSeenAt ||
        Date.now() - station.lastSeenAt.getTime() > 15000 ||
        !station.state ||
        station.state.bootId !== input.bootId ||
        station.state.revision !== input.stateRevision
      )
        throw new ScannerError(
          'scanner_state_stale',
          'The station changed or disconnected. Refresh before changing its mode.',
        );
      tx.update(scannerStationControls)
        .set({ status: 'rejected' })
        .where(
          and(
            eq(scannerStationControls.stationId, id),
            eq(scannerStationControls.status, 'pending'),
            lt(scannerStationControls.expiresAt, new Date()),
          ),
        )
        .run();
      if (
        tx
          .select()
          .from(scannerStationControls)
          .where(
            and(
              eq(scannerStationControls.stationId, id),
              eq(scannerStationControls.status, 'pending'),
            ),
          )
          .get()
      )
        throw new ScannerError(
          'scanner_control_pending',
          'Wait for the station to acknowledge its pending control.',
        );
      tx.insert(scannerStationControls)
        .values({
          id: input.id,
          stationId: id,
          bootId: input.bootId,
          stateRevision: input.stateRevision,
          command: input.command,
          expiresAt: new Date(Date.now() + 10000),
          createdAt: new Date(),
        })
        .run();
      return { id: input.id, status: 'pending' };
    },
    { behavior: 'immediate' },
  );
}
export function syncScannerStation(p: RequestPrincipal, id: string, raw: unknown) {
  const station = ownedStation(p, id),
    input = scannerSyncSchema.parse(raw);
  if (input.instanceId !== scannerInstanceId() || input.bindingId !== station.bindingId)
    throw new ScannerError('scanner_binding_changed', 'Station binding changed.', 403);
  const db = getDatabase();
  return db.transaction(
    (tx) => {
      const old = tx.select().from(scannerStations).where(eq(scannerStations.id, id)).get()!;
      if (old.state?.bootId === input.state.bootId && old.state.revision > input.state.revision)
        throw new ScannerError('scanner_state_stale', 'Discard an older station heartbeat.');
      for (const event of input.events) {
        const eventBoot = event.bootId ?? input.state.bootId;
        const key = `${id}:${eventBoot}:${event.sequence}`,
          prior = tx
            .select()
            .from(scannerStationEvents)
            .where(eq(scannerStationEvents.id, key))
            .get();
        if (prior && stable(prior.payload) !== stable(event))
          throw new ScannerError(
            'scanner_event_conflict',
            'This sequence already contains another event.',
          );
        if (!prior)
          tx.insert(scannerStationEvents)
            .values({
              id: key,
              stationId: id,
              bootId: eventBoot,
              sequence: event.sequence,
              payload: event,
              createdAt: new Date(),
            })
            .run();
      }
      for (const ack of input.acknowledgements)
        tx.update(scannerStationControls)
          .set({ status: ack.status })
          .where(
            and(
              eq(scannerStationControls.id, ack.id),
              eq(scannerStationControls.stationId, id),
              eq(scannerStationControls.bootId, input.state.bootId),
              eq(scannerStationControls.status, 'pending'),
            ),
          )
          .run();
      const controls = tx
        .select()
        .from(scannerStationControls)
        .where(
          and(
            eq(scannerStationControls.stationId, id),
            eq(scannerStationControls.status, 'pending'),
          ),
        )
        .all();
      const deliver = [];
      for (const c of controls) {
        if (
          c.expiresAt.getTime() < Date.now() ||
          c.bootId !== input.state.bootId ||
          c.stateRevision !== input.state.revision
        )
          tx.update(scannerStationControls)
            .set({ status: 'rejected' })
            .where(eq(scannerStationControls.id, c.id))
            .run();
        else
          deliver.push({
            id: c.id,
            bootId: c.bootId,
            stateRevision: c.stateRevision,
            expiresAt: c.expiresAt.getTime() / 1000,
            command: c.command,
          });
      }
      tx.update(scannerStations)
        .set({ state: input.state, lastSeenAt: new Date() })
        .where(eq(scannerStations.id, id))
        .run();
      tx.delete(scannerStationEvents)
        .where(
          and(
            eq(scannerStationEvents.stationId, id),
            lt(scannerStationEvents.createdAt, new Date(Date.now() - 30 * 86400000)),
          ),
        )
        .run();
      const requestedReviews = new Set(input.reviewOperationIds);
      const resolvedReviewIds = Array.from(
        new Set(
          tx
            .select()
            .from(scannerOperations)
            .where(
              and(
                eq(scannerOperations.stationId, station.id),
                eq(scannerOperations.outcome, 'succeeded'),
              ),
            )
            .all()
            .flatMap((row) => {
              const saved = boundScannerOperationSchema.safeParse(row.command);
              const target = saved.success ? saved.data.supersedesOperationId : undefined;
              return target && requestedReviews.has(target) ? [target] : [];
            }),
        ),
      );

      return {
        contractVersion: 2,
        stationId: id,
        instanceId: input.instanceId,
        bindingId: input.bindingId,
        bootId: input.state.bootId,
        resolvedReviewIds,
        acknowledgedSequences: input.events.map((e) => e.sequence),
        controls: deliver.slice(0, 8),
      };
    },
    { behavior: 'immediate' },
  );
}
