# Changelog

All notable changes to Stren are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

## [1.2.0] — 2026-07-11

### Gym Page Studio + Permissions & Feature Toggles — Agent A (UI)

Frozen contracts + all React surfaces for the workstream. Backend enforcement (Agent B) and the version bump land separately; UI degrades to today's role behavior until then.

#### Added
- **Permission/feature contracts** (`lib/permissions.ts`, `lib/features.ts`, `lib/access.ts`, `lib/access-data.ts`, `lib/access-context.tsx`) — role defaults matrix, feature catalog, combined `canUse` gate, `fetchMyAccess`/`saveFeatureFlags`/`listAccessPeople`/`saveOverride`, and `<AccessProvider>`/`useAccess()` (ImplementationPlan.md §8). Parity fixture `tests/fixtures/role-permission-defaults.json`.
- **`lib/focal.ts`** — pure focal-point helpers (clamp/normalize/nudge/pointer mapping); `contrastRatio` + `generatePalette` added to `lib/brand-color.ts` (existing exports untouched).
- **`components/gym/GymLandingPreview.tsx`** — prop-driven public page body (home/join/contact/pricing/locate), extracted from the inline landing page so the public pages and the Studio preview share one component; cover focal via `object-position`, section-visibility gating, feature-off placeholders.
- **Gym Page Studio** (`components/admin/gym-studio/*`) — desktop two-pane + mobile drawer editor: header (publish gated on `gym_page:publish`, else caption), control-rail groups (Essentials, Photos, Brand style, Home sections, Subpages), Features panel (owner-only, four coming-soon teasers), preview pane with tabs/device/safe-area, checklist banner, keyboard-operable focal-point editor, and the unsaved-changes guard.
- **People & access** (`app/admin/access/page.tsx`, `components/admin/AccessClient.tsx`) — owner row + the eight plain-language Access switches per admin; static staff rows.
- **§9 Agent-A tests** — `permissions`, `permissions-parity`, `features`, `access`, extended `brand-color` (unit); `admin-nav-permissions`, `member-shell-features`, `public-nav-features`, `studio-features-panel`, `studio-publish-gating`, `access-page`, `gym-landing-preview` (integration); Studio flow added to `admin-gym-preview.spec.ts` (e2e).

#### Changed
- **`app/admin/gym-profile/page.tsx`** re-skinned to render `<GymPageStudio/>` (all upload/compress/hash/cleanup/save/revalidate handlers preserved verbatim; save is now two writes with partial-failure handling and always revalidates).
- **Public pages** (`app/gym/[code]/page.tsx`, `contact`, `pricing`, `locate`) render `GymLandingPreview` (pixel-identical output); `lib/gym-data.ts` gains `toGymPreviewData`.
- **Nav filtering** consumes `useAccess()`/feature props with safe defaults: `app/admin/layout.tsx` (+`components/admin/admin-nav-items.ts`), `components/member/MemberShell.tsx`, `components/member/MemberHomeClient.tsx`, `components/gym/GymTopNav.tsx`.

### Gym Page Studio + Permissions & Feature Toggles — Agent B (logic/enforcement)

#### Added
- **Migrations 014–017** — notification RPC hardening; role defaults and per-user permission overrides; feature settings and effective access helpers; Gym Page Studio focal-point and section-visibility columns. All four were validated and reapplied idempotently against an isolated PostgreSQL schema.
- **Layered enforcement** — fail-closed server permission helpers, middleware permission/feature routing, API permission and same-gym checks, server page gates, member/public feature gates, and database RLS/RPC truth-layer checks.
- **B-owned regression coverage** — permission/feature SQL contracts, payment characterization, notification/avatar/cache hardening, bearer-scoped API authorization, fail-closed access, engagement hooks, kiosk-off polling, finance omission, and environment-gated owner/member E2E + direct member RPC probes.

#### Changed
- **Generated database types** now come from the isolated schema containing migrations 014–017; JSON-returning public RPC data is narrowed at the server adapter boundary.
- **Member home/feed/kiosk** use member-safe stats and effective feature settings; a kiosk left open stops scanner/data polling and shows the friendly off state when disabled or access cannot be resolved.
- **Dashboard/reports** omit only the specified finance fields when finance access is revoked and render a quiet em dash for missing values.
- **Public Supabase clients** are created lazily so server module evaluation and production builds do not require credentials until a data call is made.

#### Security
- `process_daily_notifications()` is service-role only; notification/streak helper RPCs validate caller identity and gym scope; avatar URLs must use the configured Supabase Storage origin.
- Bearer-only admin API requests now carry the verified token into all subsequent RLS/RPC authorization queries, and server access failures deny rather than restore role defaults.

#### Fixed
- Next 16 Promise-based `searchParams` handling on `/` and `/landing` no longer stalls E2E navigation.
- The pending `get_gym_by_code()` visibility correction is **not included**: migrations 016/017 intentionally retain tagline-derived visibility until explicit product-owner approval.

---

## [1.1.0] — 2026-06-09

### Changed
- **Admin dashboard** (`app/admin/page.tsx`) converted to Server Component — data fetched server-side via `createServerSupabaseClient()`. Interactive parts (checkout button, checked-in list, charts) extracted to `components/admin/AdminDashboardClient.tsx` client island.
- **Admin reports** (`app/admin/reports/page.tsx`) converted to Server Component. Stat cards and chart data passed to `components/admin/AdminReportsClient.tsx` client island.
- **Member home** (`app/member/page.tsx`) converted to Server Component — `member_home_stats` and `kiosk_get_checked_in` fetched server-side. Calendar, streak banner, and stat cards extracted to `components/member/MemberHomeClient.tsx`.
- **Member leaderboard** (`app/member/leaderboard/page.tsx`) converted to Server Component — default `workouts` category pre-fetched. Category tab switching and in-memory cache live in `components/member/LeaderboardClient.tsx`.
- **Kiosk** (`app/kiosk/page.tsx`) upgraded with Supabase Realtime subscription on `attendance` table (`INSERT`/`UPDATE`) for instant refresh; poll interval relaxed 30s → 60s as fallback.
- **Revalidation endpoint** (`app/api/admin/revalidate-gym/route.ts`) extended with `gym-stats-${gymId}`, `gym-reports-${gymId}`, and `leaderboard-${gymId}` tags.

### Added
- `components/admin/AdminDashboardClient.tsx` — client island for admin dashboard interactivity.
- `components/admin/AdminReportsClient.tsx` — client island for reports charts and stat display.
- `components/member/MemberHomeClient.tsx` — client island for member home with attendance calendar.
- `components/member/LeaderboardClient.tsx` — client island for leaderboard category switching.

---

## [1.0.0] — 2026-06-08

### Added
- **Migration baseline** — `supabase/migrations/001_production_baseline.sql`: single idempotent file that reproduces the full production schema. Old draft migrations 001–004 archived.
- **Strict TypeScript** — `ignoreBuildErrors` flipped to `false`; all RPC Json casts typed explicitly.
- **Regenerated DB types** — `lib/database.types.ts` generated from live Supabase schema (not hand-maintained).
- **Performance** — Landing page images converted to WebP/WebM; chart components extracted; layout refactored.
- **Auth** — Improved logout routing; fixed cache-miss on new gyms.
- **Tests** — Integration and unit test coverage for gym auth flow, gym finder section, login-origin, and sign-out routing.
- **CLAUDE.md** — Developer guide: DB workflow rule, stack overview, migration structure, auth helpers, type safety conventions.
- **Versioning** — Semantic versioning, CHANGELOG, and auto-release GitHub Actions workflow.

### Changed
- `next.config.mjs`: `typescript.ignoreBuildErrors` → `false`.
- `lib/gym-public.ts`: exported `GymPublicData` type; fixed spread type error on RPC result.
- `app/admin/page.tsx`: fixed `admin_dashboard_stats` Json cast; fetch `kiosk_get_checked_in` separately.
- `app/admin/reports/page.tsx`: fixed `admin_reports_data` Json cast.
- `app/member/page.tsx`: fixed `member_home_stats` Json cast.
- `app/signup/member/page.tsx`: fixed `get_gym_by_code` Json cast.

### Fixed
- Removed spurious UTF-16 `database.types.ts` from repo root (broke ESLint).
- Removed committed binaries (`repomix-output.xml`, `b_*.zip`) from `.gitignore`.

---

## [0.1.0] — Initial release

Initial multi-tenant gym management platform with member check-in, QR codes, attendance tracking, and gym public pages.
