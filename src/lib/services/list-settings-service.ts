import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  householdListSettings,
  households,
  pantryProductAliases,
  pantryProducts,
  pantryShoppingItemDetails,
  profiles,
  shoppingAisles,
  shoppingListItems,
  shoppingLists,
  supermarketItemAisleMappings,
  supermarketProfileAisles,
  supermarketProfiles,
} from '@/lib/db/schema';
import {
  listSettingsInputSchema,
  normalizeShoppingMatchText,
  shoppingTextMatchesTerm,
  supermarketProfileInputSchema,
  supermarketProfileUpdateSchema,
  type ListSettingsInput,
  type SupermarketProfileInput,
  type SupermarketProfileUpdateInput,
} from '@/lib/domain/list-settings';

type AppDatabase = ReturnType<typeof getDatabase>;
export type ListSettingsTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
type DatabaseExecutor = AppDatabase | ListSettingsTransaction;

export class ListSettingsNotFoundError extends Error {}
export class ListSettingsConflictError extends Error {}

export type ListSettingsView = {
  defaultSupermarketProfileId: string | null;
  completedItemsBehavior: 'completed_section' | 'hide' | 'in_place';
  openPantryPurchaseOnCheck: boolean;
  keepScreenAwake: boolean;
};

export type SupermarketRouteSectionView = {
  id: string;
  aisleId: string;
  name: string;
  position: number;
  matchTerms: string[];
};

export type SupermarketProfileView = typeof supermarketProfiles.$inferSelect & {
  sections: SupermarketRouteSectionView[];
};

export type ListSettingsWorkspace = {
  settings: ListSettingsView;
  profiles: SupermarketProfileView[];
};

const DEFAULT_LIST_SETTINGS: ListSettingsView = {
  defaultSupermarketProfileId: null,
  completedItemsBehavior: 'completed_section',
  openPantryPurchaseOnCheck: true,
  keepScreenAwake: false,
};

function parseTerms(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((term): term is string => typeof term === 'string')
      : [];
  } catch {
    return [];
  }
}

function requireHousehold(executor: DatabaseExecutor = getDatabase()) {
  const household = executor.select().from(households).orderBy(asc(households.createdAt)).get();
  if (!household) throw new ListSettingsConflictError('Set up the household first.');
  return household;
}

function requireActor(actorProfileId: string, executor: DatabaseExecutor = getDatabase()) {
  const actor = executor
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, actorProfileId))
    .get();
  if (!actor) throw new ListSettingsConflictError('Choose a household profile first.');
  return actor;
}

function settingsView(
  row: typeof householdListSettings.$inferSelect | undefined,
): ListSettingsView {
  if (!row) return DEFAULT_LIST_SETTINGS;
  return {
    defaultSupermarketProfileId: row.defaultSupermarketProfileId,
    completedItemsBehavior: row.completedItemsBehavior,
    openPantryPurchaseOnCheck: row.openPantryPurchaseOnCheck,
    keepScreenAwake: row.keepScreenAwake,
  };
}

function listProfileSections(
  supermarketProfileId: string,
  executor: DatabaseExecutor = getDatabase(),
): SupermarketRouteSectionView[] {
  return executor
    .select({ membership: supermarketProfileAisles })
    .from(supermarketProfileAisles)
    .where(eq(supermarketProfileAisles.supermarketProfileId, supermarketProfileId))
    .orderBy(asc(supermarketProfileAisles.position))
    .all()
    .map(({ membership }) => ({
      id: membership.id,
      aisleId: membership.aisleId,
      name: membership.displayName,
      position: membership.position,
      matchTerms: parseTerms(membership.matchTerms),
    }));
}

function profileView(
  profile: typeof supermarketProfiles.$inferSelect,
  executor: DatabaseExecutor = getDatabase(),
): SupermarketProfileView {
  return { ...profile, sections: listProfileSections(profile.id, executor) };
}

export function getListSettings(): ListSettingsView {
  ensureDatabase();
  const household = getDatabase()
    .select()
    .from(households)
    .orderBy(asc(households.createdAt))
    .get();
  if (!household) return DEFAULT_LIST_SETTINGS;
  return settingsView(
    getDatabase()
      .select()
      .from(householdListSettings)
      .where(eq(householdListSettings.householdId, household.id))
      .get(),
  );
}

export function listSupermarketProfiles(includeArchived = false): SupermarketProfileView[] {
  ensureDatabase();
  const household = getDatabase()
    .select()
    .from(households)
    .orderBy(asc(households.createdAt))
    .get();
  if (!household) return [];
  const rows = getDatabase()
    .select()
    .from(supermarketProfiles)
    .where(eq(supermarketProfiles.householdId, household.id))
    .orderBy(asc(supermarketProfiles.name), asc(supermarketProfiles.locationLabel))
    .all()
    .filter((profile) => includeArchived || !profile.archivedAt);
  return rows.map((profile) => profileView(profile));
}

export function getSupermarketProfile(
  supermarketProfileId: string | null,
  includeArchived = true,
): SupermarketProfileView | null {
  if (!supermarketProfileId) return null;
  ensureDatabase();
  const profile = getDatabase()
    .select()
    .from(supermarketProfiles)
    .where(eq(supermarketProfiles.id, supermarketProfileId))
    .get();
  if (!profile || (!includeArchived && profile.archivedAt)) return null;
  return profileView(profile);
}

export function getListSettingsWorkspace(): ListSettingsWorkspace {
  return { settings: getListSettings(), profiles: listSupermarketProfiles(true) };
}

function ensureSettingsRow(actorProfileId: string, executor: DatabaseExecutor) {
  const household = requireHousehold(executor);
  const current = executor
    .select()
    .from(householdListSettings)
    .where(eq(householdListSettings.householdId, household.id))
    .get();
  if (current) return current;
  const now = new Date();
  executor
    .insert(householdListSettings)
    .values({
      householdId: household.id,
      defaultSupermarketProfileId: null,
      completedItemsBehavior: DEFAULT_LIST_SETTINGS.completedItemsBehavior,
      openPantryPurchaseOnCheck: DEFAULT_LIST_SETTINGS.openPantryPurchaseOnCheck,
      keepScreenAwake: DEFAULT_LIST_SETTINGS.keepScreenAwake,
      updatedByProfileId: actorProfileId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return executor
    .select()
    .from(householdListSettings)
    .where(eq(householdListSettings.householdId, household.id))
    .get()!;
}

export function updateListSettings(
  input: ListSettingsInput,
  actorProfileId: string,
): ListSettingsWorkspace {
  ensureDatabase();
  const parsed = listSettingsInputSchema.parse(input);
  const database = getDatabase();
  database.transaction((transaction) => {
    requireActor(actorProfileId, transaction);
    const household = requireHousehold(transaction);
    ensureSettingsRow(actorProfileId, transaction);
    const defaultId = parsed.defaultSupermarketProfileId || null;
    if (defaultId) {
      const selected = transaction
        .select()
        .from(supermarketProfiles)
        .where(
          and(
            eq(supermarketProfiles.id, defaultId),
            eq(supermarketProfiles.householdId, household.id),
          ),
        )
        .get();
      if (!selected || selected.archivedAt)
        throw new ListSettingsNotFoundError('Choose an active supermarket as the default.');
    }
    transaction
      .update(householdListSettings)
      .set({
        defaultSupermarketProfileId: defaultId,
        completedItemsBehavior: parsed.completedItemsBehavior,
        openPantryPurchaseOnCheck: parsed.openPantryPurchaseOnCheck,
        keepScreenAwake: parsed.keepScreenAwake,
        updatedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(eq(householdListSettings.householdId, household.id))
      .run();
  });
  return getListSettingsWorkspace();
}

function findOrCreateAisle(
  sectionName: string,
  executor: DatabaseExecutor,
): typeof shoppingAisles.$inferSelect {
  const normalizedName = normalizeShoppingMatchText(sectionName);
  const existing = executor
    .select()
    .from(shoppingAisles)
    .orderBy(asc(shoppingAisles.position))
    .all()
    .find((aisle) => normalizeShoppingMatchText(aisle.name) === normalizedName);
  if (existing) return existing;
  const last = executor
    .select({ position: shoppingAisles.position })
    .from(shoppingAisles)
    .orderBy(desc(shoppingAisles.position))
    .limit(1)
    .get();
  const now = new Date();
  const aisle = {
    id: randomUUID(),
    name: sectionName,
    position: (last?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  };
  executor.insert(shoppingAisles).values(aisle).run();
  return aisle;
}

function replaceProfileSections(
  supermarketProfileId: string,
  input: SupermarketProfileInput,
  executor: DatabaseExecutor,
) {
  const now = new Date();
  executor
    .delete(supermarketProfileAisles)
    .where(eq(supermarketProfileAisles.supermarketProfileId, supermarketProfileId))
    .run();
  input.sections.forEach((section, position) => {
    const aisle = section.aisleId
      ? executor.select().from(shoppingAisles).where(eq(shoppingAisles.id, section.aisleId)).get()
      : findOrCreateAisle(section.name, executor);
    if (!aisle) throw new ListSettingsNotFoundError('That store section no longer exists.');
    executor
      .insert(supermarketProfileAisles)
      .values({
        id: randomUUID(),
        supermarketProfileId,
        aisleId: aisle.id,
        displayName: section.name,
        position,
        matchTerms: JSON.stringify(
          [...new Set(section.matchTerms.map(normalizeShoppingMatchText))].filter(Boolean),
        ),
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
}

function assertUniqueProfileIdentity(
  householdId: string,
  name: string,
  locationLabel: string,
  executor: DatabaseExecutor,
  excludingId?: string,
) {
  const normalizedName = normalizeShoppingMatchText(name);
  const normalizedLocation = normalizeShoppingMatchText(locationLabel);
  const duplicate = executor
    .select({ id: supermarketProfiles.id })
    .from(supermarketProfiles)
    .where(
      and(
        eq(supermarketProfiles.householdId, householdId),
        eq(supermarketProfiles.normalizedName, normalizedName),
        eq(supermarketProfiles.normalizedLocation, normalizedLocation),
      ),
    )
    .all()
    .find((profile) => profile.id !== excludingId);
  if (duplicate)
    throw new ListSettingsConflictError('That supermarket and location already exist.');
}

export function createSupermarketProfile(
  input: SupermarketProfileInput,
  actorProfileId: string,
): ListSettingsWorkspace {
  ensureDatabase();
  const parsed = supermarketProfileInputSchema.parse(input);
  const database = getDatabase();
  database.transaction((transaction) => {
    requireActor(actorProfileId, transaction);
    const household = requireHousehold(transaction);
    assertUniqueProfileIdentity(household.id, parsed.name, parsed.locationLabel, transaction);
    const now = new Date();
    const supermarketProfileId = randomUUID();
    transaction
      .insert(supermarketProfiles)
      .values({
        id: supermarketProfileId,
        householdId: household.id,
        name: parsed.name,
        normalizedName: normalizeShoppingMatchText(parsed.name),
        locationLabel: parsed.locationLabel,
        normalizedLocation: normalizeShoppingMatchText(parsed.locationLabel),
        notes: parsed.notes,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    replaceProfileSections(supermarketProfileId, parsed, transaction);
    const settings = ensureSettingsRow(actorProfileId, transaction);
    if (!settings.defaultSupermarketProfileId) {
      transaction
        .update(householdListSettings)
        .set({
          defaultSupermarketProfileId: supermarketProfileId,
          updatedByProfileId: actorProfileId,
          updatedAt: now,
        })
        .where(eq(householdListSettings.householdId, household.id))
        .run();
    }
  });
  return getListSettingsWorkspace();
}

function requireProfile(
  supermarketProfileId: string,
  executor: DatabaseExecutor,
): typeof supermarketProfiles.$inferSelect {
  const profile = executor
    .select()
    .from(supermarketProfiles)
    .where(eq(supermarketProfiles.id, supermarketProfileId))
    .get();
  if (!profile) throw new ListSettingsNotFoundError('That supermarket no longer exists.');
  return profile;
}

export function updateSupermarketProfile(
  supermarketProfileId: string,
  input: SupermarketProfileUpdateInput,
  actorProfileId: string,
): ListSettingsWorkspace {
  ensureDatabase();
  const parsed = supermarketProfileUpdateSchema.parse(input);
  const database = getDatabase();
  database.transaction((transaction) => {
    requireActor(actorProfileId, transaction);
    const profile = requireProfile(supermarketProfileId, transaction);
    assertUniqueProfileIdentity(
      profile.householdId,
      parsed.name,
      parsed.locationLabel,
      transaction,
      supermarketProfileId,
    );
    const now = new Date();
    transaction
      .update(supermarketProfiles)
      .set({
        name: parsed.name,
        normalizedName: normalizeShoppingMatchText(parsed.name),
        locationLabel: parsed.locationLabel,
        normalizedLocation: normalizeShoppingMatchText(parsed.locationLabel),
        notes: parsed.notes,
        archivedAt: parsed.archived ? (profile.archivedAt ?? now) : null,
        updatedByProfileId: actorProfileId,
        updatedAt: now,
      })
      .where(eq(supermarketProfiles.id, supermarketProfileId))
      .run();
    replaceProfileSections(supermarketProfileId, parsed, transaction);
    const settings = ensureSettingsRow(actorProfileId, transaction);
    if (parsed.archived && settings.defaultSupermarketProfileId === supermarketProfileId) {
      transaction
        .update(householdListSettings)
        .set({
          defaultSupermarketProfileId: null,
          updatedByProfileId: actorProfileId,
          updatedAt: now,
        })
        .where(eq(householdListSettings.householdId, profile.householdId))
        .run();
    } else if (!parsed.archived && !settings.defaultSupermarketProfileId) {
      transaction
        .update(householdListSettings)
        .set({
          defaultSupermarketProfileId: supermarketProfileId,
          updatedByProfileId: actorProfileId,
          updatedAt: now,
        })
        .where(eq(householdListSettings.householdId, profile.householdId))
        .run();
    }
    reclassifyListsForProfile(supermarketProfileId, transaction);
  });
  return getListSettingsWorkspace();
}

function uniqueCopyName(profile: SupermarketProfileView, executor: DatabaseExecutor): string {
  const existing = new Set(
    executor
      .select({ name: supermarketProfiles.name })
      .from(supermarketProfiles)
      .where(eq(supermarketProfiles.householdId, profile.householdId))
      .all()
      .map(({ name }) => normalizeShoppingMatchText(name)),
  );
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const candidate = suffix === 1 ? `${profile.name} copy` : `${profile.name} copy ${suffix}`;
    if (!existing.has(normalizeShoppingMatchText(candidate))) return candidate;
  }
  throw new ListSettingsConflictError('Choose a distinct name for the copied supermarket.');
}

export function duplicateSupermarketProfile(
  supermarketProfileId: string,
  actorProfileId: string,
): ListSettingsWorkspace {
  ensureDatabase();
  const database = getDatabase();
  database.transaction((transaction) => {
    requireActor(actorProfileId, transaction);
    const source = profileView(requireProfile(supermarketProfileId, transaction), transaction);
    const now = new Date();
    const copyId = randomUUID();
    const copyName = uniqueCopyName(source, transaction);
    transaction
      .insert(supermarketProfiles)
      .values({
        id: copyId,
        householdId: source.householdId,
        name: copyName,
        normalizedName: normalizeShoppingMatchText(copyName),
        locationLabel: '',
        normalizedLocation: '',
        notes: source.notes,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    source.sections.forEach((section) =>
      transaction
        .insert(supermarketProfileAisles)
        .values({
          id: randomUUID(),
          supermarketProfileId: copyId,
          aisleId: section.aisleId,
          displayName: section.name,
          position: section.position,
          matchTerms: JSON.stringify(section.matchTerms),
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    );
    const mappings = transaction
      .select()
      .from(supermarketItemAisleMappings)
      .where(eq(supermarketItemAisleMappings.supermarketProfileId, supermarketProfileId))
      .all();
    mappings.forEach((mapping) =>
      transaction
        .insert(supermarketItemAisleMappings)
        .values({
          ...mapping,
          id: randomUUID(),
          supermarketProfileId: copyId,
          updatedByProfileId: actorProfileId,
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    );
  });
  return getListSettingsWorkspace();
}

type ClassificationInput = {
  item: string;
  productId?: string | null;
};

export function resolveShoppingAisle(
  supermarketProfileId: string | null,
  input: ClassificationInput,
  executor: DatabaseExecutor = getDatabase(),
): string | null {
  if (!supermarketProfileId) return null;
  const sections = listProfileSections(supermarketProfileId, executor);
  if (!sections.length) return null;
  const activeAisles = new Set(sections.map((section) => section.aisleId));
  const mappings = executor
    .select()
    .from(supermarketItemAisleMappings)
    .where(eq(supermarketItemAisleMappings.supermarketProfileId, supermarketProfileId))
    .all();
  const byIdentity = new Map(
    mappings.map((mapping) => [
      `${mapping.identityType}:${mapping.identityValue}`,
      mapping.aisleId,
    ]),
  );
  const learnedKeys = [
    ...(input.productId ? [`pantry_product:${input.productId}`] : []),
    `item_name:${normalizeShoppingMatchText(input.item)}`,
  ];
  for (const key of learnedKeys) {
    if (!byIdentity.has(key)) continue;
    const learned = byIdentity.get(key) ?? null;
    if (learned === null || activeAisles.has(learned)) return learned;
  }

  const candidateText = [input.item];
  if (input.productId) {
    const product = executor
      .select()
      .from(pantryProducts)
      .where(eq(pantryProducts.id, input.productId))
      .get();
    if (product) candidateText.push(product.displayName, product.category, product.subcategory);
    candidateText.push(
      ...executor
        .select({ alias: pantryProductAliases.alias })
        .from(pantryProductAliases)
        .where(eq(pantryProductAliases.productId, input.productId))
        .all()
        .map(({ alias }) => alias),
    );
  }

  const matches = sections.flatMap((section) =>
    [section.name, ...section.matchTerms]
      .map((term) => normalizeShoppingMatchText(term))
      .filter(Boolean)
      .flatMap((term) =>
        candidateText.some((candidate) => shoppingTextMatchesTerm(candidate, term))
          ? [{ aisleId: section.aisleId, position: section.position, specificity: term.length }]
          : [],
      ),
  );
  matches.sort(
    (left, right) => right.specificity - left.specificity || left.position - right.position,
  );
  return matches[0]?.aisleId ?? null;
}

export function rememberShoppingAisle(
  supermarketProfileId: string | null,
  item: string,
  productId: string | null,
  aisleId: string | null,
  actorProfileId: string,
  executor: DatabaseExecutor = getDatabase(),
) {
  if (!supermarketProfileId) return;
  const profile = requireProfile(supermarketProfileId, executor);
  if (profile.archivedAt) throw new ListSettingsConflictError('Choose an active supermarket.');
  if (aisleId) {
    const membership = executor
      .select({ id: supermarketProfileAisles.id })
      .from(supermarketProfileAisles)
      .where(
        and(
          eq(supermarketProfileAisles.supermarketProfileId, supermarketProfileId),
          eq(supermarketProfileAisles.aisleId, aisleId),
        ),
      )
      .get();
    if (!membership) throw new ListSettingsNotFoundError('Choose a section from this supermarket.');
  }
  const now = new Date();
  const identities = [
    { type: 'item_name' as const, value: normalizeShoppingMatchText(item) },
    ...(productId ? [{ type: 'pantry_product' as const, value: productId }] : []),
  ].filter(({ value }) => Boolean(value));
  identities.forEach(({ type, value }) => {
    executor
      .insert(supermarketItemAisleMappings)
      .values({
        id: randomUUID(),
        supermarketProfileId,
        identityType: type,
        identityValue: value,
        aisleId,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          supermarketItemAisleMappings.supermarketProfileId,
          supermarketItemAisleMappings.identityType,
          supermarketItemAisleMappings.identityValue,
        ],
        set: { aisleId, updatedByProfileId: actorProfileId, updatedAt: now },
      })
      .run();
  });
}

export function listAislesForSupermarket(supermarketProfileId: string | null) {
  if (!supermarketProfileId) return [];
  const sections = listProfileSections(supermarketProfileId);
  if (!sections.length) return [];
  const aisleRows = getDatabase()
    .select()
    .from(shoppingAisles)
    .where(
      inArray(
        shoppingAisles.id,
        sections.map((section) => section.aisleId),
      ),
    )
    .all();
  const byId = new Map(aisleRows.map((aisle) => [aisle.id, aisle]));
  return sections.flatMap((section) => {
    const aisle = byId.get(section.aisleId);
    return aisle ? [{ ...aisle, name: section.name, position: section.position }] : [];
  });
}

function itemProductId(itemId: string, executor: DatabaseExecutor): string | null {
  return (
    executor
      .select({ productId: pantryShoppingItemDetails.productId })
      .from(pantryShoppingItemDetails)
      .where(eq(pantryShoppingItemDetails.shoppingListItemId, itemId))
      .get()?.productId ?? null
  );
}

function reclassifyListsForProfile(supermarketProfileId: string, executor: DatabaseExecutor) {
  const lists = executor
    .select({ id: shoppingLists.id })
    .from(shoppingLists)
    .where(eq(shoppingLists.supermarketProfileId, supermarketProfileId))
    .all();
  const now = new Date();
  lists.forEach(({ id: listId }) => {
    executor
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, listId))
      .all()
      .forEach((item) =>
        executor
          .update(shoppingListItems)
          .set({
            aisleId: resolveShoppingAisle(
              supermarketProfileId,
              { item: item.item, productId: itemProductId(item.id, executor) },
              executor,
            ),
            updatedAt: now,
          })
          .where(eq(shoppingListItems.id, item.id))
          .run(),
      );
  });
}

export function setShoppingListSupermarket(
  listId: string,
  supermarketProfileId: string | null,
  actorProfileId: string,
) {
  ensureDatabase();
  const database = getDatabase();
  database.transaction((transaction) => {
    requireActor(actorProfileId, transaction);
    const list = transaction.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
    if (!list) throw new ListSettingsNotFoundError('That shopping list no longer exists.');
    if (supermarketProfileId) {
      const profile = requireProfile(supermarketProfileId, transaction);
      if (profile.archivedAt) throw new ListSettingsConflictError('Choose an active supermarket.');
    }
    const now = new Date();
    transaction
      .update(shoppingLists)
      .set({ supermarketProfileId, updatedAt: now })
      .where(eq(shoppingLists.id, listId))
      .run();
    transaction
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, listId))
      .all()
      .forEach((item) =>
        transaction
          .update(shoppingListItems)
          .set({
            aisleId: resolveShoppingAisle(
              supermarketProfileId,
              { item: item.item, productId: itemProductId(item.id, transaction) },
              transaction,
            ),
            updatedAt: now,
          })
          .where(eq(shoppingListItems.id, item.id))
          .run(),
      );
  });
}

export function getShoppingListProductId(itemId: string): string | null {
  ensureDatabase();
  return itemProductId(itemId, getDatabase());
}
