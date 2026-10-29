// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RecipeMadeButton } from '@/components/recipe-made-button';
import { ToastProvider } from '@/components/toast-provider';
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('clears the prior occurrence while a different planned date is loading', async () => {
  let resolveNext!: (value: Response) => void;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        meals: [
          {
            id: 'first',
            recipeId: 'recipe',
            recipeTitle: 'Fish',
            meal: 'dinner',
            effectiveStatus: 'planned',
          },
        ],
      }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
    );
  vi.stubGlobal('fetch', fetcher);
  render(
    createElement(
      ToastProvider,
      null,
      createElement(RecipeMadeButton, { recipeId: 'recipe', initialDate: '2026-10-28' }),
    ),
  );
  await act(async () => {});
  expect((screen.getByRole('button', { name: 'Confirm made' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  fireEvent.change(screen.getByLabelText('Meal date'), { target: { value: '2026-10-29' } });
  const confirm = screen.getByRole('button', { name: 'Confirm made' });
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(confirm);
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  await act(async () =>
    resolveNext(
      Response.json({
        meals: [
          {
            id: 'second',
            recipeId: 'recipe',
            recipeTitle: 'Fish',
            meal: 'lunch',
            effectiveStatus: 'planned',
          },
        ],
      }),
    ),
  );
  expect((screen.getByLabelText('Planned meal') as HTMLSelectElement).value).toBe('second');
});
