import { describe, expect, it } from 'vitest';
import { bordReducer, type BordState } from '@/state/reducer';
import { createExpoRepository } from '@/data/repository';

const initialState: BordState = {
  recipes: [],
  favorites: ['potato-broccoli'],
  pantry: [
    {
      id: 'spinach',
      name: 'Baby spinach',
      amount: '½ bag',
      location: 'Fridge',
      expires: 'tomorrow',
      icon: 'leaf',
    },
  ],
  mealPlan: [],
  lists: [
    {
      id: 'shortages',
      name: 'Meal Plan 04/01 - 04/07',
      status: 'active',
      items: [
        {
          id: 'celery',
          name: 'Celery',
          amount: '1 stalk',
          aisle: 'Fresh produce',
          done: false,
          source: 'recipe demand',
        },
      ],
    },
  ],
  settings: {},
  cook: {},
  offline: false,
  nutrition: { profiles: [], household: null, profileDetails: {} },
  lastSyncedAt: null,
  recipeDraft: null,
  collections: [],
  tags: [],
  profiles: [],
};

describe('Bòrd persistent state transitions', () => {
  it('persists a favorite toggle without duplicating it', () => {
    const once = bordReducer({ ...initialState, favorites: [] }, { type: 'favorite', id: 'tacos' });
    const twice = bordReducer(once, { type: 'favorite', id: 'tacos' });
    expect(once.favorites).toEqual(['tacos']);
    expect(twice.favorites).toEqual([]);
  });
  it('never claims that offline writes are queued', () => {
    const offline = bordReducer(initialState, { type: 'set-offline', value: true });
    expect(offline.offline).toBe(true);
    expect(offline).not.toHaveProperty('queuedChanges');
  });
  it('marks a shopping item complete and preserves its list', () => {
    const next = bordReducer(initialState, {
      type: 'toggle-shopping',
      listId: 'shortages',
      itemId: 'celery',
    });
    expect(
      next.lists.find((list) => list.id === 'shortages')?.items.find((item) => item.id === 'celery')
        ?.done,
    ).toBe(true);
  });
  it('preserves shopper states for in-cart and unavailable items', () => {
    const unavailable = bordReducer(initialState, {
      type: 'set-shopping-state',
      listId: 'shortages',
      itemId: 'celery',
      shoppingState: 'cant_find',
    });
    const unavailableItem = unavailable.lists[0]?.items[0];
    expect(unavailableItem?.shoppingState).toBe('cant_find');
    expect(unavailableItem?.done).toBe(false);

    const inCart = bordReducer(unavailable, {
      type: 'set-shopping-state',
      listId: 'shortages',
      itemId: 'celery',
      shoppingState: 'in_cart',
    });
    expect(inCart.lists[0]?.items[0]).toMatchObject({ shoppingState: 'in_cart', done: true });
  });
  it('advances cook mode but never steps beyond the recipe', () => {
    const first = bordReducer(initialState, {
      type: 'advance-cook',
      recipeId: 'tacos',
      stepCount: 3,
    });
    const second = bordReducer(first, { type: 'advance-cook', recipeId: 'tacos', stepCount: 3 });
    const final = bordReducer(second, { type: 'advance-cook', recipeId: 'tacos', stepCount: 3 });
    expect(first.cook.tacos).toBe(1);
    expect(final.cook.tacos).toBe(2);
  });
  it('does not create an invalid cook step for a recipe without instructions', () => {
    const next = bordReducer(initialState, {
      type: 'advance-cook',
      recipeId: 'empty-recipe',
      stepCount: 0,
    });
    expect(next).toBe(initialState);
    expect(next.cook['empty-recipe']).toBeUndefined();
  });
  it('adds a meal to the selected planner day', () => {
    const next = bordReducer(initialState, {
      type: 'add-plan',
      item: {
        id: 'wed-snack',
        day: 29,
        meal: 'Snack',
        recipeId: 'wraps',
        time: '10 min',
        servings: 2,
      },
    });
    expect(next.mealPlan.filter((item) => item.day === 29)).toHaveLength(1);
    expect(next.mealPlan[0]?.recipeId).toBe('wraps');
  });
  it('replaces server-owned cache domains after an authoritative refresh', () => {
    const next = bordReducer(initialState, {
      type: 'server-sync',
      payload: {
        recipes: [],
        favorites: [],
        pantry: [],
        mealPlan: [],
        lists: [],
        nutrition: { profiles: [{ id: 'profile-1' }], household: {}, profileDetails: {} },
        collections: [],
        tags: [],
        profiles: [],
        lastSyncedAt: '2026-07-28T20:00:00.000Z',
      },
    });
    expect(next.pantry).toEqual([]);
    expect(next.lists).toEqual([]);
    expect(next.offline).toBe(false);
    expect(next.lastSyncedAt).toBe('2026-07-28T20:00:00.000Z');
  });
  it('resets all account-owned data before changing cache scope', () => {
    const next = bordReducer(initialState, { type: 'reset' });
    expect(next.recipes).toEqual([]);
    expect(next.pantry).toEqual([]);
    expect(next.lists).toEqual([]);
    expect(next.lastSyncedAt).toBeNull();
  });
});

describe('account-scoped cache repository', () => {
  it('keeps different Bòrd instances and users isolated', async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const repository = createExpoRepository();
    await repository.write('kitchen-a:user-1', { ...initialState, favorites: ['recipe-a'] });
    await repository.write('kitchen-b:user-1', { ...initialState, favorites: ['recipe-b'] });
    expect((await repository.read('kitchen-a:user-1'))?.favorites).toEqual(['recipe-a']);
    expect((await repository.read('kitchen-b:user-1'))?.favorites).toEqual(['recipe-b']);
    expect(await repository.read('kitchen-a:user-2')).toBeNull();
  });
});
