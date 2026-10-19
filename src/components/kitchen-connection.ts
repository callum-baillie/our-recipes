'use client';
export type KitchenConnection = 'checking' | 'available' | 'unavailable';
let state: KitchenConnection = 'checking';
let request: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
export function setKitchenConnection(next: KitchenConnection) {
  if (state !== next) {
    state = next;
    listeners.forEach((listener) => listener());
  }
}
export const kitchenConnectionSnapshot = () => state;
export const kitchenConnectionServerSnapshot = () => 'checking' as const;
export async function checkKitchenConnection(): Promise<boolean> {
  if (request) return request;
  setKitchenConnection('checking');
  request = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/v1/health', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      const reached = response.ok && body?.status === 'ok';
      setKitchenConnection(reached ? 'available' : 'unavailable');
      return reached;
    } catch {
      setKitchenConnection('unavailable');
      return false;
    } finally {
      window.clearTimeout(timer);
      request = null;
    }
  })();
  return request;
}
function recheck() {
  void checkKitchenConnection();
}
function disconnected() {
  setKitchenConnection('unavailable');
}
export function subscribeKitchenConnection(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('online', recheck);
    window.addEventListener('offline', disconnected);
    if (navigator.onLine) recheck();
    else disconnected();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener('online', recheck);
      window.removeEventListener('offline', disconnected);
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
