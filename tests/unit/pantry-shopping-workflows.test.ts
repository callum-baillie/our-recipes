// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PantryInventory } from '@/components/pantry-inventory';
import { PantryManager } from '@/components/pantry-manager';
import { ShoppingListEditor } from '@/components/shopping-list-editor';
import { ToastProvider } from '@/components/toast-provider';
import type { ShoppingListDetail } from '@/lib/services/planning-service';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/kitchen-print-dialog', () => ({ KitchenPrintDialog: () => null }));
vi.mock('@/components/decision-assistance', () => ({ DecisionAssistance: () => null }));
vi.mock('@/components/assisted-review-button', () => ({ AssistedReviewButton: () => null }));
vi.mock('@/components/shopping-list-shortcuts', () => ({ ShoppingListShortcuts: () => null }));
const batch = {
  id: 'batch',
  name: 'Flour',
  location: 'Cupboard',
  unit: 'g',
  quantity: 2,
  quantityLabel: '2 g',
  version: 1,
  expiry: null,
};
const emptyDashboard = {
  summary: {
    activeItems: 0,
    expiringSoon: 0,
    expired: 0,
    lowStockStaples: 0,
    openedItems: 0,
    recentlyChanged: 0,
  },
  products: [],
  locations: [],
  batches: [],
  recentEvents: [],
  lowStockProductIds: [],
};
function wrap(child: ReturnType<typeof createElement>) {
  return render(createElement(ToastProvider, null, child));
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
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
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('physical counts', () => {
  it('saves unit-only edits, keeps current versions and clears Saved after another edit', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ batch: { version: 2 } }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(createElement(PantryInventory, { batches: [batch], canEdit: true }));
    await waitFor(() => expect(localStorage.getItem('bord:physical-inventory-counts')).toBeNull());
    const unit = screen.getByRole('textbox', { name: 'Count unit for Flour' });
    await waitFor(() => expect((unit as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(unit, { target: { value: 'kg' } });
    expect((screen.getByRole('button', { name: 'Save count' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save count' })));
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
      expectedVersion: 1,
      quantityRemaining: 2,
      unit: 'kg',
    });
    await waitFor(() => expect(screen.getByText('Saved', { exact: true })).toBeTruthy());
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Counted amount of Flour' }), {
      target: { value: '3' },
    });
    expect(screen.queryByText('Saved', { exact: true })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save count' })));
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string).expectedVersion).toBe(2);
  });
  it('does not decrement unknown stock and retains hidden/recoverable drafts', async () => {
    const unknown = {
      ...batch,
      id: 'unknown',
      name: 'Rice',
      quantity: null,
      quantityLabel: 'Unknown',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ batch: { version: 2 } })),
    );
    const view = wrap(createElement(PantryInventory, { batches: [batch, unknown], canEdit: true }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Decrease Rice' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Counted amount of Flour' }), {
      target: { value: '0.5' },
    });
    await waitFor(() =>
      expect(localStorage.getItem('bord:physical-inventory-counts')).toContain('0.5'),
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Rice' } });
    expect(screen.getByRole('status').textContent).toContain('1 change outside this view');
    expect(screen.getByRole('button', { name: 'Save all 1 change' })).toBeTruthy();
    view.unmount();
    wrap(createElement(PantryInventory, { batches: [batch, unknown], canEdit: true }));
    await waitFor(() =>
      expect(
        (screen.getByRole('spinbutton', { name: 'Counted amount of Flour' }) as HTMLInputElement)
          .value,
      ).toBe('0.5'),
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Counted amount of Flour' }), {
      target: { value: '2' },
    });
    expect(
      (screen.getByRole('button', { name: 'Save all 0 changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('reviews a concurrent baseline before retrying a retained count with its new version', async () => {
    let attempts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_url, options) => {
      if (!options?.method)
        return Response.json({
          batch: { quantityRemaining: 3, unit: 'g', version: 4, status: 'unopened' },
        });
      attempts++;
      return attempts === 1
        ? Response.json({ error: { message: 'Version changed' } }, { status: 409 })
        : Response.json({ batch: { version: 5 } });
    });
    vi.stubGlobal('fetch', fetchMock);
    wrap(createElement(PantryInventory, { batches: [batch], canEdit: true }));
    const count = screen.getByRole('spinbutton', { name: 'Counted amount of Flour' });
    await waitFor(() => expect((count as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(count, { target: { value: '4' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save count' })));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Review recorded stock' })),
    );
    expect(screen.getByText(/Latest recorded stock: 3 g/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my count for review' }));
    expect((count as HTMLInputElement).value).toBe('4');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save count' })));
    const saves = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(saves.map(([, options]) => JSON.parse(options!.body as string).expectedVersion)).toEqual(
      [1, 4],
    );
  });
  it('retains failed counts after a partial save', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('second')
          ? Response.json({ error: { message: 'Version changed' } }, { status: 409 })
          : Response.json({ batch: { version: 2 } }),
      ),
    );
    wrap(
      createElement(PantryInventory, {
        batches: [batch, { ...batch, id: 'second', name: 'Rice' }],
        canEdit: true,
      }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Counted amount of Flour' }), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Counted amount of Rice' }), {
      target: { value: '4' },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Save all 2 changes' })),
    );
    expect(screen.getByRole('alert').textContent).toContain('Version changed');
    expect(
      (screen.getByRole('spinbutton', { name: 'Counted amount of Rice' }) as HTMLInputElement)
        .value,
    ).toBe('4');
    expect(screen.getByRole('button', { name: 'Save all 1 change' })).toBeTruthy();
  });
});
describe('pantry live filters', () => {
  it('enables inactive visibility with an inactive status and reconciles turning it off', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ dashboard: emptyDashboard }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(
      createElement(PantryManager, {
        canEdit: true,
        initialPreferences: { defaultView: 'all', defaultSort: 'expiry', defaultGroup: 'none' },
      }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pantry filters' })));
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect((within(dialog).getByLabelText('Group items') as HTMLSelectElement).value).toBe('none');
    fireEvent.change(within(dialog).getByLabelText('Item status'), {
      target: { value: 'depleted' },
    });
    expect(
      (
        within(dialog).getByRole('checkbox', {
          name: 'Show inactive and archived',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) =>
            String(url).includes('status=depleted') && String(url).includes('includeInactive=true'),
        ),
      ).toBe(true),
    );
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Show inactive and archived' }));
    expect((within(dialog).getByLabelText('Item status') as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('Manage products and staples')).toBeTruthy();
  });
});
describe('batch form snapshots', () => {
  it('protects another edited form and refreshes clean fields after a confirmed stock change', async () => {
    const product = {
      id: 'product',
      displayName: 'Flour',
      brand: '',
      variant: '',
      category: 'Baking',
      aliases: [],
      restockMode: 'none',
    };
    const location = {
      id: 'location',
      path: 'Cupboard',
      name: 'Cupboard',
      storageType: 'pantry',
      depth: 0,
    };
    let stock = {
      id: 'batch',
      productId: 'product',
      product,
      location,
      locationId: 'location',
      quantityRemaining: 1,
      originalQuantity: 1,
      unit: 'g',
      quantityLabel: '1 g',
      status: 'unopened',
      expiryPrecision: 'unknown',
      approximateState: null,
      notes: '',
      expiry: { state: 'unknown', date: null, kind: 'unknown', days: null },
      version: 1,
    };
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/actions')) {
        stock = { ...stock, status: 'opened', version: 2 };
        return Response.json({ batch: stock });
      }
      return Response.json({
        dashboard: {
          ...emptyDashboard,
          products: [product],
          locations: [location],
          batches: [stock],
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    wrap(
      createElement(PantryManager, {
        canEdit: true,
        initialPreferences: { defaultView: 'all', defaultSort: 'expiry', defaultGroup: 'none' },
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Manage Flour' })).toBeTruthy());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Manage Flour' })));
    const dialog = screen.getByRole('dialog', { name: 'Flour' });
    fireEvent.click(within(dialog).getByText('Manage batch', { exact: true }));
    fireEvent.change(dialog.querySelector('input[name="quantityRemaining"]')!, {
      target: { value: '4' },
    });
    await act(async () =>
      fireEvent.click(within(dialog).getByRole('button', { name: 'Open package' })),
    );
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('unsaved edits'));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/actions'))).toHaveLength(
      0,
    );
    expect(
      (dialog.querySelector('input[name="quantityRemaining"]') as HTMLInputElement).value,
    ).toBe('4');
    confirm.mockReturnValue(true);
    await act(async () =>
      fireEvent.click(within(dialog).getByRole('button', { name: 'Open package' })),
    );
    await waitFor(() =>
      expect((dialog.querySelector('select[name="status"]') as HTMLSelectElement).value).toBe(
        'opened',
      ),
    );
    expect(
      (dialog.querySelector('input[name="quantityRemaining"]') as HTMLInputElement).value,
    ).toBe('1');
  });
});
describe('stock removed from the active view', () => {
  it('keeps an explicit undo with the version returned by the stock change', async () => {
    const product = {
      id: 'product',
      displayName: 'Flour',
      brand: '',
      variant: '',
      category: 'Baking',
      aliases: [],
      restockMode: 'none',
    };
    const location = {
      id: 'location',
      path: 'Cupboard',
      name: 'Cupboard',
      storageType: 'pantry',
      depth: 0,
    };
    const stock = {
      id: 'batch',
      productId: 'product',
      product,
      location,
      locationId: 'location',
      quantityRemaining: 1,
      originalQuantity: 1,
      unit: 'g',
      quantityLabel: '1 g',
      status: 'unopened',
      expiryPrecision: 'unknown',
      approximateState: null,
      notes: '',
      expiry: { state: 'unknown', date: null, kind: 'unknown', days: null },
      version: 1,
    };
    let inactive = false;
    const fetchMock = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).includes('/actions')) {
        const body = JSON.parse(options!.body as string);
        inactive = body.type !== 'undo';
        return Response.json({
          batch: {
            id: 'batch',
            version: inactive ? 2 : 3,
            status: inactive ? 'depleted' : 'unopened',
          },
        });
      }
      return Response.json({
        dashboard: {
          ...emptyDashboard,
          products: [product],
          locations: [location],
          batches: inactive ? [] : [stock],
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    wrap(
      createElement(PantryManager, {
        canEdit: true,
        initialPreferences: { defaultView: 'all', defaultSort: 'expiry', defaultGroup: 'none' },
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Manage Flour' })).toBeTruthy());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Manage Flour' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark empty' })));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo stock change' })).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Manage Flour' })).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Undo stock change' })),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Manage Flour' })).toBeTruthy());
    const actions = fetchMock.mock.calls.filter(([url]) => String(url).includes('/actions'));
    expect(
      actions.map(([, options]) => JSON.parse(options!.body as string).expectedVersion),
    ).toEqual([1, 2]);
  });
});
describe('whole-trip review and item editing', () => {
  const list = {
    id: 'list',
    name: 'Weekly shop',
    items: [
      {
        id: 'potatoes',
        item: 'Potatoes',
        checked: false,
        shoppingState: 'to_buy',
        quantity: null,
        unit: 'g',
        cartQuantity: 0,
        cartLabel: '',
        position: 0,
        createdAt: new Date(),
        aisleId: null,
        note: '',
        pantry: null,
      },
      {
        id: 'celery',
        item: 'Celery',
        checked: true,
        shoppingState: 'sourced',
        quantity: 1,
        unit: 'each',
        cartQuantity: 0,
        cartLabel: '',
        position: 1,
        createdAt: new Date(),
        aisleId: null,
        note: '',
        pantry: null,
      },
    ],
    supermarketProfiles: [],
    aisles: [],
    policyReviews: [],
    supermarketProfileId: null,
    notes: '',
    notesVersion: 0,
    settings: { keepScreenAwake: false, openPantryPurchaseOnCheck: false },
  } as unknown as ShoppingListDetail;
  it('reviews outstanding items while search matches only a sourced item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ list })),
    );
    wrap(
      createElement(ShoppingListEditor, {
        list,
        initialPantryOptions: { products: [], locations: [] },
      }),
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search shopping items' }), {
      target: { value: 'Celery' },
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Review trip' })));
    const dialog = screen.getByRole('dialog', { name: 'Review this shopping trip' });
    expect(within(dialog).getByText('Potatoes')).toBeTruthy();
    expect(within(dialog).queryByText('Everything is accounted for')).toBeNull();
  });
  it('retains an edited row through shared refresh until the local editor is cancelled', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        list: { ...list, items: list.items.filter((item) => item.id !== 'potatoes') },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    wrap(
      createElement(ShoppingListEditor, {
        list,
        initialPantryOptions: { products: [], locations: [] },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manage list' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Edit Potatoes' })));
    const dialog = screen.getByRole('dialog', { name: 'Edit item' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'My draft name' } });
    within(dialog).getByRole('button', { name: 'Cancel' }).focus();
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('My draft name');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(screen.queryByRole('button', { name: 'Edit Potatoes' })).toBeNull();
  });
  it('uses a labelled editor and keeps invalid quantity input for correction', async () => {
    const fetchMock = vi.fn(async () => Response.json({ list }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(
      createElement(ShoppingListEditor, {
        list,
        initialPantryOptions: { products: [], locations: [] },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manage list' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Edit Potatoes' })));
    const dialog = screen.getByRole('dialog', { name: 'Edit item' });
    fireEvent.change(within(dialog).getByLabelText('To buy quantity'), {
      target: { value: '1..2' },
    });
    await act(async () =>
      fireEvent.submit(
        within(dialog).getByRole('button', { name: 'Save changes' }).closest('form')!,
      ),
    );
    expect(within(dialog).getByRole('alert').textContent).toContain('Enter a name');
    expect((within(dialog).getByLabelText('To buy quantity') as HTMLInputElement).value).toBe(
      '1..2',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
