import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  foodCatalogImportOperations,
  foodNutrientValues,
  foodNutritionRecords,
  foodProviderSnapshots,
  nutritionDataSources,
  pantryProductIdentifiers,
  pantryProductProviderLinks,
  pantryProducts,
  shoppingListItems,
} from '@/lib/db/schema';
import {
  FoodDataError,
  foodCatalogShoppingInputSchema,
  type FoodCatalogImportInput,
  type FoodRecord,
} from '@/lib/domain/food-data';
import { getFoodDetails } from './food-data-service';
import { isNativeCatalogEnabled, directFoodFallbackAllowed } from './bord-catalog-service';
import { addShoppingListItem, getShoppingList, updateShoppingListItem } from './planning-service';
import { matchShoppingItemToPantryProduct } from './pantry-grocery-cooking-service';
import { normalizePantryName, pantryBatchInputSchema } from '@/lib/domain/pantry';
import { normalizeInventoryUnit } from '@/lib/domain/inventory-units';
import {
  createPantryBatchInTransaction,
  listPantryProducts,
  PantryConflictError,
} from '@/lib/services/pantry-service';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function digest(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}
function jsonList(values: string[]) {
  return JSON.stringify([...new Set(values.map((value) => value.trim()).filter(Boolean))]);
}

function parseCatalogBatch(value: unknown) {
  const candidate = {
    ...(typeof value === 'object' && value ? value : {}),
    productId: '00000000-0000-0000-0000-000000000000',
  } as Record<string, unknown>;
  for (const field of [
    'purchaseDate',
    'bestBeforeDate',
    'useByDate',
    'sellByDate',
    'openedDate',
    'frozenDate',
    'thawedDate',
    'preparedDate',
  ]) {
    if (candidate[field] === null) candidate[field] = '';
  }
  return pantryBatchInputSchema.parse(candidate);
}

function sourceDefinition(record: FoodRecord) {
  return record.provider === 'open_food_facts'
    ? {
        id: 'open_food_facts_v3_6',
        name: 'Open Food Facts product data',
        provider: 'Open Food Facts',
        version: 'v3.6',
        sourceUrl: 'https://world.openfoodfacts.org',
        citation: record.citation,
        license: record.license,
        priority: 60,
      }
    : {
        id: 'usda_fdc_v1',
        name: 'USDA FoodData Central',
        provider: 'USDA FoodData Central',
        version: 'v1',
        sourceUrl: 'https://fdc.nal.usda.gov',
        citation: record.citation,
        license: record.license,
        priority: 70,
      };
}

function productInsert(
  input: FoodCatalogImportInput['product'],
  actorProfileId: string,
  productId: string,
  now: Date,
) {
  return {
    id: productId,
    normalizedName: normalizePantryName(input.displayName),
    displayName: input.displayName,
    brand: input.brand,
    variant: input.variant,
    category: input.category,
    subcategory: '',
    defaultInventoryUnit: normalizeInventoryUnit(input.defaultInventoryUnit),
    defaultPackageAmount: input.defaultPackageAmount,
    defaultPackageUnit: input.defaultPackageUnit
      ? normalizeInventoryUnit(input.defaultPackageUnit)
      : '',
    defaultStorageType: 'pantry' as const,
    imageStorageKey: null,
    dietaryTags: jsonList(input.dietaryTags),
    allergens: jsonList(input.allergens),
    storageInstructions: '',
    defaultShelfLifeDays: null,
    shelfLifeAfterOpeningDays: null,
    isStaple: false,
    preferredBrand: '',
    preferredStore: '',
    minimumStock: null,
    targetStock: null,
    reorderThreshold: null,
    preferredPurchaseQuantity: null,
    stockUnit: '',
    suggestGroceryRestock: false,
    archivedAt: null,
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof pantryProducts.$inferInsert;
}

export function importFoodCatalogRecord(args: {
  input: FoodCatalogImportInput;
  record: FoodRecord;
  actorProfileId: string;
  /** Authenticated account identity for HTTP/assistant calls, independent of viewed profile. */
  actorUserId?: string;
  destination: 'catalog' | 'pantry';
  batches?: unknown[];
}) {
  ensureDatabase();
  const { input, record, actorProfileId, destination } = args;
  if (
    input.selection.provider !== record.provider ||
    input.selection.recordId !== record.providerRecordId
  )
    throw new PantryConflictError('The reviewed provider record changed. Review it again.');
  if (input.selection.expectedCanonicalGtin !== record.canonicalGtin)
    throw new PantryConflictError('The reviewed barcode changed. Review it again.');
  if (
    input.selection.catalogRef &&
    (!record.catalogRef ||
      input.selection.catalogRef.source_revision !== record.catalogRef.source_revision ||
      input.selection.catalogRef.source_id !== record.catalogRef.source_id ||
      input.selection.catalogRef.source_record_id !== record.catalogRef.source_record_id)
  )
    throw new FoodDataError(
      'REVISION_EXPIRED',
      'The reviewed food revision changed. Review it again.',
    );
  const requestDigest = digest({
    input,
    destination,
    batches: args.batches ?? [],
    ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
  });
  const database = getDatabase();
  const existingOperation = database
    .select()
    .from(foodCatalogImportOperations)
    .where(eq(foodCatalogImportOperations.id, input.operationId))
    .get();
  if (existingOperation) {
    if (
      existingOperation.actorProfileId !== actorProfileId ||
      ![requestDigest, digest({ input, destination, batches: args.batches ?? [] })].includes(
        existingOperation.requestDigest,
      )
    )
      throw new PantryConflictError(
        'That import operation ID was already used for different data.',
      );
    return JSON.parse(existingOperation.result) as {
      productId: string;
      batchIds: string[];
      reusedProduct: boolean;
    };
  }
  const parsedBatches = destination === 'pantry' ? (args.batches ?? []).map(parseCatalogBatch) : [];
  const now = new Date();
  const result = database.transaction((transaction) => {
    const identifier = record.canonicalGtin
      ? transaction
          .select()
          .from(pantryProductIdentifiers)
          .where(eq(pantryProductIdentifiers.normalizedValue, record.canonicalGtin))
          .get()
      : null;
    let productId = identifier?.productId ?? '';
    const reusedProduct = Boolean(productId);
    if (!productId) {
      const duplicateName = transaction
        .select({ id: pantryProducts.id })
        .from(pantryProducts)
        .where(
          and(
            eq(pantryProducts.normalizedName, normalizePantryName(input.product.displayName)),
            eq(pantryProducts.brand, input.product.brand),
            eq(pantryProducts.variant, input.product.variant),
          ),
        )
        .get();
      if (duplicateName)
        throw new PantryConflictError(
          'A product with that name already exists. Link it explicitly instead of merging by name.',
        );
      productId = randomUUID();
      transaction
        .insert(pantryProducts)
        .values(productInsert(input.product, actorProfileId, productId, now))
        .run();
    }
    if (record.canonicalGtin && !identifier) {
      const raw = record.canonicalGtin.replace(/^0+(?=\d{8,})/u, '');
      transaction
        .insert(pantryProductIdentifiers)
        .values({
          id: randomUUID(),
          productId,
          identifierType: raw.length === 12 ? 'upc_a' : raw.length === 13 ? 'ean_13' : 'gtin',
          value: raw,
          normalizedValue: record.canonicalGtin,
          source: record.provider,
          verified: true,
          metadata: JSON.stringify({ providerRecordId: record.providerRecordId }),
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    const contentHash = digest(record);
    let snapshot = transaction
      .select()
      .from(foodProviderSnapshots)
      .where(
        and(
          eq(foodProviderSnapshots.provider, record.provider),
          eq(foodProviderSnapshots.providerRecordId, record.providerRecordId),
          eq(foodProviderSnapshots.contentHash, contentHash),
        ),
      )
      .get();
    if (!snapshot) {
      snapshot = {
        id: randomUUID(),
        provider: record.provider,
        providerRecordId: record.providerRecordId,
        dataType: record.dataType,
        canonicalGtin: record.canonicalGtin,
        normalizedPayload: JSON.stringify(record),
        transportId: record.catalogRef?.transport_id ?? null,
        sourceRevision: record.catalogRef?.source_revision ?? null,
        catalogGeneration: record.catalogRef?.catalog_generation ?? null,
        canonicalProductId: record.catalogRef?.canonical_product_id ?? null,
        providerMetadata: JSON.stringify(record.providerMetadata),
        contentHash,
        schemaVersion: record.schemaVersion,
        sourceUrl: record.sourceUrl,
        citation: record.citation,
        license: record.license,
        retrievedAt: new Date(record.retrievedAt),
        createdAt: now,
      };
      transaction.insert(foodProviderSnapshots).values(snapshot).run();
    }
    transaction
      .insert(pantryProductProviderLinks)
      .values({
        id: randomUUID(),
        productId,
        snapshotId: snapshot.id,
        relation: 'selected',
        fieldsUsed: JSON.stringify(['identity', 'product', 'nutrition', 'allergens', 'images']),
        createdByProfileId: actorProfileId,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
    if (
      record.nutrients.length &&
      record.nutrientBasis &&
      (record.nutrientBasis !== 'per_serving' || record.servingWeightGrams)
    ) {
      const source = sourceDefinition(record);
      transaction
        .insert(nutritionDataSources)
        .values({
          ...source,
          sourceType: 'provider',
          retrievedAt: now,
          metadata: JSON.stringify({ normalizedSchema: record.schemaVersion }),
          createdAt: now,
        })
        .onConflictDoNothing()
        .run();
      const alreadyImported = transaction
        .select()
        .from(foodNutritionRecords)
        .where(
          and(
            eq(foodNutritionRecords.productId, productId),
            eq(foodNutritionRecords.sourceId, source.id),
            eq(foodNutritionRecords.sourceRecordKey, `${record.providerRecordId}:${contentHash}`),
          ),
        )
        .get();
      if (!alreadyImported) {
        const previous = transaction
          .select()
          .from(foodNutritionRecords)
          .where(eq(foodNutritionRecords.productId, productId))
          .orderBy(desc(foodNutritionRecords.revision))
          .get();
        const nutritionId = randomUUID();
        transaction
          .insert(foodNutritionRecords)
          .values({
            id: nutritionId,
            productId,
            revision: (previous?.revision ?? 0) + 1,
            sourceId: source.id,
            sourceRecordKey: `${record.providerRecordId}:${contentHash}`,
            basisType: record.nutrientBasis,
            basisAmount: record.nutrientBasis === 'per_serving' ? 1 : 100,
            basisUnit:
              record.nutrientBasis === 'per_100ml'
                ? 'ml'
                : record.nutrientBasis === 'per_serving'
                  ? 'serving'
                  : record.nutrientBasis === 'per_unit'
                    ? 'each'
                    : 'g',
            servingWeightGrams: record.servingWeightGrams,
            densityGramsPerMilliliter: null,
            pieceWeightGrams: null,
            confidence: 0.85,
            completeness: record.completeness,
            supersedesRecordId: previous?.id ?? null,
            recordedByProfileId: actorProfileId,
            notes: `Imported from ${source.name}; values remain attributed to the provider snapshot.`,
            createdAt: now,
          })
          .run();
        transaction
          .insert(foodNutrientValues)
          .values(
            record.nutrients.map((nutrient) => ({
              recordId: nutritionId,
              nutrientCode: nutrient.nutrientCode,
              amount: nutrient.amount,
              confidence: 0.85,
              sourceNote: JSON.stringify({
                originalId: nutrient.originalId,
                originalName: nutrient.originalName,
                originalUnit: nutrient.originalUnit,
                canonicalUnit: nutrient.unit,
              }),
            })),
          )
          .run();
      }
    }
    const batchIds = parsedBatches.map(
      (batch) =>
        createPantryBatchInTransaction(transaction, { ...batch, productId }, actorProfileId).batch
          .id,
    );
    const operationResult = { productId, batchIds, reusedProduct };
    transaction
      .insert(foodCatalogImportOperations)
      .values({
        id: input.operationId,
        requestDigest,
        destination,
        productId,
        result: JSON.stringify(operationResult),
        actorProfileId,
        createdAt: now,
      })
      .run();
    return operationResult;
  });
  return {
    ...result,
    product: listPantryProducts(true).find((product) => product.id === result.productId)!,
  };
}

/** Replay a completed confirmation without depending on catalog availability. */
export function replayFoodCatalogImport(
  input: FoodCatalogImportInput,
  destination: 'catalog' | 'pantry',
  actorProfileId: string,
  batches: unknown[] = [],
  actorUserId?: string,
) {
  ensureDatabase();
  const operation = getDatabase()
    .select()
    .from(foodCatalogImportOperations)
    .where(eq(foodCatalogImportOperations.id, input.operationId))
    .get();
  if (!operation) return null;
  // Validate the same actor and normalized command before returning an acknowledged result.
  // Older receipts predate account binding; their original profile+intent binding still applies.
  // New account-bound receipts cannot match the legacy digest.
  if (
    operation.actorProfileId !== actorProfileId ||
    ![
      digest({ input, destination, batches, ...(actorUserId ? { actorUserId } : {}) }),
      digest({ input, destination, batches }),
    ].includes(operation.requestDigest)
  )
    throw new PantryConflictError('That import operation ID was already used for different data.');
  return JSON.parse(operation.result) as {
    productId: string;
    batchIds: string[];
    reusedProduct: boolean;
  };
}

/** Confirm a reviewed catalog identity and a shopping match in one durable local transaction. */
export async function confirmCatalogShoppingItem(args: {
  input: unknown;
  listId: string;
  actorProfileId: string;
  actorUserId: string;
}) {
  const input = foodCatalogShoppingInputSchema.parse(args.input);
  const { itemId, expectedUpdatedAt, cartQuantity, cartUnit, ...catalogInput } = input;
  ensureDatabase();
  const database = getDatabase();
  const requestDigest = digest({
    input,
    listId: args.listId,
    actorUserId: args.actorUserId,
    operation: 'catalog-shopping-item',
  });
  const replay = () => {
    const operation = database
      .select()
      .from(foodCatalogImportOperations)
      .where(eq(foodCatalogImportOperations.id, input.operationId))
      .get();
    if (!operation) return null;
    if (
      operation.actorProfileId !== args.actorProfileId ||
      operation.requestDigest !== requestDigest
    )
      throw new PantryConflictError(
        'That confirmation belongs to a different person or shopping selection.',
      );
    return JSON.parse(operation.result) as {
      productId: string;
      itemId: string;
      listId: string;
      batchIds: string[];
      reusedProduct: boolean;
    };
  };
  // Authorization is performed by the caller before this scope-bound replay. No provider is needed.
  const acknowledged = replay();
  if (acknowledged) return { ...acknowledged, replayed: true };
  const list = getShoppingList(args.listId);
  if (!list || list.archivedAt) throw new PantryConflictError('Choose an available shopping list.');
  if (
    isNativeCatalogEnabled() &&
    !directFoodFallbackAllowed() &&
    !catalogInput.selection.catalogRef
  )
    throw new FoodDataError(
      'REVISION_EXPIRED',
      'Review this food through the catalog before saving.',
    );
  const { record } = await getFoodDetails(
    catalogInput.selection.provider,
    catalogInput.selection.recordId,
    'en',
    catalogInput.selection.catalogRef,
    true,
  );
  return database.transaction(() => {
    const currentReplay = replay();
    if (currentReplay) return { ...currentReplay, replayed: true };
    const currentList = getShoppingList(args.listId);
    if (!currentList || currentList.archivedAt)
      throw new PantryConflictError('The shopping list changed. Review it again.');
    const existing = itemId
      ? database
          .select()
          .from(shoppingListItems)
          .where(and(eq(shoppingListItems.listId, args.listId), eq(shoppingListItems.id, itemId)))
          .get()
      : null;
    if (itemId && (!existing || existing.updatedAt.toISOString() !== expectedUpdatedAt))
      throw new PantryConflictError(
        'The shopping item changed. Refresh and review the match again.',
      );
    const imported = importFoodCatalogRecord({
      input: catalogInput,
      record,
      actorProfileId: args.actorProfileId,
      actorUserId: args.actorUserId,
      destination: 'catalog',
    });
    let savedItemId: string;
    if (existing) {
      savedItemId = existing.id;
      matchShoppingItemToPantryProduct(
        args.listId,
        savedItemId,
        { productId: imported.productId, matchType: 'manual' },
        args.actorProfileId,
      );
      updateShoppingListItem(
        args.listId,
        savedItemId,
        {
          item: existing.item,
          quantity: existing.quantity ?? '',
          unit: existing.unit,
          note: existing.note,
          aisleId: existing.aisleId ?? '',
          checked: false,
          shoppingState: 'in_cart',
          cartQuantity,
          cartLabel: `${cartQuantity} ${cartUnit} · ${record.displayName}`.slice(0, 160),
        },
        args.actorProfileId,
      );
    } else {
      savedItemId = addShoppingListItem(
        args.listId,
        {
          item: catalogInput.product.displayName,
          quantity: '',
          unit: '',
          note: '',
          checked: false,
          shoppingState: 'in_cart',
          cartQuantity,
          cartLabel: `${cartQuantity} ${cartUnit} · ${record.displayName}`.slice(0, 160),
          productId: imported.productId,
        },
        args.actorProfileId,
      ).id;
    }
    const result = {
      productId: imported.productId,
      batchIds: [],
      reusedProduct: imported.reusedProduct,
      itemId: savedItemId,
      listId: args.listId,
    };
    database
      .update(foodCatalogImportOperations)
      .set({ requestDigest, result: JSON.stringify(result) })
      .where(eq(foodCatalogImportOperations.id, input.operationId))
      .run();
    return { ...result, replayed: false };
  });
}
