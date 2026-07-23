import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { shoppingListItems, shoppingLists } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import {
  createSupermarketProfile,
  duplicateSupermarketProfile,
  getListSettings,
  listSupermarketProfiles,
  rememberShoppingAisle,
  resolveShoppingAisle,
  setShoppingListSupermarket,
  updateListSettings,
  updateSupermarketProfile,
} from '@/lib/services/list-settings-service';
import {
  addShoppingListItem,
  createManualShoppingList,
  createRetryShoppingList,
  getShoppingList,
  updateShoppingListItem,
} from '@/lib/services/planning-service';

describe('list settings and supermarket profiles', () => {
  let profileId: string;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    resetDatabaseForTests();
    profileId = completeSetup({
      householdName: 'Route test household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    }).profiles[0]!.id;
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  function createStore() {
    createSupermarketProfile(
      {
        name: 'Market Square',
        locationLabel: 'High Street',
        notes: 'Weekly shop',
        sections: [
          { aisleId: '', name: 'Fresh', matchTerms: ['fruit', 'vegetables', 'fresh herbs'] },
          { aisleId: '', name: 'Canned goods', matchTerms: ['canned', 'tinned', 'beans'] },
          { aisleId: '', name: 'Dairy', matchTerms: ['milk', 'cheese', 'yoghurt'] },
          { aisleId: '', name: 'Frozen', matchTerms: ['frozen', 'ice cream'] },
        ],
      },
      profileId,
    );
    return listSupermarketProfiles()[0]!;
  }

  it('creates a default store and classifies by the longest matching route term', () => {
    const store = createStore();
    expect(getListSettings().defaultSupermarketProfileId).toBe(store.id);
    expect(store.sections.map((section) => section.name)).toEqual([
      'Fresh',
      'Canned goods',
      'Dairy',
      'Frozen',
    ]);
    expect(resolveShoppingAisle(store.id, { item: 'Fresh herbs parsley' })).toBe(
      store.sections[0]!.aisleId,
    );
    expect(resolveShoppingAisle(store.id, { item: 'Canned chickpeas' })).toBe(
      store.sections[1]!.aisleId,
    );
    expect(resolveShoppingAisle(store.id, { item: 'Sesame oil' })).toBeNull();
  });

  it('remembers exact manual assignments, including explicit Unassigned', () => {
    const store = createStore();
    rememberShoppingAisle(store.id, 'Sesame oil', null, store.sections[1]!.aisleId, profileId);
    expect(resolveShoppingAisle(store.id, { item: 'Sesame oil' })).toBe(store.sections[1]!.aisleId);
    rememberShoppingAisle(store.id, 'Sesame oil', null, null, profileId);
    expect(resolveShoppingAisle(store.id, { item: 'Sesame oil' })).toBeNull();
  });

  it('switches a list to a store and reorders its sections through classification', () => {
    const store = createStore();
    const listId = '00000000-0000-4000-8000-000000000201';
    const milkId = '00000000-0000-4000-8000-000000000202';
    const peasId = '00000000-0000-4000-8000-000000000203';
    const now = new Date();
    getDatabase()
      .insert(shoppingLists)
      .values({
        id: listId,
        name: 'Weekly list',
        weekStart: '2026-07-20',
        weekEnd: '2026-07-26',
        createdByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(shoppingListItems)
      .values([
        {
          id: milkId,
          listId,
          position: 0,
          quantity: 2,
          unit: 'L',
          item: 'Milk',
          note: '',
          checked: false,
          sourceRecipeIds: '[]',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: peasId,
          listId,
          position: 1,
          quantity: 500,
          unit: 'g',
          item: 'Frozen peas',
          note: '',
          checked: false,
          sourceRecipeIds: '[]',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    setShoppingListSupermarket(listId, store.id, profileId);
    const list = getShoppingList(listId)!;
    expect(list.supermarketProfile?.name).toBe('Market Square');
    expect(list.aisles.map((aisle) => aisle.name)).toEqual([
      'Fresh',
      'Canned goods',
      'Dairy',
      'Frozen',
    ]);
    expect(list.items.find((item) => item.id === milkId)?.aisleId).toBe(store.sections[2]!.aisleId);
    expect(list.items.find((item) => item.id === peasId)?.aisleId).toBe(store.sections[3]!.aisleId);
  });

  it('duplicates, archives, restores, and updates household list preferences', () => {
    const store = createStore();
    duplicateSupermarketProfile(store.id, profileId);
    expect(listSupermarketProfiles()).toHaveLength(2);

    updateListSettings(
      {
        defaultSupermarketProfileId: store.id,
        completedItemsBehavior: 'hide',
        openPantryPurchaseOnCheck: false,
        keepScreenAwake: true,
      },
      profileId,
    );
    expect(getListSettings()).toMatchObject({
      completedItemsBehavior: 'hide',
      openPantryPurchaseOnCheck: false,
      keepScreenAwake: true,
    });

    updateSupermarketProfile(
      store.id,
      {
        name: store.name,
        locationLabel: store.locationLabel,
        notes: store.notes,
        sections: store.sections.map((section) => ({
          aisleId: section.aisleId,
          name: section.name,
          matchTerms: section.matchTerms,
        })),
        archived: true,
      },
      profileId,
    );
    expect(getListSettings().defaultSupermarketProfileId).toBeNull();
    expect(listSupermarketProfiles()).toHaveLength(1);
    expect(
      listSupermarketProfiles(true).find((profile) => profile.id === store.id)?.archivedAt,
    ).toBeTruthy();
  });

  it('moves can’t-find items into a new list in the next store route order', () => {
    const firstStore = createStore();
    createSupermarketProfile(
      {
        name: 'Second Market',
        locationLabel: 'North Road',
        notes: '',
        sections: [
          { aisleId: '', name: 'Dairy first', matchTerms: ['milk'] },
          { aisleId: '', name: 'Produce next', matchTerms: ['bananas'] },
        ],
      },
      profileId,
    );
    const secondStore = listSupermarketProfiles().find((profile) => profile.name === 'Second Market')!;
    const source = createManualShoppingList('Weekend shop', profileId);
    setShoppingListSupermarket(source.id, firstStore.id, profileId);
    const banana = addShoppingListItem(source.id, {
      quantity: 1,
      unit: 'bunch',
      item: 'Bananas',
      note: '',
      checked: false,
    });
    const milk = addShoppingListItem(source.id, {
      quantity: 2,
      unit: 'L',
      item: 'Milk',
      note: '',
      checked: false,
    });
    addShoppingListItem(source.id, {
      quantity: 1,
      unit: 'loaf',
      item: 'Bread',
      note: '',
      checked: false,
    });
    for (const item of [banana, milk]) {
      updateShoppingListItem(source.id, item.id, {
        quantity: item.quantity ?? '',
        unit: item.unit,
        item: item.item,
        note: item.note,
        checked: false,
        shoppingState: 'cant_find',
      });
    }

    const retry = createRetryShoppingList(source.id, secondStore.id, profileId);

    expect(retry.name).toBe('Weekend shop · Second Market');
    expect(retry.supermarketProfileId).toBe(secondStore.id);
    expect(retry.items.map((item) => item.item)).toEqual(['Milk', 'Bananas']);
    expect(retry.items.map((item) => item.shoppingState)).toEqual(['to_buy', 'to_buy']);
    expect(retry.items.map((item) => item.aisleId)).toEqual([
      secondStore.sections[0]!.aisleId,
      secondStore.sections[1]!.aisleId,
    ]);
  });
});
