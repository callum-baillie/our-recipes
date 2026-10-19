'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import packageInfo from '../../package.json';
import { useToast } from '@/components/toast-provider';
import {
  checkKitchenConnection,
  kitchenConnectionSnapshot,
  kitchenConnectionServerSnapshot,
  subscribeKitchenConnection,
} from './kitchen-connection';
const APP_CACHE_PREFIXES = ['bord-read-', 'our-recipes-read-'];
const UPDATE_QUERY_PARAM = '__bord_updated';
const LEGACY_UPDATE_QUERY_PARAM = '__our_recipes_updated';
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const appVersion = packageInfo.version;
function updateUrl(version: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(UPDATE_QUERY_PARAM, version);
  return url.href;
}
function takeUpdateMarker() {
  const url = new URL(window.location.href);
  const version =
    url.searchParams.get(UPDATE_QUERY_PARAM) ?? url.searchParams.get(LEGACY_UPDATE_QUERY_PARAM);
  if (!version) return null;
  url.searchParams.delete(UPDATE_QUERY_PARAM);
  url.searchParams.delete(LEGACY_UPDATE_QUERY_PARAM);
  window.history.replaceState(window.history.state, '', url);
  return version;
}
async function removeAppCaches() {
  const keys = await window.caches.keys();
  await Promise.all(
    keys
      .filter((key) => APP_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => window.caches.delete(key)),
  );
}
export function PwaRegistration() {
  const { showToast } = useToast();
  const connection = useSyncExternalStore(
    subscribeKitchenConnection,
    kitchenConnectionSnapshot,
    kitchenConnectionServerSnapshot,
  );
  const [updateReady, setUpdateReady] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadRequested = useRef(false);
  const navigated = useRef(false);
  const notice = useRef<HTMLDivElement>(null);
  const performReload = useRef<(version: string) => void>(() => {});
  useEffect(() => {
    const element = notice.current;
    if (!element) return;
    const measure = () => {
      document.documentElement.style.setProperty(
        '--app-notice-height',
        `${Math.ceil(element.getBoundingClientRect().height) + 24}px`,
      );
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        focused.matches('input, select, textarea, button, a[href], [contenteditable="true"]') &&
        !element.contains(focused) &&
        !focused.closest('dialog[open]') &&
        focused.getBoundingClientRect().bottom > element.getBoundingClientRect().top - 12
      ) {
        focused.scrollIntoView?.({ block: 'center', behavior: 'instant' });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--app-notice-height');
    };
  }, [connection, updateReady]);
  useEffect(() => {
    const updated = takeUpdateMarker();
    if (updated) showToast(`Bòrd updated to ${updated}.`, 'success');
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    const shouldRegister =
      process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_ENABLE_PWA_IN_DEVELOPMENT === 'true';
    let disposed = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    function reload(version: string) {
      if (navigated.current) return;
      navigated.current = true;
      window.location.replace(updateUrl(version));
    }
    performReload.current = reload;
    if (!shouldRegister) {
      // A development cleanup is also explicit: it must not interrupt an entered form.
      void Promise.all([navigator.serviceWorker.getRegistrations(), removeAppCaches()])
        .then(async ([registrations]) => {
          const removed = await Promise.all(registrations.map((item) => item.unregister()));
          if (!disposed && removed.some(Boolean)) setUpdateReady('development cleanup');
        })
        .catch(() => {});
      return () => {
        disposed = true;
      };
    }
    function ready(version = 'the current version') {
      if (disposed) return;
      if (reloadRequested.current) reload(version);
      else setUpdateReady(version);
    }
    function controllerChanged() {
      if (reloadRequested.current) reload(appVersion);
      else if (hadController) ready();
      navigator.serviceWorker.controller?.postMessage({
        type: 'BORD_CLIENT_READY',
        version: appVersion,
      });
    }
    function message(event: MessageEvent) {
      if (event.data?.type === 'BORD_UPDATED' || event.data?.type === 'OUR_RECIPES_UPDATED')
        ready(String(event.data.version || 'the current version'));
    }
    function check() {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void registration.current?.update().catch(() => {});
        void checkKitchenConnection();
      }
    }
    function watch(item: ServiceWorkerRegistration) {
      registration.current = item;
      if (item.waiting) ready();
      item.addEventListener('updatefound', found);
    }
    function found() {
      const installing = registration.current?.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && registration.current?.waiting) ready();
      });
    }
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    navigator.serviceWorker.addEventListener('message', message);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    navigator.serviceWorker.controller?.postMessage({
      type: 'BORD_CLIENT_READY',
      version: appVersion,
    });
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((item) => {
        if (disposed) return;
        watch(item);
        return item.update();
      })
      .catch(() => {});
    return () => {
      disposed = true;
      window.clearInterval(timer);
      registration.current?.removeEventListener('updatefound', found);
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
      navigator.serviceWorker.removeEventListener('message', message);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [showToast]);
  function reloadWhenReady() {
    if (reloadRequested.current) return;
    reloadRequested.current = true;
    setReloading(true);
    const waiting = registration.current?.waiting;
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
    else performReload.current(updateReady ?? appVersion);
  }
  if (connection === 'available' && !updateReady) return null;
  return (
    <div ref={notice} className="pwa-status-area">
      {connection !== 'available' && (
        <div className="offline-read-only-banner" role="status">
          {connection === 'checking' ? 'Checking kitchen access…' : 'Kitchen unavailable.'} Changes
          need a connection and are not queued.{' '}
          <button
            type="button"
            className="text-button"
            disabled={connection === 'checking'}
            onClick={() => void checkKitchenConnection()}
          >
            Check connection
          </button>
        </div>
      )}
      {updateReady && (
        <div className="app-update-notice" role="status">
          <p>
            Bòrd update ready. Finish your current task before reloading; unsaved fields may be
            lost.
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={reloading}
            onClick={reloadWhenReady}
          >
            {reloading ? 'Reloading…' : 'Reload when ready'}
          </button>
        </div>
      )}
    </div>
  );
}
