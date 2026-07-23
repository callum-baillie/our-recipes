import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MEAL_PLAN_PREFERENCES,
  appPreferencesUpdateSchema,
  freshInstallConfirmationSchema,
} from '@/lib/domain/app-preferences';
import { DEFAULT_VISIBLE_MEAL_TYPES, MEAL_OPTIONS } from '@/lib/domain/meal-types';

describe('app preference contracts', () => {
  it('accepts bounded category updates and rejects unknown fields', () => {
    expect(
      appPreferencesUpdateSchema.safeParse({
        category: 'recipes',
        values: { defaultSort: 'alphabetical', defaultServings: 6 },
      }).success,
    ).toBe(true);
    expect(
      appPreferencesUpdateSchema.safeParse({
        category: 'mealPlan',
        values: { ...DEFAULT_MEAL_PLAN_PREFERENCES, defaultMealTypes: [] },
      }).success,
    ).toBe(false);
    expect(
      appPreferencesUpdateSchema.safeParse({
        category: 'pantry',
        values: {
          defaultView: 'all',
          defaultSort: 'expiry',
          defaultGroup: 'location',
          admin: true,
        },
      }).success,
    ).toBe(false);
  });

  it('keeps the five core meal rows visible and accepts optional and custom meal types', () => {
    expect(DEFAULT_VISIBLE_MEAL_TYPES).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'dessert',
      'snack',
    ]);
    expect(MEAL_OPTIONS.map((option) => option.value)).toEqual(
      expect.arrayContaining(['brunch', 'supper', 'tiffin', 'suhoor', 'iftar']),
    );
    expect(
      appPreferencesUpdateSchema.safeParse({
        category: 'mealPlan',
        values: {
          ...DEFAULT_MEAL_PLAN_PREFERENCES,
          defaultDuration: 14,
          visibleMealTypes: [...DEFAULT_VISIBLE_MEAL_TYPES, 'brunch', 'custom-afternoon-tea'],
          customMealTypes: [{ value: 'custom-afternoon-tea', label: 'Afternoon tea' }],
        },
      }).success,
    ).toBe(true);
  });

  it('requires the exact destructive confirmation and renders a real dialog', () => {
    expect(
      freshInstallConfirmationSchema.safeParse({ confirmation: 'FRESH INSTALL' }).success,
    ).toBe(true);
    expect(
      freshInstallConfirmationSchema.safeParse({ confirmation: 'fresh install' }).success,
    ).toBe(false);
    const source = readFileSync('src/components/fresh-install-panel.tsx', 'utf8');
    expect(source).toContain('<dialog');
    expect(source).toContain('dialogRef.current?.showModal()');
    expect(source).toContain('Need a fresh start?');
    expect(source).toContain("window.location.replace('/')");
  });

  it('exposes every requested settings category from the hub', () => {
    const source = readFileSync('src/app/settings/page.tsx', 'utf8');
    for (const label of [
      'SYSTEM SETTINGS',
      'AI SETTINGS',
      'PROFILE SETTINGS',
      'RECIPE SETTINGS',
      'MEALPLAN SETTINGS',
      'LIST SETTINGS',
      'PANTRY SETTINGS',
      'NUTRITION SETTINGS',
    ]) {
      expect(source).toContain(label);
    }
  });
});
