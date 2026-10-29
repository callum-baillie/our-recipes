// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import { ToastProvider } from '@/components/toast-provider';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { DecisionAssistance } from '@/components/decision-assistance';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('loads select choices, exposes a failed load, and clears the stale error on retry', async () => {
  let finishFirst!: (response: Response) => void;
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(
      Response.json({ recipes: [{ id: 'soup', title: 'Lentil soup' }], lists: [], stores: [] }),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(createElement(DecisionAssistance, { initialTask: 'ingredient_match' }));
  expect(await screen.findByRole('status', { name: 'Loading recipes' })).toBeTruthy();
  await act(async () => {
    finishFirst(
      Response.json({ error: { message: 'Saved choices are unavailable.' } }, { status: 503 }),
    );
  });
  expect(await screen.findByText('Saved choices are unavailable.')).toBeTruthy();
  expect((screen.getByRole('combobox', { name: 'Recipe' }) as HTMLSelectElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading choices' }));
  expect(screen.queryByText('Saved choices are unavailable.')).toBeNull();
  await waitFor(() => expect(screen.getByRole('option', { name: 'Lentil soup' })).toBeTruthy());
  expect((screen.getByRole('combobox', { name: 'Recipe' }) as HTMLSelectElement).disabled).toBe(
    false,
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

function render(ui: Parameters<typeof baseRender>[0]) {
  return baseRender(ui, { wrapper: ToastProvider });
}
