// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), zxing: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock('@/components/toast-provider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/components/food-catalog-picker', () => ({ FoodCatalogPicker: () => null }));
vi.mock('@/components/recipe-tag-selector', () => ({ RecipeTagSelector: () => null }));
vi.mock('@/components/decision-assistance', () => ({ DecisionAssistance: () => null }));
vi.mock('@/components/recipe-pantry-panel', () => ({ RecipePantryPanel: () => null }));
vi.mock('react-zxing', () => ({ useZxing: mocks.zxing }));
import { PantryManager } from '@/components/pantry-manager';
import { pantryProductInputSchema } from '@/lib/domain/pantry';
import { RecipeForm } from '@/components/recipe-form';
import { CookingMode } from '@/components/cooking-mode';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { AiSummaryCards } from '@/components/ai-summary-cards';
import { MealPlanRecipeSelector } from '@/components/meal-plan-recipe-selector';
import { ShoppingListMobileMenu } from '@/components/shopping-list-mobile-menu';
import { ShoppingListsOverview } from '@/components/shopping-lists-overview';
import { emptyRecipeInput } from '@/lib/domain/recipe';
const recipeId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const initial = {
  ...emptyRecipeInput,
  title: 'Milk soup',
  servings: '4',
  ingredientGroups: [
    {
      name: '',
      ingredients: [
        {
          item: 'Whole milk',
          quantity: '1',
          unit: 'l',
          note: '',
          shoppingCategory: 'Dairy & eggs' as const,
          pantryProductId: productId,
        },
      ],
    },
  ],
  instructionSections: [{ title: '', steps: ['Heat gently.'] }],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  localStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('workflow acknowledgement and submitted scope', () => {
  it('requires review of a renamed linked ingredient on submit without a blur event', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ recipe: { id: recipeId } }),
    );
    vi.stubGlobal('fetch', fetch);
    render(createElement(RecipeForm, { initial, linkedFoods: { [productId]: 'Whole milk' } }));
    const ingredient = screen.getByLabelText('Ingredient 1-1 item');
    fireEvent.focus(ingredient);
    fireEvent.change(ingredient, { target: { value: 'Oat drink' } });
    fireEvent.submit(ingredient.closest('form')!);
    await screen.findByText(/Review the changed ingredient food links before saving/);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep food link' }));
    fireEvent.submit(ingredient.closest('form')!);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(fetch.mock.calls[0]![1]!.body as string).ingredientGroups[0].ingredients[0],
    ).toMatchObject({ item: 'Oat drink', pantryProductId: productId });
  });
  it('locks a submitted cooking count and renders the acknowledged session count', async () => {
    let complete!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>((url: RequestInfo | URL) =>
      String(url).includes('/cook-sessions')
        ? new Promise<Response>((resolve) => {
            complete = resolve;
          })
        : Promise.resolve(Response.json({ dashboard: { products: [], locations: [] } })),
    );
    vi.stubGlobal('fetch', fetch);
    render(
      createElement(CookingMode, {
        recipe: {
          ...initial,
          id: recipeId,
          images: [],
          instructionSections: [{ title: '', steps: [{ body: 'Heat gently.' }] }],
        } as never,
        initialFavorite: false,
        nutritionPreparation: null,
      }),
    );
    const count = screen.getByLabelText(/Cook for/);
    fireEvent.click(screen.getByRole('button', { name: 'Start cooking' }));
    expect((count as HTMLInputElement).disabled).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string).targetServings).toBe(4);
    await act(async () =>
      complete(Response.json({ session: { id: 'session', targetServings: 4 } })),
    );
    expect((count as HTMLInputElement).value).toBe('4');
    expect(screen.getByText(/Cooking session for 4 servings/)).toBeTruthy();
    expect(screen.getByLabelText('Temperature to convert')).toBeTruthy();
    expect(screen.getByLabelText('From unit')).toBeTruthy();
  });
  it('does not unlock an uncertain meal write when its selection draft is cleared', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Response lost');
    });
    vi.stubGlobal('fetch', fetch);
    render(
      createElement(MealPlanRecipeSelector, {
        open: true,
        startDate: '2026-10-19',
        duration: 1,
        mealTypes: ['dinner'],
        recipes: [
          {
            id: recipeId,
            title: 'Milk soup',
            summary: '',
            category: 'Dinner',
            tags: [],
            prepMinutes: 5,
            cookMinutes: 5,
            restMinutes: 0,
            image: null,
          } as never,
        ],
        collections: [],
        collectionMemberships: [],
        servings: 1,
        profileNames: [],
        onClose: vi.fn(),
        onSaved: vi.fn(),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Milk soup.*Select/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 meal' }));
    await screen.findByText(/We could not confirm whether these meals were added/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear selections' }));
    fireEvent.click(screen.getByRole('button', { name: /Milk soup.*Select/ }));
    const add = screen.getByRole('button', { name: 'Add 1 meal' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(add);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps camera permission startup distinct from ready and failed camera access', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    mocks.zxing.mockReturnValue({ ref: { current: null }, torch: { isAvailable: false } });
    const view = render(createElement(BarcodeScanner, { onDetected: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    expect(screen.getByRole('status').textContent).toContain('Starting camera');
    fireEvent.playing(view.container.querySelector('video')!);
    expect(screen.getByRole('status').textContent).toContain('Camera ready');
    act(() =>
      mocks.zxing.mock.calls
        .at(-1)![0]
        .onError(new DOMException('Permission denied', 'NotAllowedError')),
    );
    expect(screen.getByRole('alert').textContent).toContain('Permission denied');
    fireEvent.click(screen.getByRole('button', { name: 'Try camera again' }));
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeTruthy();
  });
  it('shows all recorded summary limitations alongside claims before details are opened', () => {
    render(
      createElement(AiSummaryCards, {
        domain: 'meal_plans',
        initialSummary: {
          id: 'summary',
          domain: 'meal_plans',
          headline: 'A varied plan',
          summary: 'Meals have variety.',
          highlights: [],
          metrics: [],
          caveats: ['Only two days contained permitted evidence.', 'Nutrition data is incomplete.'],
          createdAt: '2026-10-19T12:00:00Z',
        },
      }),
    );
    for (const text of [
      'Only two days contained permitted evidence.',
      'Nutrition data is incomplete.',
    ]) {
      expect(screen.getByText(text).closest('details')).toBeNull();
    }
  });
  it('owns mobile rename errors locally and freezes the submitted draft until acknowledgement', async () => {
    let complete!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    render(createElement(ShoppingListMobileMenu, { listId: 'list', listName: 'Weekly' }));
    fireEvent.click(screen.getByText('List options').closest('details')!.querySelector('summary')!);
    const name = screen.getByLabelText('List name');
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.submit(name.closest('form')!);
    expect(screen.getByRole('alert').textContent).toBe('Enter a list name.');
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: 'Weekend' } });
    fireEvent.submit(name.closest('form')!);
    expect((name as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Saving list name');
    await act(async () =>
      complete(
        Response.json({ error: { message: 'Version changed. Review the list.' } }, { status: 409 }),
      ),
    );
    expect(screen.getByRole('alert').textContent).toContain('Version changed');
    expect((name as HTMLInputElement).value).toBe('Weekend');
    expect((name as HTMLInputElement).disabled).toBe(false);
  });
  it('pauses stock actions after an acknowledged write until current stock reload succeeds', async () => {
    let reads = 0;
    let retryAllowed = false;
    const dashboard = {
      summary: {
        activeItems: 1,
        expiringSoon: 0,
        expired: 0,
        lowStockStaples: 0,
        openedItems: 0,
        recentlyChanged: 0,
      },
      products: [
        {
          ...pantryProductInputSchema.parse({
            displayName: 'Red lentils',
            isStaple: true,
            stockUnit: 'g',
            restockMode: 'always_have',
            restockTrigger: 'below_target',
            targetStock: 1000,
            reorderThreshold: 200,
          }),
          id: productId,
          archivedAt: null,
        },
      ],
      batches: [],
      locations: [],
      recentEvents: [],
      lowStockProductIds: [],
      productStock: { [productId]: { knownQuantity: 1500, unit: 'g', uncertain: false } },
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, options) => {
      if (options?.method === 'PATCH') return Response.json({ product: dashboard.products[0] });
      reads++;
      if (reads > 1 && !retryAllowed)
        return Response.json({ error: { message: 'Summary unavailable' } }, { status: 503 });
      return Response.json({ dashboard });
    });
    vi.stubGlobal('fetch', fetch);
    render(
      createElement(PantryManager, {
        canEdit: true,
        initialPreferences: {
          defaultView: 'essentials',
          defaultSort: 'name',
          defaultGroup: 'none',
        },
      }),
    );
    await screen.findByText('1500 g');
    const save = screen.getByRole('button', { name: 'Save policy', hidden: true });
    fireEvent.submit(save.closest('form')!);
    await screen.findByText(/The stock change was saved/);
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
    retryAllowed = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Pantry' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Save policy', hidden: true }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
  });
  it('preserves useful create failure text without marking the list-name field invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { message: 'List limit reached. Archive an unused list.' } },
          { status: 409 },
        ),
      ),
    );
    render(createElement(ShoppingListsOverview, { lists: [], initialAiSummary: null }));
    const name = screen.getByLabelText('List name');
    fireEvent.change(name, { target: { value: 'Weekly' } });
    fireEvent.submit(name.closest('form')!);
    await screen.findByText('List limit reached. Archive an unused list.');
    expect(name.getAttribute('aria-invalid')).toBe('false');
  });
});
