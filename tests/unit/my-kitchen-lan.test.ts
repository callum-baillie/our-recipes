// @vitest-environment jsdom
import { createElement } from 'react';
import { ToastProvider } from '@/components/toast-provider';
import { cleanup, fireEvent, render as baseRender, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MyKitchen } from '@/components/my-kitchen';
import type { KitchenState } from '@/lib/domain/kitchen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it('saves equipment and confirms inventory on LAN HTTP without crypto.randomUUID', async () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal('crypto', { getRandomValues });
  const state: KitchenState = {
    id: 'kitchen',
    householdId: 'household',
    viewerProfileId: 'actor',
    name: 'My Kitchen',
    coverage: 'partial',
    revision: 1,
    canManage: true,
    items: [],
  };
  const commands: Array<{ kind: string; operationId: string; expectedRevision: number }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body));
      commands.push(command);
      expect(new Headers(init?.headers).get('x-bord-expected-profile-id')).toBe('actor');
      return Response.json({
        kitchen: { ...state, revision: commands.length + 1 },
        receipt: { itemIds: [] },
      });
    }),
  );
  render(createElement(MyKitchen, { initial: state, actorKey: 'account:actor', sharing: false }));
  fireEvent.click(screen.getByRole('button', { name: 'Add equipment' }));
  fireEvent.change(screen.getByLabelText('Nickname', { exact: true }), {
    target: { value: 'LAN cooker' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review and save equipment' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Review and save equipment' })).toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm recorded inventory' }));
  await waitFor(() => expect(commands).toHaveLength(2));
  expect(commands.map((command) => command.kind)).toEqual(['add', 'coverage']);
  expect(commands.map((command) => command.expectedRevision)).toEqual([1, 2]);
  for (const command of commands)
    expect(command.operationId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u,
    );
  expect(commands[0]!.operationId).not.toBe(commands[1]!.operationId);
});

function render(ui: Parameters<typeof baseRender>[0]) {
  return baseRender(ui, { wrapper: ToastProvider });
}
