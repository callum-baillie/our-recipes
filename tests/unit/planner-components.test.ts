// @vitest-environment jsdom
import { createElement } from 'react';
import { ToastProvider } from '@/components/toast-provider';
import {
  act,
  cleanup,
  fireEvent,
  render as baseRender,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MealPlanner } from '@/components/meal-planner';
import { DEFAULT_MEAL_PLAN_PREFERENCES } from '@/lib/domain/app-preferences';
import { MealPlanRecipeSelector } from '@/components/meal-plan-recipe-selector';
import { MealEntryEditor } from '@/components/meal-entry-editor';
import { AiMealPlanGenerator } from '@/components/ai-meal-plan-generator';
import type { RecipeListItem } from '@/lib/services/recipe-service';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/decision-assistance', () => ({ DecisionAssistance: () => null }));
vi.mock('@/components/ai-summary-cards', () => ({ AiSummaryCards: () => null }));
vi.mock('next/image', () => ({ default: () => null }));
const recipe = {
  id: 'recipe',
  title: 'Dinner with a very long title',
  summary: 'A saved dinner.',
  category: 'Dinner',
  tags: ['family'],
  prepMinutes: 0,
  cookMinutes: 0,
  restMinutes: 0,
  image: null,
} as RecipeListItem;
const person = { id: 'person', displayName: 'Callum' };
const base = {
  open: true,
  startDate: '2026-12-31',
  duration: 1,
  mealTypes: ['breakfast', 'dinner'],
  recipes: [recipe],
  collections: [],
  collectionMemberships: [],
  servings: 2,
  profileNames: ['Callum'],
  profileIds: ['person'],
  onClose: vi.fn(),
  onSaved: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('meal assignment requests', () => {
  it('recovers rejected fetch without resubmitting an uncertain addition', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Network failed'));
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(MealPlanRecipeSelector, base));
    fireEvent.click(screen.getByRole('button', { name: /Dinner with a very long title.*Select/u }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add 1 meal' })));
    expect(screen.getByRole('alert').textContent).toContain('Check the calendar');
    expect((screen.getByRole('button', { name: 'Add 1 meal' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Close picker' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(base.onSaved).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear selections' }));
    expect(screen.getByRole('button', { name: 'Select a meal to continue' })).toBeTruthy();
  });
  it('treats a server error after an attempted POST as an unconfirmed outcome', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ error: { message: 'Server failed' } }, { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const uncertain = vi.fn();
    render(createElement(MealPlanRecipeSelector, { ...base, onUncertain: uncertain }));
    fireEvent.click(screen.getByRole('button', { name: /Dinner with a very long title.*Select/u }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add 1 meal' })));
    expect(uncertain).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: 'Add 1 meal' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole('alert').textContent).toContain('Check the calendar');
  });
  it('retains assignments on validation failure, freezes submitted fields and clears successful additions', async () => {
    let resolve: (response: Response) => void = () => {};
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(MealPlanRecipeSelector, base));
    fireEvent.click(screen.getByRole('button', { name: /Dinner with a very long title.*Select/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 meal' }));
    expect(screen.getByRole('textbox', { name: 'Search recipes' }).matches(':disabled')).toBe(true);
    await act(async () =>
      resolve(Response.json({ error: { message: 'Choose another recipe.' } }, { status: 400 })),
    );
    expect(screen.getByRole('alert').textContent).toBe('Choose another recipe.');
    expect((screen.getByRole('button', { name: 'Add 1 meal' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 meal' }));
    await act(async () => resolve(Response.json({ meals: [{ id: 'new' }] })));
    expect(base.onSaved).toHaveBeenCalledWith(1, [{ id: 'new' }]);
    expect(screen.getByText('0 unsubmitted meals selected')).toBeTruthy();
  });
  it('hands an alternate kind the current meal target, including with an empty recipebook', () => {
    const other = vi.fn();
    render(createElement(MealPlanRecipeSelector, { ...base, recipes: [], onOtherKind: other }));
    fireEvent.click(screen.getByRole('button', { name: 'Dinner 0 of 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fasting / no meal' }));
    expect(other).toHaveBeenCalledWith('fast', { date: '2026-12-31', meal: 'dinner' });
  });
});
describe('meal editor input boundaries', () => {
  it('keeps a temporarily blank serving draft and sends shared audience without changing quantity', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ meal: { id: 'new' } }));
    vi.stubGlobal('fetch', fetchMock);
    const saved = vi.fn();
    render(
      createElement(MealEntryEditor, {
        date: '2026-12-31',
        slot: 'dinner',
        slots: ['dinner'],
        meals: [],
        recipes: [],
        profiles: [person],
        servings: 2,
        onClose: vi.fn(),
        onSaved: saved,
      }),
    );
    const portions = screen.getByRole('spinbutton', { name: 'Servings' });
    fireEvent.change(portions, { target: { value: '' } });
    expect((portions as HTMLInputElement).value).toBe('');
    fireEvent.change(portions, { target: { value: '3' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Meal or food name' }), {
      target: { value: 'Yogurt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Callum' }));
    expect((portions as HTMLInputElement).value).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Shared household meal' }));
    await act(async () =>
      fireEvent.submit(screen.getByRole('button', { name: /Add meal/u }).closest('form')!),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      servings: 3,
      profileIds: [],
    });
    expect(saved).toHaveBeenCalledTimes(1);
  });
});
describe('generator retained review', () => {
  it('opens saved-first without a request and makes retained identity and portions effective', async () => {
    const proposal = {
      id: 'proposal',
      status: 'pending',
      preview: {
        request: {
          mode: 'recipebook',
          startDate: '2026-12-31',
          endDate: '2026-12-31',
          mealSlots: ['dinner'],
        },
        selectedProfileIds: ['person'],
        candidate: {
          newRecipes: [],
          entries: [
            {
              entryKey: 'dinner',
              plannedFor: '2026-12-31',
              meal: 'dinner',
              existingRecipeId: 'recipe',
              newRecipeKey: null,
              title: 'Proposed meal',
              servings: 2,
              note: '',
            },
          ],
          allocations: [{ entryKey: 'dinner', householdProfileId: 'person', servings: 1 }],
          leftoverLinks: [],
          warnings: [],
          assumptions: [],
        },
        conflicts: [
          {
            entryId: 'existing',
            plannedFor: '2026-12-31',
            meal: 'dinner',
            title: 'Retained supper',
          },
        ],
      },
    };
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ proposal }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      createElement(AiMealPlanGenerator, {
        weekStart: '2026-12-31',
        weekEnd: '2026-12-31',
        mealSlots: ['dinner'],
        profiles: [person],
        aiModel: 'gpt-6-luna',
        imageGenerationEnabled: true,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate meal plan' }));
    expect(
      screen
        .getByRole('button', { name: /Use saved recipes.*Prepare/u })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Prepare saved-recipe plan' })),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep existing' }));
    expect(screen.getByLabelText('Proposed meals').textContent).toContain('Retained supper');
    expect(screen.getByLabelText('Nutrition portions').textContent).toContain(
      '0 new planned servings',
    );
    expect(
      (screen.getByRole('button', { name: 'Confirm and save' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back to options' }));
    fireEvent.click(screen.getByRole('button', { name: /Resume retained proposal/u }));
    expect(screen.getByRole('button', { name: 'Keep existing' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const plannerProps = {
  weekStart: '2026-12-28',
  weekEnd: '2027-01-03',
  previousWeekStart: '2026-12-21',
  nextWeekStart: '2027-01-04',
  focusDate: '2026-12-31',
  today: '2026-12-28',
  meals: [],
  recipes: [recipe],
  profiles: [person],
  collections: [],
  collectionMemberships: [],
  initialAiSummary: null,
};
describe('planner acknowledged scopes', () => {
  it('keeps missing nutrients unknown and labels minimum, range and limit comparisons', () => {
    render(
      createElement(MealPlanner, {
        ...plannerProps,
        nutritionProfileName: 'Callum',
        nutritionByDate: { '2026-12-31': { energy_kcal: 800, total_fat: 10 } },
        nutritionGoals: [
          {
            nutrientCode: 'energy_kcal',
            kind: 'minimum',
            minimum: null,
            maximum: null,
            value: 900,
          },
          { nutrientCode: 'total_fat', kind: 'range', minimum: 15, maximum: 30, value: null },
          { nutrientCode: 'protein', kind: 'limit', minimum: null, maximum: 50, value: null },
        ],
      }),
    );
    const rail = within(screen.getByRole('complementary', { name: 'Plan overview and shopping' }));
    expect(rail.getByText('Minimum 900 kcal')).toBeTruthy();
    expect(rail.getByText('Range 15–30 g')).toBeTruthy();
    expect(rail.getByText('Limit 50 g')).toBeTruthy();
    expect(rail.getAllByText('Unknown')).toHaveLength(2);
    expect(rail.queryByRole('progressbar')).toBeNull();
    expect(rail.queryByText('0%')).toBeNull();
    expect(rail.getByText(/Callum.*Daily averages/u)).toBeTruthy();
    expect(rail.getByText('Add a meal to calculate coverage.')).toBeTruthy();
  });
  it('explains capacity and duplicate custom-type labels without silently adding them', async () => {
    const customMealTypes = Array.from({ length: 10 }, (_, index) => ({
      value: `custom-${index}`,
      label: `Custom ${index}`,
    }));
    const view = render(
      createElement(MealPlanner, {
        ...plannerProps,
        mealPlanPreferences: { ...DEFAULT_MEAL_PLAN_PREFERENCES, customMealTypes },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plan settings' }));
    let dialog = within(screen.getByRole('dialog', { name: 'Plan settings' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Manage meal types' }));
    let types = within(dialog.getByRole('group', { name: 'Meal types shown in the planner' }));
    fireEvent.change(types.getByRole('textbox', { name: 'Custom meal type' }), {
      target: { value: 'Another meal' },
    });
    fireEvent.click(types.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toContain('up to 10');
    view.unmount();
    render(createElement(MealPlanner, plannerProps));
    fireEvent.click(screen.getByRole('button', { name: 'Plan settings' }));
    dialog = within(screen.getByRole('dialog', { name: 'Plan settings' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Manage meal types' }));
    types = within(dialog.getByRole('group', { name: 'Meal types shown in the planner' }));
    fireEvent.change(types.getByRole('textbox', { name: 'Custom meal type' }), {
      target: { value: 'BREAKFAST' },
    });
    fireEvent.click(types.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toContain('already exists');
  });

  it('does not preview unsaved row preferences and freezes their submitted snapshot', async () => {
    let resolve: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    );
    render(createElement(MealPlanner, plannerProps));
    await waitFor(() => expect(sessionStorage.getItem('bord-planner-setup-v1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Plan settings' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Plan settings' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Manage meal types' }));
    const types = within(dialog.getByRole('group', { name: 'Meal types shown in the planner' }));
    fireEvent.change(types.getByRole('textbox', { name: 'Custom meal type' }), {
      target: { value: 'Afternoon tea' },
    });
    fireEvent.click(types.getByRole('button', { name: 'Add' }));
    expect(
      within(screen.getByRole('region', { name: 'Meal calendar' })).queryByText('Afternoon tea'),
    ).toBeNull();
    fireEvent.click(types.getByRole('button', { name: 'Save meal types' }));
    expect(
      (types.getByRole('textbox', { name: 'Custom meal type' }) as HTMLInputElement).matches(
        ':disabled',
      ),
    ).toBe(true);
    await act(async () =>
      resolve(Response.json({ preferences: { mealPlan: { ...DEFAULT_MEAL_PLAN_PREFERENCES } } })),
    );
    expect(dialog.queryByRole('group', { name: 'Meal types shown in the planner' })).toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'Meal calendar' })).getAllByText('Afternoon tea')
        .length,
    ).toBeGreaterThan(0);
  });
});

function render(ui: Parameters<typeof baseRender>[0]) {
  return baseRender(ui, { wrapper: ToastProvider });
}
