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
} from '@/lib/db/schema';
import type { FoodCatalogImportInput, FoodRecord } from '@/lib/domain/food-data';
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
  const requestDigest = digest({ input, destination, batches: args.batches ?? [] });
  const database = getDatabase();
  const existingOperation = database
    .select()
    .from(foodCatalogImportOperations)
    .where(eq(foodCatalogImportOperations.id, input.operationId))
    .get();
  if (existingOperation) {
    if (existingOperation.requestDigest !== requestDigest)
      throw new PantryConflictError(
        'That import operation ID was already used for different data.',
      );
    return JSON.parse(existingOperation.result) as {
      productId: string;
      batchIds: string[];
      reusedProduct: boolean;
    };
  }
  const parsedBatches =
    destination === 'pantry'
      ? (args.batches ?? []).map(parseCatalogBatch)
      : [];
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
