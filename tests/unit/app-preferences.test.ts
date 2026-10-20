// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FreshInstallPanel } from '@/components/fresh-install-panel';
import { SettingsNav } from '@/components/settings-nav';
import { AccountNav } from '@/components/account-nav';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/settings/profiles' }));
vi.mock('@/components/toast-provider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);

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
    render(createElement(FreshInstallPanel));
    fireEvent.click(screen.getByRole('button', { name: 'Erase app data' }));
    const dialog = screen.getByRole('dialog', { name: 'Erase app data and start over' });
    const confirmation = within(dialog).getByLabelText(/^Confirmation/);
    const submit = within(dialog).getByRole('button', {
      name: 'Erase app data and start fresh',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(confirmation, { target: { value: 'fresh install' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(confirmation, { target: { value: 'FRESH INSTALL' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect((dialog as HTMLDialogElement).open).toBe(false);
  });

  it('exposes shared settings in the hub and personal settings in the account navigation', () => {
    const household = render(createElement(SettingsNav));
    for (const path of [
      '/settings/profiles',
      '/settings/recipes',
      '/settings/meal-plan',
      '/settings/lists',
      '/settings/pantry',
      '/settings/ai',
      '/settings/automation',
      '/settings/system',
      '/settings/api',
    ]) {
      expect(household.container.querySelector(`a[href="${path}"]`)).not.toBeNull();
    }
    expect(household.container.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe(
      '/settings/profiles',
    );
    household.unmount();
    const account = render(createElement(AccountNav));
    for (const path of ['/account/nutrition', '/account/ai', '/account/integrations']) {
      expect(account.container.querySelector(`a[href="${path}"]`)).not.toBeNull();
    }
  });
});
