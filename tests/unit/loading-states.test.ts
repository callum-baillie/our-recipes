// @vitest-environment jsdom

import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AsyncSkeleton,
  DialogSkeleton,
  LoadingIndicator,
  InlineSkeleton,
  PageSkeleton,
  type PageSkeletonVariant,
} from '@/components/skeleton';
import { usePendingAction } from '@/components/use-pending-action';

afterEach(cleanup);

const variants: PageSkeletonVariant[] = [
  'account',
  'apiKeys',
  'assistant',
  'auth',
  'bulkImport',
  'capture',
  'collectionDetail',
  'collections',
  'cook',
  'dashboard',
  'detail',
  'suggestions',
  'editor',
  'home',
  'library',
  'offline',
  'pantryInventory',
  'planner',
  'print',
  'securityUpgrade',
  'settings',
  'shoppingList',
  'shoppingLists',
  'tags',
  'workspace',
];

describe('loading surfaces', () => {
  it.each(variants)('%s reserves meaningful content without fake controls', (variant) => {
    const { container } = render(
      createElement(PageSkeleton, { variant, label: 'Loading kitchen' }),
    );
    const status = screen.getByRole('status', { name: 'Loading kitchen' });
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(5);
    expect(container.querySelector('button, input, select, textarea, a')).toBeNull();
    expect(container.querySelector('main')?.dataset.skeletonPage).toBe(variant);
  });

  it.each(['select', 'choices', 'chat', 'scanner', 'rows', 'panel', 'message', 'image'] as const)(
    'provides a named %s component placeholder',
    (variant) => {
      const { container } = render(
        createElement(AsyncSkeleton, { variant, label: 'Loading details' }),
      );
      expect(screen.getByRole('status', { name: 'Loading details' })).toBeTruthy();
      expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    },
  );

  it.each(['form', 'recipeOptions', 'assistant'] as const)(
    'provides %s dialog content',
    (variant) => {
      render(createElement(DialogSkeleton, { variant, label: 'Opening dialog' }));
      expect(screen.getAllByRole('status', { name: 'Opening dialog' }).length).toBeGreaterThan(0);
    },
  );

  it('labels inline data placeholders', () => {
    render(createElement(InlineSkeleton, { label: 'Updating nutrition' }));
    expect(screen.getByRole('status', { name: 'Updating nutrition' })).toBeTruthy();
  });

  it('keeps action activity compact and named', () => {
    const { container } = render(createElement(LoadingIndicator, { label: 'Saving recipe' }));
    expect(screen.getByRole('status', { name: 'Saving recipe' })).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('pending actions', () => {
  it('holds pending state, blocks duplicate requests, then allows retry after failure', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => usePendingAction(onError));
    let reject!: (error: Error) => void;
    const action = vi.fn(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    let work!: Promise<unknown>;
    act(() => {
      work = result.current.run(action);
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      await result.current.run(action);
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject(new Error('Connection interrupted'));
      await work;
    });
    expect(onError).toHaveBeenCalledWith('Connection interrupted');
    expect(result.current.pending).toBe(false);
    await act(async () => {
      expect(await result.current.run(async () => 'saved')).toBe('saved');
    });
    expect(result.current.pending).toBe(false);
  });
});
