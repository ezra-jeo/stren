const CACHE_VERSION = 'v5';
const STATIC_CACHE = `stren-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `stren-runtime-${CACHE_VERSION}`;

const APP_SHELL_URLS = [
  '/landing',
  '/login',
  '/manifest.webmanifest',
  '/stren-logo.png'
];
const NETWORK_ONLY_PREFIXES = ['/admin', '/member', '/kiosk', '/signup', '/api'];

const STATIC_DESTINATIONS = new Set(['style', 'script', 'font', 'image']);

function isCacheableResponse(response) {
  return response && response.ok;
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

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cachedResponse = await cache.match(request);

        const networkPromise = fetch(request)
          .then((networkResponse) => {
            if (isCacheableResponse(networkResponse)) {
              cache.put(request, networkResponse.clone());
            }

            return networkResponse;
          })
          .catch(() => undefined);

        if (cachedResponse) {
          event.waitUntil(networkPromise);
          return cachedResponse;
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
