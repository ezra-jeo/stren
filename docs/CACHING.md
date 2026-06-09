# Caching in This App

This app uses a small Progressive Web App setup to make the public experience faster and more resilient without risking stale admin or member data.

## Where the caching lives

- Service worker: [`public/sw.js`](../public/sw.js)
- Client registration: [`components/pwa-register.tsx`](../components/pwa-register.tsx)
- App bootstrap: [`app/layout.tsx`](../app/layout.tsx)

The service worker is registered only in production, and it waits until the window `load` event before installing.

## The caching model

### 1. Static shell cache

On install, the service worker pre-caches a small app shell:

- `/landing`
- `/login`
- `/manifest.webmanifest`
- `/stren-logo.png`

Those assets are stored in a versioned static cache named like `stren-static-v4`.

This is the fast-path for the public-facing experience: if the network is slow or temporarily unavailable, the user can still get a basic landing/login shell.

### 2. Runtime cache for assets

For same-origin assets with a destination of:

- `style`
- `script`
- `font`
- `image`

...the service worker uses a cache-first strategy with background refresh:

- If the asset is already in cache, it is served immediately.
- In the background, the service worker fetches a fresh copy and updates the cache.
- If the asset is not cached yet, it goes to the network first.

This is a practical stale-while-revalidate pattern for static resources.

### 3. Network-only routes

The app deliberately avoids caching the dynamic parts of the site:

- `/admin`
- `/member`
- `/kiosk`
- `/signup`
- `/api`

Those routes always go to the network.

This is important because these pages are session-aware and data-sensitive. Caching them can produce stale snapshots, broken auth state, or incorrect repeated loading behavior.

### 4. Navigation requests

For same-origin navigations, the service worker is network-first with a timeout:

- It tries the network.
- If the network does not respond within 4 seconds, it falls back to the cached `/landing` page.
- If that fallback is not available, it returns a network error.

This means the site still opens in poor conditions, but navigations are not aggressively cached.

## Update flow

The app uses an explicit update path in [`components/pwa-register.tsx`](../components/pwa-register.tsx):

- The service worker is registered on `window.load`.
- After registration, the app calls `registration.update()`.
- If there is a waiting worker, it is told to `SKIP_WAITING`.

That keeps updates moving forward instead of leaving old workers around for a long time.

The service worker itself also listens for a `SKIP_WAITING` message and immediately activates.

## Cache versioning

The worker uses a version string:

```js
const CACHE_VERSION = 'v4';
```

That version is part of the cache names:

- `stren-static-v4`
- `stren-runtime-v4`

When the version changes, old caches are deleted during `activate`.

That is the main manual invalidation mechanism.

## Why this app avoids caching some things

There is an important repo-specific caveat: same-origin navigations are not cached directly. A previous stale-navigation issue could cause an infinite loading loop after the first load if HTML or RSC snapshots were reused too aggressively.

Related note from the repo memory:

- service worker should not cache same-origin navigations; stale HTML/RSC snapshots can cause infinite loading loops after the first load
- public gym page caching was reduced to lower stale-data risk

In short: this app prefers fresh HTML for dynamic flows and cache benefits mainly for static resources and the public shell.

## Mental model

A simple way to think about the behavior:

- Public shell pages: fast startup, can fall back offline
- Static assets: cache-first with background refresh
- Admin/member/kiosk/API: always live network
- Updates: versioned caches plus `SKIP_WAITING`

## Where to look in code

- [`public/sw.js`](../public/sw.js) for cache policy and routing decisions
- [`components/pwa-register.tsx`](../components/pwa-register.tsx) for service worker registration
- [`app/layout.tsx`](../app/layout.tsx) for PWA bootstrapping
- [`public/manifest.webmanifest`](../public/manifest.webmanifest) for install metadata

## Learning resources

### Service workers and caching

- MDN Service Worker API: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- MDN Cache Storage API: https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage
- web.dev service workers overview: https://web.dev/learn/pwa/service-workers/
- web.dev caching strategies: https://web.dev/learn/pwa/caching/
- Workbox documentation: https://developer.chrome.com/docs/workbox/

### Progressive Web Apps

- web.dev PWA guide: https://web.dev/learn/pwa/
- Google Chrome PWA fundamentals: https://developer.chrome.com/docs/lighthouse/pwa/
- web.dev app shell model: https://web.dev/learn/pwa/app-shell/

### Next.js and deployment context

- Next.js app router docs: https://nextjs.org/docs/app
- Next.js metadata and manifest docs: https://nextjs.org/docs/app/building-your-application/optimizing/metadata
- Next.js middleware-to-proxy note: https://nextjs.org/docs/messages/middleware-to-proxy

## Suggested next experiments

If you want to learn by changing code, good exercises are:

1. Add one more static asset to the install cache and confirm it loads offline.
2. Change `CACHE_VERSION` and watch old caches get removed on activate.
3. Try a stricter network-first policy for one public page and compare behavior.
4. Add a small cache-busting strategy for a logo or hero image.

## Related docs

- [`TEST_WITHOUT_CRON.md`](../TEST_WITHOUT_CRON.md)
- [`OTP-AUTH-GUIDE.md`](../OTP-AUTH-GUIDE.md)
- [`CACHE-VERIFICATION.md`](../CACHE-VERIFICATION.md)
