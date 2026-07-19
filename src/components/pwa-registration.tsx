'use client';

import { useEffect } from 'react';

import { useToast } from '@/components/toast-provider';

const APP_CACHE_PREFIX = 'our-recipes-read-';
const UPDATE_QUERY_PARAM = '__our_recipes_updated';
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

function updateUrl(version: string): string {
  const target = new URL(window.location.href);
  target.searchParams.set(UPDATE_QUERY_PARAM, version);
  return target.href;
}

function takeUpdateMarker(): string | null {
  const current = new URL(window.location.href);
  const version = current.searchParams.get(UPDATE_QUERY_PARAM);
  if (!version) return null;
  current.searchParams.delete(UPDATE_QUERY_PARAM);
  window.history.replaceState(window.history.state, '', current);
  return version;
}

async function removeAppCaches(): Promise<void> {
  const keys = await window.caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith(APP_CACHE_PREFIX)).map((key) => window.caches.delete(key)),
  );
}

export function PwaRegistration() {
  const { showToast } = useToast();

  useEffect(() => {
    const updatedVersion = takeUpdateMarker();
    if (updatedVersion) showToast(`Our Recipes updated to ${updatedVersion}.`, 'success');

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
      if (event.data?.type === 'OUR_RECIPES_UPDATED') {
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

  return null;
}
