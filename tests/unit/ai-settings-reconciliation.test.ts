// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AiRuntimeSettingsForm } from '@/components/ai-runtime-settings-form';
import { AiSettingsForm } from '@/components/ai-settings-form';
import { TaskSettings } from '@/components/task-settings';
import { aiRuntimeSchema, aiUserPreferencesSchema } from '@/lib/domain/ai-runtime-settings';
import { summaryAvailability } from '@/lib/domain/ai-summary-availability';
import { taskSettingsSchema } from '@/lib/domain/task-settings';
vi.mock('@/components/ai-action-card', () => ({
  AiActionCard: ({
    action,
    onDecide,
  }: {
    action: { id: string };
    onDecide: (id: string, decision: string) => void;
  }) =>
    createElement(
      'button',
      { onClick: () => onDecide(action.id, 'confirm') },
      'Apply fixture draft',
    ),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/account/ai' }));
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(fn, 0));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const json = (body: object, status = 200) => Promise.resolve(Response.json(body, { status }));
const sent = (mock: ReturnType<typeof vi.fn>, index: number) =>
  JSON.parse(mock.mock.calls[index]![1].body);
describe('AI settings reconciliation and action feedback', () => {
  it('retains personal defaults through conflict and saves only after explicit current-version review', async () => {
    const global = aiRuntimeSchema.parse({});
    const personal = aiUserPreferencesSchema.parse({ instructions: 'Short answers' });
    const latest = {
      global,
      workloads: [],
      account: { preferences: { ...personal, instructions: 'Someone changed this' }, version: 4 },
    };
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => json({ error: { message: 'Changed concurrently' } }, 409))
      .mockImplementationOnce(() => json(latest))
      .mockImplementationOnce(() =>
        json({
          ...latest,
          account: { preferences: { ...personal, instructions: 'My retained draft' }, version: 5 },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(AiRuntimeSettingsForm, {
        global,
        workloads: [],
        version: 3,
        personal,
        enabled: true,
      }),
    );
    fireEvent.change(screen.getByLabelText(/Response style and planning preferences/), {
      target: { value: 'My retained draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save my AI defaults' }));
    await screen.findByText('Changed concurrently');
    expect(
      (screen.getByRole('button', { name: 'Save my AI defaults' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Load current settings' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Keep my edit: My retained draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use reviewed draft' }));
    expect(
      (screen.getByLabelText(/Response style and planning preferences/) as HTMLTextAreaElement)
        .value,
    ).toBe('My retained draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save my AI defaults' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(sent(fetcher, 2)).toMatchObject({
      version: 4,
      preferences: { instructions: 'My retained draft' },
    });
  });
  it('privacy reconciliation preserves the privacy draft and uses the latest acknowledged version', async () => {
    const initial = {
      workloads: [],
      modelCatalog: [],
      dataPolicy: { version: 1, summaryFrequency: 'off', sharePantry: false },
    };
    const latest = {
      ...initial,
      dataPolicy: { ...initial.dataPolicy, version: 2, shareMealPlans: true },
    };
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => json({ error: { message: 'Privacy changed' } }, 409))
      .mockImplementationOnce(() => json(latest))
      .mockImplementationOnce((_url, options) =>
        json({ ...latest, dataPolicy: { ...JSON.parse(options.body).dataPolicy, version: 3 } }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(AiSettingsForm, {
        initialSettings: initial,
        privacyOnly: true,
        personName: 'Avery',
      }),
    );
    fireEvent.click(screen.getByLabelText(/Pantry stock/));
    fireEvent.click(screen.getByRole('button', { name: 'Save privacy and summary settings' }));
    await screen.findByText('Privacy changed');
    fireEvent.click(screen.getByRole('button', { name: 'Load current settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use reviewed draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save privacy and summary settings' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(sent(fetcher, 2).dataPolicy).toMatchObject({
      version: 2,
      sharePantry: true,
      shareMealPlans: true,
    });
  });
  it('distinguishes no permission, permitted but empty, ready, and disabled outputs', () => {
    expect(
      summaryAvailability({
        enabled: true,
        outputs: { nutrition: true, meal_plans: true, shopping_lists: true, recipes: false },
        permitted: { nutrition: false, meal_plans: true, shopping_lists: true, recipes: false },
        evidence: { nutrition: false, meal_plans: false, shopping_lists: true, recipes: false },
      }).map((row) => row.status),
    ).toEqual(['missing_permission', 'no_eligible_evidence', 'ready', 'disabled_output']);
  });
  it('keeps failed task application beside the reviewed action after successful polling', async () => {
    const job = {
      id: 'job-id',
      actionId: 'action-id',
      title: 'Fixture dinners',
      status: 'completed',
      executionMode: 'direct',
      totalItems: 1,
      completedItems: 1,
      failedItems: 0,
      errorCode: null,
      threadId: 'thread',
    };
    const fetcher = vi.fn().mockImplementation((url: string, init?: RequestInit) =>
      url.includes('/actions/') && init?.method === 'PATCH'
        ? json({ error: { message: 'Meals changed. Review current entries.' } }, 409)
        : url.includes('/actions/')
          ? json({
              action: { id: 'action-id', kind: 'meal_plan', state: 'proposed', preview: {} },
            })
          : json({ jobs: [job] }),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(TaskSettings, {
        initial: { settings: taskSettingsSchema.parse({}), version: 1, lastScheduledDate: null },
        profileId: 'person',
        profiles: [{ id: 'person', name: 'Avery' }],
        canEdit: true,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Review draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apply fixture draft' }));
    const review = screen.getByLabelText('Generated draft review');
    expect(await within(review).findByRole('alert')).toHaveProperty(
      'textContent',
      'Meals changed. Review current entries.',
    );
    expect(screen.getByRole('dialog', { hidden: true }).textContent).not.toContain('Meals changed');
  });
});
