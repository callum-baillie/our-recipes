// @vitest-environment jsdom
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/search-facet-bar', () => ({
  ResultsToolbar: ({ actions }: { actions: ReactNode }) => createElement('div', null, actions),
}));
vi.mock('@/components/assisted-review-button', () => ({ AssistedReviewButton: () => null }));
import { RecipeLibraryResults } from '@/components/recipe-library-results';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('enters selection explicitly and retains only failed IDs when recipe titles are identical', async () => {
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
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 409 }))
    .mockResolvedValueOnce(Response.json({}));
  vi.stubGlobal('fetch', fetchMock);
  render(
    createElement(
      RecipeLibraryResults,
      {
        recipes: [
          { id: 'first', title: 'Same recipe', currentRevision: 3 },
          { id: 'second', title: 'Same recipe', currentRevision: 4 },
        ],
        total: 2,
        overall: 2,
        sort: 'recently-updated',
      } as ComponentProps<typeof RecipeLibraryResults>,
      [
        createElement('p', { key: 'first' }, 'First card'),
        createElement('p', { key: 'second' }, 'Second card'),
      ],
    ),
  );
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Select recipes' }));
  fireEvent.click(screen.getByLabelText('Select this page'));
  fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
  const confirmation = screen.getByRole('dialog');
  expect(confirmation.textContent).toContain('Same recipe');
  await act(async () => fireEvent.click(confirmation.querySelector('.primary-button')!));
  const boxes = screen.getAllByRole('checkbox', {
    name: 'Select Same recipe',
  }) as HTMLInputElement[];
  expect(boxes.map((box) => box.checked)).toEqual([true, false]);
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    '/api/v1/recipes/first/status',
    '/api/v1/recipes/second/status',
  ]);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).expectedRevision).toBe(3);
});
