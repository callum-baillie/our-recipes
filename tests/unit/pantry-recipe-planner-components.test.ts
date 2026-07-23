import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { MealPlanPantryDemand } from '@/components/meal-plan-pantry-demand';
import { MealPlanner } from '@/components/meal-planner';
import { RecipePantryPanel } from '@/components/recipe-pantry-panel';

describe('Pantry recipe and planner presentation', () => {
  it('links an eligible planned meal directly into its attributed cooking session', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const markup = renderToStaticMarkup(
      createElement(MealPlanner, {
        weekStart: '2026-07-19',
        weekEnd: '2026-07-25',
        previousWeekStart: '2026-07-12',
        nextWeekStart: '2026-07-26',
        meals: [
          {
            id: 'meal-1',
            plannedFor: '2026-07-19',
            meal: 'dinner',
            recipeId: 'recipe-1',
            recipeRevision: 1,
            recipeCalculationId: null,
            recipeTitleSnapshot: 'Lentil soup',
            recipeIngredientsSnapshot: '{"baseServings":"4","ingredients":[]}',
            title: '',
            servings: 2,
            note: '',
            status: 'planned',
            createdByProfileId: 'profile-1',
            updatedByProfileId: 'profile-1',
            createdAt: now,
            updatedAt: now,
            recipeTitle: 'Lentil soup',
            recipeChangedSincePlanning: false,
            effectiveStatus: 'planned',
          },
        ],
        recipes: [],
        profiles: [],
        collections: [],
        collectionMemberships: [],
      }),
    );
    expect(markup).toContain('/recipes/recipe-1/cook?mealPlanEntryId=meal-1');
    expect(markup).toContain('Cook Lentil soup from this planned meal');
  });

  it('keeps plan totals in the insights rail without the former calendar footer', () => {
    const markup = renderToStaticMarkup(
      createElement(MealPlanner, {
        weekStart: '2026-07-20',
        weekEnd: '2026-07-26',
        previousWeekStart: '2026-07-13',
        nextWeekStart: '2026-07-27',
        meals: [],
        recipes: [],
        profiles: [],
        collections: [],
        collectionMemberships: [],
      }),
    );

    expect(markup).toContain('aria-label="Week plan at a glance"');
    expect(markup).toContain('Week summary');
    expect(markup).toContain('Total servings');
    expect(markup).not.toContain('Your plan at a glance');
    expect(markup).toContain('aria-label="Mobile planner controls"');
    expect(markup).toContain('aria-label="Show nutrition and Pantry details"');
    expect(markup).toContain('aria-controls="mobile-nutrition-panel"');
    expect(markup).not.toContain('id="mobile-nutrition-panel"');
    expect(markup).not.toContain('Your daily meal plan');
  });

  it('shows exact scaled detail, optional context, batches, locations, commitments, and dates', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipePantryPanel, {
        products: [],
        allowMapping: false,
        initialAvailability: {
          recipeId: 'recipe-1',
          recipeTitle: 'Lentil soup',
          baseServings: 4,
          targetServings: 8,
          state: 'ready',
          counts: { ready: 1, partial: 0, unknown: 0 },
          ingredients: [
            {
              id: 'ingredient-1',
              item: 'Lentils exactly as written',
              quantity: 100,
              unit: 'g',
              productId: 'product-1',
              productName: 'Red lentils',
              isOptional: true,
              state: 'ready',
              requiredQuantity: 200,
              availableQuantity: 400,
              shortageQuantity: 0,
              plannedCommittedQuantity: 100,
              projectedRemainderQuantity: 100,
              earliestExpiryDate: '2026-08-01',
              matchingBatches: [
                {
                  batchId: 'batch-1',
                  quantity: 400,
                  unit: 'g',
                  locationName: 'Basement shelf',
                  expiryDate: '2026-08-01',
                  exact: true,
                },
              ],
              reason: 'Compatible exact Pantry stock covers this amount.',
            },
          ],
        },
      }),
    );
    expect(markup).toContain('Check servings');
    expect(markup).toContain('Optional');
    expect(markup).toContain('Planned commitments');
    expect(markup).toContain('projected remainder');
    expect(markup).toContain('Basement shelf');
    expect(markup).toContain('recorded date 2026-08-01');
    expect(markup).toContain('Lentils exactly as written');
  });

  it('labels coverage, later exhaustion, and date conflicts as planning context', () => {
    const markup = renderToStaticMarkup(
      createElement(MealPlanPantryDemand, {
        demand: {
          weekStart: '2026-07-20',
          weekEnd: '2026-07-26',
          unknown: [],
          lines: [
            {
              productId: 'product-1',
              productName: 'Red lentils',
              unit: 'g',
              requiredQuantity: 300,
              availableQuantity: 250,
              shortageQuantity: 50,
              state: 'shortage',
              uncertaintyReason: null,
              projectedRemainderQuantity: -50,
              exhaustionDate: '2026-07-24',
              earliestExpiryDate: '2026-07-21',
              expiryConflicts: [
                { batchId: 'batch-1', expiryDate: '2026-07-21', plannedFor: '2026-07-24' },
              ],
              meals: [
                {
                  mealPlanEntryId: 'meal-1',
                  plannedFor: '2026-07-24',
                  recipeTitle: 'Lentil soup',
                },
              ],
            },
          ],
        },
      }),
    );
    expect(markup).toContain('short 50 g');
    expect(markup).toContain('runs short by 2026-07-24');
    expect(markup).toContain('planning context, not food-safety advice');
    expect(markup).toContain('No stock is reserved or consumed');
  });
});
