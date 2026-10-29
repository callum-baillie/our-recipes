// @vitest-environment jsdom
import { createElement } from 'react';
import { ToastProvider } from '@/components/toast-provider';
import {
  cleanup,
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfileInput } from '@/lib/domain/setup';
import { defaultProfileGoalContext } from '@/lib/domain/profile-goals';
import { buildNutritionChartDatasets, type ChartGoal } from '@/lib/domain/nutrition-chart-datasets';
import {
  NutritionProfileSettings,
  type NutritionProfileSettingsValue,
} from '@/components/nutrition-profile-settings';
import { NutritionGoalDialog } from '@/components/nutrition-goal-dialog';
import { NutritionRecordForm } from '@/components/nutrition-recording';
import {
  NutritionPreparedWorkspace,
  type PreparedServingWorkspace,
} from '@/components/nutrition-prepared-workspace';
import { ListSettingsManager } from '@/components/list-settings-manager';
import { KitchenInterview } from '@/components/kitchen-interview';
import { AccountSecurityForm } from '@/components/account-security-form';
import { OnboardingChat } from '@/components/onboarding-chat/onboarding-chat';
import { ProfileSettings, type Profile } from '@/components/profile-settings';
async function answerText(label: string, value: string) {
  const field = await screen.findByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.submit(field.closest('form')!);
}
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/components/passkey-settings', () => ({ PasskeySettings: () => null }));
vi.mock('@/lib/auth/client', () => ({ authClient: {} }));
const person = {
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Avery',
  profileType: 'adult',
  relationship: 'owner',
  canViewDiary: true,
  canViewMeasurements: true,
  canManageGoals: true,
  canManageProfile: true,
  dailyResetTimezone: 'UTC',
  measurementSystem: 'metric' as const,
};
const profile: NutritionProfileSettingsValue = {
  ...person,
  version: 3,
  dateOfBirth: '1990-01-01',
  heightCentimeters: 180,
  currentWeightKilograms: 80,
  referenceSexCategory: 'male',
  activityLevel: 'moderate',
  nutritionGoalType: 'loss',
  targetWeightKilograms: 75,
  targetDate: null,
  explicitlyEnteredLifeStage: null,
  dietaryPreferences: [],
  foodAllergies: [],
  dietaryExclusions: [],
  estimatedTargetsEnabled: true,
  estimatedTargetConsent: true,
  weightTrackingEnabled: true,
  preferredEnergyUnit: 'kcal',
  weekStartsOn: 1,
  referenceJurisdiction: 'US',
  visibleNutrientCodes: ['energy_kcal'],
  trendRangeDays: 7,
  showPlannedNutrition: true,
  showRecipeCardNutrition: true,
  recipeCardNutrientCodes: ['energy_kcal'],
  showMealPlanNutrition: true,
};
const definitions = [
  { code: 'energy_kcal', displayName: 'Calories', canonicalUnit: 'kcal', category: 'energy' },
];
const member: Profile = {
  ...defaultProfileInput,
  id: 'household-a',
  displayName: 'Avery',
  avatarUrl: null,
  mainGoals: '',
  goalContext: {
    ...defaultProfileGoalContext,
    kitchenInterview: {
      taste: 'Saved savoury preference',
      snacks: '',
      desserts: '',
      routine: '',
      favorites: '',
      avoid: '',
    },
  },
  archivedAt: null,
  role: 'admin',
  isLastAdmin: true,
};
const context = {
  profile: person,
  profiles: [person],
  definitions,
  date: '2026-10-18',
  today: '2026-10-19',
  workspace: { products: [], recipes: [] },
};
const json = (value: object, status = 200) => Promise.resolve(Response.json(value, { status }));
const sent = (fetcher: ReturnType<typeof vi.fn>, index = 0) =>
  JSON.parse(fetcher.mock.calls[index]![1].body);
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  // Automated browsers get the chat without its artificial typing pauses.
  Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('settings and Nutrition unresolved behavioral regressions', () => {
  for (const [field, label] of [
    ['estimatedTargetsEnabled', 'Allow optional estimates using saved inputs'],
    [
      'estimatedTargetConsent',
      'I explicitly consent to using the entered values for a documented estimate',
    ],
  ] as const)
    it(`${field} alone marks preferences dirty, invalidates preview and saves its actual value`, async () => {
      const fetcher = vi
        .fn()
        .mockImplementation((_url, init) =>
          json({ profile: { ...profile, ...JSON.parse(init.body).settings, version: 4 } }),
        );
      vi.stubGlobal('fetch', fetcher);
      render(
        createElement(NutritionProfileSettings, {
          profile,
          personName: 'Avery',
          effectiveOn: context.today,
          nutrientDefinitions: definitions,
        }),
      );
      fireEvent.click(screen.getByText(/Optional estimates ·/));
      const save = screen.getByRole('button', {
        name: "Save Avery's preferences",
      }) as HTMLButtonElement;
      await waitFor(() => expect(save.disabled).toBe(true));
      fireEvent.click(screen.getByLabelText(new RegExp(label)));
      await waitFor(() => expect(save.disabled).toBe(false));
      expect(
        (screen.getByRole('button', { name: /Preview estimated maintenance/ }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      fireEvent.click(save);
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      expect(sent(fetcher).settings[field]).toBe(false);
      await waitFor(() => expect(save.disabled).toBe(true));
      fireEvent.click(screen.getByLabelText(new RegExp(label)));
      await waitFor(() => expect(save.disabled).toBe(false));
    });

  it('keeps goal coverage as ambiguous for conflicting dated goals without success bars', () => {
    const base: ChartGoal = {
      id: 'a',
      nutrientCode: 'energy_kcal',
      kind: 'target',
      value: 50,
      minimum: null,
      maximum: null,
      unit: 'kcal',
      sourceType: 'user_defined',
      state: 'active',
      startsOn: '2026-01-01',
      endsOn: null,
    };
    const result = buildNutritionChartDatasets({
      profileLabel: 'Avery',
      date: context.today,
      confirmed: { energy_kcal: 75 },
      planned: {},
      recentCompleteness: null,
      goals: [base, { ...base, id: 'b', value: 100 }],
    });
    expect(result.comparisons.energy_kcal!.status).toBe('ambiguous_goal');
    expect(result.coverage.map((row) => row.status)).toEqual(['ambiguous_goal', 'ambiguous_goal']);
    expect(
      result.coverage.every(
        (row) =>
          row.ratio === null && row.comparison === result.comparisons.energy_kcal!.description,
      ),
    ).toBe(true);
  });

  it('never silently converts a retained estimated goal to manual after its activity changes', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        estimate: { roundedKcal: 2200, palCategory: 'low_active', effectiveOn: context.today },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(NutritionGoalDialog, {
        profile: person,
        definitions,
        goals: [],
        today: context.today,
        open: true,
        onClose: vi.fn(),
        onSaved: vi.fn(),
        goalSetup: {
          nutritionGoalType: 'loss',
          currentWeightKilograms: 80,
          targetWeightKilograms: 75,
          targetDate: null,
          profileVersion: 3,
        },
      }),
    );
    fireEvent.click(screen.getByText('Review an estimate from the saved weight direction'));
    fireEvent.click(screen.getByRole('button', { name: /Calculate a planning preview/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Use reviewed estimate in the draft' }),
    );
    expect((screen.getByLabelText('Value (kcal)') as HTMLInputElement).value).toBe('1950');
    fireEvent.change(screen.getByLabelText('Activity for this estimate'), {
      target: { value: 'active' },
    });
    expect((screen.getByRole('button', { name: 'Save goal' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.submit(screen.getByRole('button', { name: 'Save goal' }).closest('form')!);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Convert this draft to a manual goal' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Save goal' }).closest('form')!);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(sent(fetcher, 1).goal).toMatchObject({ sourceType: 'user_defined', value: 1950 });
  });

  it('keeps saved kitchen answers separate from an interrupted questionnaire draft', async () => {
    render(createElement(KitchenInterview, { profile: member }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit guided questionnaire' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit taste' }));
    fireEvent.change(screen.getByLabelText(/Do you lean sweet/), {
      target: { value: 'Unsaved sweet preference' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByText('Your saved kitchen context'));
    expect(screen.getByText('Saved savoury preference')).toBeTruthy();
    expect(screen.queryByText('Unsaved sweet preference')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume unsaved questionnaire' }));
    expect((screen.getByLabelText(/Do you lean sweet/) as HTMLTextAreaElement).value).toBe(
      'Unsaved sweet preference',
    );
  });

  it('requires explicit review before replacing kitchen answers changed in another tab', async () => {
    const current = { ...member.goalContext.kitchenInterview!, taste: 'Newly saved taste' };
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ interview: current, revision: 'latest' }));
    vi.stubGlobal('fetch', fetcher);
    render(createElement(KitchenInterview, { profile: member }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit guided questionnaire' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit taste' }));
    fireEvent.change(screen.getByLabelText(/Do you lean sweet/), {
      target: { value: 'My retained draft' },
    });
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save context' }));
    await screen.findByRole('region', { name: 'Compare concurrent changes' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Use current saved value: Newly saved taste')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Keep my edit: My retained draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use reviewed draft' }));
    fetcher.mockImplementation((_url, init) =>
      json(init?.method === 'PATCH' ? {} : { interview: current, revision: 'latest' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save context' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toMatchObject({
      expectedRevision: 'latest',
      interviewPatch: { taste: 'My retained draft' },
    });
  });

  it('switches stores without saving a default or discarding either draft', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(ListSettingsManager, {
        initialWorkspace: {
          settings: {
            defaultSupermarketProfileId: 'a',
            completedItemsBehavior: 'completed_section',
            openPantryPurchaseOnCheck: false,
            keepScreenAwake: false,
          },
          profiles: ['a', 'b'].map((id) => ({
            id,
            name: `Store ${id}`,
            locationLabel: '',
            notes: '',
            archivedAt: null,
            sections: [{ aisleId: `aisle-${id}`, name: 'Produce', matchTerms: [] }],
          })),
        },
      }),
    );
    const selection = screen.getByLabelText('Currently editing');
    fireEvent.change(screen.getByLabelText(/^Store name/), { target: { value: 'First draft' } });
    fireEvent.change(selection, { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText(/^Store name/), { target: { value: 'Second draft' } });
    fireEvent.change(selection, { target: { value: 'a' } });
    expect((screen.getByLabelText(/^Store name/) as HTMLInputElement).value).toBe('First draft');
    fireEvent.change(selection, { target: { value: 'b' } });
    expect((screen.getByLabelText(/^Store name/) as HTMLInputElement).value).toBe('Second draft');
    expect((screen.getByLabelText(/^Default for new lists/) as HTMLSelectElement).value).toBe('a');
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(
      true,
    );
  });

  it('sends only household identity fields when a name is saved', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ profile: { ...member, displayName: 'Avery renamed' } }));
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(ProfileSettings, {
        initialProfiles: [member],
        initialGuardians: [],
        activeProfileId: member.id,
      }),
    );
    fireEvent.click(screen.getByText('Avery', { selector: 'summary strong' }));
    fireEvent.change(screen.getByLabelText(/Display name/), { target: { value: 'Avery renamed' } });
    fireEvent.submit(screen.getByLabelText(/Display name/).closest('form')!);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(sent(fetcher)).toEqual({
      scope: 'identity',
      displayName: 'Avery renamed',
      color: member.color,
      avatarUrl: '',
    });
  });
  it('names each guardian pair and keeps immediate-save feedback separate from identity drafts', async () => {
    let acknowledge!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            acknowledge = resolve;
          }),
      )
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(ProfileSettings, {
        initialProfiles: [
          { ...member, role: 'admin' },
          { ...member, id: 'household-child', displayName: 'Casey', role: 'child' },
        ],
        initialGuardians: [],
        activeProfileId: member.id,
      }),
    );
    expect(screen.getByText(/Each switch saves immediately/)).toBeTruthy();
    const access = screen.getByRole('switch', { name: /Avery’s access to Casey/ });
    fireEvent.click(access);
    expect((access as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Saving Avery’s access to Casey…')).toBeTruthy();
    acknowledge(
      Response.json({ error: { message: 'Controlled access conflict' } }, { status: 409 }),
    );
    await waitFor(() => expect(screen.getByText('Controlled access conflict')).toBeTruthy());
    expect((access as HTMLInputElement).checked).toBe(false);
    expect(sent(fetcher)).toEqual({
      parentProfileId: member.id,
      childProfileId: 'household-child',
      enabled: true,
    });
    fireEvent.click(access);
    await waitFor(() =>
      expect(screen.getByText('Avery’s Nutrition access to Casey granted.')).toBeTruthy(),
    );
    expect((access as HTMLInputElement).checked).toBe(true);
  });

  it('keeps transport/password service failures general, with fields associated only for known codes', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Connection interrupted'))
      .mockResolvedValueOnce(
        Response.json({ code: 'INVALID_PASSWORD', message: 'Invalid password' }, { status: 400 }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(createElement(AccountSecurityForm));
    fireEvent.change(screen.getByLabelText(/^Current password/), {
      target: { value: 'old-passphrase' },
    });
    fireEvent.change(screen.getByLabelText(/^New password/), {
      target: { value: 'new-passphrase' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), {
      target: { value: 'new-passphrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await screen.findByText('Connection interrupted');
    expect(screen.getByLabelText(/^Current password/).getAttribute('aria-invalid')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await screen.findByText('Invalid password');
    expect(screen.getByLabelText(/^Current password/).getAttribute('aria-invalid')).toBe('true');
  });

  it('protects entered onboarding answers and ties a blank name to the actual field', async () => {
    const changed = vi.fn();
    render(createElement(OnboardingChat, { mode: 'profile', onDismissStateChange: changed }));
    const field = await screen.findByLabelText('Display name');
    await waitFor(() => expect(changed.mock.lastCall?.[0].dirty).toBe(false));
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.submit(field.closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toMatch(/needed to continue/);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
    expect(changed.mock.lastCall?.[0].dirty).toBe(false);
    fireEvent.change(field, { target: { value: 'Jon' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(() => expect(changed.mock.lastCall?.[0].dirty).toBe(true));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });

  it('asks for access role and profile type only when an admin adds another profile', async () => {
    render(createElement(OnboardingChat, { mode: 'profile' }));
    await answerText('Display name', 'Jon');
    await answerText('Email', 'jon@example.test');
    await answerText('Passphrase', 'synthetic fixture passphrase');
    expect(await screen.findByRole('button', { name: /Admin/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Child/ }));
    // A child profile is always a dependent, so the profile-type question is skipped.
    expect(await screen.findByRole('button', { name: 'US customary' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Dependent/ })).toBeNull();
  });

  it('keeps initial setup recovery completion visible until the codes are acknowledged', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        firstRecipeId: 'example-fixture',
        recoveryCodes: [
          { profileId: 'fixture-person', codes: ['DUMMY-NOT-A-VALID-RECOVERY-CODE'] },
        ],
        requiresEmailVerification: false,
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    render(createElement(OnboardingChat, { mode: 'initial' }));
    await answerText('Kitchen name', 'Fixture kitchen');
    fireEvent.click(await screen.findByRole('button', { name: 'Use this icon' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Looks good' }));
    await answerText('Display name', 'Avery');
    await answerText('Email', 'fixture@example.test');
    await answerText('Passphrase', 'synthetic fixture passphrase');
    fireEvent.click(await screen.findByRole('button', { name: 'US customary' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fahrenheit' }));
    fireEvent.click(await screen.findByRole('button', { name: /Set up nutrition later/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    fireEvent.click(await screen.findByRole('button', { name: /Use Example recipe/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'That’s everyone for now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Stovies & open recipe' }));
    await screen.findByRole('heading', { name: 'Save your recovery codes' });
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    const finish = screen.getByRole('button', { name: 'Continue to sign in' });
    expect((finish as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(finish);
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('I saved these one-time codes somewhere private.'));
    fireEvent.click(finish);
    expect(router.push).toHaveBeenCalledWith(
      '/sign-in?setup=1&callbackUrl=%2Frecipes%2Fexample-fixture',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Sign-in details reach only the setup route, never an AI route.
    expect(String(fetcher.mock.calls[0]![0])).toBe('/api/v1/setup');
  });

  it('links an advanced measurement validation error to its retained field', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(createElement(NutritionRecordForm, { ...context, mode: 'weight' }));
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '12:00' } });
    fireEvent.click(screen.getByText(/Additional measurements/));
    const field = screen.getByLabelText('Fat-free body weight (kg)');
    fireEvent.change(field, { target: { value: '80' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(field.getAttribute('aria-describedby')!)?.textContent).toMatch(
      /weight/,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('offers the completed copy destination through the existing verified profile switch', async () => {
    const recipient = {
      ...person,
      id: '33333333-3333-4333-8333-333333333333',
      linkedHouseholdProfileId: 'household-b',
      displayName: 'Rowan',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ result: { revisionIds: ['entry'] } })),
    );
    const navigate = vi.fn();
    window.addEventListener('bord:open-profile-diary', navigate);
    render(
      createElement(NutritionRecordForm, {
        ...context,
        profiles: [person, recipient],
        mode: 'copy',
      }),
    );
    fireEvent.change(screen.getByLabelText('Destination person'), {
      target: { value: recipient.id },
    });
    fireEvent.submit(screen.getByLabelText('Destination person').closest('form')!);
    fireEvent.click(await screen.findByRole('button', { name: /Open Rowan’s diary/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect((navigate.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      householdProfileId: 'household-b',
      date: context.date,
    });
    window.removeEventListener('bord:open-profile-diary', navigate);
  });

  for (const edited of [false, true])
    it(`reconciles prepared allocation versions with ${edited ? 'review for an edited' : 'automatic refresh for an untouched'} consumption draft`, async () => {
      const allocation = {
        id: 'old',
        seriesId: 'series',
        revision: 1,
        state: 'served' as const,
        servings: 1,
        portionWeightGrams: null,
        intakeSeriesId: null,
        note: '',
      };
      const batch: PreparedServingWorkspace[number] = {
        id: 'prepared',
        recipeNameSnapshot: 'Soup',
        actualServings: 4,
        finalWeightGrams: null,
        calculationAlignment: 'as_calculated',
        note: '',
        assignedServings: 1,
        remainingServings: 3,
        overallocatedServings: 0,
        confidence: 1,
        completeness: 1,
        ownAllocations: [allocation],
      };
      const props = {
        activeProfileId: person.id,
        activeProfileName: person.displayName,
        canManageProfile: true,
        date: context.date,
        today: context.today,
        timeZone: 'UTC',
        workspace: [batch],
      };
      const view = render(createElement(NutritionPreparedWorkspace, props));
      fireEvent.click(screen.getByText('Confirm this portion was eaten'));
      const form = screen.getAllByLabelText('Servings eaten')[0]!.closest('form')!;
      if (edited)
        fireEvent.change(within(form).getByLabelText('Servings eaten'), {
          target: { value: '0.5' },
        });
      view.rerender(
        createElement(NutritionPreparedWorkspace, {
          ...props,
          workspace: [
            {
              ...batch,
              ownAllocations: [
                { ...allocation, id: 'new', revision: 2, state: 'leftover', servings: 2 },
              ],
            },
          ],
        }),
      );
      if (edited) {
        expect(
          (within(form).getByRole('button', { name: 'Confirm eaten' }) as HTMLButtonElement)
            .disabled,
        ).toBe(true);
        fireEvent.click(
          within(form).getByRole('button', { name: 'Use current version and keep my entries' }),
        );
      }
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          Response.json({ allocation: { id: 'eaten', seriesId: 'series', revision: 3 } }),
        );
      vi.stubGlobal('fetch', fetcher);
      fireEvent.change(within(form).getByLabelText('Time'), { target: { value: '12:00' } });
      fireEvent.submit(form);
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      expect(sent(fetcher)).toMatchObject({
        supersedesAllocationVersionId: 'new',
        servingCount: edited ? 0.5 : 2,
      });
    });
});

function render(ui: Parameters<typeof baseRender>[0]) {
  return baseRender(ui, { wrapper: ToastProvider });
}
