// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodCatalogPicker } from '@/components/food-catalog-picker';
import { RecipeLifecycleActions } from '@/components/recipe-lifecycle-actions';
import { RecipeDetailToolbar } from '@/components/recipe-detail-toolbar';
import { RecipeForm } from '@/components/recipe-form';
import { RecipePantryPanel } from '@/components/recipe-pantry-panel';
import { CaptureWizard } from '@/components/capture-wizard';
import { ToastProvider } from '@/components/toast-provider';
import { emptyRecipeInput, recipeInputSchema, type RecipeInput } from '@/lib/domain/recipe';
import type { PantryRecipeAvailability } from '@/lib/domain/pantry-availability';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/recipe-enhancement-dialog', () => ({ RecipeEnhancementDialog: () => null }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
const initial: RecipeInput = {
  ...emptyRecipeInput,
  title: 'Test recipe',
  servings: '2 servings (4 bagels)',
  difficulty: 'Quite fiddly',
  prepMinutes: 0,
  cookMinutes: 15,
  ingredientGroups: [
    {
      name: '',
      ingredients: [
        {
          quantity: 1,
          unit: 'package',
          item: 'Flour',
          note: '1 lb package',
          shoppingCategory: 'Baking',
        },
      ],
    },
  ],
  instructionSections: [{ title: '', steps: ['Mix gently.'] }],
};
function wrap(child: ReturnType<typeof createElement>) {
  return render(createElement(ToastProvider, null, child));
}
beforeEach(() => {
  localStorage.clear();
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
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(fn, 0));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('recipe workflow boundaries', () => {
  it('keeps category, custom difficulty, yield and explicit zero through an untouched edit', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) =>
      (void options, url) === '/api/v1/tags'
        ? Response.json({ tags: [] })
        : Response.json({ recipe: { id: 'saved' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    wrap(createElement(RecipeForm, { initial, recipeId: 'recipe', currentRevision: 2 }));
    expect((screen.getByLabelText(/Difficulty/) as HTMLSelectElement).value).toBe('Quite fiddly');
    expect(
      (screen.getByLabelText('Ingredient 1-1 shopping category') as HTMLSelectElement).value,
    ).toBe('Baking');
    await act(async () =>
      fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' }).at(-1)!),
    );
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/recipes/recipe')).toBe(true),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/v1/recipes/recipe')!;
    const payload = JSON.parse((call[1] as RequestInit).body as string);
    expect(payload.ingredientGroups[0].ingredients[0].shoppingCategory).toBe('Baking');
    expect(payload.difficulty).toBe('Quite fiddly');
    expect(payload.prepMinutes).toBe(0);
    expect(payload.servings).toBe('2 servings (4 bagels)');
  });
  it('isolates catalog Enter and local-product selection from outer recipe saving', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/v1/tags'
        ? Response.json({ tags: [] })
        : Response.json({
            records: [],
            localProducts: [
              { id: '11111111-1111-4111-8111-111111111111', displayName: 'Plain flour', brand: '' },
            ],
            providerStatuses: [],
          }),
    );
    vi.stubGlobal('fetch', fetchMock);
    wrap(createElement(RecipeForm, { initial }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Find food data' })));
    const search = screen.getByRole('searchbox', { name: 'Product name / barcode' });
    fireEvent.change(search, { target: { value: 'Flour' } });
    await act(async () => fireEvent.submit(search.closest('form')!));
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/recipes')).toBe(false);
    expect(document.querySelector('form form')).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Plain flour/ })));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Use this product' })),
    );
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/recipes')).toBe(false);
    expect((screen.getByLabelText('Ingredient 1-1 quantity') as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText('Ingredient 1-1 unit') as HTMLInputElement).value).toBe(
      'package',
    );
    expect((screen.getByLabelText('Ingredient 1-1 note') as HTMLInputElement).value).toBe(
      '1 lb package',
    );
    expect(screen.getByText('Linked to Plain flour')).toBeTruthy();
  });
  it('keeps text and URL drafts and scopes URL errors without starting requests on switching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    wrap(createElement(CaptureWizard));
    fireEvent.change(screen.getByLabelText('Recipe text or request'), {
      target: { value: 'A long recipe idea with lemon and pasta.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Recipe link' }));
    fireEvent.change(screen.getByLabelText('Public recipe URL'), { target: { value: 'bad url' } });
    await act(async () =>
      fireEvent.submit(screen.getByLabelText('Public recipe URL').closest('form')!),
    );
    expect(screen.getByRole('alert').textContent).toContain('valid public recipe link');
    fireEvent.click(screen.getByRole('button', { name: 'Text or idea' }));
    expect((screen.getByLabelText('Recipe text or request') as HTMLTextAreaElement).value).toBe(
      'A long recipe idea with lemon and pasta.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Recipe link' }));
    expect((screen.getByLabelText('Public recipe URL') as HTMLInputElement).value).toBe('bad url');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('labels a changed batch stale until a successful pantry recheck updates the checked scope', async () => {
    const availability = {
      recipeId: 'recipe',
      state: 'unknown',
      targetServings: 4,
      baseServings: 4,
      ingredients: [],
    } as unknown as PantryRecipeAvailability;
    const updated = vi.fn();
    const fetchMock = vi.fn(async () =>
      Response.json({ availability: { ...availability, targetServings: 6 } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ui = render(
      createElement(RecipePantryPanel, {
        initialAvailability: availability,
        products: [],
        targetServings: 6,
        onAvailabilityChange: updated,
      }),
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Checked for 4 servings. Batch changed to 6',
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Recalculate' })));
    expect(screen.getByRole('status').textContent).toBe('Checked for 6 servings.');
    expect(updated).toHaveBeenCalledWith(expect.objectContaining({ targetServings: 6 }));
    ui.rerender(
      createElement(RecipePantryPanel, {
        initialAvailability: availability,
        products: [],
        targetServings: 8,
        onAvailabilityChange: updated,
      }),
    );
    expect(screen.getByRole('status').textContent).toContain('Batch changed to 8');
  });
  it('keeps the recovery prompt from overwriting an undisposed partial draft', async () => {
    const partial = {
      ...emptyRecipeInput,
      title: '',
      equipmentText: '',
      summary: 'Half-written soup',
    };
    const raw = JSON.stringify(partial);
    localStorage.setItem('bord:recipe-draft:new', raw);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ tags: [] })),
    );
    wrap(createElement(RecipeForm));
    await screen.findByRole('button', { name: 'Restore draft' });
    fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Current typing' } });
    expect(localStorage.getItem('bord:recipe-draft:new')).toBe(raw);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restore draft' })));
    expect((screen.getByLabelText('Recipe name') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Short note/) as HTMLTextAreaElement).value).toBe(
      'Half-written soup',
    );
  });
  it('holds a late AI candidate for review and can undo applying it without losing newer edits', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/v1/tags'
          ? Promise.resolve(Response.json({ tags: [] }))
          : new Promise<Response>((done) => {
              resolve = done;
            }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    wrap(createElement(RecipeForm, { initial, recipeId: 'recipe', currentRevision: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'AI Improve' }));
    fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Newer typing' } });
    await act(async () =>
      resolve(
        Response.json({
          candidate: {
            recipe: { ...recipeInputSchema.parse(initial), title: 'AI suggested title' },
          },
        }),
      ),
    );
    await screen.findByRole('dialog', { name: 'Review AI improvement' });
    expect((screen.getByLabelText('Recipe name') as HTMLInputElement).value).toBe('Newer typing');
    fireEvent.click(screen.getByRole('button', { name: 'Apply draft' }));
    expect((screen.getByLabelText('Recipe name') as HTMLInputElement).value).toBe(
      'AI suggested title',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo AI draft' }));
    expect((screen.getByLabelText('Recipe name') as HTMLInputElement).value).toBe('Newer typing');
  });
  it('can close a pending lookup and ignores its late response in the next ingredient lookup', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const ui = render(
      createElement(FoodCatalogPicker, { context: 'recipe', defaultQuery: 'Flour' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Scan or search food data' }));
    await act(async () => fireEvent.submit(screen.getByRole('searchbox').closest('form')!));
    fireEvent.click(screen.getByRole('button', { name: 'Close food data picker' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    ui.rerender(createElement(FoodCatalogPicker, { context: 'recipe', defaultQuery: 'Olive oil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scan or search food data' }));
    await act(async () =>
      resolve(
        Response.json({
          records: [],
          localProducts: [{ id: 'old', displayName: 'Old flour' }],
          providerStatuses: [],
        }),
      ),
    );
    expect(screen.queryByText('Old flour')).toBeNull();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Olive oil');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('syncs linked preference updates while keeping a local note draft and deliberate rating draft', () => {
    const props = {
      recipeId: 'recipe',
      status: 'active' as const,
      currentRevision: 1,
      personalPreference: { rating: 1, note: 'Saved note' },
    };
    const ui = render(createElement(RecipeLifecycleActions, props));
    fireEvent.change(screen.getByLabelText('Personal note'), {
      target: { value: 'Unsaved note draft' },
    });
    ui.rerender(
      createElement(RecipeLifecycleActions, {
        ...props,
        personalPreference: { rating: 5, note: 'Saved note' },
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Rate 5 out of 5 stars' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect((screen.getByLabelText('Personal note') as HTMLTextAreaElement).value).toBe(
      'Unsaved note draft',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5 stars' }));
    ui.rerender(
      createElement(RecipeLifecycleActions, {
        ...props,
        personalPreference: { rating: null, note: 'Saved note' },
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Rate 4 out of 5 stars' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
  it('refreshes the toolbar reaction after a separately saved star rating changes', () => {
    const props = {
      recipeId: 'recipe',
      recipe: recipeInputSchema.parse(initial),
      revision: 1,
      initialFavorite: false,
    };
    const ui = render(createElement(RecipeDetailToolbar, props));
    expect(
      screen.getByRole('button', { name: 'Like this recipe' }).getAttribute('aria-pressed'),
    ).toBe('false');
    ui.rerender(createElement(RecipeDetailToolbar, { ...props, initialFavorite: true }));
    expect(
      screen.getByRole('button', { name: 'Clear positive reaction' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
