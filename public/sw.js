const CACHE_VERSION = 'v9';
const STATIC_CACHE = `stren-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `stren-runtime-${CACHE_VERSION}`;

const APP_SHELL_URLS = [
  '/landing',
  '/manifest.webmanifest',
  '/stren-logo.png'
];
const NETWORK_ONLY_PREFIXES = ['/admin', '/member', '/kiosk', '/auth', '/gyms', '/api'];

// Next fingerprints its JavaScript and CSS by deployment. Serving either from
// this worker can strand a page on a now-missing chunk after a deploy, leaving
// the landing HTML visible without its styles. The browser already caches valid
// immutable chunks; the worker only keeps offline-safe media.
const RUNTIME_CACHEABLE_DESTINATIONS = new Set(['font', 'image']);

function isCacheableResponse(response) {
  return response && response.ok;
}

function hasExpectedAssetType(request, response) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (request.destination === 'image') return contentType.startsWith('image/');
  if (request.destination === 'font') return contentType.startsWith('font/') || contentType.includes('font');
  return false;
}

function cacheResponse(cacheName, request, response) {
  return caches.open(cacheName).then((cache) => {
    cache.put(request, response.clone());
  });
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Network timeout')), timeoutMs);
    }),
  ]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => undefined)
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const expectedCaches = [STATIC_CACHE, RUNTIME_CACHE];
      const existingCaches = await caches.keys();

      await Promise.all(
        existingCaches
          .filter((cacheName) => !expectedCaches.includes(cacheName))
          .map((cacheName) => caches.delete(cacheName)) // Clears existing cached upon activate
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNetworkOnlyRoute = NETWORK_ONLY_PREFIXES.some((prefix) =>
    requestUrl.pathname.startsWith(prefix)
  );

  if (!isSameOrigin) {
    return;
  }

  if (isNetworkOnlyRoute) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        try {
          const networkResponse = await withTimeout(fetch(request), 4000);
          if (isCacheableResponse(networkResponse)) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }

          const shellFallback = await caches.match('/landing');
          if (shellFallback) {
            return shellFallback;
          }

          return Response.error();
        }
      })()
    );
    return;
  }

  if (RUNTIME_CACHEABLE_DESTINATIONS.has(request.destination)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cachedResponse = await cache.match(request);

        const networkPromise = fetch(request)
          .then((networkResponse) => {
            if (isCacheableResponse(networkResponse) && hasExpectedAssetType(request, networkResponse)) {
              cache.put(request, networkResponse.clone());
            }

            return networkResponse;
          })
          .catch(() => undefined);

        if (cachedResponse && hasExpectedAssetType(request, cachedResponse)) {
          event.waitUntil(networkPromise);
          return cachedResponse;
        }

        if (cachedResponse) {
          event.waitUntil(cache.delete(request));
        }

        const networkResponse = await networkPromise;
        if (networkResponse) {
          return networkResponse;
        }

        return Response.error();
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        return Response.error();
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
