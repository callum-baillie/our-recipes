// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PwaRegistration } from '@/components/pwa-registration';
import { ToastProvider } from '@/components/toast-provider';
import { checkKitchenConnection, setKitchenConnection } from '@/components/kitchen-connection';
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('isSecureContext', false);
  setKitchenConnection('checking');
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  render(
    createElement(
      ToastProvider,
      null,
      createElement('input', { 'aria-label': 'Recipe draft' }),
      createElement(PwaRegistration),
    ),
  );
}
it('does not flash a connection warning on an ordinary successful page load', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 'ok' })),
  );
  mount();
  expect(screen.queryByText(/Connecting to the Bòrd server/)).toBeNull();
  await act(async () => {
    await checkKitchenConnection();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.queryByRole('button', { name: 'Check connection' })).toBeNull();
});
it('explains a slow initial check, then clears the notice on success', async () => {
  let respond!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    ),
  );
  mount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(screen.getByText(/Connecting to the Bòrd server/)).toBeTruthy();
  expect(screen.getByText(/Checking that your household data is ready/)).toBeTruthy();
  await act(async () => {
    respond(Response.json({ status: 'ok' }));
    await checkKitchenConnection();
  });
  expect(screen.queryByRole('button', { name: 'Check connection' })).toBeNull();
});
it('keeps an actionable outage notice until recovery and preserves entered work and focus', async () => {
  const fetch = vi.fn(async () => Response.json({ status: 'error' }, { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  mount();
  const draft = screen.getByLabelText('Recipe draft') as HTMLInputElement;
  fireEvent.change(draft, { target: { value: 'Keep this recipe' } });
  draft.focus();
  await act(async () => {
    await checkKitchenConnection();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(screen.getByText(/The Bòrd server responded, but is not ready/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check connection' })).toBeTruthy();
  fetch.mockResolvedValue(Response.json({ status: 'ok' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(screen.queryByRole('button', { name: 'Check connection' })).toBeNull();
  expect(draft.value).toBe('Keep this recipe');
  expect(document.activeElement).toBe(draft);
  expect(fetch).toHaveBeenLastCalledWith('/api/v1/health', {
    cache: 'no-store',
    signal: expect.any(AbortSignal),
  });
});
