// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({ default: () => null }));

import { AiActionCard, type AiDrawerAction } from '@/components/ai-action-card';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const recipe = {
  title: 'Smoky chickpea stew',
  summary: 'A pantry stew.',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 30,
  ingredientGroups: [
    { name: '', ingredients: [{ quantity: 1, unit: 'tin', item: 'chickpeas', note: '' }] },
  ],
};
const digest = 'a'.repeat(64);
const recipeAction = (overrides: Partial<AiDrawerAction> = {}): AiDrawerAction => ({
  id: 'recipe-1',
  kind: 'recipe_create',
  status: 'pending',
  sourceDigest: digest,
  preview: { recipe, image: { status: 'none' } },
  imageDelivery: { available: true, reason: null, count: 1, mode: 'direct' },
  ...overrides,
});
const planAction = (delivery: AiDrawerAction['imageDelivery']): AiDrawerAction => ({
  id: 'plan-1',
  kind: 'meal_plan_generate',
  status: 'pending',
  preview: {
    selectedProfileIds: ['a'],
    candidate: {
      entries: [
        { plannedFor: '2026-07-20', meal: 'dinner', title: 'Stew', servings: 4, newRecipeKey: 'k' },
      ],
      newRecipes: [{ key: 'k', recipe }],
    },
    conflicts: [],
  },
  imageDelivery: delivery,
});
const render_ = (action: AiDrawerAction, extra: Record<string, unknown> = {}) => {
  const onDecide = vi.fn();
  render(createElement(AiActionCard, { action, busy: false, onDecide, ...extra }));
  return onDecide;
};

describe('meal plan photos', () => {
  it('confirms with photos by default and says when it will run as a batch', () => {
    const onDecide = render_(
      planAction({ available: true, reason: null, count: 1, mode: 'batch' }),
    );
    expect(screen.getByText(/This runs as a batch/)).toBeTruthy();
    expect(screen.getByText(/check back later/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm plan + photos' }));
    expect(onDecide).toHaveBeenCalledWith('plan-1', 'confirm', [], { generateImages: true });
  });

  it('lets the person turn photos off before confirming, which also hides the batch note', () => {
    const onDecide = render_(
      planAction({ available: true, reason: null, count: 1, mode: 'batch' }),
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.queryByText(/This runs as a batch/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm plan' }));
    expect(onDecide).toHaveBeenCalledWith('plan-1', 'confirm', [], { generateImages: false });
  });

  it('explains why photos are unavailable and never requests them', () => {
    const onDecide = render_(
      planAction({
        available: false,
        reason: 'Recipe image generation is turned off in AI settings.',
        count: 1,
        mode: 'direct',
      }),
    );
    expect(screen.getByText(/turned off in AI settings/)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm plan' }));
    expect(onDecide).toHaveBeenCalledWith('plan-1', 'confirm', [], { generateImages: false });
  });

  it('reports queued batch photos after saving', () => {
    render_({
      ...planAction(null),
      status: 'confirmed',
      result: {
        imageGeneration: 'queued',
        imageCount: 2,
        imageExecutionMode: 'batch',
        shoppingListId: 'list-1',
      },
    });
    expect(screen.getByText(/Photos for 2 recipes are being created/)).toBeTruthy();
    expect(screen.getByText(/batch process and may take a while/)).toBeTruthy();
  });

  it('says plainly when the plan saved without photos', () => {
    render_({
      ...planAction(null),
      status: 'confirmed',
      result: { imageGeneration: 'unavailable', imageNote: 'Image generation is turned off.' },
    });
    expect(screen.getByText(/Saved without photos/)).toBeTruthy();
    expect(screen.getByText(/Image generation is turned off/)).toBeTruthy();
  });
});

describe('recipe draft photo', () => {
  const imageFetch = () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        action: recipeAction({ preview: { recipe, image: { status: 'ready', operationId: 'x' } } }),
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('starts one photo request automatically for a live draft', async () => {
    const fetchMock = imageFetch();
    render_(recipeAction(), { autoImage: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/ai/actions/recipe-1/image');
    expect(JSON.parse(String(init.body))).toMatchObject({
      confirm: true,
      expectedSourceDigest: digest,
    });
  });

  it('never starts a photo for an older draft or when the person has turned it off', async () => {
    const fetchMock = imageFetch();
    render_(recipeAction());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Generate an image preview/ })).toBeTruthy();
  });

  it('does not spend when image generation is unavailable, and says why', async () => {
    const fetchMock = imageFetch();
    render_(
      recipeAction({
        imageDelivery: {
          available: false,
          reason: 'AI is not configured on this server.',
          count: 1,
          mode: 'direct',
        },
      }),
      { autoImage: true },
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/AI is not configured on this server/)).toBeTruthy();
  });

  it('does not repeat a request that already exists, even if it failed', async () => {
    const fetchMock = imageFetch();
    render_(
      recipeAction({ preview: { recipe, image: { status: 'failed', operationId: 'earlier' } } }),
      { autoImage: true },
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Try again (paid)' })).toBeTruthy();
  });

  it('offers to ask for changes from the draft card', () => {
    const onRefine = vi.fn();
    render_(recipeAction(), { onRefine });
    fireEvent.click(screen.getByRole('button', { name: 'Ask for changes' }));
    expect(onRefine).toHaveBeenCalledWith('recipe-1');
  });
});
