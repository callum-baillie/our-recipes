'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './toast-provider';
import { MEAL_WINDOWS } from '@/lib/domain/meal-completion';
import { nutritionWallTime } from '@/lib/domain/nutrition-ui';
export function MealNotifications({ timezone }: { timezone: string }) {
  const { showToast, dismissToast } = useToast();
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    const shown = new Set<string>();
    let busy = false;
    async function check() {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const wall = nutritionWallTime(new Date(), timezone);
        const today = wall.slice(0, 10);
        const previous = new Date(`${today}T12:00:00Z`);
        previous.setUTCDate(previous.getUTCDate() - 7);
        const response = await fetch(
          `/api/v1/meal-plan?start=${previous.toISOString().slice(0, 10)}&end=${today}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) return;
        const { meals } = (await response.json()) as {
          meals: Array<{
            id: string;
            recipeId: string | null;
            plannedFor: string;
            meal: string;
            recipeTitle: string;
            effectiveStatus: string;
          }>;
        };
        const pending = new Set<string>();
        for (const meal of meals) {
          const window = MEAL_WINDOWS[meal.meal];
          if (
            !meal.recipeId ||
            meal.effectiveStatus !== 'planned' ||
            !window ||
            (meal.plannedFor === today && Number(wall.slice(11, 13)) < window[1])
          )
            continue;
          const key = `unlogged-meal:${meal.id}`;
          pending.add(key);
          shown.add(key);
          showToast(
            `Did you have ${meal.recipeTitle} for ${meal.meal} on ${meal.plannedFor}?`,
            'info',
            {
              key,
              actions: [
                {
                  label: 'Review meal',
                  onClick: () => {
                    dismissToast(key);
                    router.push(`/recipes/${meal.recipeId}?madeDate=${meal.plannedFor}`);
                  },
                },
                {
                  label: 'Skipped',
                  onClick: async () => {
                    try {
                      const response = await fetch(`/api/v1/meal-plan/${meal.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'skipped' }),
                      });
                      if (!response.ok) throw new Error('The meal could not be marked skipped.');
                      dismissToast(key);
                      router.refresh();
                    } catch (error) {
                      showToast((error as Error).message, 'error');
                    }
                  },
                },
              ],
            },
          );
        }
        for (const key of shown)
          if (!pending.has(key)) {
            dismissToast(key);
            shown.delete(key);
          }
      } catch {
        /* Retry on the next foreground refresh. */
      } finally {
        busy = false;
      }
    }
    void check();
    const timer = setInterval(() => void check(), 60000);
    document.addEventListener('visibilitychange', check);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      for (const key of shown) dismissToast(key);
    };
  }, [timezone, showToast, dismissToast, router]);
  return null;
}
