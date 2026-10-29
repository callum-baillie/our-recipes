// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShoppingListsOverview } from '@/components/shopping-lists-overview';
import type { ShoppingListSummary } from '@/lib/services/planning-service';
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/toast-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/toast-provider')>()),
  useToast: () => ({ showToast: vi.fn() }),
}));
function list(id: string, name: string): ShoppingListSummary {
  return {
    id,
    name,
    weekStart: '2026-10-20',
    weekEnd: '2026-10-26',
    sourceMode: 'manual',
    sourceKey: null,
    archivedAt: null,
    supermarketProfileId: null,
    createdByProfileId: 'owner',
    createdAt: new Date('2026-10-20T12:00:00Z'),
    updatedAt: new Date('2026-10-20T12:00:00Z'),
    itemCount: 1,
    checkedCount: 0,
    toBuyCount: 1,
    inCartCount: 0,
    cantFindCount: 0,
    sourcedCount: 0,
    openCount: 1,
    needsAttentionCount: 0,
    sourceKind: 'manual',
    supermarketName: null,
    supermarketLocation: '',
    isAutomaticRestockTarget: false,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('shopping list lifecycle error ownership', () => {
  it.each(['archive', 'duplicate'] as const)(
    '%s failure belongs to its list and preserves the new-list draft through retry',
    async (action) => {
      const reason = `Cannot ${action} this list until its current version is reviewed.`;
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ error: { message: reason } }, { status: 409 }))
        .mockResolvedValueOnce(Response.json({ list: { id: 'acknowledged-copy' } }));
      vi.stubGlobal('fetch', fetcher);
      render(
        createElement(ShoppingListsOverview, {
          lists: [list('list-one', 'Dinner groceries'), list('list-two', 'Weekend groceries')],
          initialAiSummary: null,
        }),
      );
      const draft = screen.getByLabelText('List name');
      fireEvent.change(draft, { target: { value: 'Unrelated new list draft' } });
      const affected = screen
        .getByRole('heading', { name: 'Dinner groceries' })
        .closest('article')!;
      const other = screen.getByRole('heading', { name: 'Weekend groceries' }).closest('article')!;
      fireEvent.click(within(affected).getByLabelText('More actions for Dinner groceries'));
      const buttonName = action === 'archive' ? 'Archive' : 'Duplicate';
      fireEvent.click(within(affected).getByRole('button', { name: buttonName, hidden: true }));
      expect(await within(affected).findByRole('alert')).toHaveProperty('textContent', reason);
      expect(within(other).queryByRole('alert')).toBeNull();
      expect(draft.getAttribute('aria-invalid')).toBe('false');
      expect((draft as HTMLInputElement).value).toBe('Unrelated new list draft');
      expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/shopping-lists/list-one');
      expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({ action });
      expect(router.refresh).not.toHaveBeenCalled();
      fireEvent.click(within(affected).getByRole('button', { name: buttonName, hidden: true }));
      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(within(affected).queryByRole('alert')).toBeNull();
      expect(draft.getAttribute('aria-invalid')).toBe('false');
      expect((draft as HTMLInputElement).value).toBe('Unrelated new list draft');
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
});
