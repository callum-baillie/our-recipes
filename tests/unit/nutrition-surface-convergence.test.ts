import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import {
  NutritionProfileSettings,
  type NutritionProfileSettingsValue,
} from '@/components/nutrition-profile-settings';

const source = (path: string) => readFileSync(path, 'utf8');

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

const settings: NutritionProfileSettingsValue = {
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
  visibleNutrientCodes: ['fiber'],
  trendRangeDays: 7,
  showPlannedNutrition: true,
  showRecipeCardNutrition: true,
  recipeCardNutrientCodes: ['energy_kcal'],
  showMealPlanNutrition: true,
};

describe('Nutrition surface convergence', () => {
  it('uses signed ActorContext without generating retired Nutrition selectors', () => {
    const planner = source('src/app/planner/page.tsx');
    const recipes = source('src/app/recipes/page.tsx');
    const filters = source('src/components/recipe-library-filters.tsx');
    expect(planner).toContain('getActorContext');
    expect(recipes).toContain('getActorContext');
    expect(planner).not.toContain('NUTRITION_ACCESS_COOKIE');
    expect(recipes).not.toContain('NUTRITION_ACCESS_COOKIE');
    expect(planner).not.toMatch(/requested\.nutritionProfile|[?&]nutritionProfile=/u);
    expect(recipes).not.toMatch(/set\('nutritionProfile'|[?&]nutritionProfile=/u);
    expect(filters).not.toMatch(/name="nutritionProfile"|name="profileId"/u);
  });

  it('keeps header identity and retired visibility controls out of Nutrition settings', () => {
    const markup = renderToStaticMarkup(
      createElement(NutritionProfileSettings, {
        profile: settings,
        effectiveOn: '2026-07-19',
        nutrientDefinitions: [{ code: 'fiber', displayName: 'Fiber' }],
      }),
    );
    expect(markup).toContain('household profile selected in the app header');
    for (const retired of [
      'name="displayName"',
      'name="avatarUrl"',
      'name="linkedHouseholdProfileId"',
      'name="profileType"',
      'name="comparisonVisibility"',
      'name="diaryVisibility"',
      'Private profile',
    ]) {
      expect(markup).not.toContain(retired);
    }
  });

  it('preserves explicit allocation and audited reassignment exceptions', () => {
    const dashboard = source('src/components/nutrition-dashboard.tsx');
    expect(dashboard).toContain("command: 'copy_entry' | 'move' | 'restore' | 'reassign'");
    expect(dashboard).toContain("entryLifecycleCommand(event, entry, 'reassign')");
    expect(dashboard).toContain('Reassignment reason');
    expect(source('src/components/nutrition-meal-planning.tsx')).toContain('Save revision');
  });

  it('uses a dark-theme Nutrition eyebrow color above 4.5 to 1', () => {
    const dashboardCss = source('src/components/nutrition-dashboard.module.css');
    const settingsCss = source('src/components/nutrition-profile-settings.module.css');
    const themesCss = source('src/app/themes.css');
    expect(dashboardCss).toContain('color: var(--accent-text)');
    expect(settingsCss).toContain('color: var(--accent-text)');
    expect(themesCss).toContain('--accent-text: light-dark(#863c22, #ffad91)');
    expect(contrast('#ffad91', '#202920')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffad91', '#273127')).toBeGreaterThanOrEqual(4.5);
  });
});
