# Changelog

All notable changes to Stren are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Member Onboarding & Auth Recovery

#### Added
- A useful responsive no-gym member home at `/gyms`: one supported name/location/code search, explicit QR scanning, multiple calm membership-verification cards, saved gyms, profile completion, an isolated sample-data demo, and visibly explained beta tools. Unsupported filters and Personal Mode are intentionally absent.
- Public gym profile actions for authenticated accounts to save a published gym or identify as an existing member without exposing private gym data.
- Migration `021_membership_verification.sql`: separate `saved_gyms`, deterministic email-confirmed membership connection, pending verification list, seven-day reminder cooldown, withdrawal, permission-checked staff confirmation, and member/staff in-app notifications. Database types and server actions cover every new RPC.
- Honest “Continue with Google” preview controls in both auth modes; no OAuth request or callback is started.
- A no-gym-safe `/profile` page for basic account details.

#### Changed
- Member-facing gym connection now uses **membership verification**, not join-request/application language. An existing verified billing record connects immediately; otherwise staff calmly check the member record. Phone matching remains deferred until phone ownership can be verified.
- Landing and public gym pages now hydrate the real browser session before rendering account-sensitive actions. Signed-in landing visitors see “Open Stren” instead of Sign In/Create Account, while public gym save/verify controls recognize the signed-in account. Direct `/auth` visits still resolve through the account’s active gym state.
- Password recovery now starts with an email field and uses Supabase Auth’s official reset link, PKCE/session validation, a ten-minute server-signed HTTP-only completion proof, password update, and local recovery-session sign-out.

#### Fixed
- Successful sign-in can no longer remain behind “Setting things up for you…” indefinitely: credential exchange, server-side destination resolution, and client navigation each have bounded, interactive recovery states, and navigation begins only after the provider confirms the user session.
- Password reset no longer presents an unvalidated new-password form to an ordinary signed-in or anonymous visitor, trusts a query flag or ordinary session as recovery proof, swallows recovery errors, or implies that email was delivered when required site/provider configuration is missing.

#### Security
- Saving a gym never writes `gym_users`; possession of a gym code/QR grants no private access. Only an email-confirmed account already tied to the same gym’s billing membership auto-connects.
- Membership confirmation rejects self-confirmation and requires `members:manage` at the explicit gym. Reminder cooldown and verification ownership are enforced in SECURITY DEFINER RPCs with explicit grants/revokes and RLS-backed tables.
- Password changes through the recovery screen require a short-lived HMAC proof bound to the provider-confirmed user in an HTTP-only, same-site cookie; the completion endpoint clears it after use.

### Cohesive Auth & Assisted Gym Onboarding — 2.1.0

#### Added
- One responsive `/auth?mode=signin|signup` experience: stationary two-pane card, restrained 600 ms Stren-panel transition, URL/Back synchronization, state preservation, reduced-motion behavior, non-tabbable covered form, generic credential errors, and explicit email-verification completion.
- Authenticated Join a gym onboarding at `/gyms` with user-initiated QR scanning, normalized code fallback, trusted gym confirmation, pending/existing affiliation states, and camera/error cleanup.
- `/for-gym-owners` assisted-onboarding form and validated, honeypot-protected, rate-limited Resend delivery through `/api/owner-inquiries`.
- Migration `020_platform_admin_gym_creation.sql`: `create_gym` now requires server-controlled `app_metadata.platform_role = 'platform_admin'`; ADR 0005 records the provisioning decision.

#### Changed
- Landing and drawer actions are now Sign In, Create Account, and For Gym Owners / Bring Stren to Your Gym. Auth callback, password reset, account emails, public gym Join links, join posters, auth context, and E2E helpers all point to the shared auth route.
- Post-auth routing opens a single active gym directly, keeps multi-gym accounts on the selector, and shows Join/pending states for accounts without an active gym.
- Service-worker cache version advanced to v6; `/auth` and `/gyms` are network-only. Next development allows the test host so server-rendered controls cannot remain non-interactive during local browser verification.

#### Removed
- Public `/gyms/new`, `createGymAction`, self-serve gym creation UI/copy, separate `/login` and `/signup` pages, and the superseded auth shell/tests. Legacy bookmarks permanently redirect to the appropriate shared auth or owner-inquiry destination.

#### Fixed
- The captured `public.create_gym(p_code, p_name)` schema-cache error can no longer occur through a public workflow: the stale UI/RPC coupling was removed and direct ordinary-user RPC calls are denied in the database.

### Unified Accounts & Auth Rebuild — Agent C (backend, units C1–C3 + fix pass) — 2.0.0

One account for all of Stren: per-gym roles live in `gym_users`, context comes from a server-side active gym, and the legacy per-gym auth stack is deleted. Backend + logic only (Codex 5.6 Sol, one-shot; Fable review fix pass 2026-07-12). Version bumped to **2.0.0** — the `profiles.role`/`gym_id`/`status` drops and the auth-route map are breaking changes.

#### Added
- **Migration `019_unified_accounts.sql`** — `gym_users` (per-gym role/status, `added_by`), `profiles.active_gym_id`, backfill-before-drop in one idempotent transaction; helper stack re-implemented with the same signatures over `gym_users` (`get_gym_id`, `get_user_role`, `is_manager`, `has_gym_permission`, `get_my_access`, plus `is_manager_of`/`has_active_gym_affiliation`/`is_gym_owner`/`has_member_portal_entitlement`/`shares_active_gym`); recursion-safe `gym_users`/`profiles` RLS; new RPCs `get_my_gyms`/`set_active_gym`/`join_gym`/`create_gym` (slug/reserved/unpublished-cap guards; `create_gym_and_owner` and `check_gym_membership` dropped); kiosk RPCs take explicit `p_gym_id` (pinned-gym rule); per-gym uniques for streaks/notification prefs/cooldowns; `member_home_stats` gains `subscription_status` + `lapsed_summary`; lapsed members excluded from the leaderboard; payment attribution (`payments.recorded_by`, `memberships.created_by`) + owner in-app alert on recorded payments; last-active-owner protection and active-gym integrity triggers. Types regenerated.
- **`lib/auth-actions.ts`** — server actions per the §6.3 contract (`signUpAccount`, `resolvePostAuthDestination`, `setActiveGymAction`, `joinGymAction`, `createGymAction`, `signOutAction`) with validation/copy modules; `lib/post-auth-destination.ts` implements the five §2.4 destination rules once, shared by login, callback, and middleware.
- Integration tests: `gym-users-access`, `set-active-gym`, `join-and-approve`, `onboard-existing-account`, `post-auth-destination`, `kiosk-pinned-gym`, `lapsed-member-gate`, `payment-attribution`, `create-gym-guards`.

#### Changed
- **`middleware.ts` rewritten** — static `LEGACY_AUTH_REDIRECTS` 308 map (`/gym/{code}/login|signup`, `/signup/admin|member`, `/gym-select`, `/kiosk/signup`), one `get_my_access()` gate for all protected surfaces, authed users with no usable gym land on `/gyms`; login-origin cookie writer and `resolveLoginPath` deleted.
- **`lib/auth-context.tsx` rebuilt** to the §6.2 interface (`myGyms`/`activeGymId`/`refreshMyGyms`), keeping the hardened session lifecycle; a documented `gymId`/`role:'member'` shim remains for page islands (real roles flow via `useAccess()`).
- **Onboard route** (`app/api/admin/members/onboard`) — existing email **attaches** (active `gym_users` row + QR email, no duplicate account); new email keeps the create+invite flow; email lookup is case-insensitive (`ilike` with escaped input) and `handle_new_user` stores emails lowercased so lookup and storage agree.
- App-side sweep: every `profiles.role`/`gym_id`/`status` consumer re-pointed to `gym_users`/`get_my_access`; kiosk pinned to an explicit gym at launch; member home wires the lapsed gate.

#### Fixed (Fable review pass, 2026-07-12)
- `stamp_gym_user_approval` keeps an existing `added_by` when approval runs under the service role (`COALESCE(auth.uid(), NEW.added_by)`).
- `gym_users_update` RLS `WITH CHECK` now blocks promoting anyone **to** owner unless the caller is an owner (previously any `members:manage` holder could mint owners).
- `set-active-gym.test.ts` reconciled to the shipped design (column-level `REVOKE` + SECURITY DEFINER RPC + affiliation trigger) instead of the abandoned `set_config` handshake.

#### Removed
- Legacy auth surfaces: `/gym/{code}/login|signup` pages, `/signup/admin|member`, `/gym-select`, `/kiosk/signup`, `LoginForm`/`GymSignUpForm`, `lib/login-origin.ts`, `lib/sign-out-routing.ts` and their tests (grep-zero on `login-origin|LOGIN_ORIGIN|sign-out-routing|check_gym_membership|gym-select`). `OTP-AUTH-GUIDE.md` quarantined in the Catalog's Stale table.

### Unified Accounts & Auth Rebuild — Agent U (UI/UX, units U1–U3)

The Stren-branded UX over Agent C's rebuilt auth/account backend. UI only — handlers and server-action calls consumed verbatim; no schema, middleware, `lib/auth-*`, API, or Studio-component changes. (The typecheck/C2-sweep caveat originally noted here was resolved by Agent C's entry above; the branch gate is green.)

#### Added
- **Auth screens (U1)** — real `/login` (email + password, "Forgot password?", "Create account", `?gym=CODE` gym-flavored header via `get_gym_by_code`, magic-link `?error=` banner in plain language) and `/signup` (name/email/password + join-intent notice); shared `components/auth/auth-shell.tsx` (Stren-branded card, fields, submit, error banner, `useGymFlavor`), `lib/auth-error-copy.ts` (readable auth-error map). `/reset-password` reskin fixed to route through the single `/login`.
- **Gym hub (U2)** — `/gyms` (`components/gyms/GymHub.tsx`): your-gyms cards with role/status chips, "Waiting for approval" pending state, quiet rejected row, tap-to-enter (`setActiveGymAction` → role surface), two-choice onboarding empty state, `?join=CODE` prefill; `JoinGymPanel` (code entry + `search_gyms` name search → confirm → `joinGymAction` → pending); `/gyms/new` create-gym with plain-language guard errors (`lib/create-gym-error-copy.ts` maps reserved/taken/format/cap).
- **Join-QR poster (U2)** — `components/admin/JoinQrPoster.tsx` + `/admin/join-code` ("Invite QR" nav item, `members:view`): printable/downloadable QR of `/signup?gym=CODE`.
- **Lapsed lock screen (U2)** — `components/member/LapsedLockScreen.tsx`; `MemberHomeClient` branches to it when `subscriptionStatus === 'expired'`, naming the saved streak/visits/member-since from `lapsed_summary`, warm not punitive.
- **Gym switcher (U3)** — `components/gyms/GymSwitcher.tsx` in both shells: active-gym anchor, switch list (role-labeled), Member/Admin view toggle (managers only for Admin view), "All gyms", sign out; keyboard + screen-reader operable menu (Escape/outside-close/arrow-nav). Shared `components/gyms/gym-badges.tsx` (avatar, role/status chips).
- Tests (red-first): `auth-screens`, `gym-hub`, `gym-new`, `join-qr-and-lapsed`, `gym-switcher`.

#### Changed
- `app/admin/layout.tsx` — gym-name badge replaced by the switcher; footer role now reads `useAccess().role` (was the hardcoded `profile.role` shim). `components/member/MemberShell.tsx` — brand replaced by the switcher.
- Public gym "Join" CTA needs no preview change: existing `/gym/{code}/signup` 308s to `/signup?gym=CODE` (logged-out), and a logged-in visitor is routed by middleware to `/gyms?join=CODE`, which the hub opens pre-filled → confirm → pending.
- Removed `tests/integration/gym-auth-flow.test.tsx` (imported the deleted `LoginForm`/`GymSignUpForm`; superseded by `auth-screens.test.tsx` — a leftover C3 cleanup).

### Unified Accounts & Auth Rebuild — workstream plan (docs only)

Planning pass for moving from Canvas-style per-gym logins to **one account for all of Stren** with per-gym roles (`gym_users`), a server-side active gym, a `/gyms` hub, and an in-shell gym switcher; auth routes to be rebuilt from scratch and legacy ones deleted. No product code changed.

#### Added
- `AgentsContextKnowledgeBase/ImplementationPlan-UnifiedAccounts.md` — the workstream contract (schema/migration 019 spec, middleware + server-action plan, UI spec, frozen contracts, test plan, sequencing, DoD).
- `docs/adr/0004-one-account-many-gyms.md` — the decision and rejected alternatives (multi-account switcher, path-scoped tenancy, cookie/JWT context).
- `AgentsContextKnowledgeBase/prompts/Codex-Backend-UnifiedAccounts-OneShot.md` and `prompts/Opus48-UI-UnifiedAccounts-OneShot.md` — paste-ready agent prompts.
- `CONTEXT.md` "Accounts & gyms" vocabulary (account, gym user, active gym, gym switcher, gym hub, join request); role sharpened to per-gym.

#### Changed
- Catalog/ImplementationState re-pointed: Unified Accounts is the active workstream; Gym Page Studio plan marked completed (shipped to `main` via `3e52c95`); `OTP-AUTH-GUIDE.md` flagged as pre-rebuild-only.
- Grill-session resolutions folded into the plan/ADR/prompts (2026-07-11): managers-are-members (any active affiliation gets the member experience; Member/Admin view toggle in the switcher); kiosk pins its gym at launch (kiosk RPCs take explicit gym, affiliation-validated); self-joins default to pending, join-by-code works for unpublished gyms, join-QR poster; create-gym guards (slug/reserved/3-unpublished cap); lapsed members = locked portal with saved stats named (data never deleted, off leaderboard); payment attribution (`recorded_by`/`created_by`/`added_by`) + owner in-app alert per recorded payment. Deferred with composition paths: phone-OTP login, Organizations/multi-branch, owner email digest.

### Gym Page Studio — Agent A UI fix pass (unit A6)

Non-blocking polish over the 1.2.0 UI surfaces after the backend (Agent B) landed. UI only; no schema, middleware, API, or server-gate changes.

#### Fixed
- **Studio load resilience** (`components/admin/gym-studio/GymPageStudio.tsx`) — the load now falls back in three tiers: full select → a retry that drops only the migration-017 `cover_focal`/`section_visibility` columns but keeps `is_published`/`secondary_color` → the legacy select. A published gym no longer regresses to "Hidden" when the DB is behind the app, and the save payload sends the two Studio-meta columns only when a load proved they exist (`studioMetaColumnsAvailable`).
- **Honest partial-save toast** (`GymPageStudio.tsx`) — when the gym write fails and no feature flags were dirty, the toast now says "Failed to save your page content — try again." instead of falsely claiming feature settings saved. Genuine two-write cases keep their per-half messages.
- **Atomic Access switch writes** (`components/admin/AccessClient.tsx`, `lib/access-data.ts`) — a multi-key switch (e.g. money numbers = 2 keys) now applies as one `saveOverridesBatch` (array `upsert` for grants/revokes + one `delete().in(...)` for back-to-default keys) instead of a sequential per-key loop; on failure the row resyncs from the DB via `fetchPersonOverrides` rather than assuming the pre-flip state.

#### Added
- **Client owner gate** (`AccessClient.tsx`) — a courtesy layer over the server's `requirePermission('roles:manage')`: viewers without `roles:manage` see "Only the owner can manage people & access." (defends the direct-render path and tests).

#### Changed
- **A11y / parity** — the mobile preview drawer tab strip (`MobileStudioSheet.tsx`) gains `role="tablist"`/`role="tab"`/`aria-selected` to match the desktop toolbar; `GymLandingPreview` `JoinBody` renders the "N active members" chip when `memberCount > 0` (hidden at 0).
- **Tests** — added `studio-load-fallback` (tier-b load + save payload); extended `access-page` (batched writes, refetch-on-failure, owner gate) and `gym-landing-preview` (Join members chip).

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
- **Migrations 014–018** — notification RPC hardening; role defaults and per-user permission overrides; feature settings and effective access helpers; Gym Page Studio focal-point and section-visibility columns; and a service-context repair for the daily notification processor. Migration 018 was reapplied idempotently and exercised through the real expiry/inactivity processor chain in an isolated PostgreSQL schema.
- **Layered enforcement** — fail-closed server permission helpers, middleware permission/feature routing, API permission and same-gym checks, server page gates, member/public feature gates, and database RLS/RPC truth-layer checks.
- **B-owned regression coverage** — permission/feature SQL contracts, payment characterization, notification/avatar/cache hardening, bearer-scoped API authorization, fail-closed access, engagement hooks, kiosk-off polling, finance omission, and environment-gated owner/member E2E + direct member RPC probes.

#### Changed
- **Generated database types** now come from the isolated schema containing migrations 014–017; JSON-returning public RPC data is narrowed at the server adapter boundary.
- **Member home/feed/kiosk** use member-safe stats and effective feature settings; a kiosk left open stops scanner/data polling and shows the friendly off state when disabled or access cannot be resolved.
- **Dashboard/reports** omit only the specified finance fields when finance access is revoked and render a quiet em dash for missing values.
- **Public Supabase clients** are created lazily so server module evaluation and production builds do not require credentials until a data call is made.

#### Security
- `process_daily_notifications()` remains service-role only; its notification helpers now recognize service-role JWT context without widening grants, while authenticated callers still require identity, manager, and gym/target scope checks. Notification/streak helper RPCs otherwise retain their caller validation; avatar URLs must use the configured Supabase Storage origin.
- Bearer-only admin API requests now carry the verified token into all subsequent RLS/RPC authorization queries, and server access failures deny rather than restore role defaults.

#### Fixed
- The daily notification cron no longer fails on its first member when service-role requests have a NULL `auth.uid()`; isolated validation created both a 7-day expiry reminder and an inactivity nudge while anonymous, member, cross-gym manager, and invalid service target calls remained denied.
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
