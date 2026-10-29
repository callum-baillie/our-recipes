'use client';
export type KitchenConnection =
  'checking' | 'available' | 'offline' | 'server-error' | 'unavailable';
let state: KitchenConnection = 'checking';
let request: Promise<boolean> | null = null;
let controller: AbortController | null = null;
let retryTimer: number | undefined;
let retryDelay = 2000;
const listeners = new Set<() => void>();
export function setKitchenConnection(next: KitchenConnection) {
  if (state !== next) {
    state = next;
    listeners.forEach((listener) => listener());
  }
}
export const kitchenConnectionSnapshot = () => state;
export const kitchenConnectionServerSnapshot = () => 'checking' as const;
function clearRetry() {
  window.clearTimeout(retryTimer);
  retryTimer = undefined;
}
function scheduleRetry() {
  clearRetry();
  if (!listeners.size || !navigator.onLine || document.visibilityState === 'hidden') return;
  retryTimer = window.setTimeout(recheck, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30_000);
}
export async function checkKitchenConnection(): Promise<boolean> {
  if (!navigator.onLine) {
    disconnected();
    return false;
  }
  if (request) return request;
  clearRetry();
  // Keep the last known result during background retries; do not flash a
  // checking notice (or interrupt a draft) every time we check the server.
  request = (async () => {
    const activeController = new AbortController();
    controller = activeController;
    const timer = window.setTimeout(() => activeController.abort(), 8000);
    try {
      const response = await fetch('/api/v1/health', {
        cache: 'no-store',
        signal: activeController.signal,
      });
      const body = await response.json().catch(() => null);
      if (activeController.signal.aborted) throw new Error('Connection check cancelled');
      const reached = response.ok && body?.status === 'ok';
      setKitchenConnection(reached ? 'available' : 'server-error');
      if (reached) retryDelay = 2000;
      return reached;
    } catch {
      setKitchenConnection(navigator.onLine ? 'unavailable' : 'offline');
      return false;
    } finally {
      window.clearTimeout(timer);
      controller = null;
      request = null;
      if (state !== 'available') scheduleRetry();
    }
  })();
  return request;
}
function recheck() {
  void checkKitchenConnection();
}
function disconnected() {
  clearRetry();
  controller?.abort();
  setKitchenConnection('offline');
}
function visibilityChanged() {
  if (document.visibilityState === 'visible') recheck();
  else clearRetry();
}
export function subscribeKitchenConnection(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('online', recheck);
    window.addEventListener('offline', disconnected);
    document.addEventListener('visibilitychange', visibilityChanged);
    if (navigator.onLine) recheck();
    else disconnected();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener('online', recheck);
      window.removeEventListener('offline', disconnected);
      document.removeEventListener('visibilitychange', visibilityChanged);
      clearRetry();
    }
  };
}
export function offlineDestination(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    if (
      url.origin === origin &&
      !url.pathname.startsWith('/offline') &&
      !url.pathname.startsWith('/api/') &&
      !/[\\\u0000-\u001f]/u.test(value)
    )
      return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    /* Use the ordinary online library destination. */
  }
  return '/recipes';
}
