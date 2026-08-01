import { useAuth } from '@/auth/auth-context';
import { randomUUID } from 'expo-crypto';
import type { PantryItem, Recipe, ShoppingItem } from '@/data/types';
import { useSync } from '@/sync/sync-context';
import { useBord } from '@/state/bord-store';

export function useServerActions() {
  const { request } = useAuth();
  const { refresh } = useSync();
  const { dispatch } = useBord();

  return {
    async saveRecipe(
      input: {
        title: string;
        summary: string;
        servings: string;
        prepMinutes: number;
        cookMinutes: number;
        restMinutes: number;
        ingredients: string[];
        steps: string[];
        sourceName?: string;
        sourceUrl?: string;
      },
      existing?: Recipe,
      importId?: string,
    ) {
      const payload = {
        title: input.title,
        summary: input.summary,
        status: 'active',
        servings: input.servings,
        prepMinutes: input.prepMinutes,
        cookMinutes: input.cookMinutes,
        restMinutes: input.restMinutes,
        difficulty: '',
        cuisine: '',
        category: existing?.meal ?? '',
        tips: '',
        sharedNotes: '',
        sourceName: input.sourceName ?? 'Bòrd mobile',
        sourceUrl: input.sourceUrl ?? '',
        originalAuthor: '',
        cookingMethod: '',
        equipment: [],
        nutritionCalories: '',
        nutritionProteinGrams: '',
        nutritionCarbohydrateGrams: '',
        nutritionFatGrams: '',
        nutritionSaturatedFatGrams: '',
        nutritionFiberGrams: '',
        nutritionSugarGrams: '',
        nutritionSodiumMilligrams: '',
        tags: existing?.tags ?? [],
        ingredientGroups: [
          {
            name: '',
            ingredients: input.ingredients.map((item) => ({
              quantity: '',
              unit: '',
              item,
              note: '',
              shoppingCategory: 'Other',
            })),
          },
        ],
        instructionSections: [{ title: '', steps: input.steps }],
      };
      const path = importId
        ? `/api/v1/imports/${encodeURIComponent(importId)}/confirm`
        : existing
          ? `/api/v1/recipes/${encodeURIComponent(existing.id)}`
          : '/api/v1/recipes';
      const result = await request<{ recipe: { id: string } }>(path, {
        method: existing && !importId ? 'PUT' : 'POST',
        headers: existing || importId ? undefined : { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify(
          importId
            ? { recipe: payload }
            : existing
              ? { ...payload, expectedRevision: existing.revision ?? 1 }
              : payload,
        ),
      });
      await refresh();
      return result.recipe;
    },
    async setFavorite(recipeId: string, favorite: boolean) {
      await request(`/api/v1/recipes/${encodeURIComponent(recipeId)}/favorite`, {
        method: 'PUT',
        body: JSON.stringify({ favorite }),
      });
      await refresh();
    },
    async setShoppingState(
      listId: string,
      item: ShoppingItem,
      shoppingState: NonNullable<ShoppingItem['shoppingState']>,
    ) {
      const previousState = item.shoppingState ?? (item.done ? 'in_cart' : 'to_buy');
      dispatch({ type: 'set-shopping-state', listId, itemId: item.id, shoppingState });
      try {
        await request(
          `/api/v1/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(item.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              quantity: item.quantity ?? '',
              unit: item.unit ?? '',
              item: item.name,
              note: item.note ?? '',
              aisleId: item.aisleId ?? '',
              checked: shoppingState === 'sourced',
              shoppingState,
            }),
          },
        );
        await refresh();
      } catch (error) {
        dispatch({
          type: 'set-shopping-state',
          listId,
          itemId: item.id,
          shoppingState: previousState,
        });
        throw error;
      }
    },
    async completeShopping(listId: string, items: ShoppingItem[]) {
      await Promise.all(
        items
          .filter((item) => item.shoppingState === 'in_cart')
          .map((item) =>
            request(
              `/api/v1/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(item.id)}`,
              {
                method: 'PATCH',
                body: JSON.stringify({
                  quantity: item.quantity ?? '',
                  unit: item.unit ?? '',
                  item: item.name,
                  note: item.note ?? '',
                  aisleId: item.aisleId ?? '',
                  checked: true,
                  shoppingState: 'sourced',
                }),
              },
            ),
          ),
      );
      await refresh();
    },
    async markPantryEmpty(item: PantryItem) {
      if (!item.version) throw new Error('Refresh this Pantry item before changing it.');
      await request(`/api/v1/pantry/batches/${encodeURIComponent(item.id)}/actions`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'mark_empty',
          expectedVersion: item.version,
          note: 'Marked empty from Bòrd mobile',
        }),
      });
      await refresh();
    },
  };
}
