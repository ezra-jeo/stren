# Stren Caching and Performance Verification Guide

This document explains how caching currently works in the app and how to verify that:

- fresh database changes are visible immediately
- offline support still works for safe/public pages
- the site feels fast in real usage

## 1. Current Caching Design

Caching is handled by two layers:

1. Browser service worker logic in public/sw.js
2. Next.js route prefetch for admin navigation in app/admin/layout.tsx

### Service Worker Scope

The service worker is registered only in production builds.

See:
- components/pwa-register.tsx
- app/layout.tsx

### What Is Cached

The service worker caches:

- Public app shell assets (example: logo/manifest and static files)
- Public navigation pages:
  - /
  - /landing
  - /login
- Static resources (style, script, font, image) with a stale-while-revalidate style pattern

See:
- public/sw.js

### What Is Never Cached (Network-Only)

To avoid stale database views, these route families are always fetched from network:

- /admin
- /member
- /kiosk
- /signup
- /api

This means your admin/member data screens should always reflect live DB state when online.

See:
- public/sw.js

## 2. Why This Prevents "Stuck" Database State

The earlier risk was caching dynamic app navigations and API responses too aggressively.

Now:

- dynamic/authenticated pages are network-only
- API routes are network-only
- only safe public shell/pages are cached for offline resilience

So database writes (add/update/delete) should appear immediately once the network request succeeds.

## 3. Preconditions Before Testing

Service worker does not run in normal dev mode. Test using production build.

1. Build:

```bash
npm run build
```

2. Start production server:

```bash
npm run start
```

3. Open the app in browser.

## 4. Verification Checklist

## A. Verify Service Worker Is Active

1. Open browser DevTools.
2. Go to Application > Service Workers.
3. Confirm /sw.js is installed and activated.
4. Confirm only current cache version entries exist (after refresh).

Reference:
- public/sw.js

## B. Verify Fresh Database Behavior (No Stale Admin Data)

1. Open one admin page (example: members/payments).
2. Add or update a record.
3. Navigate away and back.
4. Confirm updated data is visible without hard refresh.

Expected result:
- No stale snapshot from cache for /admin pages.

## C. Verify Gym Search Freshness

1. Add a new gym from owner/admin flow.
2. Ensure the gym is published in gym profile.
3. Open member search UI and query for the gym.
4. Confirm result appears without browser refresh.

References:
- components/gym-finder-section.tsx
- app/admin/gym-profile/page.tsx

## D. Verify Offline Behavior (Public Pages)

1. Visit /landing while online.
2. In DevTools Network, switch to Offline.
3. Reload /landing.
4. Confirm page still loads from cache.

Expected:
- public pages work offline
- dynamic pages may fail offline (by design) because they are network-only for freshness

## 5. Speed Verification (Practical)

## A. Quick UX Check

- Open /admin and switch tabs (Members, Payments, Reports).
- First click may fetch data; subsequent navigation should feel responsive due to route prefetch + browser cache for assets.

Reference:
- app/admin/layout.tsx

## B. Network Timing Check

In DevTools Network:

1. Preserve log enabled
2. Disable cache unchecked (normal realistic mode)
3. Click between pages
4. Observe document/data request timings

What to watch:

- document requests for /admin* should go to network (not service worker cache)
- static files can be served quickly from browser/service worker cache

## C. Lighthouse Snapshot

Run Lighthouse in production mode and compare:

- Performance score
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Time to Interactive (TTI)

Run once cold, once warm (after a second load) and compare improvements.

## 6. Troubleshooting

## "Changes still look stale"

1. Confirm you are running npm run start (not npm run dev).
2. In DevTools Application:
   - unregister service worker
   - clear storage and caches
   - reload app
3. Repeat verification flow.
4. Confirm target page is not under public cached routes.

## "New gym still not found"

Check gym publish state. Member-facing discovery expects published gyms.

Reference:
- app/admin/gym-profile/page.tsx

## 7. File Map

Main files involved:

- public/sw.js
- components/pwa-register.tsx
- app/layout.tsx
- app/admin/layout.tsx
- components/gym-finder-section.tsx
- app/admin/gym-profile/page.tsx

## 8. Optional Next Improvements

If you want stronger observability, we can add:

1. A tiny debug panel showing service-worker status and cache keys
2. A manual "refresh data" action on data-heavy pages
3. Lightweight client timing logs for route transitions
