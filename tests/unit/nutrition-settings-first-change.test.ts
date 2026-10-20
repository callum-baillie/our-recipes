// @vitest-environment jsdom
import { createElement, Fragment, useLayoutEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NutritionProfileSettings,
  type NutritionProfileSettingsValue,
} from '@/components/nutrition-profile-settings';
import { nutritionProfileSettingsInputSchema } from '@/lib/domain/nutrition-profile';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const profile: NutritionProfileSettingsValue = {
  ...nutritionProfileSettingsInputSchema.parse({}),
  id: 'nutrition-maya',
  version: 7,
  currentWeightKilograms: null,
  nutritionGoalType: 'none',
  measurementSystem: 'imperial',
  heightCentimeters: 172.3456,
  targetWeightKilograms: 73.4567,
  visibleNutrientCodes: ['protein', 'energy_kcal'],
  recipeCardNutrientCodes: ['protein', 'energy_kcal'],
};
const definitions = [
  { code: 'energy_kcal', displayName: 'Calories' },
  { code: 'protein', displayName: 'Protein' },
];
const saveButton = () => screen.getByRole('button', { name: "Save Maya's preferences" });
const editor = () =>
  createElement(NutritionProfileSettings, {
    profile,
    personName: 'Maya',
    effectiveOn: '2026-10-20',
    nutrientDefinitions: definitions,
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Nutrition acknowledged baseline', () => {
  it('keeps an edit made before passive effects dirty and submits its acknowledged version', async () => {
    const fetcher = vi.fn((_url, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      return Promise.resolve(
        Response.json({ profile: { ...profile, ...request.settings, version: 8 } }),
      );
    });
    vi.stubGlobal('fetch', fetcher);
    // Browser controls can change before hydration's passive effects. Exercise that
    // order explicitly; ordinary RTL render flushes effects before returning.
    function FirstInteraction() {
      useLayoutEffect(() => {
        const field = screen.getByLabelText(/Nutrition goal type/) as HTMLSelectElement;
        field.value = 'maintain';
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }, []);
      return null;
    }
    render(createElement(Fragment, null, editor(), createElement(FirstInteraction)));
    expect((screen.getByLabelText(/Nutrition goal type/) as HTMLSelectElement).value).toBe(
      'maintain',
    );
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveButton());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/nutrition/profiles/nutrition-maya');
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toMatchObject({
      expectedVersion: 7,
      settings: {
        nutritionGoalType: 'maintain',
        heightCentimeters: profile.heightCentimeters,
        targetWeightKilograms: profile.targetWeightKilograms,
        visibleNutrientCodes: ['protein', 'energy_kcal'],
        recipeCardNutrientCodes: ['protein', 'energy_kcal'],
      },
    });
    await screen.findByText("Maya's Nutrition preferences saved.");
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Nutrition goal type/), { target: { value: 'gain' } });
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Nutrition goal type/), {
      target: { value: 'maintain' },
    });
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts clean with saved nutrient order and precise measurements and tracks a normal first edit', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(editor());
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Nutrition goal type/), {
      target: { value: 'maintain' },
    });
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Nutrition goal type/), { target: { value: 'none' } });
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
