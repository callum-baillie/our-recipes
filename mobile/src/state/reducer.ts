import type {
  MealPlanItem,
  HouseholdProfile,
  NutritionCache,
  PantryItem,
  Recipe,
  RecipeCollection,
  RecipeDraft,
  RecipeTag,
  Settings,
  ShoppingList,
  ShoppingItem,
} from '@/data/types';

export type BordState = {
  recipes: Recipe[];
  favorites: string[];
  pantry: PantryItem[];
  mealPlan: MealPlanItem[];
  lists: ShoppingList[];
  settings: Settings;
  cook: Record<string, number>;
  offline: boolean;
  nutrition: NutritionCache;
  lastSyncedAt: string | null;
  recipeDraft: RecipeDraft | null;
  collections: RecipeCollection[];
  tags: RecipeTag[];
  profiles: HouseholdProfile[];
};
export type BordAction =
  | { type: 'favorite'; id: string }
  | { type: 'consume'; id: string }
  | { type: 'toggle-shopping'; listId: string; itemId: string }
  | {
      type: 'set-shopping-state';
      listId: string;
      itemId: string;
      shoppingState: NonNullable<ShoppingItem['shoppingState']>;
    }
  | { type: 'advance-cook'; recipeId: string; stepCount: number }
  | { type: 'set-setting'; key: string; value: Settings[string] }
  | { type: 'set-offline'; value: boolean }
  | { type: 'add-plan'; item: MealPlanItem }
  | { type: 'set-recipe-draft'; draft: RecipeDraft | null }
  | { type: 'reset' }
  | { type: 'hydrate'; state: BordState }
  | {
      type: 'server-sync';
      payload: Pick<
        BordState,
        | 'recipes'
        | 'favorites'
        | 'pantry'
        | 'mealPlan'
        | 'lists'
        | 'nutrition'
        | 'collections'
        | 'tags'
        | 'profiles'
        | 'lastSyncedAt'
      >;
    };

export function bordReducer(state: BordState, action: BordAction): BordState {
  switch (action.type) {
    case 'reset':
      return {
        recipes: [],
        favorites: [],
        pantry: [],
        mealPlan: [],
        lists: [],
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
    case 'hydrate':
      return action.state;
    case 'server-sync':
      return { ...state, ...action.payload, offline: false };
    case 'favorite':
      return {
        ...state,
        favorites: state.favorites.includes(action.id)
          ? state.favorites.filter((id) => id !== action.id)
          : [...state.favorites, action.id],
      };
    case 'consume':
      return { ...state, pantry: state.pantry.filter((item) => item.id !== action.id) };
    case 'toggle-shopping':
      return {
        ...state,
        lists: state.lists.map((list) =>
          list.id === action.listId
            ? {
                ...list,
                items: list.items.map((item) =>
                  item.id === action.itemId ? { ...item, done: !item.done } : item,
                ),
              }
            : list,
        ),
      };
    case 'set-shopping-state':
      return {
        ...state,
        lists: state.lists.map((list) =>
          list.id === action.listId
            ? {
                ...list,
                items: list.items.map((item) =>
                  item.id === action.itemId
                    ? {
                        ...item,
                        shoppingState: action.shoppingState,
                        done:
                          action.shoppingState === 'in_cart' || action.shoppingState === 'sourced',
                      }
                    : item,
                ),
              }
            : list,
        ),
      };
    case 'advance-cook':
      if (action.stepCount <= 0) return state;
      return {
        ...state,
        cook: {
          ...state.cook,
          [action.recipeId]: Math.min((state.cook[action.recipeId] ?? 0) + 1, action.stepCount - 1),
        },
      };
    case 'set-setting':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };
    case 'set-offline':
      return { ...state, offline: action.value };
    case 'add-plan':
      return { ...state, mealPlan: [...state.mealPlan, action.item] };
    case 'set-recipe-draft':
      return { ...state, recipeDraft: action.draft };
  }
}
