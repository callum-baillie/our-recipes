// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiRuntimeSettingsForm } from '@/components/ai-runtime-settings-form';
import { AiSettingsForm } from '@/components/ai-settings-form';
import { AiPromptSettings } from '@/components/ai-prompt-settings';
import { NutritionProfileSettings } from '@/components/nutrition-profile-settings';
import { TaskSettings } from '@/components/task-settings';
import { PersonalProfileSettings } from '@/components/personal-profile-settings';
import { aiRuntimeSchema, aiUserPreferencesSchema } from '@/lib/domain/ai-runtime-settings';
import { nutritionProfileSettingsInputSchema } from '@/lib/domain/nutrition-profile';
import { taskSettingsSchema } from '@/lib/domain/task-settings';
import { defaultProfileInput, personalProfileValues } from '@/lib/domain/setup';
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/account' }));
vi.mock('@/components/toast-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/toast-provider')>()),
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/lib/auth/client', () => ({ authClient: {} }));
vi.mock('@/components/passkey-settings', () => ({ PasskeySettings: () => null }));
const json = (value: object, status = 200) => Promise.resolve(Response.json(value, { status }));
const payloads = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls
    .filter(([, init]) => init?.method === 'PATCH')
    .map(([, init]) => JSON.parse(init.body));
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(fn, 0));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('post-review settings recovery', { timeout: 15_000 }, () => {
  it('combines personal instructions with an untouched newer model and preserves another conflict until reviewed again', async () => {
    const global = aiRuntimeSchema.parse({});
    const workload = {
      workload: 'chat' as const,
      model: 'gpt-6-luna',
      reasoningEffort: 'low' as const,
      enabled: true,
      version: 1,
    };
    const personal = aiUserPreferencesSchema.parse({
      instructions: 'Short',
      workloads: [workload],
    });
    const latest = {
      global,
      workloads: [workload],
      account: {
        version: 2,
        preferences: {
          ...personal,
          workloads: [{ ...workload, model: 'gpt-6.1-sol', reasoningEffort: 'high' }],
        },
      },
    };
    const newer = {
      ...latest,
      account: {
        version: 3,
        preferences: {
          ...latest.account.preferences,
          processing: { executionMode: 'batch', batchMinItems: 8 },
        },
      },
    };
    let patches = 0;
    let reads = 0;
    const fetcher = vi.fn((_url, init) =>
      init?.method === 'PATCH'
        ? ++patches < 3
          ? json({ error: { message: 'Concurrent defaults' } }, 409)
          : json({
              ...newer,
              account: { version: 4, preferences: JSON.parse(init.body).preferences },
            })
        : json(++reads === 1 ? latest : newer),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(AiRuntimeSettingsForm, {
        global,
        workloads: [workload],
        personal,
        version: 1,
        enabled: true,
      }),
    );
    fireEvent.change(screen.getByLabelText(/Response style and planning preferences/), {
      target: { value: 'Use concise lists' },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      fireEvent.click(screen.getByRole('button', { name: 'Save my AI defaults' }));
      await screen.findByText('Concurrent defaults');
      fireEvent.click(screen.getByRole('button', { name: 'Load current settings' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Use reviewed draft' }));
    }
    expect(payloads(fetcher)[1]).toMatchObject({
      version: 2,
      preferences: {
        instructions: 'Use concise lists',
        workloads: [{ model: 'gpt-6.1-sol', reasoningEffort: 'high' }],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save my AI defaults' }));
    await waitFor(() => expect(patches).toBe(3));
    expect(payloads(fetcher)[2]).toMatchObject({
      version: 3,
      preferences: {
        instructions: 'Use concise lists',
        processing: { executionMode: 'batch', batchMinItems: 8 },
      },
    });
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('/api/v1/ai/settings'))).toBe(
      true,
    );
  });
  it('shared defaults preserve newer account access and workload values while resolving overlapping operational limits', async () => {
    const global = aiRuntimeSchema.parse({});
    const workload = {
      workload: 'chat' as const,
      model: 'gpt-6-luna',
      reasoningEffort: 'low' as const,
      enabled: true,
      version: 1,
    };
    const account = { id: 'account-1', name: 'Avery', role: 'parent', enabled: true, version: 1 };
    const latest = {
      settings: { ...global, maxOutputTokens: 1024, requestTimeoutSeconds: 60 },
      workloads: [{ ...workload, model: 'gpt-6.1-sol', reasoningEffort: 'high', version: 2 }],
      users: [{ ...account, enabled: false, version: 3 }],
      version: 2,
    };
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => json({ error: { message: 'Shared changed' } }, 409))
      .mockImplementationOnce(() => json(latest))
      .mockImplementationOnce((_url, init) =>
        json({ ...latest, settings: JSON.parse(init.body).settings, version: 3 }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(AiRuntimeSettingsForm, {
        global,
        workloads: [workload],
        accounts: [account],
        version: 1,
      }),
    );
    fireEvent.change(screen.getByLabelText(/Maximum response tokens/), {
      target: { value: '2048' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save global AI settings/ }));
    await screen.findByText('Shared changed');
    fireEvent.click(screen.getByRole('button', { name: 'Load current settings' }));
    const review = await screen.findByRole('button', { name: 'Use reviewed draft' });
    expect((review as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Keep my edit: 2048' }));
    fireEvent.click(review);
    fireEvent.click(screen.getByRole('button', { name: /Save global AI settings/ }));
    await waitFor(() => expect(payloads(fetcher)).toHaveLength(2));
    expect(payloads(fetcher)[1]).toMatchObject({
      version: 2,
      settings: { maxOutputTokens: 2048, requestTimeoutSeconds: 60 },
      workloads: [{ model: 'gpt-6.1-sol', reasoningEffort: 'high', version: 2 }],
      users: [{ id: 'account-1', enabled: false, version: 3 }],
    });
  });
  it('shows frequency as a valued overlap, retains independent sharing and retries failed current reads without losing the draft', async () => {
    const initial = {
      workloads: [],
      modelCatalog: [],
      dataPolicy: {
        version: 1,
        summaryFrequency: 'off',
        sharePantry: false,
        shareMealPlans: false,
      },
    };
    const latest = {
      ...initial,
      dataPolicy: {
        ...initial.dataPolicy,
        version: 2,
        summaryFrequency: 'weekly',
        shareMealPlans: true,
      },
    };
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => json({ error: { message: 'Privacy changed' } }, 409))
      .mockRejectedValueOnce(new TypeError('Current settings offline'))
      .mockImplementationOnce(() => json(latest))
      .mockImplementationOnce((_url, init) =>
        json({ ...latest, dataPolicy: { ...JSON.parse(init.body).dataPolicy, version: 3 } }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(createElement(AiSettingsForm, { initialSettings: initial, privacyOnly: true }));
    fireEvent.click(screen.getByLabelText(/Pantry stock/));
    fireEvent.change(screen.getByLabelText(/Update frequency/), { target: { value: 'daily' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save privacy and summary settings' }));
    await screen.findByText('Privacy changed');
    fireEvent.click(screen.getByRole('button', { name: 'Load current settings' }));
    await screen.findByText('Current settings offline');
    expect((screen.getByLabelText(/Update frequency/) as HTMLSelectElement).value).toBe('daily');
    fireEvent.click(screen.getByRole('button', { name: 'Load current settings' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Use current saved value: weekly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use reviewed draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save privacy and summary settings' }));
    await waitFor(() => expect(payloads(fetcher)).toHaveLength(2));
    expect(payloads(fetcher)[1].dataPolicy).toMatchObject({
      version: 2,
      summaryFrequency: 'weekly',
      sharePantry: true,
      shareMealPlans: true,
    });
  });
  it('Nutrition merges a retained goal with current consent and enablement, then submits the reviewed version without preview work', async () => {
    const profile = {
      ...nutritionProfileSettingsInputSchema.parse({
        visibleNutrientCodes: ['energy_kcal'],
        recipeCardNutrientCodes: ['energy_kcal'],
      }),
      id: '22222222-2222-4222-8222-222222222222',
      version: 1,
    };
    const latest = {
      ...profile,
      version: 2,
      estimatedTargetConsent: true,
      dailyResetTimezone: 'Europe/London',
    };
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => json({ error: { message: 'Nutrition changed' } }, 409))
      .mockImplementationOnce(() => json({ profile: latest }))
      .mockImplementationOnce((_url, init) =>
        json({ profile: { ...latest, ...JSON.parse(init.body).settings, version: 3 } }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(NutritionProfileSettings, {
        profile,
        effectiveOn: '2026-10-20',
        personName: 'Avery',
        nutrientDefinitions: [{ code: 'energy_kcal', displayName: 'Calories' }],
      }),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: "Save Avery's preferences" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
    fireEvent.change(screen.getByLabelText(/Nutrition goal type/), {
      target: { value: 'maintain' },
    });
    fireEvent.click(screen.getByRole('button', { name: "Save Avery's preferences" }));
    await screen.findByText('Nutrition changed');
    fireEvent.click(screen.getByRole('button', { name: 'Load current preferences' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use reviewed draft' }));
    fireEvent.click(screen.getByRole('button', { name: "Save Avery's preferences" }));
    await waitFor(() => expect(payloads(fetcher)).toHaveLength(2));
    expect(payloads(fetcher)[1]).toMatchObject({
      expectedVersion: 2,
      settings: {
        nutritionGoalType: 'maintain',
        estimatedTargetConsent: true,
        estimatedTargetsEnabled: false,
        dailyResetTimezone: 'Europe/London',
      },
    });
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/estimate'))).toBe(false);
  });
  it('schedule recovery retains local days and newer timezone without resending hidden processing preferences', async () => {
    const settings = taskSettingsSchema.parse({
      weeklyPlanEnabled: true,
      allowPaidGeneration: true,
    });
    const latest = {
      settings: {
        ...settings,
        timezone: 'Europe/London',
        executionMode: 'batch',
        batchMinItems: 9,
      },
      version: 2,
      lastScheduledDate: null,
    };
    let patches = 0;
    const fetcher = vi.fn((url, init) =>
      String(url).includes('/jobs')
        ? json({ jobs: [] })
        : init?.method === 'PATCH'
          ? ++patches === 1
            ? json({ error: { message: 'Schedule changed' } }, 409)
            : json({
                ...latest,
                settings: { ...latest.settings, ...JSON.parse(init.body).settings },
                version: 3,
              })
          : json(latest),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(TaskSettings, {
        initial: { settings, version: 1, lastScheduledDate: null },
        profileId: 'person',
        profiles: [{ id: 'person', name: 'Avery' }],
        canEdit: true,
      }),
    );
    fireEvent.change(screen.getByLabelText(/Days to plan/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await screen.findByText('Schedule changed');
    fireEvent.click(screen.getByRole('button', { name: 'Load current schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use reviewed draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(patches).toBe(2));
    expect(payloads(fetcher)[1]).toMatchObject({
      expectedVersion: 2,
      settings: { days: 3, timezone: 'Europe/London' },
    });
    expect(payloads(fetcher)[1].settings).not.toHaveProperty('executionMode');
    expect(payloads(fetcher)[1].settings).not.toHaveProperty('batchMinItems');
  });
  it('personal form submits scoped fields and merges fresh general preferences while retaining questionnaire context', async () => {
    const profile = {
      ...personalProfileValues({ ...defaultProfileInput, displayName: 'Avery' }),
      id: 'person',
      archivedAt: null,
      role: 'parent' as const,
      isLastAdmin: false,
      goalContext: {
        ...personalProfileValues({ ...defaultProfileInput, displayName: 'Avery' }).goalContext,
        kitchenInterview: {
          taste: 'Old',
          snacks: '',
          desserts: '',
          routine: '',
          favorites: '',
          avoid: '',
        },
      },
    };
    const current = {
      ...profile,
      locale: 'fr-FR',
      goalContext: {
        ...profile.goalContext,
        kitchenInterview: { ...profile.goalContext.kitchenInterview, taste: 'Fresh' },
      },
    };
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => json({ error: { message: 'Profile changed' } }, 409))
      .mockImplementationOnce(() => json({ profile: current, revision: 'b'.repeat(64) }))
      .mockImplementationOnce((_url, init) =>
        json({
          profile: {
            ...current,
            ...JSON.parse(init.body).settings,
            goalContext: current.goalContext,
          },
          revision: 'c'.repeat(64),
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(createElement(PersonalProfileSettings, { profile, revision: 'a'.repeat(64) }));
    fireEvent.change(screen.getByLabelText(/^Display name/), {
      target: { value: 'Avery renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findAllByText('Profile changed');
    fireEvent.click(screen.getByRole('button', { name: 'Load current profile' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use reviewed draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(payloads(fetcher)).toHaveLength(2));
    expect(payloads(fetcher)[1]).toMatchObject({
      expectedRevision: 'b'.repeat(64),
      settings: { displayName: 'Avery renamed', locale: 'fr-FR' },
    });
    expect(
      payloads(fetcher).every((body) => !('kitchenInterview' in body.settings.goalContext)),
    ).toBe(true);
  });
  it('Nutrition retains overlap choices and local consent through a failed load and a second concurrency conflict', async () => {
    const profile = {
      ...nutritionProfileSettingsInputSchema.parse({
        visibleNutrientCodes: ['energy_kcal'],
        recipeCardNutrientCodes: ['energy_kcal'],
      }),
      id: '22222222-2222-4222-8222-222222222222',
      version: 1,
    };
    const latest = {
      ...profile,
      version: 2,
      nutritionGoalType: 'gain',
      estimatedTargetsEnabled: true,
    };
    const newer = { ...latest, version: 3, dailyResetTimezone: 'Europe/London' };
    let writes = 0;
    let reads = 0;
    const fetcher = vi.fn((_url, init) =>
      init?.method === 'PATCH'
        ? ++writes < 3
          ? json({ error: { message: 'Nutrition changed' } }, 409)
          : json({ profile: { ...newer, ...JSON.parse(init.body).settings, version: 4 } })
        : ++reads === 1
          ? Promise.reject(new Error('Current preferences unavailable'))
          : json({ profile: reads === 2 ? latest : newer }),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(NutritionProfileSettings, {
        profile,
        effectiveOn: '2026-10-20',
        personName: 'Avery',
        nutrientDefinitions: [{ code: 'energy_kcal', displayName: 'Calories' }],
      }),
    );
    fireEvent.change(screen.getByLabelText(/Nutrition goal type/), {
      target: { value: 'maintain' },
    });
    fireEvent.click(screen.getByLabelText(/I explicitly consent/));
    fireEvent.click(screen.getByRole('button', { name: "Save Avery's preferences" }));
    await screen.findByText('Nutrition changed');
    fireEvent.click(screen.getByRole('button', { name: 'Load current preferences' }));
    await screen.findByText('Current preferences unavailable');
    expect((screen.getByLabelText(/Nutrition goal type/) as HTMLSelectElement).value).toBe(
      'maintain',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load current preferences' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Keep my edit: maintain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use reviewed draft' }));
    fireEvent.click(screen.getByRole('button', { name: "Save Avery's preferences" }));
    await screen.findByText('Nutrition changed');
    expect(payloads(fetcher)[1]).toMatchObject({
      expectedVersion: 2,
      settings: {
        nutritionGoalType: 'maintain',
        estimatedTargetConsent: true,
        estimatedTargetsEnabled: true,
      },
    });
    expect(
      (screen.getByRole('button', { name: "Save Avery's preferences" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Load current preferences' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use reviewed draft' }));
    fireEvent.click(screen.getByRole('button', { name: "Save Avery's preferences" }));
    await waitFor(() => expect(writes).toBe(3));
    expect(payloads(fetcher)[2]).toMatchObject({
      expectedVersion: 3,
      settings: {
        nutritionGoalType: 'maintain',
        estimatedTargetConsent: true,
        estimatedTargetsEnabled: true,
        dailyResetTimezone: 'Europe/London',
      },
    });
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/estimate'))).toBe(true);
  });
  it('schedule days overlap requires choice; load failure and further changes retain draft until reviewed', async () => {
    const settings = taskSettingsSchema.parse({
      weeklyPlanEnabled: true,
      allowPaidGeneration: true,
    });
    const latest = { settings: { ...settings, days: 5 }, version: 2, lastScheduledDate: null };
    const newer = {
      ...latest,
      settings: { ...latest.settings, timezone: 'Europe/London' },
      version: 3,
    };
    let writes = 0;
    let reads = 0;
    const fetcher = vi.fn((url, init) =>
      String(url).includes('/jobs')
        ? json({ jobs: [] })
        : init?.method === 'PATCH'
          ? ++writes < 3
            ? json({ error: { message: 'Schedule changed' } }, 409)
            : json({
                ...newer,
                settings: { ...newer.settings, ...JSON.parse(init.body).settings },
                version: 4,
              })
          : ++reads === 1
            ? Promise.reject(new Error('Current schedule unavailable'))
            : json(reads === 2 ? latest : newer),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(TaskSettings, {
        initial: { settings, version: 1, lastScheduledDate: null },
        profileId: 'person',
        profiles: [{ id: 'person', name: 'Avery' }],
        canEdit: true,
      }),
    );
    fireEvent.change(screen.getByLabelText(/Days to plan/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await screen.findByText('Schedule changed');
    fireEvent.click(screen.getByRole('button', { name: 'Load current schedule' }));
    await screen.findByText('Current schedule unavailable');
    expect((screen.getByLabelText(/Days to plan/) as HTMLInputElement).value).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Load current schedule' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Keep my edit: 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use reviewed draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await screen.findByText('Schedule changed');
    expect(payloads(fetcher)[1]).toMatchObject({ expectedVersion: 2, settings: { days: 3 } });
    fireEvent.click(screen.getByRole('button', { name: 'Load current schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use reviewed draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(writes).toBe(3));
    expect(payloads(fetcher)[2]).toMatchObject({
      expectedVersion: 3,
      settings: { days: 3, timezone: 'Europe/London' },
    });
  });
  it('Nutrition renders acknowledged list normalization and uses it as the next clean baseline', async () => {
    const profile = {
      ...nutritionProfileSettingsInputSchema.parse({
        visibleNutrientCodes: ['energy_kcal'],
        recipeCardNutrientCodes: ['energy_kcal'],
      }),
      id: '22222222-2222-4222-8222-222222222222',
      version: 1,
    };
    const fetcher = vi.fn((_url, init) =>
      json({
        profile: {
          ...profile,
          ...JSON.parse(init.body).settings,
          dietaryPreferences: '["Vegetarian"]',
          version: 2,
        },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(NutritionProfileSettings, {
        profile,
        effectiveOn: '2026-10-20',
        personName: 'Avery',
        nutrientDefinitions: [{ code: 'energy_kcal', displayName: 'Calories' }],
      }),
    );
    fireEvent.change(screen.getByLabelText(/^Dietary preferences/), {
      target: { value: 'Vegetarian\nvegetarian' },
    });
    fireEvent.click(screen.getByRole('button', { name: "Save Avery's preferences" }));
    await screen.findByText("Avery's Nutrition preferences saved.");
    expect(payloads(fetcher)[0].settings.dietaryPreferences).toEqual(['Vegetarian', 'vegetarian']);
    expect((screen.getByLabelText(/^Dietary preferences/) as HTMLTextAreaElement).value).toBe(
      'Vegetarian',
    );
    fireEvent.change(screen.getByLabelText(/^Dietary preferences/), {
      target: { value: 'Vegetarian' },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: "Save Avery's preferences" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
  });
  it('task guidance uses the shared conflict choice and current version without losing the next-version reason', async () => {
    const initial = {
      workload: 'chat' as const,
      version: 1,
      template: 'For {{task}}, provide short answers.',
      changeNote: 'Initial version',
      createdAt: null,
      history: [],
    };
    const current = { ...initial, version: 2, template: 'For {{task}}, explain each step.' };
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => json({ error: { message: 'Guidance changed' } }, 409))
      .mockImplementationOnce(() => json({ prompts: [current] }))
      .mockImplementationOnce((_url, init) =>
        json({ prompt: { ...current, template: JSON.parse(init.body).template, version: 3 } }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(createElement(AiPromptSettings, { initial: [initial] }));
    fireEvent.change(screen.getByLabelText(/^Task guidance/), {
      target: { value: 'For {{task}}, use concise lists.' },
    });
    fireEvent.change(screen.getByLabelText(/^Reason for this version/), {
      target: { value: 'Use actionable lists' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Kitchen Assistant guidance', hidden: true }),
    );
    await screen.findByText('Guidance changed');
    fireEvent.click(
      screen.getByRole('button', { name: 'Load current version to compare', hidden: true }),
    );
    fireEvent.click(
      await screen.findByRole('radio', {
        name: 'Keep my edit: For {{task}}, use concise lists.',
        hidden: true,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use reviewed draft', hidden: true }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Kitchen Assistant guidance', hidden: true }),
    );
    await waitFor(() =>
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(2),
    );
    expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body)).toMatchObject({
      expectedVersion: 2,
      template: 'For {{task}}, use concise lists.',
      changeNote: 'Use actionable lists',
    });
    expect(fetcher.mock.calls.every(([url]) => url === '/api/v1/ai/prompts')).toBe(true);
  });
});
