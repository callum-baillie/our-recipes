import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { NutritionDataWorkspace } from '@/components/nutrition-data-workspace';
import { NutritionMealPlanning } from '@/components/nutrition-meal-planning';
import { RecipeNormalizedNutrition } from '@/components/recipe-normalized-nutrition';
import { RecipeSummaryCard } from '@/components/recipe-summary-card';
import { ToastProvider } from '@/components/toast-provider';

describe('recipe Nutrition workspace communication', () => {
  it('separates source, calculation, quality, and explicit consumption', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionDataWorkspace, {
        activeProfileId: '11111111-1111-4111-8111-111111111111',
        canManageProfile: true,
        definitions: [
          { code: 'energy_kcal', displayName: 'Calories', canonicalUnit: 'kcal' },
          { code: 'protein', displayName: 'Protein', canonicalUnit: 'g' },
        ],
        workspace: {
          products: [{ id: 'p', displayName: 'Lentils', record: null }],
          recipes: [
            {
              id: 'r',
              title: 'Lentil soup',
              servings: '4',
              currentRevision: 2,
              ingredients: [
                {
                  id: 'i',
                  item: 'lentils',
                  quantity: 200,
                  unit: 'g',
                  mappedProductId: 'p',
                  isOptional: false,
                },
              ],
              calculation: {
                id: 'c',
                recipeRevision: 2,
                revision: 1,
                servingCount: 4,
                finalWeightGrams: 800,
                servingWeightGrams: 200,
                confidence: 0.8,
                completeness: 0.7,
                energyMethod: 'macro-fallback',
                warnings: ['One ingredient has no record.'],
                createdAt: '2026-07-19T00:00:00.000Z',
                values: [
                  {
                    nutrientCode: 'energy_kcal',
                    amount: 800,
                    confidence: 0.8,
                    completeness: 0.7,
                    perServing: 200,
                    per100g: 100,
                  },
                ],
                contributions: [],
                source: { name: 'Our Recipes calculation', provider: 'Our Recipes', version: '1' },
              },
            },
          ],
        },
      }),
    );
    expect(markup).toContain('Source, calculate, then confirm');
    expect(markup).toContain('Nothing enters the Food Diary until you explicitly confirm');
    expect(markup).toContain('Raw-ingredient estimate');
    expect(markup).toContain('coverage 70%');
    expect(markup).toContain('per serving');
    expect(markup).toContain('per 100 g');
    expect(markup).toContain('Final cooked weight');
    expect(markup).toContain('Substitute Pantry product');
    expect(markup).toContain('Weighed portion');
    expect(markup).toContain('Confirm recipe in Food Diary');
    expect(markup).toContain('Confirm this product in the Food Diary');
    expect(markup).toContain('Manual Food Diary entry');
    expect(markup).toContain('moderate-confidence by the server');
    expect(markup).toContain('No nutrition record');
  });
});

describe('normalized recipe presentation', () => {
  it('labels normalized calculations separately from legacy fields and exposes quality warnings', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipeNormalizedNutrition, {
        nutrition: {
          status: 'stale',
          calculationId: 'calculation',
          recipeRevision: 2,
          calculationRevision: 3,
          servingCount: 4,
          confidence: 0.8,
          completeness: 0.7,
          sourceLabel: 'Ingredient calculation · 1',
          methodLabel: 'our_recipes_recipe_nutrition · v1',
          energyMethod: 'macro-fallback',
          warnings: ['This calculation is stale.'],
          calculatedAt: '2026-07-19T00:00:00.000Z',
          values: [
            {
              nutrientCode: 'energy_kcal',
              label: 'Calories',
              unit: 'kcal',
              total: 800,
              perServing: 200,
              confidence: 0.8,
              completeness: 0.7,
            },
          ],
        },
      }),
    );
    expect(markup).toContain('NORMALIZED INGREDIENT CALCULATION');
    expect(markup).toContain('Recalculation needed');
    expect(markup).toContain('800 kcal');
    expect(markup).toContain('200 kcal per serving');
    expect(markup).toContain('Raw-ingredient estimate');
    expect(markup).toContain('This calculation is stale.');
  });

  it('renders only the selected factual per-serving card fields', () => {
    const markup = renderToStaticMarkup(
      createElement(
        ToastProvider,
        null,
        createElement(RecipeSummaryCard, {
          compact: true,
          recipe: {
            id: 'recipe',
            title: 'Lentil soup',
            summary: '',
            category: 'Soup',
            tags: [],
            servings: '4 servings',
            prepMinutes: 10,
            cookMinutes: 20,
            restMinutes: 0,
            personalRating: null,
            image: null,
            normalizedNutrition: {
              status: 'current',
              completeness: 0.8,
              facts: [
                { code: 'protein', label: 'Protein', amount: 12.34, unit: 'g', digits: 1 },
                { code: 'fiber', label: 'Fiber', amount: 8.04, unit: 'g', digits: 1 },
              ],
            },
          },
        }),
      ),
    );
    expect(markup).toContain('12.3 g protein');
    expect(markup).toContain('8 g fiber');
    expect(markup).toContain('80% coverage');
    expect(markup).not.toContain('kcal');
  });
});

describe('planner Nutrition preview preference', () => {
  it('hides metrics while retaining allocation, capacity, quality and prepared controls', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionMealPlanning, {
        activeProfileId: '11111111-1111-4111-8111-111111111111',
        canManageProfile: true,
        showNutritionPreview: false,
        today: '2026-07-20',
        consumedToday: { energy_kcal: 400 },
        projection: {
          range: { start: '2026-07-20', end: '2026-07-26' },
          totalsByDate: { '2026-07-20': { energy_kcal: 600 } },
          confirmedTotalsByDate: { '2026-07-20': { energy_kcal: 400 } },
          meals: [
            {
              mealPlanEntryId: 'meal',
              plannedFor: '2026-07-20',
              meal: 'dinner',
              title: 'Lentil soup',
              recipeId: 'recipe',
              totalServings: 4,
              assignedServings: 1,
              unassignedServings: 3,
              overallocatedServings: 0,
              ownAllocations: [
                {
                  id: 'allocation',
                  seriesId: 'series',
                  revision: 1,
                  state: 'planned',
                  servings: 1,
                  note: '',
                },
              ],
              plannedServings: 1,
              calculationStatus: 'current',
              calculationId: 'calculation',
              confidence: 0.8,
              completeness: 0.7,
              warnings: [],
              plannedValues: { energy_kcal: 400, protein: 20 },
            },
          ],
        },
      }),
    );
    expect(markup).toContain('Nutrition metric previews are hidden');
    expect(markup).not.toContain('Planned: 600');
    expect(markup).not.toContain('Consumed: 400');
    expect(markup).not.toContain('This profile:');
    expect(markup).toContain('<dt>Total</dt><dd>4</dd>');
    expect(markup).toContain('<dt>Unassigned</dt><dd>3</dd>');
    expect(markup).toContain('Calculation: current');
    expect(markup).toContain('Save revision');
    expect(markup).toContain('Record a prepared batch');
    expect(markup).toContain('Planning or serving never records food as eaten');
  });
});
