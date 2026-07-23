'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { useToast } from '@/components/toast-provider';

const APP_CACHE_PREFIXES = ['bord-read-', 'our-recipes-read-'];
const UPDATE_QUERY_PARAM = '__bord_updated';
const LEGACY_UPDATE_QUERY_PARAM = '__our_recipes_updated';
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

function updateUrl(version: string): string {
  const target = new URL(window.location.href);
  target.searchParams.set(UPDATE_QUERY_PARAM, version);
  return target.href;
}

function takeUpdateMarker(): string | null {
  const current = new URL(window.location.href);
  const version =
    current.searchParams.get(UPDATE_QUERY_PARAM) ??
    current.searchParams.get(LEGACY_UPDATE_QUERY_PARAM);
  if (!version) return null;
  current.searchParams.delete(UPDATE_QUERY_PARAM);
  current.searchParams.delete(LEGACY_UPDATE_QUERY_PARAM);
  window.history.replaceState(window.history.state, '', current);
  return version;
}

async function removeAppCaches(): Promise<void> {
  const keys = await window.caches.keys();
  await Promise.all(
    keys
      .filter((key) => APP_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => window.caches.delete(key)),
  );
}

function subscribeToConnectivity(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function PwaRegistration() {
  const { showToast } = useToast();
  const online = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => {
    const updatedVersion = takeUpdateMarker();
    if (updatedVersion) showToast(`Bòrd updated to ${updatedVersion}.`, 'success');

    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    const shouldRegister =
      process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_ENABLE_PWA_IN_DEVELOPMENT === 'true';

    if (!shouldRegister) {
      void Promise.all([navigator.serviceWorker.getRegistrations(), removeAppCaches()])
        .then(async ([registrations]) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .then((results) => {
          if (results.some(Boolean)) window.location.reload();
        });
      return;
    }

    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    let registration: ServiceWorkerRegistration | null = null;

    function reloadForUpdate(version = 'the current version') {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.replace(updateUrl(version));
    }

    function handleControllerChange() {
      reloadForUpdate();
    }

    function handleWorkerMessage(event: MessageEvent) {
      if (event.data?.type === 'BORD_UPDATED' || event.data?.type === 'OUR_RECIPES_UPDATED') {
        reloadForUpdate(String(event.data.version || 'the current version'));
      }
    }

    function checkForUpdate() {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void registration?.update().catch(() => undefined);
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
    window.addEventListener('online', checkForUpdate);
    document.addEventListener('visibilitychange', checkForUpdate);

    const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((nextRegistration) => {
        registration = nextRegistration;
        nextRegistration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        return nextRegistration.update();
      })
      .catch(() => {
        // Offline reading is an enhancement; the household workflow remains usable online.
      });

    return () => {
      window.clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker.removeEventListener('message', handleWorkerMessage);
      window.removeEventListener('online', checkForUpdate);
      document.removeEventListener('visibilitychange', checkForUpdate);
    };
  }, [showToast]);

  return online ? null : (
    <div className="offline-read-only-banner" role="status">
      Offline reading only. Changes are unavailable and will not be queued.
    </div>
  );
}
