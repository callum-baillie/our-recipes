// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: () => null,
}));

import { AiAssistantDrawer } from '@/components/ai-assistant-drawer';

const recipeAction = {
  id: 'action-1',
  kind: 'recipe_create',
  status: 'pending',
  result: null,
  preview: {
    operation: 'create recipe',
    image: { status: 'unavailable' },
    recipe: {
      title: 'Cauliflower-Forward Mac and Cheese',
      summary: 'A lighter cauliflower-based dinner.',
      servings: '6 servings',
      prepMinutes: 20,
      cookMinutes: 35,
      restMinutes: 0,
      difficulty: 'Easy',
      nutritionCalories: 300,
      ingredientGroups: [
        {
          name: 'Main',
          ingredients: [{ quantity: 1, unit: 'head', item: 'cauliflower', note: '' }],
        },
      ],
    },
  },
};

describe('AI assistant drawer', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('compacts historical proposal text and sends with Enter but not Shift+Enter', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/ai/chat/threads' && !init?.method) {
        return Response.json({ threads: [{ id: 'thread-1' }] });
      }
      if (url === '/api/v1/ai/chat/threads/thread-1' && !init?.method) {
        return Response.json({
          messages: [
            {
              id: 'message-1',
              role: 'assistant',
              actionId: 'action-1',
              content:
                'I drafted a **Cauliflower-Forward Mac and Cheese** recipe.\n\nMakes 6 servings\nAbout 55 minutes cooking\nEstimated per serving: **300 calories**',
            },
          ],
          actions: [recipeAction],
        });
      }
      if (url === '/api/v1/ai/chat/threads/thread-1/messages' && init?.method === 'POST') {
        return new Response(
          [
            JSON.stringify({ type: 'status', message: 'Complete' }),
            JSON.stringify({ type: 'text', delta: 'I can help with that.' }),
            JSON.stringify({ type: 'done', messageId: 'message-2', actionId: null }),
            '',
          ].join('\n'),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(AiAssistantDrawer, { open: true, onClose: vi.fn() }));

    expect(
      await screen.findByText(
        'I created a recipe preview and kept your preferences in mind. Review it below when you’re ready.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/I drafted a/iu)).toBeNull();

    const composer = screen.getByLabelText('Message the AI assistant');
    fireEvent.change(composer, { target: { value: 'Plan a quick dinner' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('I can help with that.')).toBeTruthy();
  });
});
