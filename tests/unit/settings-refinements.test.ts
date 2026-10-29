// @vitest-environment jsdom
import {
  cleanup,
  configure,
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createElement } from 'react';
import { ToastProvider } from '@/components/toast-provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/settings/recipes',
}));

vi.mock('@/lib/auth/client', () => ({ authClient: { signIn: { email: vi.fn() } } }));
vi.mock('@/components/catalog-store-link', () => ({ CatalogStoreLink: () => null }));
vi.mock('@/components/store-map-upload', () => ({
  StoreMapUpload: ({ onUse }: { onUse: (sections: unknown[]) => void }) =>
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => onUse([{ aisleId: '', name: 'Imported produce', matchTerms: ['fruit'] }]),
      },
      'Import map fixture',
    ),
}));
import { RecipePreferencesForm, MealPlanPreferencesForm } from '@/components/app-preferences-forms';
import { BackupManager } from '@/components/backup-manager';
import { TaskSettings } from '@/components/task-settings';
import { ProfileEditor } from '@/components/profile-settings';
import { defaultProfileGoalContext } from '@/lib/domain/profile-goals';
import { ApiKeyManager } from '@/components/api-key-manager';
import { AiSettingsForm } from '@/components/ai-settings-form';
import { ListSettingsManager } from '@/components/list-settings-manager';
import {
  NutritionProfileSettings,
  type NutritionProfileSettingsValue,
} from '@/components/nutrition-profile-settings';
import { DEFAULT_MEAL_PLAN_PREFERENCES } from '@/lib/domain/app-preferences';
import { validTimeZone, validLocale } from '@/lib/domain/regional';
import { nutritionProfileSettingsInputSchema } from '@/lib/domain/nutrition-profile';
import { taskSettingsSchema, scheduledDraftExample } from '@/lib/domain/task-settings';
import type { ApiKeyDto } from '@/lib/services/api-key-service';
function sent(fetch: { mock: { calls: unknown[][] } }, index = 0) {
  return JSON.parse((fetch.mock.calls[index]![1] as RequestInit).body as string);
}
const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status }));
const profile: NutritionProfileSettingsValue = {
  id: '22222222-2222-4222-8222-222222222222',
  version: 1,
  dateOfBirth: '1990-01-01',
  heightCentimeters: 182.88,
  currentWeightKilograms: 80,
  measurementSystem: 'metric',
  referenceSexCategory: 'male',
  activityLevel: 'moderate',
  nutritionGoalType: 'none',
  targetWeightKilograms: 90,
  targetDate: null,
  explicitlyEnteredLifeStage: null,
  dietaryPreferences: [],
  foodAllergies: [],
  dietaryExclusions: [],
  estimatedTargetsEnabled: true,
  estimatedTargetConsent: true,
  weightTrackingEnabled: true,
  preferredEnergyUnit: 'kcal',
  dailyResetTimezone: 'America/Chicago',
  weekStartsOn: 1,
  referenceJurisdiction: 'US',
  visibleNutrientCodes: ['fiber'],
  trendRangeDays: 7,
  showPlannedNutrition: true,
  showRecipeCardNutrition: true,
  recipeCardNutrientCodes: ['energy_kcal'],
  showMealPlanNutrition: true,
};
const definitions = [
  { code: 'fiber', displayName: 'Fiber', category: 'Macronutrients', canonicalUnit: 'g' },
  { code: 'energy_kcal', displayName: 'Calories', category: 'Energy', canonicalUnit: 'kcal' },
];
function nutrition(value = profile) {
  return render(
    createElement(NutritionProfileSettings, {
      profile: value,
      effectiveOn: '2026-10-19',
      nutrientDefinitions: definitions,
      personName: 'Avery',
    }),
  );
}
function openEstimates() {
  fireEvent.click(screen.getByText(/Optional estimates ·/));
}
beforeEach(() => {
  configure({ asyncUtilTimeout: 5000 });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('settings drafts and boundaries', () => {
  it('reports saved policy and failed summary generation beside the named summary action', async () => {
    const settings = {
      workloads: [],
      dataPolicy: { version: 1, summaryFrequency: 'off' },
      modelCatalog: [],
    };
    const fetch = vi
      .fn()
      .mockImplementationOnce(() =>
        json({ ...settings, dataPolicy: { ...settings.dataPolicy, version: 2 } }),
      )
      .mockImplementationOnce(() => json({ error: { message: 'Fixture provider failure' } }, 503));
    vi.stubGlobal('fetch', fetch);
    render(
      createElement(AiSettingsForm, {
        initialSettings: settings,
        privacyOnly: true,
        personName: 'Avery',
      }),
    );
    const action = within(screen.getByRole('group', { name: "Update Avery's summaries" }));
    fireEvent.click(action.getByRole('button', { name: 'Update summaries' }));
    await action.findByText(
      'Privacy and summary settings saved; summary updating failed. Fixture provider failure',
    );
    expect(fetch.mock.calls[1]?.[0]).toBe('/api/v1/ai/summaries?scope=account');
    expect(
      (
        screen.getByRole('button', {
          name: 'Save privacy and summary settings',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText('No unsaved privacy or summary settings')).toBeTruthy();
  });
  it('keeps a temporary numeric blank, freezes the submitted form and retains failures', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    render(
      createElement(RecipePreferencesForm, {
        initial: { defaultSort: 'alphabetical', defaultServings: 2 },
      }),
    );
    const input = screen.getByLabelText(/New recipe servings/);
    fireEvent.change(input, { target: { value: '' } });
    expect((input as HTMLInputElement).value).toBe('');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.submit(input.closest('form')!);
    fireEvent.submit(input.closest('form')!);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((input as HTMLInputElement).disabled || input.closest('fieldset')?.disabled).toBe(true);
    finish(Response.json({ error: { message: 'Could not be saved: conflict.' } }, { status: 409 }));
    await screen.findByText('Could not be saved: conflict.');
    expect((input as HTMLInputElement).value).toBe('4');
  });
  it('retains custom meal rows and separate generation defaults in the save payload', async () => {
    const initial = {
      ...DEFAULT_MEAL_PLAN_PREFERENCES,
      customMealTypes: [{ value: 'custom-tea', label: 'Afternoon tea' }],
      visibleMealTypes: ['dinner', 'custom-tea'],
    };
    const fetch = vi.fn(() => json({ preferences: { mealPlan: initial } }));
    vi.stubGlobal('fetch', fetch);
    render(createElement(MealPlanPreferencesForm, { initial }));
    expect(screen.getByLabelText('Afternoon tea')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Breakfast'));
    fireEvent.submit(screen.getByLabelText('Breakfast').closest('form')!);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const payload = sent(fetch);
    expect(payload.values.defaultMealTypes).toEqual(initial.defaultMealTypes);
    expect(payload.values.visibleMealTypes).toContain('custom-tea');
  });
  it('validates supported zones and preserves aliases outside the choices', () => {
    expect(validTimeZone('US/Central')).toBe(true);
    expect(validTimeZone('Not/AZone')).toBe(false);
    expect(validLocale('en-NZ')).toBe(true);
    expect(validLocale('zz-ZZ')).toBe(true);
    expect(validLocale('not a locale')).toBe(false);
    expect(
      nutritionProfileSettingsInputSchema.safeParse({ dailyResetTimezone: 'Not/AZone' }).success,
    ).toBe(false);
  });
  it('calculates prospective ranges using the schedule timezone and last scheduled day', () => {
    const settings = taskSettingsSchema.parse({
      weekday: 0,
      timezone: 'America/Chicago',
      days: 7,
      aheadDays: 1,
    });
    expect(scheduledDraftExample(settings, new Date('2026-11-01T15:00:00Z'))).toEqual({
      runDate: '2026-11-01',
      start: '2026-11-02',
      end: '2026-11-08',
    });
    expect(
      scheduledDraftExample(settings, new Date('2026-11-01T15:00:00Z'), '2026-11-01')?.runDate,
    ).toBe('2026-11-08');
  });
  it('converts the current measurement draft without remounting saved values or losing blanks', async () => {
    nutrition();
    openEstimates();
    fireEvent.change(screen.getByLabelText(/Height \(cm\)/), { target: { value: '195' } });
    fireEvent.change(screen.getByLabelText(/Target weight \(kg\)/), {
      target: { value: '108.86217' },
    });
    fireEvent.change(screen.getByLabelText(/Measurement system/), {
      target: { value: 'imperial' },
    });
    expect((screen.getByLabelText(/Target weight \(lb\)/) as HTMLInputElement).value).toBe('240');
    expect((screen.getByLabelText('Inches') as HTMLInputElement).value).not.toBe('12');
    fireEvent.change(screen.getByLabelText(/Measurement system/), { target: { value: 'metric' } });
    expect((screen.getByLabelText(/Height \(cm\)/) as HTMLInputElement).value).toBe('195');
    fireEvent.change(screen.getByLabelText(/Height \(cm\)/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Measurement system/), {
      target: { value: 'imperial' },
    });
    expect((screen.getByLabelText('Feet') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Inches') as HTMLInputElement).value).toBe('');
  });
  it('uses acknowledged versions after saving and keeps coverage choices while filtering', async () => {
    const fetch = vi.fn(() => json({ profile: { version: 2 } }));
    vi.stubGlobal('fetch', fetch);
    nutrition();
    fireEvent.change(screen.getByLabelText(/Dietary preferences/), {
      target: { value: 'Vegetarian' },
    });
    fireEvent.submit(screen.getByLabelText(/Dietary preferences/).closest('form')!);
    await screen.findByText("Avery's Nutrition preferences saved.");
    fireEvent.change(screen.getByLabelText(/Dietary preferences/), {
      target: { value: 'Vegetarian\nQuick meals' },
    });
    fireEvent.submit(screen.getByLabelText(/Dietary preferences/).closest('form')!);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(sent(fetch, 1).expectedVersion).toBe(2);
  });
  it('invalidates an estimate when its reviewed date changes without making an implicit request', async () => {
    const fetch = vi.fn(() =>
      json({
        action: 'previewed',
        estimate: {
          roundedKcal: 2200,
          exactKcal: 2200,
          formula: 'Fixture',
          sourceVersion: 'Mock source',
          sourceUrl: 'https://example.test',
          doi: '',
          disclosure: 'Fixture estimate',
        },
        currentEnergyGoals: [],
        goal: null,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    nutrition();
    openEstimates();
    fireEvent.change(screen.getByLabelText(/NASEM physical-activity category/), {
      target: { value: 'inactive' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview estimated maintenance calories' }));
    await screen.findByRole('button', { name: 'Apply reviewed estimate' });
    fireEvent.change(screen.getByLabelText(/Estimate effective date/), {
      target: { value: '2026-10-20' },
    });
    expect(screen.queryByRole('button', { name: 'Apply reviewed estimate' })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('binds restore availability to the requested validated archive after another review fails', async () => {
    const backups = ['a', 'b'].map((id) => ({
      id,
      createdAt: '2026-10-19T12:00:00Z',
      bytes: 1234,
    }));
    const fetch = vi.fn((url: string) =>
      url.endsWith('/a')
        ? json({
            backup: {
              ...backups[0],
              manifest: {
                applicationVersion: 'fixture',
                schemaVersion: 'test',
                createdAt: backups[0]!.createdAt,
                reason: 'manual',
                files: [],
              },
            },
          })
        : json({ error: { message: 'Invalid archive B' } }, 400),
    );
    vi.stubGlobal('fetch', fetch);
    render(
      createElement(BackupManager, {
        initialBackups: backups,
        storage: {
          directory: '/fixture',
          location: 'app-data',
          intervalHours: 24,
          retentionDays: 7,
        },
      }),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Review restore' })[0]!);
    await screen.findByRole('button', { name: 'Restore backup' });
    fireEvent.change(screen.getByLabelText(/Confirm replacement/), {
      target: { value: 'RESTORE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close restore review' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Review restore' })[1]!);
    await screen.findByText('Invalid archive B');
    expect(screen.queryByRole('button', { name: 'Restore backup' })).toBeNull();
  });
  it('blocks rotation from replacing an unacknowledged one-time secret', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const key = {
      id: 'dummy-key',
      name: 'Fixture key',
      start: 'bord_dummy',
      enabled: true,
      permissions: { recipes: ['read'] },
      expiresAt: null,
      createdAt: '2026-10-19T12:00:00Z',
    } as ApiKeyDto;
    const fetch = vi.fn(() =>
      json({ apiKey: { ...key, id: 'dummy-copy' }, secret: 'dummy-secret-not-a-credential' }),
    );
    vi.stubGlobal('fetch', fetch);
    render(
      createElement(ApiKeyManager, { initialKeys: [key], accountEmail: 'fixture@example.test' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    await screen.findByText('dummy-secret-not-a-credential');
    fireEvent.click(screen.getAllByRole('button', { name: 'Rotate' })[0]!);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('dummy-secret-not-a-credential')).toBeTruthy();
  });
  it('keeps general preferences, raw keywords and per-store drafts independent', async () => {
    const settings = {
      defaultSupermarketProfileId: 'a',
      completedItemsBehavior: 'completed_section' as const,
      openPantryPurchaseOnCheck: false,
      keepScreenAwake: false,
    };
    const profiles = ['a', 'b'].map((id) => ({
      id,
      name: `Store ${id.toUpperCase()}`,
      locationLabel: '',
      notes: '',
      archivedAt: null,
      sections: [{ id: `section-${id}`, aisleId: '', name: 'Produce', matchTerms: ['fruit'] }],
    }));
    const fetch = vi.fn(() => json({ settings, profiles }));
    vi.stubGlobal('fetch', fetch);
    render(createElement(ListSettingsManager, { initialWorkspace: { settings, profiles } }));
    fireEvent.click(screen.getByLabelText(/Keep the screen awake/));
    fireEvent.change(screen.getByRole('textbox', { name: /^Store name/ }), {
      target: { value: 'Draft store A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Store B/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /^Store name/ }), {
      target: { value: 'Draft store B' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Store A/ }));
    expect((screen.getByRole('textbox', { name: /^Store name/ }) as HTMLInputElement).value).toBe(
      'Draft store A',
    );
    fireEvent.click(screen.getByText('Route details · 1'));
    const keywords = screen.getByLabelText('Section 1 keywords');
    fireEvent.change(keywords, { target: { value: 'fruit, ' } });
    expect((keywords as HTMLTextAreaElement).value).toBe('fruit, ');
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft store A' }));
    await screen.findByText('Supermarket saved.');
    expect((screen.getByLabelText(/Keep the screen awake/) as HTMLInputElement).checked).toBe(true);
    expect(sent(fetch).sections[0].matchTerms).toEqual(['fruit']);
  });
  it('lets an imported route draft be undone before saving the store', () => {
    const settings = {
      defaultSupermarketProfileId: null,
      completedItemsBehavior: 'hide' as const,
      openPantryPurchaseOnCheck: false,
      keepScreenAwake: false,
    };
    render(createElement(ListSettingsManager, { initialWorkspace: { settings, profiles: [] } }));
    const before = (screen.getByLabelText('Section 1 name') as HTMLInputElement).value;
    fireEvent.click(screen.getByRole('button', { name: 'Import map fixture' }));
    expect((screen.getByLabelText('Section 1 name') as HTMLInputElement).value).toBe(
      'Imported produce',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo route import' }));
    expect((screen.getByLabelText('Section 1 name') as HTMLInputElement).value).toBe(before);
  });
  it('keeps an exact estimate Apply operation through an uncertain response', async () => {
    const operations: Array<Record<string, unknown>> = [];
    const estimate = {
      roundedKcal: 2200,
      exactKcal: 2200,
      formula: 'Fixture',
      sourceVersion: 'Mock',
      sourceUrl: 'https://example.test',
      doi: '',
      disclosure: 'Fixture',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.action === 'preview')
          return Response.json({
            action: 'previewed',
            estimate,
            currentEnergyGoals: [],
            goal: null,
          });
        operations.push(body);
        if (operations.length === 1) throw new TypeError('Fixture connection lost');
        return Response.json({
          action: 'applied',
          estimate,
          currentEnergyGoals: [],
          goal: { id: 'fixture-goal' },
        });
      }),
    );
    nutrition();
    openEstimates();
    fireEvent.change(screen.getByLabelText(/NASEM physical-activity category/), {
      target: { value: 'inactive' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview estimated maintenance calories' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apply reviewed estimate' }));
    await screen.findByText(/An exact Apply retry keeps the same operation/);
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed estimate' }));
    await screen.findByRole('button', { name: 'Goal saved' });
    expect(operations).toHaveLength(2);
    expect(operations[1]).toEqual(operations[0]);
    expect(operations[0]).toMatchObject({
      effectiveOn: '2026-10-19',
      palCategory: 'inactive',
      expectedProfileVersion: 1,
    });
  });
  it('retains selected nutrient codes while searching and when compact facts is off', async () => {
    const fetch = vi.fn(() => json({ profile: { version: 2 } }));
    vi.stubGlobal('fetch', fetch);
    nutrition();
    fireEvent.click(screen.getAllByText('Choose nutrients')[0]!);
    fireEvent.change(screen.getAllByLabelText('Search nutrients')[0]!, {
      target: { value: 'no matches fixture' },
    });
    expect(screen.getByRole('button', { name: 'Remove Fiber' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Show compact Nutrition facts/));
    fireEvent.submit(screen.getByLabelText(/Show compact Nutrition facts/).closest('form')!);
    await screen.findByText("Avery's Nutrition preferences saved.");
    expect(sent(fetch).settings).toMatchObject({
      visibleNutrientCodes: ['fiber'],
      recipeCardNutrientCodes: ['energy_kcal'],
      showRecipeCardNutrition: false,
    });
  });
  it('requires an explicit role action and preserves independent identity edits', async () => {
    const person = {
      id: 'fixture-person',
      displayName: 'Avery',
      color: '#637A45',
      avatarUrl: null,
      units: 'metric' as const,
      temperatureUnit: 'C' as const,
      locale: 'en-GB',
      timezone: 'Europe/London',
      mainGoals: '',
      goalContext: defaultProfileGoalContext,
      archivedAt: null,
      role: 'parent' as const,
      isLastAdmin: false,
    };
    const role = vi.fn(async () => true);
    const save = vi.fn(async () => undefined);
    render(
      createElement(ProfileEditor, {
        profile: person,
        active: false,
        onSave: save,
        onRoleChange: role,
        onArchive: vi.fn(),
      }),
    );
    fireEvent.change(screen.getByLabelText(/Display name/), { target: { value: 'Avery draft' } });
    fireEvent.change(screen.getByLabelText(/Access role/), { target: { value: 'child' } });
    expect(role).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update role' }));
    await waitFor(() => expect(role).toHaveBeenCalledWith(person, 'child'));
    expect((screen.getByLabelText(/Display name/) as HTMLInputElement).value).toBe('Avery draft');
    await screen.findByText(
      /Access role updated. Identity edits remain separate. Unsaved profile changes/,
    );
  });
  it('rolls a rejected role action back to the confirmed role without clearing identity', async () => {
    const person = {
      id: 'fixture-person',
      displayName: 'Avery',
      color: '#637A45',
      avatarUrl: null,
      units: 'metric' as const,
      temperatureUnit: 'C' as const,
      locale: 'en-GB',
      timezone: 'Europe/London',
      mainGoals: '',
      goalContext: defaultProfileGoalContext,
      archivedAt: null,
      role: 'parent' as const,
      isLastAdmin: false,
    };
    render(
      createElement(ProfileEditor, {
        profile: person,
        active: false,
        onSave: vi.fn(),
        onRoleChange: vi.fn(async () => {
          throw new Error('Fixture role conflict');
        }),
        onArchive: vi.fn(),
      }),
    );
    fireEvent.change(screen.getByLabelText(/Display name/), { target: { value: 'Avery draft' } });
    fireEvent.change(screen.getByLabelText(/Access role/), { target: { value: 'child' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update role' }));
    await screen.findAllByText('Fixture role conflict');
    expect((screen.getByLabelText(/Access role/) as HTMLSelectElement).value).toBe('parent');
    expect((screen.getByLabelText(/Display name/) as HTMLInputElement).value).toBe('Avery draft');
  });
  it('keeps a task-list loading failure distinct from a successful empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({ error: { message: 'Fixture tasks unavailable' } }, 503)),
    );
    render(
      createElement(TaskSettings, {
        initial: { settings: taskSettingsSchema.parse({}), version: 0, lastScheduledDate: null },
        profileId: profile.id,
        profiles: [{ id: profile.id, name: 'Avery' }],
        canEdit: true,
      }),
    );
    await screen.findByText(/Fixture tasks unavailable/);
    expect(screen.queryByText('No background tasks yet.')).toBeNull();
  });
  it('keeps time-zone validity after the form clears previous server feedback', () => {
    nutrition();
    fireEvent.click(screen.getByText('Advanced dates and reference defaults'));
    const zone = screen.getByLabelText(/Daily reset timezone/) as HTMLInputElement;
    fireEvent.change(zone, { target: { value: 'Not/AZone' } });
    expect(zone.checkValidity()).toBe(false);
    fireEvent.change(zone, { target: { value: 'US/Central' } });
    expect(zone.checkValidity()).toBe(true);
  });
  it('uses acknowledged saved body inputs for subsequent estimate readiness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({ profile: { version: 2, currentWeightKilograms: 80 } })),
    );
    nutrition({ ...profile, currentWeightKilograms: null });
    openEstimates();
    fireEvent.change(screen.getByLabelText(/NASEM physical-activity category/), {
      target: { value: 'inactive' },
    });
    expect(
      (
        screen.getByRole('button', {
          name: 'Preview estimated maintenance calories',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText(/Dietary preferences/), {
      target: { value: 'Fixture draft' },
    });
    fireEvent.submit(screen.getByLabelText(/Dietary preferences/).closest('form')!);
    await screen.findByText("Avery's Nutrition preferences saved.");
    expect(
      (
        screen.getByRole('button', {
          name: 'Preview estimated maintenance calories',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});

function render(ui: Parameters<typeof baseRender>[0]) {
  return baseRender(ui, { wrapper: ToastProvider });
}
