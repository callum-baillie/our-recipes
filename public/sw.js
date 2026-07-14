const CACHE_NAME = 'our-recipes-read-v2';
const OFFLINE_URL = '/offline';
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
    url.pathname === '/icons/our-recipes-mark.svg'
  );
}

async function cacheResponse(request, response) {
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  return cacheResponse(request, await fetch(request));
}

async function networkFirst(request, fallback) {
  try {
    return await cacheResponse(request, await fetch(request));
  } catch {
    const cached = await (await caches.open(CACHE_NAME)).match(request);
    return cached ?? fallback;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
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
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isCacheableRead(url)) {
    event.respondWith(networkFirst(request));
  }
});
