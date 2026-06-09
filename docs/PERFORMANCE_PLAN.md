# Performance Plan (Lighthouse + Real User Speed)

This plan targets the performance regressions seen in local Lighthouse runs and the reported production slowness. It is structured as short, safe wins first, then larger architecture improvements.

## Current Lighthouse Snapshot (Local)

From the latest local audit:

- FCP: 1.9s
- LCP: 12.7s
- TBT: 2310ms
- CLS: 0

These numbers suggest heavy main-thread work (TBT) and slow largest content render (LCP), which typically point to large JS bundles, heavy chart libraries, or unoptimized images.

## Goals

- Reduce LCP and TBT (primary Lighthouse failures).
- Improve time-to-interactive on login and dashboard flows.
- Keep auth correctness and data freshness intact.

## Phase 0 — Baseline and Telemetry (1–2 hours)

1. Collect a baseline Lighthouse run for:
   - Landing
   - Gym login
   - Admin dashboard
   - Member dashboard
2. Capture real request timing using `Server-Timing` from middleware (already added in current branch).
3. Record LCP, TBT, and JS payload size.

**Success metric**: clear before/after numbers for each flow.

## Phase 1 — Low-Risk Wins (same day)

1. **Image optimization**
   - Keep Next image optimization enabled.
   - Confirm remote image domains allow WebP/AVIF delivery.
   - Audit large hero images and replace with smaller sizes when possible.

2. **Reduce auth middleware work**
   - Public routes should bypass auth client creation and DB calls.
   - Protected routes should avoid duplicate auth calls.

3. **Lazy load heavy components**
   - Defer recharts and other heavy visualization libraries with dynamic import.
   - Only load charts on the pages where they are visible.

4. **Trim icon imports**
   - Avoid importing large icon sets across multiple pages.
   - Consolidate icons into shared modules and remove unused imports.

**Success metric**: LCP < 3s, TBT < 300ms on landing + gym login.

### Phase 1 completed steps (current branch)

- Image optimization enabled in Next config (WebP/AVIF).
- Middleware short-circuits public routes and adds Server-Timing for auth/profile hops.
- Charts lazy-loaded via dynamic imports on admin dashboard, admin reports, and dashboard reports.

### Phase 1 validation

- Build check: `npm run build` succeeded on 2026-05-06 (warning: middleware file convention deprecated).

## Phase 2 — Auth and Hydration Simplification (1–2 days)

1. Reduce loading screens during auth recovery.
2. Remove redundant re-hydration logic in admin and member layouts.
3. Delay AuthProvider initialization on public routes.

**Success metric**: first paint appears immediately for public routes, member/admin shell appears within 1s of auth.

## Phase 3 — Data Fetching + Caching (2–4 days)

1. Use server-side cached data for dashboard summary queries (RPC consolidation).
2. Add caching windows (revalidate) for data that doesn’t need to be live.
3. Add pagination/virtualization to heavy lists (members, feed, leaderboard).

**Success metric**: dashboard and report screens load < 1.5s on a warm cache.

## Phase 4 — Structural Improvements (as needed)

1. Replace client-only layouts with server components where possible.
2. Split admin/member shells into smaller chunks and defer non-critical widgets.
3. Consider route-level caching for static gym pages with short revalidate windows.

**Success metric**: consistent Lighthouse 80+ on landing + login, 70+ on dashboard routes.

---

## Investigation Checklist

- [ ] Confirm which pages are client-only and why.
- [ ] Identify charts/components that can be dynamic imports.
- [ ] List high-cost queries and move to RPC or batched calls.
- [ ] Enable caching in Netlify for static HTML where safe.
- [ ] Verify service worker does not cache HTML navigations.

---

## Recommended Next Step

Start with Phase 1 (low risk). This gives immediate LCP/TBT improvements without touching auth correctness. After that, Phase 2 + Phase 3 drive the biggest user-visible improvements.

---

## Notes

- This plan assumes production is on a stable branch. Backport fixes carefully and compare before/after metrics on staging.
- Keep `Server-Timing` headers to verify hop-level bottlenecks on real traffic.
