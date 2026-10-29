// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let unsubscribe: (() => void) | undefined;
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('shares an in-flight request and keeps available state during background checks', async () => {
  const connection = await import('@/components/kitchen-connection');
  let respond!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const first = connection.checkKitchenConnection();
  const second = connection.checkKitchenConnection();
  expect(fetch).toHaveBeenCalledTimes(1);
  respond(Response.json({ status: 'ok' }));
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  const background = connection.checkKitchenConnection();
  expect(connection.kitchenConnectionSnapshot()).toBe('available');
  respond(Response.json({ status: 'ok' }));
  await background;
});
it('recovers from server failure with bounded backoff and stops retrying after success', async () => {
  const connection = await import('@/components/kitchen-connection');
  const fetch = vi.fn(async () => Response.json({ status: 'error' }, { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  unsubscribe = connection.subscribeKitchenConnection(vi.fn());
  await connection.checkKitchenConnection();
  expect(connection.kitchenConnectionSnapshot()).toBe('server-error');
  for (const delay of [2000, 4000, 8000, 16000, 30000, 30000]) {
    const before = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(fetch).toHaveBeenCalledTimes(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(before + 1);
  }
  fetch.mockResolvedValue(Response.json({ status: 'ok' }));
  await vi.advanceTimersByTimeAsync(30000);
  expect(connection.kitchenConnectionSnapshot()).toBe('available');
  const after = fetch.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetch).toHaveBeenCalledTimes(after);
});
it('bounds hanging checks and automatically recovers when the server wakes', async () => {
  const connection = await import('@/components/kitchen-connection');
  const fetch = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_, reject) => {
        options.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
  vi.stubGlobal('fetch', fetch);
  unsubscribe = connection.subscribeKitchenConnection(vi.fn());
  await vi.advanceTimersByTimeAsync(8000);
  expect(connection.kitchenConnectionSnapshot()).toBe('unavailable');
  fetch.mockResolvedValue(Response.json({ status: 'ok' }));
  await vi.advanceTimersByTimeAsync(2000);
  expect(connection.kitchenConnectionSnapshot()).toBe('available');
});
it('does not let a stale response overwrite an offline event', async () => {
  const connection = await import('@/components/kitchen-connection');
  let respond!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  unsubscribe = connection.subscribeKitchenConnection(vi.fn());
  const pending = connection.checkKitchenConnection();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  window.dispatchEvent(new Event('offline'));
  respond(Response.json({ status: 'ok' }));
  expect(await pending).toBe(false);
  expect(connection.kitchenConnectionSnapshot()).toBe('offline');
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue(Response.json({ status: 'ok' }));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  window.dispatchEvent(new Event('online'));
  expect(await connection.checkKitchenConnection()).toBe(true);
});
it('pauses retries in hidden tabs and checks immediately when returning', async () => {
  const connection = await import('@/components/kitchen-connection');
  const fetch = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', fetch);
  unsubscribe = connection.subscribeKitchenConnection(vi.fn());
  await connection.checkKitchenConnection();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await connection.checkKitchenConnection();
  expect(fetch).toHaveBeenCalledTimes(2);
  unsubscribe();
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('treats invalid health responses as a server error rather than becoming stuck checking', async () => {
  const connection = await import('@/components/kitchen-connection');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<html>Error</html>')),
  );
  expect(await connection.checkKitchenConnection()).toBe(false);
  expect(connection.kitchenConnectionSnapshot()).toBe('server-error');
});
