import { and, asc, desc, eq, inArray, isNull, max } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  pantryBatches,
  pantryInventoryEvents,
  pantryLocations,
  pantryProductAliases,
  pantryProductIdentifiers,
  pantryProducts,
} from '@/lib/db/schema';
import {
  normalizePantryName,
  pantryExpiryState,
  type PantryBatchAction,
  type PantryBatchInput,
  type PantryBatchUpdate,
  type PantryLocationInput,
  type PantryProductInput,
  type PantryQuery,
} from '@/lib/domain/pantry';
import {
  areInventoryUnitsCompatible,
  convertInventoryQuantity,
  normalizeInventoryUnit,
} from '@/lib/domain/inventory-units';

type AppDatabase = ReturnType<typeof getDatabase>;
export type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
type DatabaseExecutor = AppDatabase | AppTransaction;
type BatchRecord = typeof pantryBatches.$inferSelect;
type EventType = typeof pantryInventoryEvents.$inferInsert.eventType;

export class PantryNotFoundError extends Error {}
export class PantryConflictError extends Error {}
export class PantryValidationError extends Error {}

export type PantryProductView = typeof pantryProducts.$inferSelect & {
  aliases: string[];
  identifiers: Array<typeof pantryProductIdentifiers.$inferSelect>;
};

export type PantryLocationView = typeof pantryLocations.$inferSelect & {
  path: string;
  depth: number;
};

export type PantryBatchView = BatchRecord & {
  product: PantryProductView;
  location: PantryLocationView;
  expiry: ReturnType<typeof pantryExpiryState>;
  quantityLabel: string;
};

export type PantryDashboard = {
  summary: {
    activeItems: number;
    expiringSoon: number;
    expired: number;
    lowStockStaples: number;
    openedItems: number;
    recentlyChanged: number;
  };
  products: PantryProductView[];
  locations: PantryLocationView[];
  batches: PantryBatchView[];
  recentEvents: Array<typeof pantryInventoryEvents.$inferSelect & { productName: string }>;
  lowStockProductIds: string[];
};

type MutableBatchState = Pick<
  BatchRecord,
  | 'quantityRemaining'
  | 'originalQuantity'
  | 'unit'
  | 'packageCount'
  | 'amountPerPackage'
  | 'packageUnit'
  | 'approximateState'
  | 'locationId'
  | 'sublocation'
  | 'purchaseDate'
  | 'bestBeforeDate'
  | 'useByDate'
  | 'sellByDate'
  | 'openedDate'
  | 'frozenDate'
  | 'thawedDate'
  | 'preparedDate'
  | 'expiryPrecision'
  | 'status'
  | 'purchasePriceCents'
  | 'source'
  | 'notes'
  | 'excludeFromGrocery'
  | 'productId'
  | 'sourceRecipeId'
  | 'sourceMealPlanEntryId'
  | 'sourceShoppingListItemId'
>;

const MUTABLE_BATCH_KEYS: Array<keyof MutableBatchState> = [
  'quantityRemaining',
  'originalQuantity',
  'unit',
  'packageCount',
  'amountPerPackage',
  'packageUnit',
  'approximateState',
  'locationId',
  'sublocation',
  'purchaseDate',
  'bestBeforeDate',
  'useByDate',
  'sellByDate',
  'openedDate',
  'frozenDate',
  'thawedDate',
  'preparedDate',
  'expiryPrecision',
  'status',
  'purchasePriceCents',
  'source',
  'notes',
  'excludeFromGrocery',
  'productId',
  'sourceRecipeId',
  'sourceMealPlanEntryId',
  'sourceShoppingListItemId',
];

const ACTIVE_BATCH_STATUSES = new Set<BatchRecord['status']>([
  'unopened',
  'opened',
  'frozen',
  'thawed',
  'reserved',
]);

function batchSnapshot(
  batch: BatchRecord | (MutableBatchState & Partial<BatchRecord>),
): MutableBatchState {
  return Object.fromEntries(
    MUTABLE_BATCH_KEYS.map((key) => [key, batch[key]]),
  ) as MutableBatchState;
}

function parseSnapshot(value: string): MutableBatchState {
  return JSON.parse(value) as MutableBatchState;
}

function normalizedJsonList(values: string[]): string {
  const seen = new Set<string>();
  return JSON.stringify(
    values.flatMap((value) => {
      const compact = value.trim().replace(/\s+/gu, ' ');
      const key = compact.toLocaleLowerCase();
      if (!compact || seen.has(key)) return [];
      seen.add(key);
      return [compact];
    }),
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type PairedActionNote = {
  pantryPair: 'split' | 'combine';
  peerBatchId: string;
  peerEventId: string;
  peerVersionAfter: number;
  userNote: string;
};

function pairedActionNote(value: PairedActionNote): string {
  return JSON.stringify(value);
}

function parsePairedActionNote(value: string): PairedActionNote | null {
  try {
    const parsed = JSON.parse(value) as Partial<PairedActionNote>;
    return (parsed.pantryPair === 'split' || parsed.pantryPair === 'combine') &&
      typeof parsed.peerBatchId === 'string' &&
      typeof parsed.peerEventId === 'string' &&
      typeof parsed.peerVersionAfter === 'number'
      ? (parsed as PairedActionNote)
      : null;
  } catch {
    return null;
  }
}

function requireProduct(executor: DatabaseExecutor, productId: string) {
  const product = executor
    .select()
    .from(pantryProducts)
    .where(eq(pantryProducts.id, productId))
    .get();
  if (!product || product.archivedAt)
    throw new PantryNotFoundError('That Pantry product is unavailable.');
  return product;
}

function requireLocation(executor: DatabaseExecutor, locationId: string) {
  const location = executor
    .select()
    .from(pantryLocations)
    .where(eq(pantryLocations.id, locationId))
    .get();
  if (!location || location.archivedAt)
    throw new PantryNotFoundError('That storage location is unavailable.');
  return location;
}

function requireBatch(executor: DatabaseExecutor, batchId: string): BatchRecord {
  const batch = executor.select().from(pantryBatches).where(eq(pantryBatches.id, batchId)).get();
  if (!batch) throw new PantryNotFoundError('That Pantry batch no longer exists.');
  return batch;
}

function ensureVersion(batch: BatchRecord, expectedVersion: number): void {
  if (batch.version !== expectedVersion) {
    throw new PantryConflictError(
      'This Pantry item changed in another tab. Refresh it before applying another adjustment.',
    );
  }
}

function insertEvent(
  executor: DatabaseExecutor,
  input: {
    batch: BatchRecord;
    eventType: EventType;
    previous: MutableBatchState;
    next: MutableBatchState;
    actorProfileId: string;
    reason?: string;
    note?: string;
    undoOfEventId?: string | null;
    relatedRecipeId?: string | null;
    relatedMealPlanEntryId?: string | null;
    relatedShoppingListItemId?: string | null;
    relatedCookSessionId?: string | null;
  },
): string {
  const eventId = randomUUID();
  const latestSequence = executor
    .select({ value: max(pantryInventoryEvents.batchSequence) })
    .from(pantryInventoryEvents)
    .where(eq(pantryInventoryEvents.batchId, input.batch.id))
    .get()?.value;
  executor
    .insert(pantryInventoryEvents)
    .values({
      id: eventId,
      batchId: input.batch.id,
      productId: input.batch.productId,
      eventType: input.eventType,
      previousQuantity: input.previous.quantityRemaining,
      newQuantity: input.next.quantityRemaining,
      quantityChanged:
        input.previous.quantityRemaining === null || input.next.quantityRemaining === null
          ? null
          : Number((input.next.quantityRemaining - input.previous.quantityRemaining).toFixed(6)),
      unit: input.next.unit,
      previousState: JSON.stringify(input.previous),
      newState: JSON.stringify(input.next),
      reason: input.reason ?? '',
      relatedRecipeId: input.relatedRecipeId ?? null,
      relatedMealPlanEntryId: input.relatedMealPlanEntryId ?? null,
      relatedShoppingListItemId: input.relatedShoppingListItemId ?? null,
      relatedCookSessionId: input.relatedCookSessionId ?? null,
      note: input.note ?? '',
      actorProfileId: input.actorProfileId,
      undoOfEventId: input.undoOfEventId ?? null,
      reversedByEventId: null,
      batchSequence: (latestSequence ?? 0) + 1,
      createdAt: new Date(),
    })
    .run();
  return eventId;
}

function replaceAliases(
  executor: DatabaseExecutor,
  productId: string,
  aliases: string[],
  createdAt: Date,
): void {
  executor.delete(pantryProductAliases).where(eq(pantryProductAliases.productId, productId)).run();
  aliases.forEach((alias) => {
    const compact = alias.trim().replace(/\s+/gu, ' ');
    if (!compact) return;
    executor
      .insert(pantryProductAliases)
      .values({
        id: randomUUID(),
        productId,
        alias: compact,
        normalizedAlias: normalizePantryName(compact),
        createdAt,
      })
      .onConflictDoNothing()
      .run();
  });
}

export function ensureDefaultPantryLocations(actorProfileId: string): void {
  ensureDatabase();
  const db = getDatabase();
  if (db.select({ id: pantryLocations.id }).from(pantryLocations).limit(1).get()) return;
  const now = new Date();
  db.transaction((transaction) => {
    if (transaction.select({ id: pantryLocations.id }).from(pantryLocations).limit(1).get()) return;
    const kitchenPantry = randomUUID();
    const refrigerator = randomUUID();
    const freezer = randomUUID();
    const defaults: Array<typeof pantryLocations.$inferInsert> = [
      {
        id: kitchenPantry,
        name: 'Kitchen pantry',
        normalizedName: 'kitchen pantry',
        parentId: null,
        storageType: 'pantry',
        description: '',
        position: 0,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: refrigerator,
        name: 'Refrigerator',
        normalizedName: 'refrigerator',
        parentId: null,
        storageType: 'refrigerator',
        description: '',
        position: 1,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        name: 'Refrigerator door',
        normalizedName: 'refrigerator door',
        parentId: refrigerator,
        storageType: 'refrigerator',
        description: '',
        position: 0,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        name: 'Produce drawer',
        normalizedName: 'produce drawer',
        parentId: refrigerator,
        storageType: 'refrigerator',
        description: '',
        position: 1,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: freezer,
        name: 'Freezer',
        normalizedName: 'freezer',
        parentId: null,
        storageType: 'freezer',
        description: '',
        position: 2,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        name: 'Bread bin',
        normalizedName: 'bread bin',
        parentId: null,
        storageType: 'pantry',
        description: '',
        position: 3,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      },
    ];
    transaction.insert(pantryLocations).values(defaults).run();
  });
}

export function listPantryProducts(includeArchived = false): PantryProductView[] {
  ensureDatabase();
  const db = getDatabase();
  const products = (
    includeArchived
      ? db.select().from(pantryProducts)
      : db.select().from(pantryProducts).where(isNull(pantryProducts.archivedAt))
  )
    .orderBy(asc(pantryProducts.displayName))
    .all();
  const aliases = db
    .select()
    .from(pantryProductAliases)
    .orderBy(asc(pantryProductAliases.alias))
    .all();
  const identifiers = db.select().from(pantryProductIdentifiers).all();
  return products.map((product) => ({
    ...product,
    aliases: aliases.filter((alias) => alias.productId === product.id).map((alias) => alias.alias),
    identifiers: identifiers.filter((identifier) => identifier.productId === product.id),
  }));
}

export function createPantryProduct(
  input: PantryProductInput,
  actorProfileId: string,
): PantryProductView {
  ensureDatabase();
  const db = getDatabase();
  const normalizedName = normalizePantryName(input.displayName);
  const duplicate = db
    .select({ id: pantryProducts.id })
    .from(pantryProducts)
    .where(
      and(
        eq(pantryProducts.normalizedName, normalizedName),
        eq(pantryProducts.brand, input.brand),
        eq(pantryProducts.variant, input.variant),
      ),
    )
    .get();
  if (duplicate) throw new PantryConflictError('That Pantry product already exists.');
  const now = new Date();
  const productId = randomUUID();
  db.transaction((transaction) => {
    transaction
      .insert(pantryProducts)
      .values({
        id: productId,
        normalizedName,
        displayName: input.displayName,
        brand: input.brand,
        variant: input.variant,
        category: input.category,
        subcategory: input.subcategory,
        defaultInventoryUnit: normalizeInventoryUnit(input.defaultInventoryUnit),
        defaultPackageAmount: input.defaultPackageAmount,
        defaultPackageUnit: input.defaultPackageUnit
          ? normalizeInventoryUnit(input.defaultPackageUnit)
          : '',
        defaultStorageType: input.defaultStorageType,
        imageStorageKey: null,
        dietaryTags: normalizedJsonList(input.dietaryTags),
        allergens: normalizedJsonList(input.allergens),
        storageInstructions: input.storageInstructions,
        defaultShelfLifeDays: input.defaultShelfLifeDays,
        shelfLifeAfterOpeningDays: input.shelfLifeAfterOpeningDays,
        isStaple: input.isStaple,
        preferredBrand: input.preferredBrand,
        preferredStore: input.preferredStore,
        minimumStock: input.minimumStock,
        targetStock: input.targetStock,
        reorderThreshold: input.reorderThreshold,
        preferredPurchaseQuantity: input.preferredPurchaseQuantity,
        stockUnit: input.stockUnit ? normalizeInventoryUnit(input.stockUnit) : '',
        suggestGroceryRestock: input.suggestGroceryRestock,
        archivedAt: input.archived ? now : null,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    replaceAliases(transaction, productId, input.aliases, now);
  });
  return listPantryProducts(true).find((product) => product.id === productId)!;
}

export function updatePantryProduct(
  productId: string,
  input: PantryProductInput,
  actorProfileId: string,
): PantryProductView {
  ensureDatabase();
  const db = getDatabase();
  const existing = db.select().from(pantryProducts).where(eq(pantryProducts.id, productId)).get();
  if (!existing) throw new PantryNotFoundError('That Pantry product no longer exists.');
  const now = new Date();
  db.transaction((transaction) => {
    if (input.archived && !existing.archivedAt) {
      const activeBatch = transaction
        .select({ status: pantryBatches.status })
        .from(pantryBatches)
        .where(eq(pantryBatches.productId, productId))
        .all()
        .some((batch) => ACTIVE_BATCH_STATUSES.has(batch.status));
      if (activeBatch) {
        throw new PantryConflictError('Deplete, discard, or donate active stock before archiving.');
      }
    }
    transaction
      .update(pantryProducts)
      .set({
        normalizedName: normalizePantryName(input.displayName),
        displayName: input.displayName,
        brand: input.brand,
        variant: input.variant,
        category: input.category,
        subcategory: input.subcategory,
        defaultInventoryUnit: normalizeInventoryUnit(input.defaultInventoryUnit),
        defaultPackageAmount: input.defaultPackageAmount,
        defaultPackageUnit: input.defaultPackageUnit
          ? normalizeInventoryUnit(input.defaultPackageUnit)
          : '',
        defaultStorageType: input.defaultStorageType,
        dietaryTags: normalizedJsonList(input.dietaryTags),
        allergens: normalizedJsonList(input.allergens),
        storageInstructions: input.storageInstructions,
        defaultShelfLifeDays: input.defaultShelfLifeDays,
        shelfLifeAfterOpeningDays: input.shelfLifeAfterOpeningDays,
        isStaple: input.isStaple,
        preferredBrand: input.preferredBrand,
        preferredStore: input.preferredStore,
        minimumStock: input.minimumStock,
        targetStock: input.targetStock,
        reorderThreshold: input.reorderThreshold,
        preferredPurchaseQuantity: input.preferredPurchaseQuantity,
        stockUnit: input.stockUnit ? normalizeInventoryUnit(input.stockUnit) : '',
        suggestGroceryRestock: input.suggestGroceryRestock,
        archivedAt: input.archived ? (existing.archivedAt ?? now) : null,
        updatedByProfileId: actorProfileId,
        updatedAt: now,
      })
      .where(eq(pantryProducts.id, productId))
      .run();
    replaceAliases(transaction, productId, input.aliases, now);
  });
  return listPantryProducts(true).find((product) => product.id === productId)!;
}

function locationPath(
  location: typeof pantryLocations.$inferSelect,
  locations: Array<typeof pantryLocations.$inferSelect>,
): { path: string; depth: number } {
  const names = [location.name];
  const visited = new Set([location.id]);
  let parentId = location.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = locations.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return { path: names.join(' / '), depth: names.length - 1 };
}

export function listPantryLocations(includeArchived = false): PantryLocationView[] {
  ensureDatabase();
  const all = getDatabase()
    .select()
    .from(pantryLocations)
    .orderBy(asc(pantryLocations.position), asc(pantryLocations.name))
    .all();
  return all
    .filter((location) => includeArchived || !location.archivedAt)
    .map((location) => ({ ...location, ...locationPath(location, all) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function assertNoLocationCycle(locationId: string, parentId: string): void {
  const locations = listPantryLocations(true);
  let current = locations.find((location) => location.id === parentId);
  const visited = new Set<string>();
  while (current) {
    if (current.id === locationId)
      throw new PantryValidationError('A location cannot contain itself.');
    if (visited.has(current.id))
      throw new PantryValidationError('The location tree already contains a cycle.');
    visited.add(current.id);
    current = current.parentId
      ? locations.find((location) => location.id === current!.parentId)
      : undefined;
  }
}

export function createPantryLocation(
  input: PantryLocationInput,
  actorProfileId: string,
): PantryLocationView {
  ensureDatabase();
  const db = getDatabase();
  const parentId = input.parentId || null;
  if (parentId) requireLocation(db, parentId);
  const siblings = listPantryLocations(true).filter((location) => location.parentId === parentId);
  if (siblings.some((location) => location.normalizedName === normalizePantryName(input.name))) {
    throw new PantryConflictError('A location with that name already exists here.');
  }
  const now = new Date();
  const id = randomUUID();
  db.insert(pantryLocations)
    .values({
      id,
      name: input.name,
      normalizedName: normalizePantryName(input.name),
      parentId,
      storageType: input.storageType,
      description: input.description,
      position: input.position ?? siblings.length,
      archivedAt: input.archived ? now : null,
      createdByProfileId: actorProfileId,
      updatedByProfileId: actorProfileId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return listPantryLocations(true).find((location) => location.id === id)!;
}

export function updatePantryLocation(
  locationId: string,
  input: PantryLocationInput,
  actorProfileId: string,
): PantryLocationView {
  ensureDatabase();
  const db = getDatabase();
  const existing = db
    .select()
    .from(pantryLocations)
    .where(eq(pantryLocations.id, locationId))
    .get();
  if (!existing) throw new PantryNotFoundError('That storage location no longer exists.');
  const parentId = input.parentId || null;
  if (parentId) {
    requireLocation(db, parentId);
    assertNoLocationCycle(locationId, parentId);
  }
  if (input.archived) {
    const hasChildren = db
      .select({ id: pantryLocations.id })
      .from(pantryLocations)
      .where(and(eq(pantryLocations.parentId, locationId), isNull(pantryLocations.archivedAt)))
      .limit(1)
      .get();
    const hasStock = db
      .select({ id: pantryBatches.id, status: pantryBatches.status })
      .from(pantryBatches)
      .where(eq(pantryBatches.locationId, locationId))
      .all()
      .some((batch) => ACTIVE_BATCH_STATUSES.has(batch.status));
    if (hasChildren || hasStock)
      throw new PantryConflictError('Move active stock and archive child locations first.');
  }
  const now = new Date();
  db.update(pantryLocations)
    .set({
      name: input.name,
      normalizedName: normalizePantryName(input.name),
      parentId,
      storageType: input.storageType,
      description: input.description,
      position: input.position ?? existing.position,
      archivedAt: input.archived ? (existing.archivedAt ?? now) : null,
      updatedByProfileId: actorProfileId,
      updatedAt: now,
    })
    .where(eq(pantryLocations.id, locationId))
    .run();
  return listPantryLocations(true).find((location) => location.id === locationId)!;
}

function batchInsertValues(input: PantryBatchInput, actorProfileId: string) {
  return {
    id: randomUUID(),
    productId: input.productId,
    quantityRemaining: input.quantityRemaining,
    originalQuantity: input.originalQuantity ?? input.quantityRemaining,
    unit: input.unit ? normalizeInventoryUnit(input.unit) : '',
    packageCount: input.packageCount,
    amountPerPackage: input.amountPerPackage,
    packageUnit: input.packageUnit ? normalizeInventoryUnit(input.packageUnit) : '',
    approximateState: input.approximateState,
    locationId: input.locationId,
    sublocation: input.sublocation,
    purchaseDate: input.purchaseDate,
    bestBeforeDate: input.bestBeforeDate,
    useByDate: input.useByDate,
    sellByDate: input.sellByDate,
    openedDate: input.openedDate,
    frozenDate: input.frozenDate,
    thawedDate: input.thawedDate,
    preparedDate: input.preparedDate,
    expiryPrecision: input.expiryPrecision,
    status: input.status,
    purchasePriceCents: input.purchasePriceCents,
    source: input.source,
    notes: input.notes,
    excludeFromGrocery: input.excludeFromGrocery,
    sourceRecipeId: input.sourceRecipeId || null,
    sourceMealPlanEntryId: input.sourceMealPlanEntryId || null,
    sourceShoppingListItemId: input.sourceShoppingListItemId || null,
    version: 1,
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies typeof pantryBatches.$inferInsert;
}

export function createPantryBatchInTransaction(
  transaction: AppTransaction,
  input: PantryBatchInput,
  actorProfileId: string,
  context: { relatedCookSessionId?: string | null } = {},
): { batch: BatchRecord; inventoryEventId: string } {
  requireProduct(transaction, input.productId);
  requireLocation(transaction, input.locationId);
  const values = batchInsertValues(input, actorProfileId);
  transaction.insert(pantryBatches).values(values).run();
  const inserted = requireBatch(transaction, values.id);
  const snapshot = batchSnapshot(inserted);
  const inventoryEventId = insertEvent(transaction, {
    batch: inserted,
    eventType: input.sourceShoppingListItemId ? 'purchase_added' : 'item_added',
    previous: snapshot,
    next: snapshot,
    actorProfileId,
    reason: input.sourceShoppingListItemId ? 'Purchased grocery added to Pantry' : 'Item added',
    relatedRecipeId: input.sourceRecipeId || null,
    relatedMealPlanEntryId: input.sourceMealPlanEntryId || null,
    relatedShoppingListItemId: input.sourceShoppingListItemId || null,
    relatedCookSessionId: context.relatedCookSessionId,
  });
  return { batch: inserted, inventoryEventId };
}

export function createPantryBatch(input: PantryBatchInput, actorProfileId: string): BatchRecord {
  ensureDatabase();
  return getDatabase().transaction(
    (transaction) => createPantryBatchInTransaction(transaction, input, actorProfileId).batch,
  );
}

function eventTypeForEdit(previous: MutableBatchState, next: MutableBatchState): EventType {
  if (previous.quantityRemaining !== next.quantityRemaining) return 'inventory_correction';
  if (previous.locationId !== next.locationId) return 'item_moved';
  return 'item_edited';
}

export function updatePantryBatch(
  batchId: string,
  input: PantryBatchUpdate,
  actorProfileId: string,
): BatchRecord {
  ensureDatabase();
  const db = getDatabase();
  return db.transaction((transaction) => {
    const existing = requireBatch(transaction, batchId);
    ensureVersion(existing, input.expectedVersion);
    requireProduct(transaction, input.productId);
    requireLocation(transaction, input.locationId);
    const previous = batchSnapshot(existing);
    const next: MutableBatchState = {
      quantityRemaining: input.quantityRemaining,
      originalQuantity: input.originalQuantity ?? input.quantityRemaining,
      unit: input.unit ? normalizeInventoryUnit(input.unit) : '',
      packageCount: input.packageCount,
      amountPerPackage: input.amountPerPackage,
      packageUnit: input.packageUnit ? normalizeInventoryUnit(input.packageUnit) : '',
      approximateState: input.approximateState,
      locationId: input.locationId,
      sublocation: input.sublocation,
      purchaseDate: input.purchaseDate,
      bestBeforeDate: input.bestBeforeDate,
      useByDate: input.useByDate,
      sellByDate: input.sellByDate,
      openedDate: input.openedDate,
      frozenDate: input.frozenDate,
      thawedDate: input.thawedDate,
      preparedDate: input.preparedDate,
      expiryPrecision: input.expiryPrecision,
      status: input.status,
      purchasePriceCents: input.purchasePriceCents,
      source: input.source,
      notes: input.notes,
      excludeFromGrocery: input.excludeFromGrocery,
      productId: input.productId,
      sourceRecipeId: input.sourceRecipeId || null,
      sourceMealPlanEntryId: input.sourceMealPlanEntryId || null,
      sourceShoppingListItemId: input.sourceShoppingListItemId || null,
    };
    const result = transaction
      .update(pantryBatches)
      .set({
        ...next,
        version: existing.version + 1,
        updatedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(and(eq(pantryBatches.id, batchId), eq(pantryBatches.version, input.expectedVersion)))
      .run();
    if (!result.changes) throw new PantryConflictError('This Pantry item changed in another tab.');
    const updated = requireBatch(transaction, batchId);
    insertEvent(transaction, {
      batch: existing,
      eventType: eventTypeForEdit(previous, next),
      previous,
      next,
      actorProfileId,
      reason: 'Item details updated',
    });
    return updated;
  });
}

function mutateBatch(
  batchId: string,
  expectedVersion: number,
  actorProfileId: string,
  mutation: (
    batch: BatchRecord,
    transaction: AppTransaction,
  ) => {
    next: MutableBatchState;
    eventType: EventType;
    reason: string;
    note?: string;
  },
): BatchRecord {
  ensureDatabase();
  const db = getDatabase();
  return db.transaction((transaction) => {
    const batch = requireBatch(transaction, batchId);
    ensureVersion(batch, expectedVersion);
    const previous = batchSnapshot(batch);
    const mutationResult = mutation(batch, transaction);
    const result = transaction
      .update(pantryBatches)
      .set({
        ...mutationResult.next,
        version: batch.version + 1,
        updatedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(and(eq(pantryBatches.id, batchId), eq(pantryBatches.version, expectedVersion)))
      .run();
    if (!result.changes) throw new PantryConflictError('This Pantry item changed in another tab.');
    insertEvent(transaction, {
      batch,
      eventType: mutationResult.eventType,
      previous,
      next: mutationResult.next,
      actorProfileId,
      reason: mutationResult.reason,
      note: mutationResult.note,
    });
    return requireBatch(transaction, batchId);
  });
}

function undoBatchAction(
  batchId: string,
  expectedVersion: number,
  actorProfileId: string,
): BatchRecord {
  ensureDatabase();
  const db = getDatabase();
  return db.transaction((transaction) => {
    const batch = requireBatch(transaction, batchId);
    ensureVersion(batch, expectedVersion);
    const candidate = transaction
      .select()
      .from(pantryInventoryEvents)
      .where(
        and(
          eq(pantryInventoryEvents.batchId, batchId),
          isNull(pantryInventoryEvents.reversedByEventId),
        ),
      )
      .orderBy(desc(pantryInventoryEvents.batchSequence))
      .all()
      .find(
        (event) => !['item_added', 'purchase_added', 'action_undone'].includes(event.eventType),
      );
    if (!candidate)
      throw new PantryConflictError('There is no recent reversible action for this item.');
    const paired = parsePairedActionNote(candidate.note);
    const previous = batchSnapshot(batch);
    const next = parseSnapshot(candidate.previousState);
    let peerUndo:
      | {
          batch: BatchRecord;
          event: typeof pantryInventoryEvents.$inferSelect;
          previous: MutableBatchState;
          next: MutableBatchState;
        }
      | undefined;
    if (paired) {
      const peer = requireBatch(transaction, paired.peerBatchId);
      ensureVersion(peer, paired.peerVersionAfter);
      const peerEvent = transaction
        .select()
        .from(pantryInventoryEvents)
        .where(eq(pantryInventoryEvents.id, paired.peerEventId))
        .get();
      const latestPeerEvent = transaction
        .select()
        .from(pantryInventoryEvents)
        .where(eq(pantryInventoryEvents.batchId, peer.id))
        .orderBy(desc(pantryInventoryEvents.batchSequence))
        .get();
      if (!peerEvent || peerEvent.reversedByEventId || latestPeerEvent?.id !== peerEvent.id)
        throw new PantryConflictError('The paired Pantry batch changed after this action.');
      const peerPrevious = batchSnapshot(peer);
      const peerNext =
        paired.pantryPair === 'combine'
          ? parseSnapshot(peerEvent.previousState)
          : ({
              ...peerPrevious,
              quantityRemaining: 0,
              approximateState: null,
              status: 'depleted',
            } satisfies MutableBatchState);
      peerUndo = { batch: peer, event: peerEvent, previous: peerPrevious, next: peerNext };
    }
    if (peerUndo) {
      const peerResult = transaction
        .update(pantryBatches)
        .set({
          ...peerUndo.next,
          version: peerUndo.batch.version + 1,
          updatedByProfileId: actorProfileId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pantryBatches.id, peerUndo.batch.id),
            eq(pantryBatches.version, peerUndo.batch.version),
          ),
        )
        .run();
      if (peerResult.changes !== 1)
        throw new PantryConflictError('The paired Pantry batch changed during undo.');
      const peerUndoEventId = insertEvent(transaction, {
        batch: peerUndo.batch,
        eventType: 'action_undone',
        previous: peerUndo.previous,
        next: peerUndo.next,
        actorProfileId,
        reason: `Undo ${paired!.pantryPair} paired batch`,
        undoOfEventId: peerUndo.event.id,
      });
      transaction
        .update(pantryInventoryEvents)
        .set({ reversedByEventId: peerUndoEventId })
        .where(eq(pantryInventoryEvents.id, peerUndo.event.id))
        .run();
    }
    const result = transaction
      .update(pantryBatches)
      .set({
        ...next,
        version: batch.version + 1,
        updatedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(and(eq(pantryBatches.id, batchId), eq(pantryBatches.version, expectedVersion)))
      .run();
    if (result.changes !== 1)
      throw new PantryConflictError('This Pantry item changed in another tab.');
    const undoEventId = insertEvent(transaction, {
      batch,
      eventType: 'action_undone',
      previous,
      next,
      actorProfileId,
      reason: `Undo ${candidate.eventType.replaceAll('_', ' ')}`,
      undoOfEventId: candidate.id,
    });
    transaction
      .update(pantryInventoryEvents)
      .set({ reversedByEventId: undoEventId })
      .where(eq(pantryInventoryEvents.id, candidate.id))
      .run();
    return requireBatch(transaction, batchId);
  });
}

export function applyPantryBatchAction(
  batchId: string,
  action: PantryBatchAction,
  actorProfileId: string,
): BatchRecord {
  if (action.type === 'undo')
    return undoBatchAction(batchId, action.expectedVersion, actorProfileId);
  if (action.type === 'split') {
    ensureDatabase();
    return getDatabase().transaction((transaction) => {
      const batch = requireBatch(transaction, batchId);
      ensureVersion(batch, action.expectedVersion);
      if (batch.quantityRemaining === null)
        throw new PantryValidationError('Confirm an exact quantity before splitting this batch.');
      let splitQuantity: number;
      try {
        splitQuantity = convertInventoryQuantity(action.quantity, action.unit, batch.unit);
      } catch (error) {
        throw new PantryValidationError(
          error instanceof Error ? error.message : 'Incompatible unit.',
        );
      }
      if (splitQuantity >= batch.quantityRemaining - 1e-6)
        throw new PantryConflictError('Leave some stock in the original batch when splitting.');
      const locationId = action.locationId || batch.locationId;
      requireLocation(transaction, locationId);
      const child = createPantryBatchInTransaction(
        transaction,
        {
          productId: batch.productId,
          quantityRemaining: splitQuantity,
          originalQuantity: splitQuantity,
          unit: batch.unit,
          packageCount: null,
          amountPerPackage: null,
          packageUnit: '',
          approximateState: null,
          locationId,
          sublocation: batch.sublocation,
          purchaseDate: batch.purchaseDate,
          bestBeforeDate: batch.bestBeforeDate,
          useByDate: batch.useByDate,
          sellByDate: batch.sellByDate,
          openedDate: batch.openedDate,
          frozenDate: batch.frozenDate,
          thawedDate: batch.thawedDate,
          preparedDate: batch.preparedDate,
          expiryPrecision: batch.expiryPrecision,
          status: batch.status,
          purchasePriceCents: null,
          source: batch.source,
          notes: batch.notes,
          excludeFromGrocery: batch.excludeFromGrocery,
          sourceRecipeId: batch.sourceRecipeId ?? '',
          sourceMealPlanEntryId: batch.sourceMealPlanEntryId ?? '',
          sourceShoppingListItemId: batch.sourceShoppingListItemId ?? '',
        },
        actorProfileId,
      );
      const previous = batchSnapshot(batch);
      const next = {
        ...previous,
        quantityRemaining: Number((batch.quantityRemaining - splitQuantity).toFixed(6)),
      };
      const result = transaction
        .update(pantryBatches)
        .set({
          ...next,
          version: batch.version + 1,
          updatedByProfileId: actorProfileId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(pantryBatches.id, batch.id), eq(pantryBatches.version, action.expectedVersion)),
        )
        .run();
      if (result.changes !== 1)
        throw new PantryConflictError('This Pantry item changed during split.');
      insertEvent(transaction, {
        batch,
        eventType: 'quantity_decreased',
        previous,
        next,
        actorProfileId,
        reason: 'Batch split',
        note: pairedActionNote({
          pantryPair: 'split',
          peerBatchId: child.batch.id,
          peerEventId: child.inventoryEventId,
          peerVersionAfter: child.batch.version,
          userNote: action.note,
        }),
      });
      return requireBatch(transaction, batch.id);
    });
  }
  if (action.type === 'combine') {
    ensureDatabase();
    return getDatabase().transaction((transaction) => {
      if (action.targetBatchId === batchId)
        throw new PantryValidationError('Choose a different batch to combine.');
      const batch = requireBatch(transaction, batchId);
      const target = requireBatch(transaction, action.targetBatchId);
      ensureVersion(batch, action.expectedVersion);
      ensureVersion(target, action.targetExpectedVersion);
      if (batch.productId !== target.productId)
        throw new PantryValidationError('Only batches of the same product can be combined.');
      if (batch.quantityRemaining === null || target.quantityRemaining === null)
        throw new PantryValidationError('Confirm exact quantities before combining batches.');
      if (
        batch.locationId !== target.locationId ||
        batch.status !== target.status ||
        batch.bestBeforeDate !== target.bestBeforeDate ||
        batch.useByDate !== target.useByDate ||
        batch.sellByDate !== target.sellByDate ||
        batch.openedDate !== target.openedDate ||
        batch.frozenDate !== target.frozenDate ||
        batch.thawedDate !== target.thawedDate ||
        batch.expiryPrecision !== target.expiryPrecision
      )
        throw new PantryValidationError(
          'Move batches together and align their status and recorded dates before combining.',
        );
      let targetQuantity: number;
      try {
        targetQuantity = convertInventoryQuantity(
          target.quantityRemaining,
          target.unit,
          batch.unit,
        );
      } catch (error) {
        throw new PantryValidationError(
          error instanceof Error ? error.message : 'Incompatible unit.',
        );
      }
      const targetPrevious = batchSnapshot(target);
      const targetNext = {
        ...targetPrevious,
        quantityRemaining: 0,
        approximateState: null,
        status: 'depleted' as const,
      };
      const targetResult = transaction
        .update(pantryBatches)
        .set({
          ...targetNext,
          version: target.version + 1,
          updatedByProfileId: actorProfileId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pantryBatches.id, target.id),
            eq(pantryBatches.version, action.targetExpectedVersion),
          ),
        )
        .run();
      if (targetResult.changes !== 1)
        throw new PantryConflictError('The other Pantry batch changed during combine.');
      const targetEventId = insertEvent(transaction, {
        batch: target,
        eventType: 'item_depleted',
        previous: targetPrevious,
        next: targetNext,
        actorProfileId,
        reason: 'Combined into another batch',
      });
      const previous = batchSnapshot(batch);
      const combinedQuantity = Number((batch.quantityRemaining + targetQuantity).toFixed(6));
      const next = {
        ...previous,
        quantityRemaining: combinedQuantity,
        originalQuantity: Math.max(batch.originalQuantity ?? 0, combinedQuantity),
      };
      const result = transaction
        .update(pantryBatches)
        .set({
          ...next,
          version: batch.version + 1,
          updatedByProfileId: actorProfileId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(pantryBatches.id, batch.id), eq(pantryBatches.version, action.expectedVersion)),
        )
        .run();
      if (result.changes !== 1)
        throw new PantryConflictError('This Pantry item changed during combine.');
      insertEvent(transaction, {
        batch,
        eventType: 'quantity_increased',
        previous,
        next,
        actorProfileId,
        reason: 'Batches combined',
        note: pairedActionNote({
          pantryPair: 'combine',
          peerBatchId: target.id,
          peerEventId: targetEventId,
          peerVersionAfter: target.version + 1,
          userNote: action.note,
        }),
      });
      return requireBatch(transaction, batch.id);
    });
  }
  return mutateBatch(batchId, action.expectedVersion, actorProfileId, (batch, transaction) => {
    const next = batchSnapshot(batch);
    const note = action.note;
    if (action.type === 'consume' || action.type === 'consume_one') {
      if (batch.quantityRemaining === null)
        throw new PantryValidationError('Confirm an exact quantity before consuming this item.');
      const requested = action.type === 'consume_one' ? 1 : action.quantity;
      const unit = action.type === 'consume_one' ? batch.unit : action.unit;
      let converted: number;
      try {
        converted = convertInventoryQuantity(requested, unit, batch.unit);
      } catch (error) {
        throw new PantryValidationError(
          error instanceof Error ? error.message : 'Incompatible unit.',
        );
      }
      if (converted > batch.quantityRemaining + 1e-6)
        throw new PantryConflictError('That amount is greater than the stock remaining.');
      next.quantityRemaining = Number(Math.max(0, batch.quantityRemaining - converted).toFixed(6));
      next.approximateState = null;
      if (next.quantityRemaining === 0) next.status = 'depleted';
      return {
        next,
        eventType: next.quantityRemaining === 0 ? 'item_depleted' : 'quantity_decreased',
        reason: action.type === 'consume' ? action.reason : 'Consumed one',
        note,
      };
    }
    if (action.type === 'mark_empty') {
      next.quantityRemaining = 0;
      next.approximateState = null;
      next.status = 'depleted';
      return { next, eventType: 'item_depleted', reason: 'Marked empty', note };
    }
    if (action.type === 'open') {
      next.status = 'opened';
      next.openedDate = action.openedDate ?? today();
      return { next, eventType: 'package_opened', reason: 'Package opened', note };
    }
    if (action.type === 'move') {
      requireLocation(transaction, action.locationId);
      next.locationId = action.locationId;
      return { next, eventType: 'item_moved', reason: 'Moved to another location', note };
    }
    if (action.type === 'freeze') {
      if (action.locationId) {
        requireLocation(transaction, action.locationId);
        next.locationId = action.locationId;
      }
      next.status = 'frozen';
      next.frozenDate = action.frozenDate ?? today();
      return { next, eventType: 'item_frozen', reason: 'Item frozen', note };
    }
    if (action.type === 'thaw') {
      next.status = 'thawed';
      next.thawedDate = action.thawedDate ?? today();
      return { next, eventType: 'item_thawed', reason: 'Item thawed', note };
    }
    if (action.type === 'correct') {
      if (action.quantityRemaining === null && action.approximateState === null)
        throw new PantryValidationError('Enter an exact or approximate corrected quantity.');
      next.quantityRemaining = action.quantityRemaining;
      next.unit = normalizeInventoryUnit(action.unit);
      next.approximateState = action.approximateState;
      if (action.quantityRemaining === 0) next.status = 'depleted';
      else if (['depleted', 'discarded', 'donated'].includes(next.status)) next.status = 'opened';
      return { next, eventType: 'inventory_correction', reason: action.reason, note };
    }
    if (action.type === 'discard' || action.type === 'donate') {
      next.status = action.type === 'discard' ? 'discarded' : 'donated';
      return {
        next,
        eventType: action.type === 'discard' ? 'item_discarded' : 'item_donated',
        reason: action.reason || (action.type === 'discard' ? 'Discarded' : 'Donated'),
        note,
      };
    }
    if (action.type === 'restore') {
      if (action.quantityRemaining !== null) {
        next.quantityRemaining = action.quantityRemaining;
        next.unit = action.unit ? normalizeInventoryUnit(action.unit) : next.unit;
        next.approximateState = null;
      } else if (action.approximateState !== null) {
        next.quantityRemaining = null;
        next.approximateState = action.approximateState;
      } else if (next.quantityRemaining === 0) {
        throw new PantryValidationError('Enter the restored quantity or approximate amount.');
      }
      next.status = next.openedDate ? 'opened' : 'unopened';
      return { next, eventType: 'item_restored', reason: 'Item restored', note };
    }
    throw new PantryValidationError('Unsupported Pantry action.');
  });
}

export type PantryConsumptionRecord = {
  batchId: string;
  quantity: number;
  unit: string;
  inventoryEventId: string;
  batchVersionAfter: number;
};

export type PantryConsumptionPreview = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  availableQuantity: number;
  sufficient: boolean;
  deductions: Array<{
    batchId: string;
    locationId: string;
    locationName: string;
    expiryDate: string | null;
    quantity: number;
    unit: string;
    quantityBefore: number;
    batchUnit: string;
  }>;
};

/** Read-only projection of the exact FEFO allocation used by the confirming transaction. */
export function previewPantryProductConsumption(
  productId: string,
  quantity: number,
  unit: string,
): PantryConsumptionPreview {
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new PantryValidationError('Consumption must be a positive quantity.');
  const normalizedUnit = normalizeInventoryUnit(unit);
  const dashboard = getPantryDashboard({
    q: '',
    view: 'all',
    sort: 'expiry',
    includeInactive: true,
  });
  const product = dashboard.products.find((candidate) => candidate.id === productId);
  if (!product) throw new PantryNotFoundError('That Pantry product no longer exists.');
  const candidates = dashboard.batches
    .filter(
      (batch) =>
        batch.productId === productId &&
        ACTIVE_BATCH_STATUSES.has(batch.status) &&
        batch.quantityRemaining !== null &&
        areInventoryUnitsCompatible(batch.unit, normalizedUnit),
    )
    .sort(
      (a, b) =>
        (a.expiry.date ?? '9999-12-31').localeCompare(b.expiry.date ?? '9999-12-31') ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  const availableQuantity = Number(
    candidates
      .reduce(
        (total, batch) =>
          total + convertInventoryQuantity(batch.quantityRemaining!, batch.unit, normalizedUnit),
        0,
      )
      .toFixed(6),
  );
  let remaining = quantity;
  const deductions: PantryConsumptionPreview['deductions'] = [];
  for (const batch of candidates) {
    if (remaining <= 1e-6) break;
    const available = convertInventoryQuantity(
      batch.quantityRemaining!,
      batch.unit,
      normalizedUnit,
    );
    const take = Math.min(remaining, available);
    deductions.push({
      batchId: batch.id,
      locationId: batch.locationId,
      locationName: batch.location.path,
      expiryDate: batch.expiry.date,
      quantity: Number(take.toFixed(6)),
      unit: normalizedUnit,
      quantityBefore: batch.quantityRemaining!,
      batchUnit: batch.unit,
    });
    remaining = Number((remaining - take).toFixed(6));
  }
  return {
    productId,
    productName: product.displayName,
    quantity,
    unit: normalizedUnit,
    availableQuantity,
    sufficient: availableQuantity + 1e-6 >= quantity,
    deductions,
  };
}

export function consumePantryProductStockInTransaction(
  transaction: AppTransaction,
  productId: string,
  quantity: number,
  unit: string,
  actorProfileId: string,
  context: {
    reason?: string;
    relatedRecipeId?: string | null;
    relatedMealPlanEntryId?: string | null;
    relatedShoppingListItemId?: string | null;
    relatedCookSessionId?: string | null;
  } = {},
): PantryConsumptionRecord[] {
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new PantryValidationError('Consumption must be a positive quantity.');
  const product = requireProduct(transaction, productId);
  const candidates = transaction
    .select()
    .from(pantryBatches)
    .where(eq(pantryBatches.productId, productId))
    .all()
    .filter(
      (batch) =>
        ACTIVE_BATCH_STATUSES.has(batch.status) &&
        batch.quantityRemaining !== null &&
        areInventoryUnitsCompatible(batch.unit, unit),
    )
    .sort((a, b) => {
      const aDate = pantryExpiryState(a, product.shelfLifeAfterOpeningDays).date ?? '9999-12-31';
      const bDate = pantryExpiryState(b, product.shelfLifeAfterOpeningDays).date ?? '9999-12-31';
      return aDate.localeCompare(bDate) || a.createdAt.getTime() - b.createdAt.getTime();
    });
  const available = candidates.reduce(
    (total, batch) => total + convertInventoryQuantity(batch.quantityRemaining!, batch.unit, unit),
    0,
  );
  if (available + 1e-6 < quantity)
    throw new PantryConflictError('There is not enough exact compatible Pantry stock.');
  let remaining = quantity;
  const deductions: PantryConsumptionRecord[] = [];
  for (const batch of candidates) {
    if (remaining <= 1e-6) break;
    const availableInRequestedUnit = convertInventoryQuantity(
      batch.quantityRemaining!,
      batch.unit,
      unit,
    );
    const takeRequested = Math.min(remaining, availableInRequestedUnit);
    const takeBatchUnit = convertInventoryQuantity(takeRequested, unit, batch.unit);
    const previous = batchSnapshot(batch);
    const next = { ...previous };
    next.quantityRemaining = Number((batch.quantityRemaining! - takeBatchUnit).toFixed(6));
    if (next.quantityRemaining <= 1e-6) {
      next.quantityRemaining = 0;
      next.status = 'depleted';
    }
    const result = transaction
      .update(pantryBatches)
      .set({
        ...next,
        version: batch.version + 1,
        updatedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(and(eq(pantryBatches.id, batch.id), eq(pantryBatches.version, batch.version)))
      .run();
    if (result.changes !== 1)
      throw new PantryConflictError('Pantry stock changed during deduction. Try again.');
    const inventoryEventId = insertEvent(transaction, {
      batch,
      eventType: context.relatedRecipeId
        ? 'recipe_used'
        : next.quantityRemaining === 0
          ? 'item_depleted'
          : 'quantity_decreased',
      previous,
      next,
      actorProfileId,
      reason: context.reason ?? 'First-expiring stock consumed',
      relatedRecipeId: context.relatedRecipeId,
      relatedMealPlanEntryId: context.relatedMealPlanEntryId,
      relatedShoppingListItemId: context.relatedShoppingListItemId,
      relatedCookSessionId: context.relatedCookSessionId,
    });
    deductions.push({
      batchId: batch.id,
      quantity: takeRequested,
      unit,
      inventoryEventId,
      batchVersionAfter: batch.version + 1,
    });
    remaining = Number((remaining - takeRequested).toFixed(6));
  }
  return deductions;
}

export function consumePantryProductStock(
  productId: string,
  quantity: number,
  unit: string,
  actorProfileId: string,
  context: {
    reason?: string;
    relatedRecipeId?: string | null;
    relatedMealPlanEntryId?: string | null;
    relatedShoppingListItemId?: string | null;
    relatedCookSessionId?: string | null;
  } = {},
): Array<{ batchId: string; quantity: number; unit: string }> {
  ensureDatabase();
  return getDatabase()
    .transaction((transaction) =>
      consumePantryProductStockInTransaction(
        transaction,
        productId,
        quantity,
        unit,
        actorProfileId,
        context,
      ),
    )
    .map(({ batchId, quantity: used, unit: usedUnit }) => ({
      batchId,
      quantity: used,
      unit: usedUnit,
    }));
}

export function undoPantryConsumptionEvents(
  eventIds: string[],
  actorProfileId: string,
  relatedCookSessionId: string,
): string[] {
  ensureDatabase();
  if (!eventIds.length) throw new PantryValidationError('There are no Pantry deductions to undo.');
  return getDatabase().transaction((transaction) =>
    undoPantryConsumptionEventsInTransaction(
      transaction,
      eventIds,
      actorProfileId,
      relatedCookSessionId,
    ),
  );
}

export function undoPantryConsumptionEventsInTransaction(
  transaction: AppTransaction,
  eventIds: string[],
  actorProfileId: string,
  relatedCookSessionId: string,
): string[] {
  if (!eventIds.length) throw new PantryValidationError('There are no Pantry deductions to undo.');
  const events = transaction
    .select()
    .from(pantryInventoryEvents)
    .where(inArray(pantryInventoryEvents.id, eventIds))
    .all();
  if (events.length !== new Set(eventIds).size)
    throw new PantryConflictError('A Pantry deduction event no longer exists.');
  if (
    events.some(
      (event) =>
        event.relatedCookSessionId !== relatedCookSessionId || event.reversedByEventId !== null,
    )
  )
    throw new PantryConflictError('These cooking deductions are not safely reversible.');

  const byBatch = new Map<string, typeof events>();
  events.forEach((event) => {
    const grouped = byBatch.get(event.batchId) ?? [];
    grouped.push(event);
    byBatch.set(event.batchId, grouped);
  });
  const undoEventIds: string[] = [];
  for (const [batchId, grouped] of byBatch) {
    grouped.sort((left, right) => left.batchSequence - right.batchSequence);
    const batch = requireBatch(transaction, batchId);
    const latest = transaction
      .select()
      .from(pantryInventoryEvents)
      .where(eq(pantryInventoryEvents.batchId, batchId))
      .orderBy(desc(pantryInventoryEvents.batchSequence))
      .get();
    const newestCookingEvent = grouped.at(-1)!;
    if (!latest || latest.id !== newestCookingEvent.id)
      throw new PantryConflictError(
        'Pantry stock changed after cooking. Review it instead of applying an unsafe undo.',
      );
    const previous = batchSnapshot(batch);
    const next = parseSnapshot(grouped[0]!.previousState);
    const result = transaction
      .update(pantryBatches)
      .set({
        ...next,
        version: batch.version + 1,
        updatedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(and(eq(pantryBatches.id, batchId), eq(pantryBatches.version, batch.version)))
      .run();
    if (result.changes !== 1)
      throw new PantryConflictError('Pantry stock changed during undo. Try again.');
    const undoEventId = insertEvent(transaction, {
      batch,
      eventType: 'action_undone',
      previous,
      next,
      actorProfileId,
      reason: 'Undo confirmed cooking deduction',
      undoOfEventId: newestCookingEvent.id,
      relatedRecipeId: newestCookingEvent.relatedRecipeId,
      relatedMealPlanEntryId: newestCookingEvent.relatedMealPlanEntryId,
      relatedCookSessionId,
    });
    transaction
      .update(pantryInventoryEvents)
      .set({ reversedByEventId: undoEventId })
      .where(
        inArray(
          pantryInventoryEvents.id,
          grouped.map((event) => event.id),
        ),
      )
      .run();
    undoEventIds.push(undoEventId);
  }
  return undoEventIds;
}

function quantityLabel(batch: BatchRecord): string {
  if (batch.quantityRemaining !== null) return `${batch.quantityRemaining} ${batch.unit}`.trim();
  return (batch.approximateState ?? 'unknown').replaceAll('_', ' ');
}

function stockForProduct(product: PantryProductView, batches: BatchRecord[]): number | null {
  const targetUnit = product.stockUnit || product.defaultInventoryUnit;
  let total = 0;
  let found = false;
  for (const batch of batches) {
    if (
      batch.productId !== product.id ||
      !ACTIVE_BATCH_STATUSES.has(batch.status) ||
      batch.quantityRemaining === null ||
      batch.excludeFromGrocery ||
      !areInventoryUnitsCompatible(batch.unit, targetUnit)
    )
      continue;
    total += convertInventoryQuantity(batch.quantityRemaining, batch.unit, targetUnit);
    found = true;
  }
  return found ? Number(total.toFixed(6)) : null;
}

export function listPantryEvents(batchId?: string, limit = 50) {
  ensureDatabase();
  const query = getDatabase().select().from(pantryInventoryEvents);
  return (batchId ? query.where(eq(pantryInventoryEvents.batchId, batchId)) : query)
    .orderBy(desc(pantryInventoryEvents.createdAt), desc(pantryInventoryEvents.batchSequence))
    .limit(limit)
    .all();
}

export function getPantryDashboard(
  query: PantryQuery = {
    q: '',
    view: 'all',
    sort: 'expiry',
    includeInactive: false,
  },
): PantryDashboard {
  const products = listPantryProducts(query.includeInactive);
  const locations = listPantryLocations(query.includeInactive);
  const allBatches = getDatabase().select().from(pantryBatches).all();
  const productById = new Map(products.map((product) => [product.id, product]));
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const lowStockProductIds = products
    .filter((product) => {
      if (!product.isStaple || product.reorderThreshold === null) return false;
      const stock = stockForProduct(product, allBatches);
      return stock !== null && stock <= product.reorderThreshold;
    })
    .map((product) => product.id);
  const allViews = allBatches.flatMap((batch) => {
    const product = productById.get(batch.productId);
    const location = locationById.get(batch.locationId);
    if (!product || !location) return [];
    return [
      {
        ...batch,
        product,
        location,
        expiry: pantryExpiryState(batch, product.shelfLifeAfterOpeningDays),
        quantityLabel: quantityLabel(batch),
      } satisfies PantryBatchView,
    ];
  });
  const activeViews = allViews.filter((batch) => ACTIVE_BATCH_STATUSES.has(batch.status));
  const recentCutoff = Date.now() - 7 * 86_400_000;
  let batches = allViews.filter(
    (batch) => query.includeInactive || ACTIVE_BATCH_STATUSES.has(batch.status),
  );
  const q = normalizePantryName(query.q);
  if (q)
    batches = batches.filter((batch) =>
      [
        batch.product.displayName,
        batch.product.brand,
        batch.product.variant,
        batch.product.category,
        ...batch.product.aliases,
      ]
        .map(normalizePantryName)
        .some((value) => value.includes(q)),
    );
  if (query.locationId) batches = batches.filter((batch) => batch.locationId === query.locationId);
  if (query.category)
    batches = batches.filter(
      (batch) =>
        normalizePantryName(batch.product.category) === normalizePantryName(query.category!),
    );
  if (query.status) batches = batches.filter((batch) => batch.status === query.status);
  if (query.expiry) batches = batches.filter((batch) => batch.expiry.state === query.expiry);
  if (query.view === 'pantry')
    batches = batches.filter((batch) => batch.location.storageType === 'pantry');
  if (query.view === 'refrigerator')
    batches = batches.filter((batch) => batch.location.storageType === 'refrigerator');
  if (query.view === 'freezer')
    batches = batches.filter((batch) => batch.location.storageType === 'freezer');
  if (query.view === 'low_stock')
    batches = batches.filter((batch) => lowStockProductIds.includes(batch.productId));
  if (query.view === 'opened') batches = batches.filter((batch) => batch.status === 'opened');
  if (query.view === 'unopened') batches = batches.filter((batch) => batch.status === 'unopened');
  if (query.view === 'frozen') batches = batches.filter((batch) => batch.status === 'frozen');
  if (query.view === 'depleted') batches = batches.filter((batch) => batch.status === 'depleted');
  if (query.view === 'discarded') batches = batches.filter((batch) => batch.status === 'discarded');
  if (query.view === 'donated') batches = batches.filter((batch) => batch.status === 'donated');
  if (query.view === 'recent')
    batches = batches.filter((batch) => batch.updatedAt.getTime() >= recentCutoff);
  const expirySort = (batch: PantryBatchView) => batch.expiry.date ?? '9999-12-31';
  batches.sort((a, b) => {
    if (query.sort === 'name') return a.product.displayName.localeCompare(b.product.displayName);
    if (query.sort === 'quantity') return (b.quantityRemaining ?? -1) - (a.quantityRemaining ?? -1);
    if (query.sort === 'added') return b.createdAt.getTime() - a.createdAt.getTime();
    if (query.sort === 'updated') return b.updatedAt.getTime() - a.updatedAt.getTime();
    if (query.sort === 'location') return a.location.path.localeCompare(b.location.path);
    return expirySort(a).localeCompare(expirySort(b));
  });
  const recentEvents = listPantryEvents(undefined, 12).map((event) => ({
    ...event,
    productName: productById.get(event.productId)?.displayName ?? 'Archived product',
  }));
  return {
    summary: {
      activeItems: activeViews.length,
      expiringSoon: activeViews.filter((batch) => batch.expiry.state === 'soon').length,
      expired: activeViews.filter((batch) => batch.expiry.state === 'expired').length,
      lowStockStaples: lowStockProductIds.length,
      openedItems: activeViews.filter((batch) => batch.status === 'opened').length,
      recentlyChanged: activeViews.filter((batch) => batch.updatedAt.getTime() >= recentCutoff)
        .length,
    },
    products,
    locations,
    batches,
    recentEvents,
    lowStockProductIds,
  };
}
