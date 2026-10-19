// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    vi.stubGlobal('scrollTo', vi.fn());
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(hover: hover) and (pointer: fine)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('follows keyboard resize and pan, preserves reading position, and restores the page on close', async () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    vi.stubGlobal('visualViewport', viewport);
    vi.stubGlobal('innerHeight', 844);
    vi.stubGlobal('scrollY', 240);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/threads')) return Response.json({ threads: [{ id: 'history' }] });
        if (url.includes('app-actions')) return Response.json({ proposals: [] });
        return Response.json({
          messages: [{ id: 'latest', role: 'assistant', content: 'Latest reply' }],
          actions: [],
          jobs: [],
        });
      }),
    );
    const view = render(createElement(AiAssistantDrawer, { open: true, onClose: vi.fn() }));
    await screen.findByText('Latest reply');
    const drawer = screen.getByRole('dialog', { name: 'Kitchen assistant' });
    const list = screen.getByText('Latest reply').closest('[aria-live]') as HTMLElement;
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 300 },
    });
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-240px');
    await act(async () => {
      viewport.height = 440;
      viewport.offsetTop = 36;
      viewport.dispatchEvent(new Event('resize'));
    });
    await waitFor(() =>
      expect(drawer.style.getPropertyValue('--assistant-viewport-height')).toBe('440px'),
    );
    expect(drawer.style.getPropertyValue('--assistant-viewport-top')).toBe('36px');
    expect(drawer.style.getPropertyValue('--assistant-layout-height')).toBe('844px');
    expect(drawer.dataset.keyboardOpen).toBe('true');
    expect(list.scrollTop).toBe(1200);
    // Let viewport-driven scroll events settle before simulating deliberate reading.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    list.scrollTop = 100;
    fireEvent.scroll(list);
    await act(async () => {
      viewport.offsetTop = 62;
      viewport.dispatchEvent(new Event('scroll'));
    });
    await waitFor(() =>
      expect(drawer.style.getPropertyValue('--assistant-viewport-top')).toBe('62px'),
    );
    expect(list.scrollTop).toBe(100);
    await act(async () => {
      viewport.height = 844;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event('resize'));
    });
    await waitFor(() => expect(drawer.dataset.keyboardOpen).toBe('false'));
    view.rerender(createElement(AiAssistantDrawer, { open: false, onClose: vi.fn() }));
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 240, left: 0, behavior: 'instant' });
    // Removed listeners must not mutate the closed surface.
    viewport.height = 300;
    viewport.dispatchEvent(new Event('resize'));
    expect(drawer.style.getPropertyValue('--assistant-viewport-height')).toBe('844px');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('compacts proposals, sends desktop Enter, and keeps mobile Enter for new lines', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/ai/chat/threads' && !init?.method) {
        return Response.json({ threads: [{ id: 'thread-1' }] });
      }
      if (url.startsWith('/api/v1/ai/app-actions?')) return Response.json({ proposals: [] });
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
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);

    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1),
    );
    expect(await screen.findByText('I can help with that.')).toBeTruthy();

    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    fireEvent.change(composer, { target: { value: 'Plan breakfast too' } });
    expect(fireEvent.keyDown(composer, { key: 'Enter' })).toBe(true);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
});
