import * as React from 'react';
import { AppState } from 'react-native';
import type {
  HouseholdProfile,
  MealPlanItem,
  NutritionCache,
  PantryItem,
  Recipe,
  RecipeCollection,
  RecipeStepCategory,
  RecipeTag,
  ShoppingList,
} from '@/data/types';
import { useAuth } from '@/auth/auth-context';
import { useBord } from '@/state/bord-store';

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const FOREGROUND_STALE_MS = 5 * 60 * 1000;

type SyncContextValue = {
  refreshing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const SyncContext = React.createContext<SyncContextValue | null>(null);

type LibraryRecipe = {
  id: string;
  title: string;
  summary: string;
  servings: string;
  prepMinutes: number;
  cookMinutes: number;
  restMinutes: number;
  category: string;
  tags: string[];
  isFavorite: boolean;
};

type RecipeDetail = LibraryRecipe & {
  revision?: number;
  ingredientGroups: {
    ingredients: { quantity: number | null; unit: string; item: string; note: string }[];
  }[];
  instructionSections: { steps: { body: string; category?: RecipeStepCategory }[] }[];
  images?: { id: string; altText?: string }[];
};

type PantryDashboard = {
  lowStockProductIds: string[];
  batches: {
    id: string;
    version: number;
    quantityLabel: string;
    status: string;
    productId: string;
    product: { displayName: string; category?: string };
    location: { storageType: string; name: string };
    expiry: { state: string; date: string | null };
  }[];
};

type PlannedMeal = {
  id: string;
  plannedFor: string;
  meal: string;
  recipeId: string | null;
  servings: number;
  recipeTitle: string;
};

type ShoppingSummary = {
  id: string;
  name: string;
  archivedAt: string | null;
  supermarketName?: string | null;
  supermarketLocation?: string;
};
type ShoppingDetail = ShoppingSummary & {
  supermarketProfile?: { id: string; name: string; locationLabel?: string } | null;
  aisles: { id: string; name: string }[];
  items: {
    id: string;
    item: string;
    quantity: number | null;
    unit: string;
    note: string;
    aisleId: string | null;
    checked: boolean;
    shoppingState: string;
    sourceRecipeIds: string;
  }[];
};

function todayRange() {
  const start = new Date();
  start.setDate(start.getDate() - 180);
  const end = new Date();
  end.setDate(end.getDate() + 365);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function pantryLocation(storageType: string): PantryItem['location'] {
  if (storageType === 'refrigerator') return 'Fridge';
  if (storageType === 'freezer') return 'Freezer';
  return 'Pantry';
}

function pantryIcon(category = '') {
  const normalized = category.toLowerCase();
  if (normalized.includes('produce')) return 'leaf';
  if (normalized.includes('dairy')) return 'drop';
  if (normalized.includes('frozen')) return 'snow';
  return 'shippingbox';
}

const fallbackRecipeImage = require('../../assets/design-pack/paper.png');

function mapRecipe(
  detail: RecipeDetail,
  assetSource: (path: string) => Recipe['image'] | undefined,
): Recipe {
  const servings = Number.parseInt(detail.servings, 10);
  const instructionSteps = detail.instructionSections.flatMap((section) => section.steps);
  const categories = instructionSteps.map((step) => step.category);
  return {
    id: detail.id,
    revision: detail.revision,
    title: detail.title,
    subtitle: detail.summary || 'A recipe from your Bòrd household.',
    minutes: detail.prepMinutes + detail.cookMinutes + detail.restMinutes,
    prepMinutes: detail.prepMinutes,
    cookMinutes: detail.cookMinutes,
    restMinutes: detail.restMinutes,
    servings: Number.isFinite(servings) ? servings : 1,
    meal: detail.category || 'Recipe',
    image:
      (detail.images?.[0]
        ? assetSource(
            `/api/v1/recipes/${encodeURIComponent(detail.id)}/images/${encodeURIComponent(detail.images[0].id)}`,
          )
        : undefined) ?? fallbackRecipeImage,
    tags: detail.tags,
    ingredients: detail.ingredientGroups.flatMap((group) =>
      group.ingredients.map((ingredient) =>
        [
          ingredient.quantity == null ? '' : String(ingredient.quantity),
          ingredient.unit,
          ingredient.item,
          ingredient.note,
        ]
          .filter(Boolean)
          .join(' '),
      ),
    ),
    steps: instructionSteps.map((step) => step.body),
    stepCategories: categories.every(Boolean) ? (categories as RecipeStepCategory[]) : undefined,
  };
}

function shoppingSourceLabel(sourceRecipeIds: string, note: string, recipes: Recipe[]) {
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(sourceRecipeIds) as unknown;
    if (Array.isArray(parsed))
      ids = parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    ids = sourceRecipeIds
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  const titles = ids
    .map((id) => recipes.find((recipe) => recipe.id === id)?.title)
    .filter((title): title is string => Boolean(title));
  if (titles.length === 1) return `For ${titles[0]}`;
  if (titles.length > 1) return `For ${titles[0]} +${titles.length - 1} more`;
  const safeNote = note.trim();
  if (safeNote && !/^[0-9a-f-]{24,}$/iu.test(safeNote)) return safeNote;
  return 'Added to this list';
}

async function mapInBatches<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  size = 6,
) {
  const output: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    const chunk = items.slice(index, index + size);
    output.push(...(await Promise.all(chunk.map((item, offset) => mapper(item, index + offset)))));
  }
  return output;
}

export function SyncProvider({ children }: React.PropsWithChildren) {
  const { status, request, requestNdjson, assetSource } = useAuth();
  const { state, dispatch, hydrated } = useBord();
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const activeRequest = React.useRef<Promise<void> | null>(null);
  const lastSyncedRef = React.useRef(state.lastSyncedAt);

  React.useEffect(() => {
    lastSyncedRef.current = state.lastSyncedAt;
  }, [state.lastSyncedAt]);

  const refresh = React.useCallback(async () => {
    if (status !== 'authenticated') return;
    if (activeRequest.current) return activeRequest.current;
    const operation = (async () => {
      setRefreshing(true);
      setError(null);
      try {
        const firstPage = await request<{
          library: { recipes: LibraryRecipe[]; totalPages: number };
        }>('/api/v1/recipes?page=1');
        const additionalPages = await Promise.all(
          Array.from({ length: Math.max(0, firstPage.library.totalPages - 1) }, (_, index) =>
            request<{ library: { recipes: LibraryRecipe[] } }>(`/api/v1/recipes?page=${index + 2}`),
          ),
        );
        const library = [
          ...firstPage.library.recipes,
          ...additionalPages.flatMap((page) => page.library.recipes),
        ];
        const recipeDetails = await requestNdjson<RecipeDetail>('/api/v1/recipes/bulk').catch(() =>
          mapInBatches(library, async (recipe) => {
            const result = await request<{ recipe: RecipeDetail }>(
              `/api/v1/recipes/${encodeURIComponent(recipe.id)}`,
            );
            return result.recipe;
          }),
        );
        const range = todayRange();
        const [
          pantryResult,
          mealsResult,
          listResult,
          nutritionProfiles,
          household,
          collectionResult,
          tagResult,
          profileResult,
        ] = await Promise.all([
          request<{ dashboard: PantryDashboard }>('/api/v1/pantry/summary'),
          request<{ meals: PlannedMeal[] }>(
            `/api/v1/meal-plan?start=${range.start}&end=${range.end}`,
          ),
          request<{ lists: ShoppingSummary[] }>('/api/v1/shopping-lists'),
          request<{ profiles: { id: string }[] }>('/api/v1/nutrition/profiles').catch(() => ({
            profiles: [],
          })),
          request<{ comparison: unknown }>('/api/v1/nutrition/household').catch(() => ({
            comparison: null,
          })),
          requestNdjson<RecipeCollection>('/api/v1/collections/bulk')
            .then((collections) => ({ collections }))
            .catch(() =>
              request<{ collections: RecipeCollection[] }>('/api/v1/collections').catch(() => ({
                collections: [],
              })),
            ),
          request<{ tags: RecipeTag[] }>('/api/v1/tags').catch(() => ({ tags: [] })),
          request<HouseholdProfile[]>('/api/v1/profiles').catch(() => []),
        ]);
        const listDetails = await requestNdjson<ShoppingDetail>(
          '/api/v1/shopping-lists/bulk',
        ).catch(() =>
          mapInBatches(listResult.lists, async (list) => {
            const result = await request<{ list: ShoppingDetail }>(
              `/api/v1/shopping-lists/${encodeURIComponent(list.id)}`,
            );
            return result.list;
          }),
        );
        const nutritionDetailPairs = await mapInBatches(
          nutritionProfiles.profiles,
          async (profile) => {
            const [detail, goals, intake] = await Promise.all([
              request<unknown>(`/api/v1/nutrition/profiles/${profile.id}`).catch(() => null),
              request<unknown>(`/api/v1/nutrition/profiles/${profile.id}/goals`).catch(() => null),
              request<unknown>(`/api/v1/nutrition/profiles/${profile.id}/intake`).catch(() => null),
            ]);
            return [profile.id, { detail, goals, intake }] as const;
          },
        );
        const pantry: PantryItem[] = pantryResult.dashboard.batches.map((batch) => ({
          id: batch.id,
          name: batch.product.displayName,
          amount: batch.quantityLabel,
          location: pantryLocation(batch.location.storageType),
          expires: batch.expiry.date
            ? `${batch.expiry.state.replaceAll('_', ' ')} ${batch.expiry.date}`
            : batch.status,
          low: pantryResult.dashboard.lowStockProductIds.includes(batch.productId),
          icon: pantryIcon(batch.product.category),
          version: batch.version,
        }));
        const mealPlan: MealPlanItem[] = mealsResult.meals.map((meal) => ({
          id: meal.id,
          day: Number(meal.plannedFor.slice(-2)),
          date: meal.plannedFor,
          meal: meal.meal,
          recipeId: meal.recipeId,
          title: meal.recipeTitle,
          time: '',
          servings: meal.servings,
        }));
        const mappedRecipes = recipeDetails.map((recipe) => mapRecipe(recipe, assetSource));
        const lists: ShoppingList[] = listDetails.map((list) => ({
          id: list.id,
          name: list.name,
          status: list.archivedAt ? 'completed' : 'active',
          supermarket: list.supermarketProfile
            ? {
                id: list.supermarketProfile.id,
                name: list.supermarketProfile.name,
                locationLabel: list.supermarketProfile.locationLabel,
              }
            : null,
          items: list.items.map((item) => ({
            id: item.id,
            name: item.item,
            amount: [item.quantity, item.unit].filter(Boolean).join(' ') || item.note,
            aisle: list.aisles.find((aisle) => aisle.id === item.aisleId)?.name ?? 'Other',
            done:
              item.shoppingState === 'in_cart' || item.shoppingState === 'sourced' || item.checked,
            source: shoppingSourceLabel(item.sourceRecipeIds, item.note, mappedRecipes),
            quantity: item.quantity,
            unit: item.unit,
            note: item.note,
            aisleId: item.aisleId,
            shoppingState: item.shoppingState as 'to_buy' | 'in_cart' | 'cant_find' | 'sourced',
          })),
        }));
        const nutrition: NutritionCache = {
          profiles: nutritionProfiles.profiles,
          household: household.comparison,
          profileDetails: Object.fromEntries(nutritionDetailPairs),
        };
        dispatch({
          type: 'server-sync',
          payload: {
            recipes: mappedRecipes,
            favorites: library.filter((recipe) => recipe.isFavorite).map((recipe) => recipe.id),
            pantry,
            mealPlan,
            lists,
            nutrition,
            collections: collectionResult.collections,
            tags: tagResult.tags,
            profiles: profileResult,
            lastSyncedAt: new Date().toISOString(),
          },
        });
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : 'Bòrd could not refresh.';
        setError(message);
        dispatch({ type: 'set-offline', value: true });
      } finally {
        setRefreshing(false);
        activeRequest.current = null;
      }
    })();
    activeRequest.current = operation;
    return operation;
  }, [assetSource, dispatch, request, requestNdjson, status]);

  React.useEffect(() => {
    if (!hydrated || status !== 'authenticated') return;
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const age = lastSyncedRef.current
        ? Date.now() - new Date(lastSyncedRef.current).getTime()
        : Number.POSITIVE_INFINITY;
      if (age >= FOREGROUND_STALE_MS) void refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [hydrated, refresh, status]);

  const value = React.useMemo(
    () => ({ refreshing, lastSyncedAt: state.lastSyncedAt, error, refresh }),
    [error, refresh, refreshing, state.lastSyncedAt],
  );
  return <SyncContext value={value}>{children}</SyncContext>;
}

export function useSync() {
  const context = React.use(SyncContext);
  if (!context) throw new Error('useSync must be used inside SyncProvider');
  return context;
}
