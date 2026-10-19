// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RecipeCollectionButton } from '@/components/recipe-collection-button';
import { ToastProvider } from '@/components/toast-provider';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('distinguishes a failed collection load from a known empty collection list and offers retry', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(Response.json({ collections: [] }));
  vi.stubGlobal('fetch', fetchMock);
  render(
    createElement(
      ToastProvider,
      null,
      createElement(RecipeCollectionButton, { recipeId: 'recipe', recipeTitle: 'Soup' }),
    ),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Add Soup to a collection' })),
  );
  expect(screen.queryByText('Create your first collection and add this recipe to it.')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('could not reach');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading collections' })),
  );
  expect(screen.getByText('Create your first collection and add this recipe to it.')).toBeTruthy();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.getByRole('button', { name: 'Create and add' })).toBeTruthy();
});
