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
        personName: 'Avery',
      }),
    );
    expect(markup).toContain(
      'Avery · Preferences follow this selected household Nutrition profile.',
    );
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

  it('keeps shared accent text readable against each palette’s dark settings surfaces', () => {
    const themesCss = source('src/app/themes.css');
    const palettes = themesCss
      .split(/(?=:root\[data-palette=)/u)
      .filter((section) => section.includes('--accent-text:'));
    expect(palettes).toHaveLength(5);
    for (const palette of palettes) {
      const dark = (token: string) =>
        palette.match(new RegExp(`--${token}: light-dark\\(#[a-f0-9]+, (#[a-f0-9]+)\\)`))?.[1];
      const foreground = dark('accent-text')!;
      for (const token of ['page', 'linen'])
        expect(contrast(foreground, dark(token)!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
