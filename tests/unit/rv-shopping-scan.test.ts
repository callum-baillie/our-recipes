// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShoppingListEditor } from '@/components/shopping-list-editor';
import { ShoppingScanReview } from '@/components/shopping-scan-review';
import { ToastProvider } from '@/components/toast-provider';
import type { ShoppingListDetail } from '@/lib/services/planning-service';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/kitchen-print-dialog', () => ({ KitchenPrintDialog: () => null }));
vi.mock('@/components/decision-assistance', () => ({ DecisionAssistance: () => null }));
vi.mock('@/components/assisted-review-button', () => ({ AssistedReviewButton: () => null }));
vi.mock('@/components/shopping-list-shortcuts', () => ({ ShoppingListShortcuts: () => null }));
const listId = '10000000-0000-4000-8000-000000000001';
const productId = '10000000-0000-4000-8000-000000000002';
const itemId = '10000000-0000-4000-8000-000000000003';
const actor = { userId: 'fixture-account', profileId: '10000000-0000-4000-8000-000000000004' };
const item = {
  id: itemId,
  item: 'Oats',
  quantity: 2,
  unit: 'each',
  cartQuantity: 500,
  cartUnit: 'g',
  cartLabel: 'Oats',
  shoppingState: 'in_cart',
  checked: false,
  note: '',
  aisleId: null,
  position: 0,
  createdAt: new Date('2026-10-20'),
  updatedAt: new Date('2026-10-20'),
  pantry: null,
} as unknown as ShoppingListDetail['items'][number];
const local = {
  id: productId,
  displayName: 'Oats',
  brand: 'Local brand',
  defaultInventoryUnit: 'g',
};
const list = {
  id: listId,
  name: 'Fixture shopping',
  items: [item],
  supermarketProfiles: [],
  aisles: [],
  policyReviews: [],
  supermarketProfileId: null,
  notes: '',
  notesVersion: 0,
  settings: { keepScreenAwake: false, openPantryPurchaseOnCheck: false },
} as unknown as ShoppingListDetail;
beforeEach(() => {
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function lookup() {
  fireEvent.change(screen.getByLabelText('Enter barcode'), { target: { value: '049000042511' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Look up' })));
  await screen.findByText(/Saved household product/);
}
describe('actual shopping scan review consumer', () => {
  it('uses local-only outage identity and replaces 500 g with explicit 1 g without changing 2 each demand or completing the purchase', async () => {
    const commands: Record<string, unknown>[] = [];
    const saved = { ...item, cartQuantity: 1, cartUnit: 'g', pantry: { productId } };
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/auth/context')) return Response.json({ actor });
      if (String(url).endsWith('barcode-lookups'))
        return Response.json({
          localProduct: local,
          preferred: null,
          alternatives: [],
          providerStatuses: [{ provider: 'usda_fdc', status: 'unavailable' }],
        });
      if (String(url).endsWith('catalog-items')) {
        commands.push(JSON.parse(init!.body as string));
        return Response.json({ itemId, productId, replayed: false });
      }
      return Response.json({ list: { ...list, items: [saved] } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      createElement(
        ToastProvider,
        null,
        createElement(ShoppingListEditor, {
          list,
          initialPantryOptions: { products: [], locations: [] },
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Scan item' }));
    await lookup();
    fireEvent.change(screen.getByLabelText('Cart destination'), { target: { value: itemId } });
    expect(screen.getByText(/Replace 500 g in cart with 1 g/)).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirm replacement cart amount' })),
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      localProductId: productId,
      cartIntent: 'replace_existing',
      cartQuantity: 1,
      cartUnit: 'g',
      itemId,
      expectedUpdatedAt: '2026-10-20T00:00:00.000Z',
    });
    expect(commands[0]).not.toHaveProperty('quantity');
    expect(commands[0]).not.toHaveProperty('checked');
    expect(commands[0]).not.toHaveProperty('selection');
    const submitted = fetchMock.mock.calls.find(([url]) => String(url).endsWith('catalog-items'))!;
    expect(new Headers(submitted[1]?.headers).get('X-Bord-Expected-Profile-Id')).toBe(
      actor.profileId,
    );
    expect(new Headers(submitted[1]?.headers).get('X-Bord-Expected-User-Id')).toBe(actor.userId);
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).endsWith(`/items/${itemId}`) && init?.method === 'PATCH',
      ),
    ).toBe(false);
    await screen.findByText(
      'Cart amount saved. No purchase completion or Pantry intake was recorded.',
    );
    expect(
      within(screen.getByRole('dialog', { name: 'Scan mode' })).getByText(
        /Recipe demand stays 2 each/,
      ),
    ).toBeTruthy();
  });
  it('keeps separate-entry intent and retries a lost response with the exact same immutable operation', async () => {
    const commands: Record<string, unknown>[] = [];
    const onSaved = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, init) => {
        if (String(url).endsWith('/auth/context')) return Response.json({ actor });
        if (String(url).endsWith('barcode-lookups'))
          return Response.json({ localProduct: local, preferred: null });
        if (String(url).endsWith('catalog-items')) {
          commands.push(JSON.parse(init!.body as string));
          if (commands.length === 1) throw new TypeError('Response lost');
          return Response.json({ itemId: 'separate', productId, replayed: true });
        }
        return Response.json({
          list: { items: [{ ...item, id: 'separate', quantity: null, unit: '', cartQuantity: 1 }] },
        });
      }),
    );
    render(
      createElement(ShoppingScanReview, {
        listId,
        items: [item],
        open: true,
        onSaved,
        onLockedChange: vi.fn(),
      }),
    );
    await lookup();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirm separate cart entry' })),
    );
    expect(
      (screen.getByLabelText('Amount') as HTMLInputElement).closest('fieldset')!.disabled,
    ).toBe(true);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Retry same confirmation' })),
    );
    expect(commands[1]).toEqual(commands[0]);
    expect(commands[0]).toMatchObject({
      cartIntent: 'separate_entry',
      cartQuantity: 1,
      cartUnit: 'g',
      localProductId: productId,
    });
    expect(commands[0]).not.toHaveProperty('itemId');
    expect(item.cartQuantity).toBe(500);
    expect(item.unit).toBe('each');
    expect(onSaved).toHaveBeenCalledOnce();
  });
  it('uses the full source portion and exact catalog revision in a new confirmation', async () => {
    const reference = {
      transport_id: 'bord_food_api',
      source_id: 'usda_fdc',
      source_record_id: '123',
      source_revision: 'revision-2',
      catalog_generation: 'generation-4',
      canonical_product_id: null,
    };
    const food = {
      provider: 'usda_fdc',
      providerRecordId: '123',
      canonicalGtin: null,
      displayName: 'Oats',
      brand: '',
      quantity: '',
      servingSize: '',
      nutrientBasis: 'per_100g',
      nutrients: [],
      allergens: [],
      labels: [],
      citation: 'Fixture USDA',
      license: 'Fixture',
      catalogRef: reference,
    };
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, init) => {
        if (String(url).endsWith('/auth/context')) return Response.json({ actor });
        if (String(url).endsWith('barcode-lookups'))
          return Response.json({ preferred: food, alternatives: [] });
        if (String(url).endsWith('/measures'))
          return Response.json({
            measures: [
              {
                label: '2 cups cooked',
                amount: 2,
                unit: 'cup',
                modifier: 'cooked',
                description: 'Full cooked portion',
                gramWeight: 240,
                form: 'cooked',
                basis: 'as prepared',
              },
            ],
          });
        if (String(url).endsWith('catalog-items')) {
          requests.push(JSON.parse(init!.body as string));
          return Response.json({ itemId });
        }
        return Response.json({ list: { items: [{ ...item, cartQuantity: 240 }] } });
      }),
    );
    render(
      createElement(ShoppingScanReview, {
        listId,
        items: [item],
        open: true,
        onSaved: vi.fn(),
        onLockedChange: vi.fn(),
      }),
    );
    fireEvent.change(screen.getByLabelText('Enter barcode'), { target: { value: '049000042511' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Look up' })));
    fireEvent.click(screen.getByText('Portion measures and storage guidance'));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Show source measures' })),
    );
    fireEvent.click(screen.getByRole('button', { name: /Use source portion/ }));
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('240');
    expect((screen.getByLabelText('Unit') as HTMLInputElement).value).toBe('g');
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirm separate cart entry' })),
    );
    expect(requests[0]).toMatchObject({
      cartQuantity: 240,
      cartUnit: 'g',
      selection: { provider: 'usda_fdc', recordId: '123', catalogRef: reference },
    });
  });
  it('keeps an auth-context failure not attempted and preserves the editable scan without an orphan lock', async () => {
    const locked = vi.fn();
    const writes = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        if (String(url).endsWith('/auth/context')) throw new TypeError('Account check unavailable');
        if (String(url).endsWith('catalog-items')) {
          writes();
          throw new Error('Must not send');
        }
        return Response.json({ localProduct: local, preferred: null });
      }),
    );
    render(
      createElement(ShoppingScanReview, {
        listId,
        items: [item],
        open: true,
        onSaved: vi.fn(),
        onLockedChange: locked,
      }),
    );
    await lookup();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirm separate cart entry' })),
    );
    expect(writes).not.toHaveBeenCalled();
    expect(screen.getByText(/No confirmation request was sent/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry same confirmation' })).toBeNull();
    expect(
      (screen.getByLabelText('Amount') as HTMLInputElement).closest('fieldset')!.disabled,
    ).toBe(false);
    expect(locked).toHaveBeenLastCalledWith(false);
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('1');
  });
  it.each([404, 409])(
    'keeps an uncertain attempt locked after %i and explicitly closes only after receipt inspection and destination review',
    async (status) => {
      const commands: Record<string, unknown>[] = [];
      const recoveries: Record<string, unknown>[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async (url, init) => {
          if (String(url).endsWith('/auth/context')) return Response.json({ actor });
          if (String(url).endsWith('barcode-lookups'))
            return Response.json({ localProduct: local });
          if (String(url).endsWith('catalog-items')) {
            commands.push(JSON.parse(init!.body as string));
            if (commands.length === 1) throw new TypeError('Response lost');
            return Response.json({ error: { message: 'Saved target unavailable' } }, { status });
          }
          if (String(url).endsWith('/confirmations/recovery')) {
            const command = JSON.parse(init!.body as string);
            recoveries.push(command);
            expect(new Headers(init?.headers).get('X-Bord-Expected-Profile-Id')).toBe(
              actor.profileId,
            );
            expect(new Headers(init?.headers).get('X-Bord-Expected-User-Id')).toBe(actor.userId);
            return Response.json({
              status: command.action === 'inspect' ? 'not_recorded' : 'abandoned',
              outcome: 'unknown',
            });
          }
          throw new Error('Unexpected request');
        }),
      );
      render(
        createElement(
          ToastProvider,
          null,
          createElement(ShoppingListEditor, {
            list,
            initialPantryOptions: { products: [], locations: [] },
          }),
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Scan item' }));
      await lookup();
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Confirm separate cart entry' })),
      );
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Retry same confirmation' })),
      );
      expect(commands).toHaveLength(2);
      expect(commands[1]).toEqual(commands[0]);
      expect(
        (screen.getByRole('button', { name: 'Close scan mode' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(screen.queryByRole('button', { name: /close unknown confirmation/ })).toBeNull();
      await act(async () =>
        fireEvent.click(
          screen.getByRole('button', { name: 'Check original confirmation receipt' }),
        ),
      );
      expect(screen.getByText(/No retained receipt was found/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /close unknown confirmation/ })).toBeNull();
      fireEvent.click(screen.getByRole('link', { name: 'Review saved list in another tab' }));
      await act(async () =>
        fireEvent.click(
          screen.getByRole('button', { name: 'I reviewed the list — close unknown confirmation' }),
        ),
      );
      expect(recoveries.map((entry) => entry.action)).toEqual(['inspect', 'abandon']);
      expect(recoveries[1]).toMatchObject({
        actor,
        operationId: commands[0]!.operationId,
        command: commands[0],
        commandPath: `/api/v1/shopping-lists/${listId}/catalog-items`,
      });
      expect(commands).toHaveLength(2);
      expect(
        (screen.getByRole('button', { name: 'Close scan mode' }) as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(screen.queryByRole('button', { name: 'Retry same confirmation' })).toBeNull();
      expect(
        screen.getByText(/earlier outcome remains unknown; no changes were undone/),
      ).toBeTruthy();
      expect(screen.getByText('Closed unknown confirmations (1)')).toBeTruthy();
      expect(screen.getByText(new RegExp(String(commands[0]!.operationId)))).toBeTruthy();
    },
  );
  it('honors an acknowledgement that wins before explicit closure and never starts another cart write', async () => {
    const onSaved = vi.fn();
    let writes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, init) => {
        if (String(url).endsWith('/auth/context')) return Response.json({ actor });
        if (String(url).endsWith('barcode-lookups')) return Response.json({ localProduct: local });
        if (String(url).endsWith('catalog-items')) {
          writes++;
          throw new TypeError('Response lost');
        }
        if (String(url).endsWith('/confirmations/recovery')) {
          const command = JSON.parse(init!.body as string);
          return Response.json(
            command.action === 'inspect'
              ? { status: 'not_recorded', outcome: 'unknown' }
              : { status: 'acknowledged', result: { itemId } },
          );
        }
        return Response.json({ list: { items: [{ ...item, cartQuantity: 1, cartUnit: 'g' }] } });
      }),
    );
    render(
      createElement(ShoppingScanReview, {
        listId,
        items: [item],
        open: true,
        onSaved,
        onLockedChange: vi.fn(),
      }),
    );
    await lookup();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirm separate cart entry' })),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Check original confirmation receipt' })),
    );
    fireEvent.click(screen.getByRole('link', { name: 'Review saved list in another tab' }));
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'I reviewed the list — close unknown confirmation' }),
      ),
    );
    expect(writes).toBe(1);
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: itemId, cartQuantity: 1, cartUnit: 'g' }),
    );
    expect(screen.queryByText(/Closed unknown confirmations/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh saved cart' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry same confirmation' })).toBeNull();
  });
  it.each(['userId', 'profileId'] as const)(
    'does not retry or reconcile an uncertain command under a changed %s',
    async (field) => {
      let currentActor = { ...actor };
      let writes = 0;
      let recoveries = 0;
      const locked = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async (url) => {
          if (String(url).endsWith('/auth/context')) return Response.json({ actor: currentActor });
          if (String(url).endsWith('barcode-lookups'))
            return Response.json({ localProduct: local });
          if (String(url).endsWith('catalog-items')) {
            writes++;
            throw new TypeError('Response lost');
          }
          if (String(url).endsWith('/confirmations/recovery')) {
            recoveries++;
            return Response.json({ status: 'acknowledged', result: { itemId } });
          }
          return Response.json({ list: { items: [item] } });
        }),
      );
      render(
        createElement(ShoppingScanReview, {
          listId,
          items: [item],
          open: true,
          onSaved: vi.fn(),
          onLockedChange: locked,
        }),
      );
      await lookup();
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Confirm separate cart entry' })),
      );
      currentActor = { ...actor, [field]: 'different-recipient' };
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Retry same confirmation' })),
      );
      await act(async () =>
        fireEvent.click(
          screen.getByRole('button', { name: 'Check original confirmation receipt' }),
        ),
      );
      expect(writes).toBe(1);
      expect(recoveries).toBe(0);
      expect(screen.getByText(/Return to the original account and viewing profile/)).toBeTruthy();
      expect(locked).toHaveBeenLastCalledWith(true);
      currentActor = actor;
      await act(async () =>
        fireEvent.click(
          screen.getByRole('button', { name: 'Check original confirmation receipt' }),
        ),
      );
      expect(recoveries).toBe(1);
      expect(writes).toBe(1);
      expect(locked).toHaveBeenLastCalledWith(false);
    },
  );
  it('retains the original reviewed actor after a known first rejection until a fresh barcode review', async () => {
    let currentActor = { ...actor };
    let writes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        if (String(url).endsWith('/auth/context')) return Response.json({ actor: currentActor });
        if (String(url).endsWith('barcode-lookups')) return Response.json({ localProduct: local });
        writes++;
        return Response.json({ error: { message: 'Viewing profile changed' } }, { status: 409 });
      }),
    );
    render(
      createElement(ShoppingScanReview, {
        listId,
        items: [item],
        open: true,
        onSaved: vi.fn(),
        onLockedChange: vi.fn(),
      }),
    );
    await lookup();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirm separate cart entry' })),
    );
    currentActor = { ...actor, profileId: 'different-profile' };
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirm separate cart entry' })),
    );
    expect(writes).toBe(1);
    expect(screen.getByText(/Return to the original account and viewing profile/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry same confirmation' })).toBeNull();
  });
});
