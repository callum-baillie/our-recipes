import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { NutritionAccessPanel } from '@/components/nutrition-access-panel';
import { NutritionDashboard, type NutritionDashboardProps } from '@/components/nutrition-dashboard';
import { NutritionHouseholdWorkspace } from '@/components/nutrition-household-workspace';
import { NutritionPreparedWorkspace } from '@/components/nutrition-prepared-workspace';
import { buildNutritionChartDatasets } from '@/lib/domain/nutrition-chart-datasets';
import { buildAdvancedNutritionCharts } from '@/lib/domain/nutrition-advanced-charts';
import { buildNutritionWeightTrend } from '@/lib/domain/nutrition-weight-trend';
import {
  canonicalHeight,
  canonicalWeight,
  NutritionProfileSettings,
  nutritionProfileUpdateRequest,
  type NutritionProfileSettingsValue,
} from '@/components/nutrition-profile-settings';

const profileSettings: NutritionProfileSettingsValue = {
  id: '22222222-2222-4222-8222-222222222222',
  version: 1,
  dateOfBirth: null,
  heightCentimeters: null,
  currentWeightKilograms: null,
  measurementSystem: 'metric',
  referenceSexCategory: null,
  activityLevel: null,
  nutritionGoalType: 'none',
  targetWeightKilograms: null,
  targetDate: null,
  explicitlyEnteredLifeStage: null,
  dietaryPreferences: [],
  foodAllergies: [],
  dietaryExclusions: [],
  estimatedTargetsEnabled: false,
  estimatedTargetConsent: false,
  weightTrackingEnabled: false,
  preferredEnergyUnit: 'kcal',
  dailyResetTimezone: 'America/Los_Angeles',
  weekStartsOn: 1,
  referenceJurisdiction: 'US',
  visibleNutrientCodes: ['fiber', 'calcium', 'iron'],
  trendRangeDays: 7,
  showPlannedNutrition: true,
  showRecipeCardNutrition: true,
  recipeCardNutrientCodes: ['energy_kcal', 'protein', 'fiber'],
  showMealPlanNutrition: true,
};

const props: NutritionDashboardProps = {
  principalId: '11111111-1111-4111-8111-111111111111',
  profiles: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      displayName: 'Private Avery',
      profileType: 'adult',
      relationship: 'owner',
      canViewDiary: true,
      canViewMeasurements: true,
      canManageProfile: true,
      canManageGoals: true,
      canExportData: true,
      canDeleteData: true,
      version: 1,
      trendRangeDays: 7,
      showPlannedNutrition: true,
    },
  ],
  activeProfile: {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Private Avery',
    profileType: 'adult',
    relationship: 'owner',
    canViewDiary: true,
    canViewMeasurements: true,
    canManageProfile: true,
    canManageGoals: true,
    canExportData: true,
    canDeleteData: true,
    version: 1,
  },
  view: 'overview',
  summary: {
    currentEntries: [],
    todayTotals: { energy_kcal: 420, protein: 22 },
    sevenDayTotals: { energy_kcal: 420 },
    trend: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-07-${String(13 + index).padStart(2, '0')}`,
      energyKcal: index === 6 ? 420 : null,
      entryCount: index === 6 ? 1 : 0,
    })),
    averageCompleteness: 0.6,
    averageConfidence: 0.8,
    hasEstimatedValues: true,
  },
  definitions: [
    { code: 'energy_kcal', displayName: 'Calories', canonicalUnit: 'kcal', category: 'energy' },
    { code: 'protein', displayName: 'Protein', canonicalUnit: 'g', category: 'macronutrient' },
  ],
  goals: [],
  allocationCounts: { planned: 2 },
  insights: {
    goals: [],
    suggestions: [],
    qualityMessage: 'Insights need at least 3 recorded days and 50% nutrient coverage.',
  },
  householdComparison: {
    periodDays: 7,
    range: { start: '2026-07-13', end: '2026-07-19' },
    allocationSummary: {
      plannedMealServings: null,
      unassignedServings: null,
      unknownServingAllocations: 0,
    },
    members: [],
  },
  chartDatasets: buildNutritionChartDatasets({
    profileLabel: 'Private Avery',
    date: '2026-07-19',
    confirmed: {
      energy_kcal: 420,
      protein: 22,
      carbohydrate: 50,
      total_fat: 14,
    },
    planned: { energy_kcal: 600 },
    recentCompleteness: 0.6,
    goals: [
      {
        id: 'energy-goal',
        nutrientCode: 'energy_kcal',
        kind: 'target',
        value: 2_000,
        minimum: null,
        maximum: null,
        unit: 'kcal',
        sourceType: 'manual',
        state: 'active',
        startsOn: '2026-07-01',
        endsOn: null,
      },
      {
        id: 'protein-goal',
        nutrientCode: 'protein',
        kind: 'minimum',
        value: 80,
        minimum: null,
        maximum: null,
        unit: 'g',
        sourceType: 'manual',
        state: 'active',
        startsOn: '2026-07-01',
        endsOn: null,
      },
    ],
  }),
  advancedCharts: buildAdvancedNutritionCharts({
    profileLabel: 'Private Avery',
    startDate: '2026-07-13',
    endDate: '2026-07-19',
    days: 7,
    selectedNutrients: ['fiber'],
    goalContext: 'available',
    entries: [],
    plans: [],
    goals: [],
  }),
  weightTrend: buildNutritionWeightTrend({
    profileLabel: 'Private Avery',
    timeZone: 'America/Los_Angeles',
    measurementSystem: 'metric',
    startDate: '2026-07-13',
    endDate: '2026-07-19',
    days: 7,
    targetWeightKilograms: 68,
    status: 'enabled',
    measurements: [
      {
        id: 'weight-one',
        measuredAt: '2026-07-19T15:00:00.000Z',
        localDate: '2026-07-19',
        weightKilograms: 70,
        sourceType: 'imported',
        approximate: true,
      },
    ],
  }),
};

describe('Nutrition rendered boundary', () => {
  it('renders household-profile guidance without credential controls', () => {
    const markup = renderToStaticMarkup(createElement(NutritionAccessPanel));
    expect(markup).toContain('Select a household profile to continue');
    expect(markup).toContain('no separate Nutrition login');
    expect(markup).not.toContain('type="password"');
    expect(markup).not.toContain('weight');
    expect(markup).not.toContain('pregnan');
  });

  it('labels planned portions separately and exposes the complete view hierarchy', () => {
    const markup = renderToStaticMarkup(createElement(NutritionDashboard, props));
    expect(markup).toContain('Calories consumed');
    expect(markup).toContain('not counted as consumed');
    for (const label of ['Overview', 'Food Diary', 'Nutrients', 'Trends', 'Household', 'Goals']) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('Nothing is assumed');
    expect(markup).toContain('Daily calorie progress');
    expect(markup).toContain('Planned calories, not counted as consumed');
    expect(markup).toContain('Confirmed macro composition');
    expect(markup).toContain('Table equivalent for confirmed macro composition');
  });

  it('renders configured nutrient semantics with a table equivalent', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionDashboard, { ...props, view: 'nutrients' }),
    );
    expect(markup).toContain('Today&#x27;s configured nutrient coverage');
    expect(markup).toContain('minimum · below');
    expect(markup).toContain('58 g remains to the configured minimum');
    expect(markup).toContain('Table equivalent for today&#x27;s configured nutrient coverage');
  });

  it('explains sensitive profile inputs before optional controls and does not claim goals are generated', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionProfileSettings, {
        profile: profileSettings,
        effectiveOn: '2026-07-19',
        nutrientDefinitions: props.definitions,
      }),
    );
    expect(markup.indexOf('Date of birth, body measurements')).toBeLessThan(
      markup.indexOf('name="dateOfBirth"'),
    );
    expect(markup).toContain('Manual goals need none of these values');
    expect(markup).toContain('does not calculate, create, or replace a goal');
    expect(markup).not.toContain('Display name');
    expect(markup).not.toContain('Profile type');
    expect(markup).not.toContain('Linked household profile ID');
    expect(markup).not.toContain('Diary visibility');
    expect(markup).toContain('Preview estimated maintenance calories');
    expect(markup).toContain('generic activity field above is never translated automatically');
    expect(markup).toContain('NASEM physical-activity category');
    expect(markup).toContain('Nutrition display');
    expect(markup).toContain('Select between 1 and 12 nutrients');
    expect(markup).toContain('Show planned values in Nutrition charts');
    expect(markup).toContain('Show compact Nutrition facts on recipe-library cards');
    expect(markup).toContain('Select between 1 and 5 factual per-serving values');
    expect(markup).toContain('Show Nutrition previews in the meal planner');
    expect(markup).toContain('do not edit diary entries, meal plans, or goals');
  });

  it('applies range text and hides only planned presentation when configured', () => {
    const chartDatasets = buildNutritionChartDatasets({
      profileLabel: 'Private Avery',
      date: '2026-07-19',
      confirmed: { energy_kcal: 420 },
      planned: { energy_kcal: 600 },
      recentCompleteness: 0.6,
      showPlannedNutrition: false,
      goals: [],
    });
    const hidden = renderToStaticMarkup(
      createElement(NutritionDashboard, {
        ...props,
        activeProfile: {
          ...props.activeProfile,
          trendRangeDays: 14,
          showPlannedNutrition: false,
        },
        summary: {
          ...props.summary,
          trend: Array.from({ length: 14 }, (_, index) => ({
            date: `2026-07-${String(6 + index).padStart(2, '0')}`,
            energyKcal: null,
            entryCount: 0,
          })),
        },
        chartDatasets,
      }),
    );
    expect(hidden).not.toContain('Calories planned');
    expect(hidden).not.toContain('Planned separately');
    expect(hidden).not.toContain('Planned calories, not counted as consumed');
    expect(hidden).not.toContain('Confirmed and separately planned calories');
    expect(hidden).toContain('aria-label="Confirmed calories"');
    const trend = renderToStaticMarkup(
      createElement(NutritionDashboard, {
        ...props,
        view: 'trends',
        activeProfile: {
          ...props.activeProfile,
          trendRangeDays: 14,
          showPlannedNutrition: false,
        },
        summary: {
          ...props.summary,
          trend: Array.from({ length: 14 }, (_, index) => ({
            date: `2026-07-${String(6 + index).padStart(2, '0')}`,
            energyKcal: null,
            entryCount: 0,
          })),
        },
        chartDatasets,
        advancedCharts: buildAdvancedNutritionCharts({
          profileLabel: 'Private Avery',
          startDate: '2026-07-06',
          endDate: '2026-07-19',
          days: 14,
          selectedNutrients: ['fiber'],
          goalContext: 'available',
          entries: [],
          plans: [],
          goals: [],
        }),
      }),
    );
    expect(trend).toContain('Confirmed calorie trend');
    expect(trend).toContain('2026-07-06–2026-07-19');
    expect(trend).toContain('Exact confirmed calorie history');
  });

  it('converts imperial settings values to canonical server units deterministically', () => {
    expect(canonicalHeight(70, 'imperial')).toBe(177.8);
    expect(canonicalWeight(150, 'imperial')).toBe(68.0389);
    expect(canonicalHeight(180, 'metric')).toBe(180);
    expect(canonicalWeight(null, 'metric')).toBeNull();
  });

  it('builds an optimistic nutrition-only PATCH payload without header identity fields', () => {
    const data = new FormData();
    const values: Record<string, string> = {
      measurementSystem: 'imperial',
      height: '70',
      currentWeight: '150',
      nutritionGoalType: 'custom',
      targetWeight: '145',
      dietaryPreferences: 'Vegetarian\nHigh protein',
      foodAllergies: 'Peanuts',
      dietaryExclusions: 'Alcohol',
      preferredEnergyUnit: 'kcal',
      dailyResetTimezone: 'America/Los_Angeles',
      weekStartsOn: '1',
      referenceJurisdiction: 'US',
    };
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    data.set('weightTrackingEnabled', 'on');
    data.set('visibleNutrientCodes', 'fiber');
    data.append('visibleNutrientCodes', 'sodium');
    data.set('trendRangeDays', '14');
    data.set('showPlannedNutrition', 'on');
    data.set('showRecipeCardNutrition', 'on');
    data.set('recipeCardNutrientCodes', 'energy_kcal');
    data.append('recipeCardNutrientCodes', 'protein');
    data.set('showMealPlanNutrition', 'on');
    expect(nutritionProfileUpdateRequest(profileSettings, data)).toMatchObject({
      expectedVersion: 1,
      settings: {
        heightCentimeters: 177.8,
        currentWeightKilograms: 68.0389,
        targetWeightKilograms: 65.7709,
        dietaryPreferences: ['Vegetarian', 'High protein'],
        foodAllergies: ['Peanuts'],
        dietaryExclusions: ['Alcohol'],
        estimatedTargetsEnabled: false,
        weightTrackingEnabled: true,
        visibleNutrientCodes: ['fiber', 'sodium'],
        trendRangeDays: 14,
        showPlannedNutrition: true,
        showRecipeCardNutrition: true,
        recipeCardNutrientCodes: ['energy_kcal', 'protein'],
        showMealPlanNutrition: true,
      },
    });
  });

  it('explains deterministic recipe evidence and requires explicit grocery confirmation', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionDashboard, {
        ...props,
        definitions: [
          ...props.definitions,
          { code: 'fiber', displayName: 'Fiber', canonicalUnit: 'g', category: 'macronutrient' },
        ],
        shoppingLists: [{ id: 'list', name: 'Weekly groceries' }],
        recommendations: [
          {
            key: 'a'.repeat(64),
            kind: 'recurring_gap',
            nutrientCode: 'fiber',
            gapAmount: 20,
            unit: 'g',
            recipeId: 'recipe',
            recipeTitle: 'Lentil soup',
            nutrientAmountPerServing: 10,
            gapCoveragePercent: 50,
            completeness: 0.8,
            confidence: 0.9,
            pantryState: 'partial',
            expiringProductNames: ['Spinach'],
            shortages: [
              {
                productId: 'lentils',
                productName: 'Lentils',
                quantity: 200,
                unit: 'g',
              },
            ],
            pantryUnknownReasons: [],
            explanation:
              'Lentil soup provides 10 g fiber per calculated serving, about 50% of this recorded-average gap. Pantry availability is partial.',
            feedback: null,
          },
        ],
      }),
    );
    expect(markup).toContain('Recipe ideas from recorded evidence');
    expect(markup).toContain('Pantry means available, not eaten');
    expect(markup).toContain('50% of this gap');
    expect(markup).toContain('Confirm one grocery item');
    expect(markup).toContain('Dismiss this evidence version');
    expect(markup).not.toContain('good food');
  });

  it('renders a text equivalent for the visual trend', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionDashboard, { ...props, view: 'trends' }),
    );
    expect(markup).toContain('Confirmed calorie trend');
    expect(markup).toContain('Exact confirmed calorie history');
    expect(markup).toContain('Record completeness');
    expect(markup).toContain('Advanced nutrient source ranking');
    expect(markup).toContain('Advanced nutrient trend matrix');
    expect(markup).toContain('No data');
    expect(markup).toContain('Weight trend');
    expect(markup).toContain('Exact weight observations');
    expect(markup).toContain('70.000 kg');
    expect(markup).toContain('imported');
    expect(markup).toContain('Approximate');
    expect(markup).toContain('Configured target: 68 kg');
  });

  it('shows an authorized empty weight state and omits an unavailable target', () => {
    const empty = buildNutritionWeightTrend({
      profileLabel: 'Measurement viewer',
      timeZone: 'UTC',
      measurementSystem: 'imperial',
      startDate: '2026-07-13',
      endDate: '2026-07-19',
      days: 7,
      targetWeightKilograms: null,
      status: 'enabled',
      measurements: [],
    });
    const markup = renderToStaticMarkup(
      createElement(NutritionDashboard, {
        ...props,
        view: 'trends',
        advancedCharts: null,
        weightTrend: empty,
      }),
    );
    expect(markup).toContain('Nutrition diary data is required for food trends.');
    expect(markup).toContain('Weight tracking is enabled, but no observations are recorded');
    expect(markup).toContain('Measurement viewer');
    expect(markup).not.toContain('Configured target:');
  });

  it('exposes audited diary lifecycle controls without profile deletion', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionDashboard, {
        ...props,
        view: 'diary',
        summary: {
          ...props.summary,
          currentEntries: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              revision: 2,
              occurredAt: '2026-07-19T19:00:00Z',
              state: 'deleted',
              sourceNameSnapshot: 'Private meal',
              mealSlot: 'dinner',
              sourceType: 'manual',
              recipeId: null,
              productId: null,
              recipeCalculationId: null,
              quantity: 1,
              unit: 'portion',
              servingCount: null,
              values: [],
            },
          ],
        },
      }),
    );
    expect(markup).toContain('Export Nutrition JSON');
    expect(markup).toContain('Restore entry');
    expect(markup).toContain('Copy a diary day');
    expect(markup).not.toContain('DELETE Private Avery');
    expect(markup).not.toContain('Permanently delete Nutrition data');
  });

  it('exposes linked household profiles only for the explicit reassign exception', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionDashboard, {
        ...props,
        view: 'diary',
        profiles: [
          ...props.profiles,
          {
            ...props.profiles[0]!,
            id: '77777777-7777-4777-8777-777777777777',
            displayName: 'Linked Riley',
            relationship: 'viewer',
            canManageProfile: false,
            canManageGoals: false,
          },
        ],
        summary: {
          ...props.summary,
          currentEntries: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              revision: 1,
              occurredAt: '2026-07-19T19:00:00Z',
              state: 'eaten',
              sourceNameSnapshot: 'Shared soup',
              mealSlot: 'dinner',
              sourceType: 'manual',
              recipeId: null,
              productId: null,
              recipeCalculationId: null,
              quantity: 1,
              unit: 'portion',
              servingCount: null,
              values: [],
            },
          ],
        },
      }),
    );
    expect(markup).toContain('Reassign entry');
    expect(markup).toContain('Linked Riley');
    expect(markup.match(/Linked Riley/gu)).toHaveLength(1);
  });

  it('renders serving-state and explicit unassigned household data in an accessible table', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionHouseholdWorkspace, {
        profiles: [{ id: 'profile-one', displayName: 'Avery', profileType: 'adult' }],
        comparison: {
          periodDays: 14,
          range: { start: '2026-07-06', end: '2026-07-19' },
          focusMemberKey: 'profile-one',
          allocationSummary: {
            plannedMealServings: 6,
            unassignedServings: 1.5,
            unknownServingAllocations: 0,
          },
          members: [
            {
              key: 'profile-one',
              label: 'Avery',
              visibility: 'named',
              status: 'ready',
              observedDays: 3,
              confirmedCount: 2,
              allocationServings: {
                planned: 1,
                served: 1.5,
                eaten: 1,
                skipped: 0.5,
                leftover: 0.5,
              },
              averageCompleteness: 0.8,
              nutrients: [
                {
                  nutrientCode: 'protein',
                  normalizedPercent: 95,
                  semantic: 'coverage',
                  status: 'below',
                  coverage: 0.8,
                  observedDays: 3,
                },
              ],
            },
          ],
        },
      }),
    );
    expect(markup).toContain('<caption>Household Nutrition activity');
    expect(markup).toContain('<th scope="col">Leftover</th>');
    expect(markup).toContain('Explicitly unassigned: 1.5 servings');
    expect(markup).toContain('protein: 95% coverage (below)');
    expect(markup).toContain('Date range');
    expect(markup).toContain('7 days');
    expect(markup).toContain('14 days');
    expect(markup).toContain('30 days');
    expect(markup).toContain('90 days');
    expect(markup).toContain('Linked member focus');
    expect(markup).toContain('Avery: own-goal status');
    expect(markup).toContain('protein: 95% coverage, below');
    expect(markup).toContain('Planned servings and confirmed records use different units');
    expect(markup).toContain('Evidence completeness');
    expect(markup).toContain('<strong>unassigned</strong>');
    expect(markup.match(/aria-current="true"/gu)).toHaveLength(2);
  });

  it('labels unknown household visual evidence instead of rendering it as zero', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionHouseholdWorkspace, {
        profiles: [{ id: 'profile-one', displayName: 'Avery', profileType: 'adult' }],
        comparison: {
          periodDays: 90,
          range: { start: '2026-04-21', end: '2026-07-19' },
          focusMemberKey: 'missing-member',
          allocationSummary: {
            plannedMealServings: null,
            unassignedServings: null,
            unknownServingAllocations: 1,
          },
          members: [
            {
              key: 'profile-one',
              label: 'Avery',
              visibility: 'named',
              status: 'insufficient_data',
              observedDays: 0,
              confirmedCount: 0,
              allocationServings: {
                planned: null,
                served: null,
                eaten: null,
                skipped: null,
                leftover: null,
              },
              averageCompleteness: null,
              nutrients: [],
            },
          ],
        },
      }),
    );
    expect(markup).toContain('Missing nutrient values are unknown, not zero');
    expect(markup).toContain('No serving data');
    expect(markup).toContain('Unknown or no planned meal data');
    expect(markup).toContain('Insufficient data');
    expect(markup).not.toContain('0%');
  });

  it('keeps prepared, served, leftover and eaten actions explicit', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionPreparedWorkspace, {
        activeProfileId: '22222222-2222-4222-8222-222222222222',
        activeProfileName: 'Private Avery',
        canManageProfile: true,
        workspace: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            recipeNameSnapshot: 'Shared soup',
            actualServings: 4,
            finalWeightGrams: null,
            calculationAlignment: 'as_calculated',
            note: '',
            assignedServings: 1,
            remainingServings: 3,
            overallocatedServings: 0,
            confidence: 0.8,
            completeness: 0.7,
            ownAllocations: [
              {
                id: '44444444-4444-4444-8444-444444444444',
                seriesId: '55555555-5555-4555-8555-555555555555',
                revision: 1,
                state: 'served',
                servings: 1,
                portionWeightGrams: null,
                intakeSeriesId: null,
                note: '',
              },
            ],
          },
        ],
      }),
    );
    expect(markup).toContain('Serving, skipping, and saving leftovers are not consumption');
    expect(markup).toContain('Served, not yet eaten');
    expect(markup).toContain('Leftover, not eaten');
    expect(markup).toContain('Confirm eaten');
    expect(markup).toContain('Confirm another portion eaten');
  });
});
