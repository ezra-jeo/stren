# Gym Page Studio + Permissions & Feature Toggles — Implementation Guide

**✅ Completed 2026-07-11** — shipped to `main` via qa merge `3e52c95` (open pre-prod items tracked in `ImplementationState.md`). Superseded as the active plan by [ImplementationPlan-UnifiedAccounts.md](ImplementationPlan-UnifiedAccounts.md); kept per Catalog rule 6. **Caution for later readers:** migration 019 re-implements the `get_gym_id()`/role helper internals over `gym_users` — this document's profile-based identity assumptions are historical.

_Authored 2026-07-10 on branch `CustomizationPermissionsToggles`. Planning document only — no product code changed yet. Every file/line reference below was verified against the working tree on this date. Revised the same date after a 35-question grilling session with the product owner; the resolved vocabulary lives in `CONTEXT.md` and the load-bearing decisions in `docs/adr/`._

This guide is the **contract** for two implementation agents working in parallel:

| Agent | Model | Owns | Section |
|---|---|---|---|
| **Agent A — UI** | Claude Opus 4.8 | Gym Page Studio, all React surfaces, shared contract modules, client wiring | §7, §8, prompts in §10.A |
| **Agent B — Logic** | GPT 5.5 (Codex) | Migrations, SQL helpers, RLS, RPC hardening, middleware, API routes, server enforcement | §5, §6, prompts in §10.B |

Neither agent designs anything. **All design decisions are made in this document** — layout, copy, component boundaries, data model, enforcement order. If something appears ambiguous, the answer is in here; if it genuinely is not, stop and ask the user rather than inventing.

Read `CLAUDE.md` first; all of its conventions apply (migrations in `supabase/migrations/`, test-first for new behavior, feature branches → `qa`, `maybeSingle()`, middleware is the single auth guard, layouts never redirect).

**Design reference**: `stren-gym-page-studio/project/Stren Gym Page Studio.dc.html` — a Claude Design export containing three sections: `1a` desktop studio, `1b` mobile studio, `1c` embedded build spec. (A duplicate folder `StrenGymCustomizationRedesign/` was byte-identical and has been deleted; this is the same bundle.) The mockup is the layout/interaction source of truth, **but its colors and fonts are prototype placeholders** — production uses the app's design tokens (§7.0). The mockup contains **no RBAC UI**; the Features panel (§7.8) and People & access page (§7.9) are designed in this document and did not come from the mockup.

---

## 0. Sequencing — what ships first, and new security findings

**Slice 0 (Phase 2.6 notification-RPC hardening) ships FIRST, in its own migration (`014_fix_notification_rpc_scope.sql`) and PR to `qa`, before any other work in this guide.** It belongs to Agent B and has no dependency on anything else here.

Rationale: the two Criticals (`process_daily_notifications()`, `create_member_notification()` — granted to `authenticated` with no caller checks, `006_notification_system.sql:687-688`) and the High (`kiosk_update_streak()`) documented in `PHASE_3_TO_7_DIAGNOSTIC_AND_PLAN.md` are live and exploitable by any authenticated user today. The fix is small, follows the proven migration-011 caller-check pattern, and must not wait on the permission-schema design cycle. The two Medium `app/api` findings (revalidate-gym gym scope, avatar `avatarUrl` validation) ride along in the Slice 0 PR as app-code changes.

### Additional verified findings (owned by Agent B, folded into the slices below)

- **High — `admin_dashboard_stats()` and `admin_reports_data(p_days)` are callable by any authenticated member.** `001_production_baseline.sql:982` and `:1077`. Both are `SECURITY DEFINER`, scoped only by `get_gym_id()`, **no role check** — a member can `supabase.rpc('admin_dashboard_stats')` and read gym-wide member lists, pending members, plan/revenue metrics. Fixed in migration 015.
- **Bug — `get_gym_by_code()` derives `is_published` from tagline presence** (`001_production_baseline.sql:954`: `'is_published', (v_gym.tagline IS NOT NULL AND TRIM(v_gym.tagline) <> '')`) instead of reading the real `gyms.is_published` column (which has had a proper tagline CHECK constraint since migration 008). An owner who unpublishes but keeps a tagline stays publicly visible. Fixed in migration 016 when the function is reworked anyway. **Confirm with the user before shipping** — it changes public visibility for any gym relying on the buggy behavior.
- **Bug — `app/member/page.tsx:15` calls `kiosk_get_checked_in()`,** which migration 011 made manager-only (`RAISE EXCEPTION 'permission denied'`). For members the RPC errors, the error is swallowed, and `peopleInGym` renders 0. Agent B replaces it with a member-safe count (§6, middleware/server table).

---

## 1. Current state (verified)

| Layer | Today |
|---|---|
| Middleware ([middleware.ts:243](../middleware.ts)) | Coarse: `/admin` + `/kiosk` require role ∈ {owner, admin, staff}. Forwards `x-gym-id`/`x-user-role`. No finer distinction. |
| Layouts | Chrome only, no redirects. [app/admin/layout.tsx:40](../app/admin/layout.tsx) has `ownerOnly` on the Gym Page nav item — **hides the link only** (filter at :89-96). |
| Pages | [app/admin/gym-profile/page.tsx:226](../app/admin/gym-profile/page.tsx) does a client-side `router.replace('/admin')` for non-owners — cosmetic, not enforcement. Other admin pages render for any manager role. |
| RLS | Gym-scoped + `is_manager()` patterns (001 + 011). `gyms_update` (001:451) allows **owner AND admin**. |
| RPCs | Kiosk family hardened (011: `auth.uid()` + `is_manager()` + gym scope + REVOKE anon). `admin_dashboard_stats` / `admin_reports_data` / leaderboards have gym scope but **no role checks**. Notification family unscoped (Slice 0). |
| API routes | Role-checked (`ADMIN_ROLES` set) but `revalidate-gym` accepts **any gym's code** (fetches the gym only to build cache tags, [route.ts:80-100](../app/api/admin/revalidate-gym/route.ts)). |
| Feature availability | Hardcoded: nav arrays in [app/admin/layout.tsx:33](../app/admin/layout.tsx), [components/member/MemberShell.tsx:14](../components/member/MemberShell.tsx), [components/gym/GymTopNav.tsx:12](../components/gym/GymTopNav.tsx); quick links [components/member/MemberHomeClient.tsx:494](../components/member/MemberHomeClient.tsx). Public subpages gate only on publish state. No way to disable feed/leaderboard/kiosk/pricing/etc. per gym. |
| Public payload | `get_gym_by_code` → `unstable_cache` tag `gym-public` ([lib/gym-public.ts:20-30](../lib/gym-public.ts)); revalidated by `/api/admin/revalidate-gym` after every Studio save ([gym-profile page:793](../app/admin/gym-profile/page.tsx)). |
| Media pipeline | [gym-profile page:359-682](../app/admin/gym-profile/page.tsx): validate → `blobHash` → `{gymId}/{kind}-{hash}.jpg` → upsert → delayed versioned cleanup (`MAX_ASSET_VERSIONS_PER_KIND = 8`) → save → revalidate. **Preserved verbatim** by this plan. |

Roles live on `profiles.role` (`owner | admin | staff | member`). SQL helpers `get_gym_id()`, `get_user_role()`, `is_manager()` exist at `001_production_baseline.sql:54-86` — new helpers follow their conventions (`SECURITY DEFINER`, `SET search_path = ''`, `STABLE` where possible, explicit GRANTs).

---

## 2. Target architecture — two layered systems

**Permissions answer "can this user perform this action?" Feature toggles answer "is this capability enabled for this gym?" Every gated surface checks BOTH**, feature first, then permission:

- Staff with `kiosk:use` at a gym with `kiosk_checkin=false` → kiosk blocked.
- Member at a gym with `leaderboards=false` → nav link hidden AND `/member/leaderboard` + `leaderboard_*` RPCs blocked.

Enforcement is layered; the innermost layer is the source of truth:

```
RLS policies + RPC-internal checks   ← truth (cannot be bypassed by any client)   [Agent B]
API route handlers                   ← 401/403 with correct status codes          [Agent B]
Server components / middleware       ← redirects, no data fetched                 [Agent B]
Client UI                            ← hide/disable affordances only              [Agent A]
```

### 2.1 Permission model

- **Role defaults** — single TypeScript source of truth: `ROLE_DEFAULT_PERMISSIONS` in `lib/permissions.ts` (§8.1), mirrored into a seeded SQL table `gym_role_permission_defaults(role, permission)`. Parity is enforced by a checked-in fixture `tests/fixtures/role-permission-defaults.json` (written by Agent A from the TS constant; Agent B generates the migration seed from it; a Vitest parity test fails CI on drift).
- **Per-user overrides** — `gym_user_permission_overrides` table (§5, migration 015). One row grants **or revokes** one permission for one user in one gym; override beats role default. Overrides are managed only by holders of `roles:manage` (owner) and are surfaced in the UI exclusively as the eight plain-language **Access switches** (§7.9) — one flat list per admin, both directions (grant what's off, revoke what's on), no roles, no permission matrices. Overrides can never touch `roles:manage`/`features:manage`/`gym_page:publish` (owner-only, never delegable) and never target `owner`/`member` profiles — enforced by trigger in SQL, mirrored in UI.
- **SQL helper** — `has_gym_permission(p_permission text, p_gym_id uuid DEFAULT public.get_gym_id())` → boolean. Owner short-circuits `true` for every key (future keys never lock owners out); override row wins; else defaults table. For **non-owner** callers, a key that does not exist in the defaults table **RAISEs** (`unknown permission: %`) instead of silently returning false — the defaults table seeds an owner row for every key, making it the canonical key registry, so typos in policies fail loudly instead of silently denying admins.
- **Batch helper** — `get_my_access()` → jsonb `{ role, gym_id, permissions: text[], features: {<key>: bool} }` so middleware/layouts fetch everything in one round trip.
- **TS API** — §8.1/§8.4. Client resolves the same matrix for UI hiding; server module `lib/permissions-server.ts` (Agent B) provides `requirePermission()` / `apiRequirePermission()`.

### 2.2 Feature toggle model

- **Table** — `gym_feature_settings(gym_id uuid PK → gyms ON DELETE CASCADE, flags jsonb NOT NULL DEFAULT '{}', updated_by uuid, updated_at timestamptz)`. Missing row or missing key ⇒ catalog default. Rollout is therefore safe: no backfill, every existing gym keeps current behavior.
- **SQL helper** — `gym_feature_enabled(p_feature text, p_gym_id uuid DEFAULT public.get_gym_id())` → boolean; reads `flags->p_feature`, falls back to defaults encoded in the function (mirrors the TS catalog; same parity-fixture treatment).
- **TS catalog** — `FEATURE_CATALOG` in `lib/features.ts` (§8.2). Technical keys are **never rendered** in owner UI — only `label`/`effect`.
- **`trainers`** is not a separate key: the team surface is `gyms.team_members` rendered on the public contact page — `public_team` covers it.
- **Teasers**: four catalog entries (`trainer_bookings`, `friends_chat`, `workout_log`, `session_posts`) with `status: 'coming_soon'`, `defaultEnabled: false`. Disabled rows in the Features panel, owner-facing only; no enforcement wiring (nothing to enforce yet). Real keys now = zero migration work when they ship.
- **Public exposure**: anon visitors can't call authenticated helpers, so `get_gym_by_code()` gains a `features` object containing **only** `publicSurface: true` keys (`public_team`, `public_pricing`, `public_location`), and **omits the underlying data** (`team_members`, `pricing_packages`, `map_embed_url`/`directions`) when the flag is off — disabled data never reaches the anon cache. Cached under the existing `gym-public` tag; the existing save→revalidate flow already busts it.

### 2.3 Combined gate

```ts
// lib/access.ts (§8.3)
canUse(access, feature, permission)  // false if feature exists and is off, OR permission exists and is missing
```

SQL side, the same composition appears inline: `public.gym_feature_enabled('kiosk_checkin') AND public.has_gym_permission('kiosk:use')`.

---

## 3. Permission matrix

`✓` = on by default. `✗` = off by default. `(s)` = covered by an **Access switch** (§7.9): the owner can flip it per admin in either direction (revoke a default, or grant an extra). Owner always has everything, including unknown/future keys. Overrides on non-`(s)` keys are possible in the schema but have no UI in v1.

| Permission | owner | admin | staff | member | Guards |
|---|---|---|---|---|---|
| `dashboard:view` | ✓ | ✓ | ✗ | ✗ | `/admin` page, `admin_dashboard_stats` RPC |
| `dashboard:finance:view` | ✓ | ✓ (s) | ✗ | ✗ | Money fields in dashboard stats (§5 exact list) — RPC omits them without it |
| `reports:attendance:view` | ✓ | ✓ | ✗ | ✗ | `/admin/reports`, attendance series in `admin_reports_data` |
| `reports:finance:view` | ✓ | ✓ (s) | ✗ | ✗ | Revenue fields in `admin_reports_data` (§5 exact list) — omitted without it |
| `members:view` | ✓ | ✓ | ✓ | ✗ | `/admin/members` read, `kiosk_search_members` |
| `members:manage` | ✓ | ✓ (s) | ✗ | ✗ | Member approve/edit/renew, `/api/admin/members/onboard` |
| `members:payment_history:view` | ✓ | ✓ | ✗ | ✗ | Per-member payment history panel + `payments` SELECT policy |
| `payments:view` | ✓ | ✓ (s) | ✗ | ✗ | `/admin/payments` list, `payments` SELECT (one switch with `payments:create`) |
| `payments:create` | ✓ | ✓ (s) | ✗ | ✗ | Record-payment flow, `payments` INSERT |
| `plans:manage` | ✓ | ✓ (s) | ✗ | ✗ | `/admin/plans`, `membership_plans` write policies |
| `promos:manage` | ✓ | ✓ (s) | ✗ | ✗ | `/admin/promos`, `promos` write policies |
| `announcements:manage` | ✓ | ✓ (s) | ✗ | ✗ | `/admin/announcements` page + `announcements` write policies (staff lose today's implicit write access — intended) |
| `gym_page:view` | ✓ | ✗ (s) | ✗ | ✗ | Open the Gym Page Studio (always granted together with `edit` — one switch, §7.9; there is no view-only Studio mode in v1) |
| `gym_page:edit` | ✓ | ✗ (s) | ✗ | ✗ | `gyms` UPDATE policy (non-publish columns), Studio editing. Resolver treats edit ⊇ view |
| `gym_page:publish` | ✓ | ✗ | ✗ | ✗ | `gyms.is_published` transitions (trigger-enforced). Never delegable |
| `features:manage` | ✓ | ✗ | ✗ | ✗ | `gym_feature_settings` writes, Features panel. Never delegable |
| `roles:manage` | ✓ | ✗ | ✗ | ✗ | Overrides writes, People & access UI. Never delegable |
| `kiosk:use` | ✓ | ✓ (s) | ✓ | ✗ | `/kiosk` route + kiosk RPC family (switch applies to admins; staff keep it) |
| `cache:revalidate` | ✓ | ✓ | ✗ | ✗ | `/api/admin/revalidate-gym`, `/api/admin/cache-health` |

Notes:

- **admin = operational management, finance visible by default** (product decision: keep it simple for ~40-year-old owners; the owner can revoke the money switch per admin if they care). No Studio by default, no feature toggles, no role management, no publish. **staff = kiosk + member lookup, nothing configurable in v1.** **member = member portal only** — the member portal is feature-gated, not permission-gated; do not invent `member:*` keys.
- `gyms_update` today allows admin (001:451). After migration 015 it requires `gym_page:edit` — admins lose gym-row writes by default; this is the intended behavior change. Verified: no operational admin flow writes to `gyms` (only the Studio save does).
- Staff can write announcements today via the `is_manager()` policy — the new `announcements:manage` key closes that (probably unintended) surface.

---

## 4. Feature toggle matrix

All defaults `true` except the four **Coming soon teasers** (always off, no enforcement wiring, owner-facing display only — see §7.8). Missing row/key ⇒ default. Group = where the row appears in the Features panel (§7.8).

| Key | Group | Owner-facing label | Effect line (exact UI copy) | Default | Public? | UI surfaces gated (Agent A) | Enforcement truth layer (Agent B) |
|---|---|---|---|---|---|---|---|
| `member_feed` | Members | Show gym feed | Members see a live feed of check-ins and milestones. | on | no | Member nav (`MemberShell`), home quick link, `/member/feed` | `feed_items` SELECT/INSERT policies `AND gym_feature_enabled('member_feed', gym_id)`; `lib/engagement-hooks.ts` skips feed inserts when off |
| `leaderboards` | Members | Show leaderboard to members | Members see workout and streak rankings. | on | no | Member nav "Ranks", home quick link, `/member/leaderboard` | `leaderboard_workouts/week_streak/longest_member` return empty set when off; page redirects |
| `public_team` | Public page | Show trainers & team | Your coaches appear on the public Contact page. | on | yes | Contact page team block; Studio Subpages→Team; preview | `get_gym_by_code` omits `team_members` when off |
| `public_pricing` | Public page | Show pricing page | Visitors can see your membership prices. | on | yes | `GymTopNav` "Pricing" link, `/gym/[code]/pricing`, preview Pricing tab | Pricing page `notFound()` when off; `get_gym_by_code` omits `pricing_packages` |
| `public_location` | Public page | Show location page | Visitors can see your map and directions. | on | yes | `GymTopNav` "Locate Us", `/gym/[code]/locate`, preview Locate tab | Locate page `notFound()` when off; payload omits `map_embed_url`/`directions` |
| `announcements` | Operations | Enable announcements | You can post announcements that members see in notifications. | on | no | `/admin/announcements` (nav item is currently commented out at [app/admin/layout.tsx:39](../app/admin/layout.tsx) — re-enable it behind this flag) | `announcements` INSERT/UPDATE policies gain `gym_feature_enabled(...)` |
| `promos` | Operations | Enable promos | You can create promo discounts to apply to payments. | on | no | `/admin/promos` nav + page, promo pickers in payments/onboarding | `promos` write policies gated; promo application checks flag |
| `kiosk_checkin` | Operations | Enable kiosk check-ins | The front-desk kiosk can check members in and out. | on | no | Admin nav "Kiosk", `/kiosk` route (friendly "turned off" screen, §6) | Every `kiosk_*` RPC adds `gym_feature_enabled('kiosk_checkin')` after its manager check; middleware also blocks `/kiosk` |
| `trainer_bookings` | Coming soon | Trainer bookings | Members can book sessions with your trainers, see their schedules, and chat with them. | off | no | Teaser row in Features panel only | None (unimplemented) |
| `friends_chat` | Coming soon | Friends & Chat | Members can add friends and message each other. | off | no | Teaser row in Features panel only | None (unimplemented) |
| `workout_log` | Coming soon | Workout routines | Members can record their own exercise routines. | off | no | Teaser row in Features panel only | None (unimplemented) |
| `session_posts` | Coming soon | Posts | Members can share their gym sessions to the feed, like a social post. | off | no | Teaser row in Features panel only | None (unimplemented) |

Interaction rules:

- A disabled feature blocks the surface for **everyone including the owner** on member/public surfaces. The Features panel is the only place the owner still sees it (as an "off" switch), and the Studio preview shows a hidden-page placeholder (§7.8).
- **No real-time push in v1**: a member with a now-disabled page open sees the change on their next navigation or refresh; data access is blocked server-side the instant the flag flips.
- Teasers are **owner-facing only** — nothing about them appears in member or public UI, they have real catalog keys (zero migration work when they ship), and there is no "notify me / interested" affordance in v1.

---

## 5. Database migration plan — Agent B

Conventions: `NNN_description.sql`, idempotent (`CREATE OR REPLACE`, `DROP ... IF EXISTS`), applied via Supabase CLI/MCP, never the dashboard. No destructive SQL. Regenerate `lib/database.types.ts` after each. Bump `package.json` + `CHANGELOG.md` per shipped slice group.

### `014_fix_notification_rpc_scope.sql` — Slice 0 (ships first, own PR)

Exactly per `PHASE_3_TO_7_DIAGNOSTIC_AND_PLAN.md` "Recommended fix":

1. `REVOKE EXECUTE ON FUNCTION public.process_daily_notifications() FROM authenticated;` (the cron route uses the service role — verified safe).
2. `create_member_notification(...)` — prepend `auth.uid()` NOT NULL + `is_manager()` + `p_gym_id = get_gym_id()` checks (kiosk pattern, 011:160-441). Internal trigger/definer callers unaffected.
3. `kiosk_update_streak(uuid, uuid)` — same caller checks; `REVOKE ... FROM PUBLIC, anon`.
4. `can_send_member_notification(...)` — require caller = the member OR a manager of the member's gym.

Rides along in the same PR (app code, no migration): gym-ownership check in `app/api/admin/revalidate-gym/route.ts` (resolve gym from `code`, require `gym.id === profile.gym_id`, else 403) and `avatarUrl` origin validation in `app/api/member/avatar/route.ts` (accept only Supabase-storage-origin URLs). Add RPC probe regression tests. Update the Phase 2.6 row in `CLAUDE.md` to ✅ when merged.

### `015_permission_model.sql`

1. Tables:

   ```sql
   CREATE TABLE IF NOT EXISTS public.gym_role_permission_defaults (
     role       public.user_role NOT NULL,
     permission TEXT NOT NULL,
     PRIMARY KEY (role, permission)
   );
   CREATE TABLE IF NOT EXISTS public.gym_user_permission_overrides (
     gym_id     UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
     user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
     permission TEXT NOT NULL,
     granted    BOOLEAN NOT NULL,
     granted_by UUID REFERENCES public.profiles(id),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (gym_id, user_id, permission)
   );
   ```

   Seed `gym_role_permission_defaults` from `tests/fixtures/role-permission-defaults.json`: **an `owner` row for EVERY key** (this makes the table the canonical key registry) plus the `admin`/`staff` `✓` cells from §3. Switch-flippable `(s)` states are not seeded per-user — they exist only as override rows once an owner flips a switch.
2. `has_gym_permission(p_permission text, p_gym_id uuid DEFAULT public.get_gym_id())` — conventions of `get_gym_id()` (SECURITY DEFINER, `SET search_path = ''`, STABLE, GRANT to `authenticated`). Logic: caller profile must exist and `gym_id = p_gym_id`; role `owner` → true (even for unknown keys — owners are never locked out); for non-owners, if the key has no row in the defaults table for any role → `RAISE EXCEPTION 'unknown permission: %'` (typo protection); else override row wins; else defaults table; special-case `gym_page:view` to also return true when the caller holds `gym_page:edit`.
3. `get_my_access()` → jsonb `{role, gym_id, permissions, features}` (features read via `gym_feature_enabled` once 016 lands; until then return the catalog defaults inline — 016 replaces the function with the final shape).
4. RLS for the new tables: defaults readable by `authenticated` (not secret); overrides SELECT for gym managers + the affected user; INSERT/UPDATE/DELETE only `has_gym_permission('roles:manage')` + gym scope; a trigger rejects overrides on `roles:manage`/`features:manage`/`gym_page:publish` (never delegable) and overrides targeting profiles with role `owner` or `member` (mirror of `prevent_profile_privilege_escalation`, 011:31). Overrides may target `staff` rows (schema-level, for the future) even though v1 UI never writes them.
5. Re-point existing policies (drop/recreate, 011 style):
   - `gyms_update` → `USING (id = public.get_gym_id() AND public.has_gym_permission('gym_page:edit')) WITH CHECK (same)`.
   - New trigger `protect_gym_publish` BEFORE UPDATE ON `gyms`: if `NEW.is_published IS DISTINCT FROM OLD.is_published` and NOT `has_gym_permission('gym_page:publish', NEW.id)` → raise.
   - `payments` SELECT → self OR `payments:view` OR `members:payment_history:view` (members keep seeing their own payment rows — confirmed product decision); INSERT → `payments:create`. **Note: `dev_all_payments` (001:539) is a wide-open `USING (true)` dev policy — replace it entirely.**
   - `plans_manage`/`plans_admin_all` → one policy on `plans:manage` (member SELECT stays).
   - `promos_manage`/`promos_admin_all` → `promos:manage`.
   - `announcements_manage`/`announcements_admin_all` → `announcements:manage` (016 adds the feature gate). This removes staff write access — intended (§3 note).
   - Leave other role-based policies alone — only tables named in §3 get permission-based policies now.
6. RPC hardening:
   - `admin_dashboard_stats()` — require `has_gym_permission('dashboard:view')` (else `RAISE EXCEPTION 'permission denied'`); the **finance fields**, built only with `dashboard:finance:view`, are exactly: `month_revenue`, `today_revenue`, and the monthly `revenue` series. Everything else (`currently_in`, `today_visits`, `total_members`, `pending_count`, `active_plans`, `expired_plans`, `frozen_plans`, attendance data) is visible to any `dashboard:view` holder. Rule of thumb the implementer must NOT re-derive: **finance = any field denominated in money**; counts and attendance are not finance.
   - `admin_reports_data(p_days)` — require `reports:attendance:view`; the **finance fields**, only with `reports:finance:view`, are exactly: `month_revenue`, `revenue_by_day`, `revenue_by_dom`, and `method_breakdown` (cash/GCash counts + totals — payment-method data is finance). `active_count`, `expired_count`, `attendance_by_day`, `peak_hours` stay.
   - Verify `components/admin/AdminDashboardClient.tsx` / `AdminReportsClient.tsx` tolerate the missing keys; adjust their TS types to mark finance fields optional and render a quiet "—" where absent. (Since admins keep finance **by default**, this path only triggers after an owner revokes the money switch.)

**Money-path caution (CLAUDE.md)**: the `payments` policy swap touches the highest-risk surface. The characterization tests in §9 must be green BEFORE this migration lands.

### `016_feature_toggles.sql`

1. `gym_feature_settings` table (§2.2) + RLS: SELECT for any authenticated user of the gym; ALL writes require `has_gym_permission('features:manage')` + gym scope.
2. `gym_feature_enabled(p_feature, p_gym_id DEFAULT get_gym_id())` with catalog defaults inline; GRANT to `authenticated`; callable from policies on anon-facing paths (it does not depend on `auth.uid()`).
3. `get_gym_by_code(p_code)` — CREATE OR REPLACE:
   - **fix `is_published` to read the real column** (§0 bug — user sign-off required);
   - add `'features', jsonb_build_object('public_team', ..., 'public_pricing', ..., 'public_location', ...)`;
   - omit `team_members` / `pricing_packages` / `map_embed_url` + `directions` when the corresponding flag is off;
   - include `logo_path`/`cover_path` if not already present (the public page reads them, [page.tsx:44-50](../app/gym/[code]/page.tsx)).
4. Feature checks in RPCs: the three `leaderboard_*` functions return an empty set when `leaderboards` is off; every `kiosk_*` function adds `gym_feature_enabled('kiosk_checkin')` to its existing guard.
5. RLS additions: `feed_select`/`feed_insert` gain `AND public.gym_feature_enabled('member_feed', gym_id)`; `announcements`/`promos` write policies gain their flags.
6. `get_my_access()` final shape (replaces 015's interim version).

### `017_gym_cover_focal_and_sections.sql`

1. `ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS cover_focal JSONB NOT NULL DEFAULT '{"x":50,"y":50}';`
2. `ADD COLUMN IF NOT EXISTS section_visibility JSONB NOT NULL DEFAULT '{"amenities":true,"hours":true,"contact":true}';` (home-page section show/hide is **page content**, so it lives on `gyms`, not in `gym_feature_settings`).
3. Surface both in `get_gym_by_code()` (sequential CREATE OR REPLACE is fine).

Land 017 **early** (it can ship right after Slice 0) so Agent A's preview work has real columns to save to.

---

## 6. Route / API / RPC hardening checklist — Agent B

### RPCs

| Function | Today | Required | Migration |
|---|---|---|---|
| `process_daily_notifications()` | Granted to `authenticated`, no checks (**Critical**) | REVOKE from authenticated; service-role/cron only | 014 |
| `create_member_notification(...)` | No caller checks (**Critical**) | `auth.uid()` + `is_manager()` + gym scope | 014 |
| `kiosk_update_streak(uuid,uuid)` | No caller checks (**High**) | Same + REVOKE PUBLIC/anon | 014 |
| `can_send_member_notification(...)` | Info disclosure (**Medium**) | Self-or-manager + gym scope | 014 |
| `admin_dashboard_stats()` | Gym-scoped, **member-callable** (High) | `dashboard:view`; finance keys only with `dashboard:finance:view` | 015 |
| `admin_reports_data(p_days)` | Same problem | `reports:attendance:view`; revenue only with `reports:finance:view` | 015 |
| `leaderboard_workouts/week_streak/longest_member` | Gym-scoped, any authenticated | + `gym_feature_enabled('leaderboards')` → empty when off | 016 |
| `kiosk_checkin`, `kiosk_checkin_by_member`, `kiosk_checkout`, `kiosk_get_checked_in`, `kiosk_search_members` | Manager+gym (011) | + `gym_feature_enabled('kiosk_checkin')`; `kiosk_search_members` keeps working for staff (`members:view`) | 016 |
| `get_gym_by_code(p_code)` | `is_published` derived from tagline (**bug**); returns all data | Fix bug; add public feature flags; omit disabled-feature data; add focal/section fields | 016+017 |
| `member_home_stats()`, `search_gyms`, `set_member_avatar_with_cooldown` | OK | Verify only, no change | — |

### API routes (`app/api/`)

| Route | Today | Required | Slice |
|---|---|---|---|
| `admin/revalidate-gym` | Role check; **any gym's code accepted** | Gym-scope check (Slice 0); later `apiRequirePermission('cache:revalidate')` | 0 + post-015 |
| `admin/cache-health` | Role check; `?code=` unscoped | Same gym-scope rule; `cache:revalidate` | post-015 |
| `admin/members/onboard` | `MANAGER_ROLES` check | `apiRequirePermission('members:manage')` | post-015 |
| `member/avatar` | `avatarUrl` accepted unvalidated (**Medium**) | Require Supabase-storage-origin URL | 0 |
| `cron-notifications` | Bearer secret + service role | No change | — |

### Middleware + server pages

| Surface | Required change |
|---|---|
| `middleware.ts` | Keep the coarse role gate. For `/admin/*` + `/kiosk`: replace the profile query with one `supabase.rpc('get_my_access')` call (same round-trip count), consult `ROUTE_PERMISSIONS` from `lib/permissions.ts`; missing permission → redirect `/admin`; `/kiosk` additionally requires the `kiosk_checkin` feature. Keep forwarding `x-gym-id`/`x-user-role`. |
| `app/admin/page.tsx`, `app/admin/reports/page.tsx` | Server components: `await requirePermission('dashboard:view' / 'reports:attendance:view')` before the RPC (belt to the RPC's suspenders). |
| `app/admin/gym-profile/page.tsx` | Becomes a thin **server** page: `requirePermission('gym_page:view')`, fetch gym row + access + feature flags, render `<GymPageStudio …/>` (Agent A's client island). Replaces the client-side `router.replace` pseudo-guard. Agent B owns this server wrapper; Agent A owns everything it renders. |
| Other `/admin/*` pages | Covered by middleware map + RLS. Add `requirePermission` only to pages that are already server components — do not convert pages just for this. |
| `app/member/layout.tsx` | Fetch effective features server-side (`get_my_access`), pass `features` prop into `MemberShell` (prop contract in §8.5). |
| `app/member/feed/page.tsx`, `app/member/leaderboard/page.tsx` | Server gate: feature off → `redirect('/member')` (RLS/RPC already return nothing; this is UX). |
| `/kiosk` page | When `kiosk_checkin` is off, render a friendly full-screen state — heading "Check-ins are turned off", body "The owner has disabled kiosk check-ins for this gym." — instead of letting scans hit RPC errors. Middleware already redirects; this covers a kiosk left open when the flag flips mid-shift. |
| `app/admin/announcements/page.tsx` | Smoke-test the page (nav item has been commented out; it may have rotted). **If broken, fix it** — user-confirmed in scope. Then re-enable the nav item behind the `announcements` feature + `announcements:manage` permission. |
| `app/member/page.tsx` | Remove the `kiosk_get_checked_in()` call (line 15). Replace `peopleInGym` with a member-safe source: add a `people_in_gym` integer to `member_home_stats()` (count of open attendance rows for the caller's gym) in migration 016. |
| `app/gym/[code]/layout.tsx` | Pass `features` from the public payload into `GymTopNav` (prop contract in §8.5). |
| `app/gym/[code]/pricing\|locate\|contact` | `notFound()` when the respective public feature is off (data already omitted from payload). Contact page stays up (it's the contact surface), but hides the team block when `public_team` off. |
| `lib/engagement-hooks.ts` | In `handleScan`, fetch the gym's `member_feed` flag once (one `gym_feature_settings` read; missing row ⇒ default true) and skip `postCheckInFeedItem`/`postStreakMilestoneFeedItem` when off. Check-in itself must still succeed; never throw from a skipped hook. |

### Client UI (hide-only — Agent A, listed for completeness)

| Surface | Change |
|---|---|
| `app/admin/layout.tsx` | Replace `ownerOnly` with `permission?: PermissionKey; feature?: FeatureKey` per nav item; filter via `useAccess()`. Nav additions: "People & access" (`roles:manage`), re-enabled "Announcements" (`announcements` feature + `announcements:manage` permission — page verified/fixed by Agent B first, §6). Kiosk item: `kiosk:use` + `kiosk_checkin`. Gym Page item: `gym_page:view`. Reports: `reports:attendance:view`. |
| `components/member/MemberShell.tsx` | Filter `NAV_ITEMS` by the `features` prop (`member_feed`, `leaderboards`). |
| `components/member/MemberHomeClient.tsx` | Same filtering for the quick links block (lines 492-497); accept a `features` prop through `MemberHomeData`. |
| `components/gym/GymTopNav.tsx` | Accept `features` prop; drop Pricing/Locate links when off. |

---

## 7. Gym Page Studio — full design specification (Agent A)

This section IS the design. Recreate the mockup's layout and interactions with the app's own design tokens. Do not rendering-copy the prototype's DOM; build idiomatic React/Tailwind matching the existing codebase style (inline `style={{ …var(--color-*) }}` + Tailwind utility classes, as every current admin page does).

### 7.0 Design-language mapping (mockup → production)

The mockup's warm cream palette and Syne font are **prototype placeholders**. Map:

| Mockup | Production token |
|---|---|
| Page background `#F6F1EA` | `var(--color-background)` |
| Card white `#fff`, border `#EBE3DA` | `var(--color-white)` / `var(--color-surface)` |
| Accent `#B47A45` / `#D4956A` | `var(--color-primary)` (+ `var(--color-primary-glow)` for tints) |
| Headings font Syne | `var(--font-heading)` |
| Body font Inter | app default |
| Success green `#4f9d6f` family | `var(--color-success)` / `var(--color-success-bg)` |
| Warning amber `#e0a83a` family | `var(--color-warning)` / `var(--color-warning-bg)` |
| Muted text `#9a8f82` | `var(--color-text-muted)`; secondary `#6a6157` → `var(--color-text-secondary)` |
| Preview stage backdrop `#e4ddd4` | `var(--color-surface)` |

**Inside the preview frame**, colors come from the gym's own brand (`brandColorVars()` output applied to the preview subtree via a scoped `<style>` or inline vars) — the preview must look like the real public page, not like the admin theme.

### 7.1 The one refactor that unlocks it (do first)

Extract the presentational body of `GymLandingPage` (currently inline in [app/gym/[code]/page.tsx:134-578](../app/gym/[code]/page.tsx)) into **`components/gym/GymLandingPreview.tsx`**:

```ts
type GymPreviewData = {            // superset of today's GymData
  name: string; code: string; tagline: string | null; description: string | null;
  address: string | null; phone: string | null;
  logoUrl: string | null; coverUrl: string | null;
  brandColor: string; secondaryColor: string | null;
  operatingHours: Record<string, string> | null;
  amenities: string[] | null;
  socialLinks: { facebook?: string; instagram?: string; website?: string } | null;
  teamMembers: { name: string; role: string; bio?: string; photo_url?: string }[] | null;
  pricingPackages: { name: string; price: string; duration: string; features: string[]; is_featured: boolean }[] | null;
  mapEmbedUrl: string | null; directions: string | null;
  memberCount: number;
  coverFocal: { x: number; y: number };                          // 0–100
  sectionVisibility: { amenities: boolean; hours: boolean; contact: boolean };
};

props: {
  gym: GymPreviewData;
  view: 'home' | 'join' | 'contact' | 'pricing' | 'locate';
  device: 'desktop' | 'mobile';
  interactive?: boolean;      // false in Studio: links/buttons render but don't navigate
  focalOverlay?: React.ReactNode; // Studio injects the FocalPointEditor here (home/join only)
}
```

- **Public pages** (`/gym/[code]`, `/contact`, `/pricing`, `/locate`) render it with `interactive` true, device resolved by the existing responsive markup (keep today's `md:hidden` / `hidden md:block` split inside the component — `device` prop only forces one branch when set, for the Studio).
- Cover focal: apply `style={{ objectPosition: \`${focal.x}% ${focal.y}%\` }}` on the cover `<Image>` (both mobile and desktop heroes).
- Section visibility: `sectionVisibility.amenities === false` hides the Amenities section even when data exists; same for hours/contact. Empty-data hiding behavior is preserved unchanged.
- `view: 'join'` renders a **non-interactive facsimile** of the signup layout (cover panel + disabled form fields per the mockup's `_renderJoin`) — it is Studio-only; the real `/gym/[code]/signup` page is NOT refactored or touched.
- `view: 'contact' | 'pricing' | 'locate'` render prop-driven bodies matching the existing public subpages (gradient header + cards). Feature flags shape them: when `public_pricing` is off, the Studio passes a flag so the tab shows the hidden-page placeholder (§7.8) — the component itself stays dumb.
- **Acceptance bar: the public pages must render pixel-identically before/after this refactor** (existing e2e passes unchanged).

### 7.2 Component tree & files

```
app/admin/gym-profile/page.tsx      // (Agent B) thin server page: guard + fetch + <GymPageStudio/>
components/admin/gym-studio/
├─ GymPageStudio.tsx                // client island; owns ALL state + save (state/handlers lifted
│                                   //   verbatim from today's page.tsx — media pipeline untouched)
├─ GettingStartedBanner.tsx         // §7.6
├─ StudioHeader.tsx                 // §7.3.1
├─ ControlRail.tsx                  // desktop left rail (w-[404px]) / mobile stacked cards
│  ├─ RailGroup.tsx                 // shared collapsible card: icon, title, sub, chevron, children
│  ├─ EssentialsGroup.tsx           // §7.3.2
│  ├─ PhotosGroup.tsx               // §7.3.3 (CoverField, LogoField)
│  ├─ BrandStyleGroup.tsx           // §7.7
│  ├─ SectionsGroup.tsx             // §7.3.4
│  ├─ SubpagesGroup.tsx             // §7.3.5
│  └─ FeaturesGroup.tsx             // §7.8 (NEW — not in mockup)
├─ PreviewPane.tsx                  // toolbar + stage
│  ├─ PreviewToolbar.tsx            // tabs · safe-area toggle · device toggle
│  ├─ DeviceFrame.tsx               // browser chrome (desktop) / phone bezel (mobile)
│  └─ FocalPointEditor.tsx          // §7.5
├─ MobileStudioSheet.tsx            // §7.4 drawer
components/gym/GymLandingPreview.tsx  // §7.1
app/admin/access/page.tsx + components/admin/AccessClient.tsx   // §7.9 (NEW)
```

`GymPageStudio` state = today's `gym-profile/page.tsx` state (lines 114-152) plus: `coverFocal`, `sectionVisibility`, `featureFlags`, `previewTab`, `previewDevice`, `showSafeArea`, `focalEditing`, `dirty`, `drawerOpen`, `openGroups`. All upload/compress/hash/cleanup/save/revalidate functions move over **verbatim** (§7.10 guardrail).

### 7.3 Desktop layout (≥1024px) — mockup 1a

Full-height two-pane inside the admin shell: banner (optional) → header → `flex` row of ControlRail (404px, own scroll) and PreviewPane (flex-1, stage scrolls).

#### 7.3.1 StudioHeader

- Left: `h1` "Gym Page" (heading font) · gym code chip (mono, muted bg) · **status pill**: `● Live` (success tint) or `● Hidden` (warning tint).
- Sub-line: "Guided edits on a polished Stren page — you choose the content, we keep the layout sharp."
- Right cluster: dirty text (`Unsaved changes` warning-tinted / `All changes saved` muted / `Saving…`) · "View public page ↗" link → `/gym/{code}` new tab · **Save changes** button (primary when dirty, muted-disabled when clean) · **Publish**/**Unpublish** button (Publish = success solid; Unpublish = outline). Publish with empty tagline → button disabled + tooltip "Add a tagline first".
- **Publish/Unpublish renders only when `access.permissions.has('gym_page:publish')`** (owner). An admin granted the Studio switch sees the status pill plus a muted caption "Only the owner can publish" where the button would be — never a button that 403s. (The DB trigger is the backstop.)
- Save and Publish are **separate actions**. Publish also saves. Both disabled while uploading (existing flags).
- **Save = two writes** (gym row update, then `gym_feature_settings` upsert when flags changed). If either fails: stay `dirty`, toast names which half failed ("Your page content saved, but feature settings didn't — try again."). No transaction in v1; re-saving flags is idempotent.
- **Save always fires the revalidation call** (existing `triggerGymPageRevalidation`), even for a flags-only or focal-only change — one path, impossible to forget, keeps the 1-hour public cache honest.

#### 7.3.2 EssentialsGroup (default open)

Icon: sliders. Sub: "Tagline & description". Contents:
1. **Public visibility row** (boxed): title "Public visibility", sub "A tagline is required to publish." + the same Published/Hidden pill-toggle behavior as today (blocked with toast when no tagline).
2. **Tagline**: label + live `{n}/120` counter (counter turns danger-colored at 0 chars trimmed); input `maxLength=120`, placeholder "Your gym's one-liner".
3. **Short description**: 3-row textarea, placeholder "What makes your gym special".

Gym name and code are NOT edited here (they stay ownership/identity data; editing them stays out of v1 Studio — remove those inputs from the UI; the save payload keeps sending current values).

#### 7.3.3 PhotosGroup (default open, "START HERE" badge)

Badge: small primary-tinted chip "START HERE" on the group header.

**CoverField**: label "Cover photo" + Remove (danger text, only when present). Thumbnail (~118px, rounded-xl): shows current cover with `background-position` from focal + bottom gradient scrim + an **"Adjust focal point"** overlay button (bottom-right, dark translucent; becomes primary-solid "Done" while editing). Empty state: dashed card, image icon, "Add a cover photo". Below: **Upload** button (opens file input; drag-and-drop onto the thumbnail also accepted — reuse existing handlers). Help copy: "Fills the hero on desktop & mobile. Drag the focal point on the preview so faces stay clear of the text." Upload spinner text: "Uploading cover image…" (existing flow).

**LogoField** (divider above): label "Logo" + Remove. 60px square preview tile ("None" placeholder text when empty) + **Upload/Replace** button + copy: "Shows in the nav, hero & signup. A square mark reads best." (Mockup's "Try another"/generated marks are prototype-only — production has real uploads exclusively.)

#### 7.3.4 SectionsGroup ("Home sections", default collapsed)

Sub: "Amenities, hours, contact". Three boxed sub-cards, each with a **Shown/Hidden pill** (success tint when shown, muted when hidden) that writes `sectionVisibility.*` and updates the preview instantly. When hidden, the sub-card's editor collapses.

1. **Amenities** — chip list with per-chip ✕ remove, input + Add button, Enter adds (existing handlers).
2. **Opening hours** — 7 rows `day | input`, placeholder "Closed" (existing handlers, placeholder change).
3. **Contact & social** — inputs: Address, Phone (**new to the form** — columns exist on `gyms`; add them to the load/save payload), Facebook, Instagram, Website (existing social handlers).

#### 7.3.5 SubpagesGroup (default collapsed)

Sub: "Team, pricing, location". Three boxed sub-cards, each with a page-tag chip ("Contact page" / "Pricing page" / "Locate page") and a **"Preview →"** text button that switches the preview tab.

1. **Team** — compact rows (avatar initial circle, name, role, ✕) + "+ Add member" dashed button → appends an editable row (name, role, bio, photo URL — reuse existing team editor fields inside an expanding row).
2. **Pricing** — compact rows (name, POPULAR tag when featured, price) + "+ Add package" → expanding editor (existing pricing fields incl. features-one-per-line + Featured checkbox).
3. **Location** — Map embed URL input + Directions textarea (existing fields + help copy "Google Maps → Share → Embed a map → copy the src URL").

Rail footer caption (muted, centered): "Layout, fonts & spacing are handled by Stren — you focus on the content."

#### 7.3.6 PreviewPane

- **Toolbar**: segmented tabs **Home · Join · Contact · Pricing · Locate** (active = white card w/ shadow) · right side: **Safe area** toggle chip (primary-tinted when on) · device segmented control (desktop/mobile icons). The device toggle and tabs are **always visible, one click, never nested in a menu** — a single stored focal point serves both crops (product decision), so instant device switching is how owners sanity-check it.
- **Stage**: neutral backdrop, centered `DeviceFrame`:
  - Desktop frame: browser chrome bar (three dots + URL pill showing the real `stren` host + `/gym/{code}`), 940px max width, ~620px scrollable viewport.
  - Mobile frame: phone bezel (320px wide, rounded-[34px] dark shell), 660px scrollable viewport.
- Inside: `GymLandingPreview` fed from **unsaved Studio state** (live mapping: tagline keystrokes, colors, focal, section pills, feature flags reflect instantly).
- Preview of an unpublished gym renders normally (the Studio *is* the preview mode); no "coming soon" branch inside the Studio.

### 7.4 Mobile layout (<1024px) — mockup 1b

- Header condenses: title + status pill; compact checklist banner (progress ring + "Finish your gym page / N of 5 essentials done" + chevron; tapping opens the first incomplete group).
- ControlRail renders as stacked full-width cards, same groups/order.
- **Sticky bottom bar** (fixed, above the admin shell's own chrome): primary button **"👁 Preview my page"** (flex-1) + square Save icon-button.
- Tapping Preview opens **MobileStudioSheet**: full overlay scrim + drawer sliding to 90% height (rounded top, grab handle), header row "Live preview" + muted chip "as members see it" + **Done** pill (dark) on the right; horizontal scrollable tab strip (pill tabs, dark = active); body = `GymLandingPreview` mobile at full width. Done closes and returns to the exact prior scroll position. Focal editing works inside the drawer the same way.

### 7.5 FocalPointEditor

Overlay injected into `GymLandingPreview` over the hero (Home + Join tabs only, only when a cover exists):

- **Focal dot**: 26px white-ringed circle at `(x%, y%)`, subtle shadow, transitions when not dragging.
- **Editing mode** (entered via "Adjust focal point" in PhotosGroup, or clicking the dot): hero dims slightly, cursor crosshair, top-center caption pill "Drag to set the focal point" + white **Done** button. Pointer events: down/move/up with pointer capture; position clamped 0–100, rounded to integers; updates `coverFocal` live (cover `object-position` follows).
- **Keyboard**: dot is a focusable element `role="slider"`-like button, `aria-label="Cover focal point"`, `aria-valuetext="X {x}%, Y {y}%"`; arrow keys nudge 1% (clamped); Escape/Enter = Done.
- **Safe-area guide** (when `showSafeArea` or editing): dashed white rounded rectangle with tag "TEXT SITS HERE" — geometry: mobile `{top:46%, left:8%, right:8%, bottom:6%}`, desktop `{top:34%, left:4%, right:46%, bottom:10%}` (matches where hero text actually renders).
- Focal is **metadata only** (`gyms.cover_focal`) — never re-crops or re-uploads the image.

### 7.6 GettingStartedBanner (checklist)

Items (exact defs):

| key | label | done when |
|---|---|---|
| `cover` | Cover photo | `coverPath \|\| coverUrl` non-empty |
| `logo` | Logo | `logoPath \|\| logoUrl` non-empty |
| `tagline` | Tagline | trimmed length > 0 |
| `contact` | Contact info | address OR phone non-empty |
| `cta` | Join button | always true (built in) |

Render: warm card (primary-tinted gradient ok) with title **"Finish your gym page"**, sub "{n} of 5 essentials done", chips per item (done = success tint + filled dot; pending = outlined), progress ring (conic-gradient, % label). Chip click opens + scrolls to the owning group (`cover/logo→Photos`, `tagline→Essentials`, `contact→Home sections`, `cta→Essentials`). Dismiss ✕ persists in `localStorage` key `stren.studio.checklistDismissed.{gymId}`; banner auto-hides at 5/5.

### 7.7 BrandStyleGroup

Sub: "Colors, no hex required". Header shows a live two-tone swatch (primary|secondary split).

1. **"Pick a palette"** — 2×2 preset grid; each row: two-tone swatch + name + ✓ when active. Presets (primary/secondary): **Grove** `#2F7D5B/#24302B`, **Terracotta** `#C1653F/#2B211C`, **Ocean** `#2C6E8F/#1B2932`, **Ember** `#B0473C/#2A1E1C`. Picking sets both colors and the ramp seed.
2. **"Fine-tune the main color"** — 5-swatch ramp of the seed primary: `generatePalette(seed)` = mixes toward white by 34% and 16%, the seed itself, and toward black by 18% and 36%. Active swatch gets a dark ring.
3. **ContrastMeter** — computes WCAG `contrastRatio('#FFFFFF', primary)`:
   - ≥ 4.5 → success tint, ✓ icon: "Great contrast — white button text is easy to read on your color."
   - ≥ 3 → success tint: "Readable — white button text works on your color."
   - < 3 → warning tint, ⚠ icon: "Low contrast — white text is hard to read. Pick a deeper shade below."
   Save is **not blocked** on low contrast (owner may accept it); the warning is persistent.
4. **"Advanced: custom color"** text-button reveals the two hex inputs (Main / Deep) with the existing `isValidHex` validation + error strings.

`lib/brand-color.ts` additions (Agent A, unit-tested):

```ts
export function contrastRatio(hexA: string, hexB: string): number; // WCAG relative luminance
export function generatePalette(seedHex: string): [string, string, string, string, string]; // +34% white, +16% white, seed, +18% black, +36% black
```

`isValidHex`, `hexDarken`, `brandColorVars` stay untouched.

### 7.8 FeaturesGroup — NEW (designed here; not in the mockup)

Last card in the ControlRail. **Rendered only when `access.permissions.has('features:manage')`** (owner). Icon: toggles/sliders. Title **"Features"**, sub "What members and visitors can use".

Layout: grouped rows under small uppercase group headers **MEMBERS**, **PUBLIC PAGE**, **OPERATIONS**, **COMING SOON** (groups/order/copy from §4). Each row:

```
[ Label                      (switch) ]
[ effect line, muted, one sentence    ]
```

- Switches are real `role="switch"` buttons with `aria-checked`, label = the row label. On/off track colors: success / muted surface.
- Toggling updates local `featureFlags` → `dirty`; persisted by the normal **Save** (one `upsert` to `gym_feature_settings` alongside the gym-row update, via `saveFeatureFlags` from §8.4).
- **Instant preview feedback**: turning `public_pricing` off while the Pricing tab is active swaps the preview body for a **hidden-page placeholder** — centered card: eye-off icon, "This page is hidden", "Visitors won't see Pricing in the menu, and the link won't work." Same for Locate. Turning `public_team` off hides the team block on the Contact tab. Nav links inside the preview's top bar drop accordingly.
- `kiosk_checkin` row shows a warning micro-line **while off**: "Front-desk check-ins are paused."
- **COMING SOON group** (last): the four teaser rows from §4 — Trainer bookings, Friends & Chat, Workout routines, Posts. Same label + effect-line format as live features, rendered at slightly reduced opacity with a muted "Coming soon" chip where the switch would be. No switch, no click action, no member-facing trace. Teasers look like features, not ads — they tell the owner "this panel is where new capabilities will appear."
- Technical keys never appear anywhere in the UI.

Non-owner with the Studio switch (`gym_page:view`+`gym_page:edit`): the FeaturesGroup is absent entirely (not disabled — absent), and Publish is replaced by the caption per §7.3.1. There is **no read-only Studio mode in v1** — the Studio switch always grants view+edit together.

### 7.9 People & access page — NEW (designed here; not in the mockup)

Route `app/admin/access/page.tsx` (server guard by Agent B: `requirePermission('roles:manage')`) rendering `components/admin/AccessClient.tsx`. Admin-nav item **"People & access"** (shield icon), visible only with `roles:manage`.

Design philosophy: **one flat list of switches per admin.** No roles, no groups, no permission matrix — deliberately simpler than Discord-style systems; the target owner is ~40 and non-technical.

Layout (matches existing admin pages: title block + white rounded-xl cards):

- Title "People & access", sub "Control what your team can see and do."
- **Card: "Your team"**, listing in order:
  1. **The owner row (always first)** — the owner's name + email, a distinct filled badge **"Owner — full access"** (primary tint, check icon), no chevron, no switches. It must be unmistakable that the owner can do everything; this row exists purely to convey that.
  2. **Admin rows** — name, email, role chip. Chevron expands to the **Access switches** panel.
  3. **Staff rows** — name, email, role chip. No chevron; static caption: "Staff can use the kiosk and look up members."
  Empty state (no admins/staff): "No admin or staff accounts yet."
- **The Access switches** (exact list — this is the frozen `ACCESS_SWITCHES` contract, §8.1). Each is a plain-language `role="switch"` row, pre-set from the admin's current effective permissions; the owner flips freely in both directions:

  | # | Switch label | Default | Permission key(s) written |
  |---|---|---|---|
  | 1 | Can see money numbers (dashboard & reports) | ON | `dashboard:finance:view` + `reports:finance:view` |
  | 2 | Can manage members | ON | `members:manage` |
  | 3 | Can record payments | ON | `payments:create` + `payments:view` |
  | 4 | Can manage plans | ON | `plans:manage` |
  | 5 | Can manage promos | ON | `promos:manage` |
  | 6 | Can post announcements | ON | `announcements:manage` |
  | 7 | Can use the kiosk | ON | `kiosk:use` |
  | 8 | Can open & edit the Gym Page studio | OFF | `gym_page:view` + `gym_page:edit` |

  Multi-key switches write one override row per key, same `granted` value. Flipping a switch back to the role default **deletes** the override rows (via `saveOverride` with `granted: null`) rather than storing a redundant row.
- Each switch saves immediately (`saveOverride`, §8.4): saving spinner on the row, toast on failure and revert. No page-level Save button.
- Never exposed as switches (owner-only, never delegable): publish, feature toggles, people & access itself, cache tools.
- Footer caption: "Owners always have full access. These switches apply to this gym only."
- No role editor, no invitations, no owner transfer, no staff switches in v1.

### 7.10 States, a11y, guardrails

States to handle: empty (dashed affordances + checklist nudges) · uploading (spinner, Save disabled) · dirty→saving→saved in header · published vs hidden (status pill; publish gated on tagline — existing rule + DB constraint 008) · low contrast warning · section hidden (instant preview removal) · focal editing · drawer open/closed · **feature off (preview placeholder)** · **partial save failure (§7.3.1 — stays dirty, names the failed half)** · **no-publish-permission (§7.3.1 caption)**.

Additional behaviors (user-confirmed):

- **Unsaved-changes guard**: `beforeunload` browser prompt while dirty, plus an in-app confirm dialog ("You have unsaved changes — leave anyway?") when a nav link is clicked while dirty.
- **Concurrent edits are last-write-wins** for the whole gym row, silently. Accepted for v1 — realistically one owner edits this; no locking or merge UI.

Accessibility: groups are real `<button>` disclosures with `aria-expanded`; all toggles `role="switch"`; focal editor keyboard-operable + announces coordinates; drawer traps focus, Escape closes; preview images get alt from gym name; tab strips are `role="tablist"`.

Guardrails (non-negotiable):

- **No** freeform canvas, drag-to-reorder, font/spacing controls, arbitrary section ordering, or nav/checkout editing. Owners cannot break the layout — that is the point. Notion/Wix-ADI confidence, not a website builder.
- **Preserve the media pipeline verbatim** (§1 table). The Studio is a UI around it, not a rewrite. Focal point is new metadata, not a re-crop.
- Save keeps the exact update payload shape of today's `handleSave` (page.tsx:728-768) + the new keys (`cover_focal`, `section_visibility`, address, phone). Revalidation call and cleanup scheduling stay as-is.
- Target users are ~40-year-old gym owners, not power users: every control is labeled in plain language, one obvious primary action per screen, no jargon, no technical keys.

---

## 8. Frozen TypeScript contracts (Agent A creates; Agent B consumes; neither changes shapes without updating this guide)

### 8.1 `lib/permissions.ts` (pure, isomorphic — no supabase imports)

```ts
export type Role = 'owner' | 'admin' | 'staff' | 'member';

export type PermissionKey =
  | 'dashboard:view' | 'dashboard:finance:view'
  | 'reports:attendance:view' | 'reports:finance:view'
  | 'members:view' | 'members:manage' | 'members:payment_history:view'
  | 'payments:view' | 'payments:create'
  | 'plans:manage' | 'promos:manage' | 'announcements:manage'
  | 'gym_page:view' | 'gym_page:edit' | 'gym_page:publish'
  | 'features:manage' | 'roles:manage'
  | 'kiosk:use' | 'cache:revalidate';

export const PERMISSION_KEYS: readonly PermissionKey[];
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, readonly PermissionKey[]>;
// §3 exactly; owner = EVERY key (the fixture seeds an owner row per key — canonical registry)

// The People & access UI (§7.9): one flat list of switches per admin, both directions.
export interface AccessSwitch {
  id: string;                                 // stable slug, e.g. 'money-numbers'
  label: string;                              // §7.9 table, verbatim
  permissions: readonly PermissionKey[];      // keys written together, same granted value
}
export const ACCESS_SWITCHES: readonly AccessSwitch[]; // the 8 rows of §7.9, in order

export interface PermissionOverride { permission: PermissionKey; granted: boolean }

export function roleHasPermission(role: Role, key: PermissionKey): boolean;
// owner ⇒ all keys (incl. unknown future ones); gym_page:edit implies gym_page:view; overrides beat defaults
export function resolvePermissions(role: Role, overrides: readonly PermissionOverride[]): ReadonlySet<PermissionKey>;

// Longest-prefix match wins; used by middleware and admin nav. Exact entries:
//   /admin/gym-profile   → gym_page:view      /admin/access   → roles:manage
//   /admin/reports       → reports:attendance:view
//   /admin/members       → members:view        /admin/payments → payments:view
//   /admin/plans         → plans:manage        /admin/promos   → promos:manage
//   /admin/announcements → announcements:manage
//   /kiosk               → kiosk:use           /admin          → dashboard:view
export const ROUTE_PERMISSIONS: readonly { prefix: string; permission: PermissionKey }[];
```

### 8.2 `lib/features.ts` (pure)

```ts
export type FeatureKey =
  | 'member_feed' | 'leaderboards' | 'public_team' | 'public_pricing'
  | 'public_location' | 'announcements' | 'promos' | 'kiosk_checkin'
  | 'trainer_bookings' | 'friends_chat' | 'workout_log' | 'session_posts'; // teasers — real keys now, zero migration when they ship

export interface FeatureDef {
  key: FeatureKey;
  label: string;                 // §4 label column, verbatim
  effect: string;                // §4 effect column, verbatim
  group: 'members' | 'public' | 'operations' | 'coming_soon';
  defaultEnabled: boolean;       // all true except the four coming_soon teasers
  status: 'available' | 'coming_soon';
  publicSurface: boolean;        // true: public_team, public_pricing, public_location
}

export const FEATURE_CATALOG: readonly FeatureDef[];
export type FeatureFlags = Partial<Record<FeatureKey, boolean>>;
export function isFeatureEnabled(flags: FeatureFlags | null | undefined, key: FeatureKey): boolean; // missing ⇒ default; coming_soon ⇒ always false
```

### 8.3 `lib/access.ts` (pure)

```ts
import type { Role, PermissionKey, PermissionOverride } from './permissions';
import type { FeatureKey, FeatureFlags } from './features';

export interface MyAccess {
  role: Role;
  gymId: string | null;
  permissions: ReadonlySet<PermissionKey>;
  features: FeatureFlags;        // effective flags (server-resolved when available)
}

export function buildAccess(role: Role, gymId: string | null, overrides: readonly PermissionOverride[], features: FeatureFlags): MyAccess;
export function canUse(access: MyAccess, feature: FeatureKey | null, permission: PermissionKey | null): boolean;
export function accessFromRoleDefaults(role: Role, gymId: string | null): MyAccess; // fallback: role defaults + catalog defaults
```

### 8.4 `lib/access-data.ts` (client data access — Agent A writes it against the SQL surface specified in §5; Agent B guarantees the backend matches)

```ts
export async function fetchMyAccess(supabase: SupabaseClient): Promise<MyAccess>;
// supabase.rpc('get_my_access'); on error or missing function → accessFromRoleDefaults() from the auth-context profile

export async function saveFeatureFlags(supabase: SupabaseClient, gymId: string, flags: FeatureFlags): Promise<void>;
// upsert into gym_feature_settings { gym_id, flags, updated_by: auth.uid(), updated_at: now }

export interface AccessPerson { userId: string; name: string; email: string; role: Role; overrides: PermissionOverride[] }
export async function listAccessPeople(supabase: SupabaseClient, gymId: string): Promise<AccessPerson[]>;
// profiles (role in admin,staff, gym scope) joined with gym_user_permission_overrides

export async function saveOverride(supabase: SupabaseClient, args: { gymId: string; userId: string; permission: PermissionKey; granted: boolean | null }): Promise<void>;
// granted=null ⇒ delete the row (back to default); else upsert
```

Plus `lib/access-context.tsx` (Agent A): `<AccessProvider>` client component fetching `fetchMyAccess` once per mount (after auth-context resolves) + `useAccess(): MyAccess` hook, wrapped around the admin layout content. Until the RPC exists / on failure it serves `accessFromRoleDefaults` — the UI degrades to today's role behavior, never crashes.

### 8.5 Server module + prop contracts (Agent B)

- `lib/permissions-server.ts`: `getMyAccess()` (server, cached per request), `requirePermission(key)` → `redirect('/admin')`, `requireFeature(key)` → `redirect`, `apiRequirePermission(key)` → `NextResponse` 403 helper.
- Prop contracts Agent B wires and Agent A consumes:
  - `MemberShell` gains `features: FeatureFlags` prop (from `app/member/layout.tsx`).
  - `MemberHomeData` gains `features: FeatureFlags`.
  - `GymTopNav` gains `features: Pick<FeatureFlags,'public_pricing'|'public_location'>` (from `app/gym/[code]/layout.tsx`, sourced from the public payload).
  - `GymPageStudio` receives from the server page: `{ initialGym, access: MyAccess, initialFeatureFlags: FeatureFlags }`.

### 8.6 Parity fixture

`tests/fixtures/role-permission-defaults.json` — written by Agent A, generated from `ROLE_DEFAULT_PERMISSIONS` (script or hand-written + parity test). Agent B copies it into the 015 seed. `tests/unit/permissions-parity.test.ts` compares the TS constant to the fixture; a second SQL-side probe test (integration) asserts `has_gym_permission` agrees with the matrix for each role.

---

## 9. Test plan (test-first per CLAUDE.md; each item lists its owner)

Reference patterns: `tests/integration/gym-visibility.test.ts`, `tests/e2e/admin-gym-preview.spec.ts`. Shared mocks in `tests/setup/vitest.setup.tsx`. Everything runs inside the existing `test:ci` gate.

### Unit (`tests/unit/`)

| Test | Owner |
|---|---|
| `permissions.test.ts` — every §3 cell × 4 roles; `resolvePermissions` grant+revoke overrides; owner gets unknown keys; edit⊇view; `ROUTE_PERMISSIONS` covers every admin nav href | A |
| `permissions-parity.test.ts` — TS matrix === fixture | A |
| `features.test.ts` — catalog defaults (all on, chat off); `isFeatureEnabled` missing row/key/explicit false; coming_soon never enabled | A |
| `access.test.ts` — combined-gate truth table incl. the two §2 named cases (staff+kiosk-off; member+leaderboards-off) | A |
| `brand-color.test.ts` (extend) — `contrastRatio` known pairs (black/white=21, #767676/white≈4.54), `generatePalette` ramp shape/order, focal clamp/normalize 0–100 + 1% nudge | A |

### Integration (`tests/integration/`)

| Test | Owner |
|---|---|
| `payments-access.characterization.test.ts` — **pin current payment read/insert behavior per role BEFORE migration 015** (money-path rule) | B |
| `admin-nav-permissions.test.ts` — nav filtering per role and per override (admin: no Gym Page/People & access/finance; staff: Members + Kiosk only; override grants reveal items) | A |
| `member-shell-features.test.ts` — `leaderboards`/`member_feed` off ⇒ nav + quick links absent | A |
| `public-nav-features.test.ts` — `GymTopNav` drops Pricing/Locate when off | A |
| `studio-features-panel.test.ts` — FeaturesGroup renders §4 copy, hides for non-owner, four teaser rows disabled with "Coming soon" chips, toggle → dirty → save payload contains flags; partial-save failure keeps dirty + names the failed half | A |
| `access-page.test.ts` — People & access: owner row first with "Owner — full access" badge and no switches; admin rows expand to exactly the 8 §7.9 switches with correct defaults; flipping writes `saveOverride` for every mapped key; flipping back to default deletes override rows (`granted: null`); staff rows not expandable | A |
| `studio-publish-gating.test.ts` — Publish button absent without `gym_page:publish`, caption shown instead | A |
| `engagement-hooks-features.test.ts` — `handleScan` with `member_feed` off checks in successfully, posts no feed items; check-in also survives an RLS-rejected feed insert (flag-flip race) | B |
| `kiosk-disabled-state.test.ts` — kiosk page renders the "Check-ins are turned off" state when `kiosk_checkin` is off | B |
| `dashboard-finance-gating.test.ts` — dashboard/report clients tolerate missing finance keys | B |
| `feature-settings-authz.test.ts` — owner writes flags OK; admin/staff/member writes rejected (RLS contract) | B |
| `get-my-access.test.ts` — RPC shape matches `MyAccess`; fallback path in `fetchMyAccess` | B |

### E2E (Playwright, `tests/e2e/`)

| Test | Owner |
|---|---|
| Extend `admin-gym-preview.spec.ts` — studio two-pane loads; typing tagline updates preview live; tabs switch; Save vs Publish distinct; publish gated on tagline; mobile viewport drawer flow; public page pixel-parity after the `GymLandingPreview` extraction | A |
| `feature-toggles.spec.ts` — owner turns "Show leaderboard to members" off → member loses nav + direct route bounces; re-enable → restored; pricing off → public 404 + nav link gone | B |
| `permissions.spec.ts` — admin: no Gym Page nav, `/admin/gym-profile` redirected, dashboard **shows** finance by default; owner revokes the money switch → admin's dashboard payload loses the §5 finance fields; owner grants the Studio switch → admin edits but sees no Publish button; staff: kiosk works, `/admin/reports` blocked | B |
| RPC probes — member session calling `admin_dashboard_stats`, `create_member_notification`, `kiosk_update_streak` gets errors (regressions for 014/015) | B |

E2E account strategy: extend the seeding pattern used by `admin-gym-preview.spec.ts` to four fixture accounts (owner/admin/staff/member) in one fixture gym. If inspection shows the current e2e has no seeding infra, scope the E2E to owner+member and cover admin/staff at the integration layer — Agent B decides on inspection and notes the choice in the PR.

---

## 10. Handoff prompts

Hand each block below verbatim to its agent (paste-ready packaged versions live in `AgentsContextKnowledgeBase/prompts/`; on divergence, this section wins). Both work on branch `CustomizationPermissionsToggles` (Slice 0 goes straight to `qa` in its own PR). Merge order: Slice 0 → (A and B in parallel) → joint green `npm run test:ci` → PR to `qa`.

**Shared-file rule (the only overlap): `app/admin/gym-profile/page.tsx`.** Agent A re-skins it first, keeping it a client page. Agent B's conversion of that file to a server wrapper is sequenced **strictly after Agent A's Studio merge**. A is UI only; B is backend/logic only — neither crosses the boundary anywhere else.

**Production rollout (per slice): migrations first, app deploy immediately after, one release window.** No dual-write/compat shims; the only visible gap is minutes long. Slice 0 deploys independently and immediately.

---

### 10.A — Prompt for Claude Opus 4.8 (UI)

> You are implementing the **UI half** of the "Gym Page Studio + Permissions & Feature Toggles" plan for Stren. Read, in order: `CLAUDE.md`, `AgentsContextKnowledgeBase/ImplementationPlan.md` (the contract — §7 and §8 are your spec), and the design bundle `stren-gym-page-studio/project/Stren Gym Page Studio.dc.html` in full. All design decisions are already made in guide §7 — including the Features panel and People & access page, which are NOT in the design bundle. Follow the spec; do not redesign, do not add features.
>
> **You own (create/edit):** `lib/permissions.ts`, `lib/features.ts`, `lib/access.ts`, `lib/access-data.ts`, `lib/access-context.tsx` (exactly per guide §8 — these are frozen contracts the logic agent builds against); `tests/fixtures/role-permission-defaults.json`; `components/gym/GymLandingPreview.tsx` (extraction per §7.1 — public pages must render pixel-identically, prove it with the existing e2e); `components/admin/gym-studio/*` (§7.2–§7.8); `components/admin/AccessClient.tsx` + the client part of `app/admin/access/page.tsx` (§7.9); the client-side JSX of `app/admin/gym-profile/page.tsx` (keep every state/upload/compress/hash/cleanup/save/revalidate handler **verbatim** — you are re-skinning around them; the server-page conversion is the logic agent's); nav filtering in `app/admin/layout.tsx`, `components/member/MemberShell.tsx`, `components/member/MemberHomeClient.tsx`, `components/gym/GymTopNav.tsx` (consume the §8.5 props/hook; provide safe defaults so nothing breaks before the backend lands); `contrastRatio` + `generatePalette` in `lib/brand-color.ts`; public gym pages only as far as swapping their bodies to `GymLandingPreview`.
>
> **You must NOT touch:** anything in `supabase/migrations/`, `middleware.ts`, anything in `app/api/`, `lib/permissions-server.ts`, `lib/engagement-hooks.ts`, `lib/gym-public.ts`, `lib/database.types.ts`, server-side gates in page files. If a task seems to need them, it belongs to the logic agent — leave a `TODO(logic)` comment and move on.
>
> **Order of work (test-first — write each slice's tests failing before implementing):**
> 1. Contract modules + fixture + unit tests (guide §8, §9 unit rows marked A).
> 2. `GymLandingPreview` extraction + focal/section-visibility props + pixel-parity e2e proof.
> 3. Studio shell: header, rail groups, preview pane, checklist banner, brand group (desktop 1a).
> 4. Mobile drawer + focal editor + states/a11y (1b).
> 5. FeaturesGroup (incl. the four Coming-soon teaser rows) + People & access UI (owner row + the 8 Access switches, §7.9 exactly) + nav filtering (§7.8, §7.9) with the §9 integration tests marked A.
>
> Rules: production colors/fonts use the app's CSS tokens per §7.0 (mockup palette is placeholder); owners never see technical keys; Publish renders only with `gym_page:publish` (§7.3.1); no website-builder features (no drag-reorder, no font/spacing controls); `role="switch"`/`aria-expanded`/keyboard focal per §7.10; dirty-state navigation guard per §7.10. `app/admin/gym-profile/page.tsx` stays a **client** page in your hands — the server conversion happens after your merge. Where backend pieces don't exist yet (`get_my_access`, `gym_feature_settings`, `cover_focal`), code against the §8 contracts — `fetchMyAccess` falls back to role defaults, and your tests mock the supabase client (see `tests/setup/vitest.setup.tsx`). Run `npm run lint && npm run typecheck && npm run test:unit` green before handing off; note remaining `TODO(logic)` items in your final summary.

---

### 10.B — Prompt for GPT 5.5 / Codex (logic & enforcement)

> You are implementing the **logic half** of the "Gym Page Studio + Permissions & Feature Toggles" plan for Stren. Read, in order: `CLAUDE.md`, `AgentsContextKnowledgeBase/ImplementationPlan.md` (the contract — §0, §2–§6, §8, §9 are your spec), and `PHASE_3_TO_7_DIAGNOSTIC_AND_PLAN.md`. The UI agent builds against the frozen contracts in guide §8 — you implement the SQL/server surface to match them exactly; never change the contract shapes.
>
> **You own (create/edit):** `supabase/migrations/014_fix_notification_rpc_scope.sql`, `015_permission_model.sql`, `016_feature_toggles.sql`, `017_gym_cover_focal_and_sections.sql` (guide §5, in that order; regenerate `lib/database.types.ts` after each); `lib/permissions-server.ts` (§8.5); `middleware.ts` permission map (§6); all `app/api/admin/*` + `app/api/member/avatar` hardening (§6); server conversion of `app/admin/gym-profile/page.tsx` into guard+fetch+`<GymPageStudio/>` wrapper; server gates in `app/admin/page.tsx`, `app/admin/reports/page.tsx`, `app/admin/access/page.tsx`, `app/member/layout.tsx`, `app/member/feed/page.tsx`, `app/member/leaderboard/page.tsx`, the public subpage `notFound()` gates, `app/gym/[code]/layout.tsx` feature prop wiring; `app/member/page.tsx` (remove the manager-only `kiosk_get_checked_in` call; use the new `people_in_gym` field from `member_home_stats`); `lib/engagement-hooks.ts` feature check; finance-key-optional typing in `AdminDashboardClient.tsx`/`AdminReportsClient.tsx` (types + minimal render fallback only — no visual redesign).
>
> **You must NOT touch:** `components/admin/gym-studio/*`, `components/gym/GymLandingPreview.tsx`, `components/admin/AccessClient.tsx`, the visual JSX of any nav/shell component, `lib/permissions.ts` / `lib/features.ts` / `lib/access.ts` / `lib/access-data.ts` / `lib/access-context.tsx` (consume only), `lib/brand-color.ts`, the media-pipeline handlers in the gym-profile client code.
>
> **Order of work (test-first; money-path characterization BEFORE 015):**
> 1. **Slice 0 immediately, own PR to `qa`**: migration 014 + revalidate-gym gym-scope + avatar URL validation + RPC probe regression tests. Update the Phase 2.6 row in `CLAUDE.md` to ✅ on merge.
> 2. Migration 017 (focal + section visibility) — early, so the Studio has real columns.
> 3. `payments-access.characterization.test.ts` green → migration 015 (tables, seed from `tests/fixtures/role-permission-defaults.json`, `has_gym_permission`, `get_my_access`, policy swaps incl. replacing `dev_all_payments`, publish trigger, dashboard/reports RPC gating).
> 4. Migration 016 (feature settings, `gym_feature_enabled`, `get_gym_by_code` rework — **the `is_published` bugfix needs explicit user sign-off before shipping**, leaderboard/kiosk feature checks, feed/announcements/promos policies, final `get_my_access`).
> 5. Server enforcement wiring (§6 middleware/server/API tables, incl. the kiosk "turned off" screen and the announcements page smoke-test — **fix that page if it's broken**, user-confirmed in scope) + prop plumbing (§8.5) + engagement hooks + the §9 integration/E2E tests marked B.
> 6. Last: convert `app/admin/gym-profile/page.tsx` to the server wrapper — **only after Agent A's Studio has merged** (shared-file rule above).
>
> Rules: migrations are idempotent, no destructive SQL, never the dashboard; new SQL helpers follow the `get_gym_id()` conventions (`SECURITY DEFINER`, `SET search_path = ''`, explicit GRANT/REVOKE); `has_gym_permission` RAISEs on unknown keys for non-owners (§5); the finance field lists in §5 are exhaustive — do not re-derive what counts as finance; UI hiding is never the only enforcement — every gate exists at RLS/RPC level first, then API (403), then middleware (redirect); `maybeSingle()` for maybe-empty reads; correct status codes on API routes. Production rollout per slice: migrations first, deploy immediately after. Bump `package.json` + `CHANGELOG.md` per shipped slice group. Run `npm run test:ci` green before handing off.

---

### Definition of done (whole workstream)

- §6 checklist fully checked; §9 tests green in `test:ci`.
- An admin cannot reach the Studio, feature toggles, publish, or role management by URL, RPC, or REST; an admin **does** see finance numbers by default; after the owner flips a switch off, the corresponding data/action disappears at every layer (nav, route, RPC payload) — and reappears when flipped back on.
- People & access shows the owner row ("Owner — full access", no switches), the 8 switches per admin exactly, and nothing for staff.
- A member at a gym with leaderboards + feed disabled sees neither nav nor data; direct routes bounce; RPCs return empty/deny.
- The public page of a gym with pricing/location disabled 404s those subpages and the cached payload omits the data.
- A kiosk left open when `kiosk_checkin` is turned off shows the friendly "turned off" screen, not errors.
- The owner: completes the checklist to 5/5, adjusts the focal point, toggles a section and a feature and sees the preview react instantly, sees the four Coming-soon teasers, publishes from the Studio — on both desktop and mobile layouts; leaving with unsaved changes prompts a warning.
- `CLAUDE.md` phase table and `CHANGELOG.md` updated.

_End of guide._
