const APP_VERSION = '1.0.0-rc.27';
const CACHE_PREFIX = 'bord-read-';
const LEGACY_CACHE_PREFIX = 'our-recipes-read-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const OFFLINE_URL = '/offline';
const clientVersions = new Map();
const IS_UPDATE = Boolean(self.registration.active);

function isSameOriginGet(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

function isCacheableRead(request, url) {
  if (request.headers.has('authorization')) return false;
  return (
    url.pathname.startsWith('/_next/static/') ||
    /^\/api\/v1\/recipes\/[^/]+\/images\/[^/]+$/u.test(url.pathname) ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/icons/favicon-32.png' ||
    url.pathname === '/icons/bord-app-icon-192.png' ||
    url.pathname === '/icons/bord-app-icon-512.png' ||
    url.pathname.startsWith('/api/v1/branding/icons/v1/')
  );
}

function isOfflineRecipeNavigation(url) {
  return /^\/recipes\/[^/]+$/u.test(url.pathname);
}

async function cacheResponse(request, response) {
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request);
    if (!response.ok) {
      const cached = await cachedRead(request);
      return cached ?? response;
    }
    return await cacheResponse(request, response);
  } catch {
    const cached = await cachedRead(request);
    return cached ?? fallback;
  }
}

async function deleteOldAppCaches() {
  const keys = await caches.keys();
  const oldAppCaches = keys.filter(
    (key) =>
      (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) && key !== CACHE_NAME,
  );
  await Promise.all(oldAppCaches.map((key) => caches.delete(key)));
  return oldAppCaches.length;
}

async function notifyWindowClients() {
  await self.clients.claim();
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: 'BORD_UPDATED', version: APP_VERSION });
}
async function cleanAcknowledgedCaches() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.every((client) => clientVersions.get(client.id) === APP_VERSION))
    await deleteOldAppCaches();
}
async function offlineFallback() {
  const cached = await (await caches.open(CACHE_NAME)).match(OFFLINE_URL);
  if (!cached)
    return new Response('Kitchen unavailable. Reconnect and try again.', { status: 503 });
  const headers = new Headers(cached.headers);
  headers.set('X-Bord-Offline', '1');
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  });
}
async function cachedRead(request) {
  const current = await (await caches.open(CACHE_NAME)).match(request);
  if (current) return current;
  // Keep existing tabs readable until every tab has adopted the new app version.
  for (const key of await caches.keys()) {
    if (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) {
      const previous = await (await caches.open(key)).match(request);
      if (previous) return previous;
    }
  }
}

async function cacheOfflineShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
  const shell = await cache.match(OFFLINE_URL);
  if (!shell) throw new Error('Offline shell was not cached');
  const html = await shell.text();
  const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gu)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter(
      (url) => url.origin === self.location.origin && url.pathname.startsWith('/_next/static/'),
    );
  // The recovery button needs the offline route's client bundle as well as its HTML.
  await cache.addAll([...new Set(assets.map((url) => url.href))]);
}
self.addEventListener('install', (event) => {
  event.waitUntil(cacheOfflineShell().then(() => (IS_UPDATE ? undefined : self.skipWaiting())));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(IS_UPDATE ? notifyWindowClients() : self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'BORD_CLIENT_READY' && event.source?.id) {
    clientVersions.set(event.source.id, event.data.version);
    event.waitUntil(cleanAcknowledgedCaches());
  }
  if (event.data?.type === 'CLEAR_AUTH_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX))
              .map((key) => caches.delete(key)),
          ),
        ),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isSameOriginGet(request)) return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(
      isOfflineRecipeNavigation(url)
        ? networkFirst(request, offlineFallback())
        : fetch(request).catch(() => offlineFallback()),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(networkFirst(request, caches.match(request)));
    return;
  }

  if (isCacheableRead(request, url)) {
    event.respondWith(networkFirst(request));
  }
});
