const APP_VERSION = '1.0.0-rc.1';
const CACHE_PREFIX = 'bord-read-';
const LEGACY_CACHE_PREFIX = 'our-recipes-read-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const OFFLINE_URL = '/offline';
const UPDATE_QUERY_PARAM = '__bord_updated';
const IS_UPDATE = Boolean(self.registration.active);
const RECIPE_DETAIL_PATH = /^\/recipes\/[0-9a-f-]{36}$/i;
const RECIPE_IMAGE_PATH = /^\/api\/v1\/recipes\/[^/]+\/images\/[^/]+$/;

function isSameOriginGet(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

function isCacheableRead(url) {
  return (
    url.pathname === '/recipes' ||
    RECIPE_DETAIL_PATH.test(url.pathname) ||
    url.pathname === '/api/v1/recipes' ||
    /^\/api\/v1\/recipes\/[^/]+$/.test(url.pathname) ||
    RECIPE_IMAGE_PATH.test(url.pathname) ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/icons/favicon-32.png' ||
    url.pathname === '/icons/bord-app-icon-192.png' ||
    url.pathname === '/icons/bord-app-icon-512.png' ||
    url.pathname.startsWith('/api/v1/branding/icons/v1/')
  );
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
      const cached = await (await caches.open(CACHE_NAME)).match(request);
      return cached ?? response;
    }
    return await cacheResponse(request, response);
  } catch {
    const cached = await (await caches.open(CACHE_NAME)).match(request);
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

async function refreshWindowClients() {
  await self.clients.claim();
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(
    windowClients.map(async (client) => {
      client.postMessage({ type: 'BORD_UPDATED', version: APP_VERSION });
      if (typeof client.navigate !== 'function') return;
      const target = new URL(client.url);
      if (target.origin !== self.location.origin) return;
      target.searchParams.set(UPDATE_QUERY_PARAM, APP_VERSION);
      try {
        await client.navigate(target.href);
      } catch {
        // The message and controllerchange handlers remain as reload fallbacks.
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    deleteOldAppCaches().then(async (deletedCacheCount) => {
      if (IS_UPDATE || deletedCacheCount > 0) await refreshWindowClients();
      else await self.clients.claim();
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isSameOriginGet(request)) return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    if (url.pathname === '/recipes' || RECIPE_DETAIL_PATH.test(url.pathname)) {
      event.respondWith(networkFirst(request, caches.match(OFFLINE_URL)));
    } else {
      event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    }
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(networkFirst(request, caches.match(request)));
    return;
  }

  if (isCacheableRead(url)) {
    event.respondWith(networkFirst(request));
  }
});
