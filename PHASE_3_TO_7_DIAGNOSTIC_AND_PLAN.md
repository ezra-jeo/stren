# Phase 3–7 Diagnostic Review & Updated Plan

_Last updated: 2026-07-01 — run after Phase 2.5 (security/shippability hardening) shipped._

This is a fresh codebase diagnostic to confirm whether Phases 3–7 of the
remediation plan (see `CLAUDE.md`) are still accurate, and to catch anything
new since the last security pass (migrations 011/012/013). Five parallel
audits were run: dead weight (Phase 3), design system (Phase 4), money-path
test coverage (Phase 5), a fresh general security review, and a full sweep
of every `SECURITY DEFINER` function in the migrations directory.

## Headline result: TWO live Critical vulnerabilities found in migration `006`, unrelated to Phases 3–7

Both predate Phase 2.5 (they're in migration `006_notification_system.sql`)
and were outside that phase's audit scope (which focused on the baseline
`001` policies/RPCs and kiosk). Both should be fixed **before** Phase 3, in
one standalone migration — same pattern as `013`.

### Critical 1 — `process_daily_notifications()` is directly callable by any authenticated user

`supabase/migrations/006_notification_system.sql:660` (function),
`:688` (grant). `SECURITY DEFINER`, `GRANT EXECUTE ... TO authenticated`,
**no `auth.uid()` check, no role check, no gym scoping** — it's meant to be a
cron-only job (there's a real cron entry point at
`app/api/cron-notifications/route.ts`, gated by a bearer-token secret), but
because it's *also* granted directly to `authenticated`, any logged-in member
can call `supabase.rpc('process_daily_notifications')` themselves and force
it to scan and send expiry/inactivity notifications **across every gym**,
not just their own. This is a cross-tenant data-processing trigger + spam/DoS
vector.

### Critical 2 — `create_member_notification(uuid, uuid, notification_type, text, text)` has zero caller checks

`supabase/migrations/006_notification_system.sql:380-414` (function),
`:687` (grant). `SECURITY DEFINER`, `GRANT EXECUTE ... TO authenticated`,
takes `p_member_id`, `p_gym_id`, `p_title`, `p_body` as raw parameters with
**zero caller-identity checks** — no `auth.uid()`, no `is_manager()`, no
gym-scope validation against the caller. Any logged-in member can call this
RPC directly to insert notifications into **any other gym or member's**
notification feed, completely bypassing the `notifications_insert` RLS policy
(added in migration 011, which requires `is_manager()`) since this function
runs as `SECURITY DEFINER` and doesn't check the caller at all.

### High — `kiosk_update_streak(uuid, uuid)` callable directly, no caller checks

`supabase/migrations/001_production_baseline.sql:868`. Intended to be called
internally by the hardened `kiosk_checkin*` RPCs (which do check
`auth.uid()`/`is_manager()`/gym-scope), but this function itself has no
`REVOKE`/no explicit auth check and takes caller-supplied `p_member_id`/
`p_gym_id`. Any authenticated user can call it directly to mutate another
member's streak counters in any gym, bypassing the manager-only intent
enforced only in the wrapper RPCs.

### Medium — `can_send_member_notification(uuid, notification_type)` info disclosure

`supabase/migrations/006_notification_system.sql:204-210`, granted to
`authenticated`. No `auth.uid()`/gym-scope check; any authenticated user can
probe another member's notification cadence/cooldown state. Read-only
(returns boolean), so this is information disclosure only, not a mutation —
lower severity than the two Criticals and the `kiosk_update_streak` High, but
worth fixing in the same pass since it's the same root cause (missing
caller-identity checks on notification-system RPCs from migration `006`).

**Call-site verification done**: grepped `app/`, `components/`, `lib/` for all
four function names. `process_daily_notifications` is called exactly once,
from `app/api/cron-notifications/route.ts:55`, using a `createSupabaseClient`
built with `SUPABASE_SERVICE_ROLE_KEY` (not the `authenticated` grant) — so
revoking `EXECUTE FROM authenticated` on it is **safe**, the real cron flow
doesn't depend on that grant at all. No client-side `.rpc()` call sites exist
for `create_member_notification`, `kiosk_update_streak`, or
`can_send_member_notification` anywhere in the app — the only references are
generated type defs in `lib/database.types.ts`. This means tightening all
four is safe with no known legitimate caller to break.

**Recommended fix** (new migration, e.g. `014_fix_notification_rpc_scope.sql`):
1. `process_daily_notifications` — `REVOKE EXECUTE ... FROM authenticated`
   (keep it definer-only, invoked solely via the service-role cron route).
2. `create_member_notification`, `kiosk_update_streak`,
   `can_send_member_notification` — add `auth.uid()` + `is_manager()` +
   gym-scope checks matching the pattern already used in the hardened kiosk
   RPCs (migration 011), since no legitimate direct caller exists for any of
   them today (all are meant to be called internally by triggers/other
   `SECURITY DEFINER` functions, which run with definer privileges regardless
   of the caller's own grants).

## Phase 2.5 re-verification: confirmed complete for its stated scope

- Migration 011: gym-wide `SELECT` tightened to own-gym only; `profiles`
  `UPDATE` now has `WITH CHECK` + a hard-block trigger against
  self-promotion; `handle_new_user` hardcodes `role='member'`; kiosk RPCs all
  check `auth.uid()` + `is_manager()` + gym-scope; `dev_all_*` `USING(true)`
  policies removed.
- Migrations 012/013: `check_gym_membership` correctly lowercases both sides
  now; returns boolean only, no PII leak.
- `middleware.ts`: `/kiosk` is now guarded (requires admin/staff/owner role).
- `app/api/*` routes all correctly call `getUser()`/role checks before
  mutating, have rate limiting, zod validation, and (for the avatar route)
  magic-byte + size + MIME validation.
- No committed secrets found in git history; `SUPABASE_SERVICE_ROLE_KEY`
  usage confined to `lib/supabase-admin.ts` and the secret-gated
  `cron-notifications` route.

### Two additional High findings from the app/api/ sweep (new, not in the notification RPC bucket)

1. **`app/api/admin/revalidate-gym/route.ts`** — authenticates and checks
   `ADMIN_ROLES`, but never verifies the resolved gym (looked up from
   client-supplied `body.code`) matches the requesting admin's own
   `profile.gym_id`. Any admin/staff of *any* gym can trigger a cache
   revalidation for *any other gym*. Low-severity in practice (cache
   invalidation, not data access) but should be a one-line gym-ownership
   check.
2. **`app/api/member/avatar/route.ts`** — when the request omits
   `avatarDataUrl` and instead supplies `body.avatarUrl` directly, that
   client-supplied URL string is persisted as-is with no validation that it
   points to an actual uploaded/owned asset. Low/Medium — could be used to
   set an arbitrary external image URL as a profile avatar (not classic
   stored-XSS since it's rendered as an `<img src>`, but worth a same-origin
   or Supabase-storage-domain check).

Both are Medium-priority, not urgent — bundle with the notification RPC fix
or take up early in Phase 3.

---

## Phase 3 — Dead weight removal: **still valid**, smaller scope than originally scoped

`app/dashboard/*` and `app/qr-login/page.tsx` were already removed in an
earlier commit (`17aa348`), so that part of the original Phase 3 description
is done. Remaining, confirmed by the audit:

1. **`app/signup/member/page.tsx` is orphaned** — not linked anywhere; member
   signup actually flows through `/gym-select` → `/gym/[code]/signup`.
   Confirmed dead code, safe to delete.
2. **`autoprefixer` unused dependency** — not referenced by
   `postcss.config.mjs` (which only uses `@tailwindcss/postcss`) or any
   source file. Remove from `package.json` devDependencies.
3. **Committed files that shouldn't be in git**:
   - `b_mE6MUnn2LLm-1772008463183.zip` (1.4 MB binary dump)
   - `admin_benchmark.txt` (17 KB terminal output dump)
   - Confirm `repomix-output.xml` / `*.patch` are actually gone from current
     HEAD (they were flagged for removal in an earlier security pass —
     verify, don't assume).
4. **Zero TODO/FIXME/HACK comments** — codebase is clean on that front, no
   action needed.
5. **Documentation sprawl at repo root** — significant overlap/staleness:
   `MIGRATION_SYNC_GUIDE.md` is out of date (references migrations `005-009`
   as pending; `011`–`013` have since shipped). `TESTING_PLAN.md`,
   `TEST_WITHOUT_CRON.md`, `context-history.md`, `OTP-AUTH-GUIDE.md`,
   `DB_STAFF_ONBOARDING_SQL_EDITOR_STEPS.md`, `STREN_GUIDE.md`,
   `CACHE-VERIFICATION.md` all have narrow/historical scope that should
   either fold into `CLAUDE.md` or move to an `archive/` or `docs/` folder
   rather than cluttering the repo root. This overlaps with Phase 6
   (documentation) — recommend doing the consolidation as one pass covering
   both phases rather than twice.

**Effort estimate: low.** Mostly file deletion + one dependency removal +
doc consolidation. Test-after is fine (pure removal, no behavior change).

---

## Phase 4 — Design system: **still valid**, and now quantified

- `lib/admin-ui.tsx` (189 lines) is a small component/token library
  (`StatusPill`, `Avatar`, `PageHeader`, `ACard`, `SearchInput`, `Modal`,
  `ChoicePicker`, etc.) — every component uses 2–5 inline
  `style={{ ...hsl(var(--...)) }}` declarations because **no Tailwind
  utility classes exist for the admin-specific tokens**
  (`--admin-surface`, `--admin-border`, `--admin-text`, etc.).
- **644 inline `var(--...)` usages** across `components/` (21 files) and
  `app/` (24 files); **1033 total inline `style={}` declarations** vs. 2002
  `className=` usages — inline styles are roughly half as common as
  Tailwind classes, which is the core inconsistency Phase 4 should resolve.
- Tokens themselves ARE centralized correctly: `app/globals.css` (242 lines,
  28 HSL color tokens + 14 legacy aliases + typography/spacing/radius vars)
  and `tailwind.config.ts` (maps 16 CSS vars to Tailwind color utilities).
  The problem is **implementation fragmentation**, not missing
  single-source-of-truth tokens.
- Concrete duplication: shadow value `rgba(212, 149, 106, 0.35)` and its
  variants appear repeated verbatim across landing/hero components (36+
  inline gradients, 20+ custom shadow definitions) instead of a shared
  component or Tailwind utility.

**Scope refinement for Phase 4**: the highest-leverage fix is extending
`tailwind.config.ts` to expose the admin tokens (`--admin-surface` etc.) as
Tailwind utilities, then migrating `lib/admin-ui.tsx` and its heaviest
consumers off inline styles. Landing-page gradient/shadow duplication is a
secondary, lower-priority cleanup within the same phase.

---

## Phase 5 — Money-path tests: **still valid and higher-priority than previously scoped**

Confirmed the money paths and confirmed **zero existing test coverage**:

- `app/admin/payments/page.tsx:178-220` — payment recording + membership
  creation, JS-side date math (`new Date()` → `setDate` → `toISOString()`),
  promo-discount rounding (`Math.round((base - base*(pct/100))*100)/100`),
  then a **separate, unguarded** UPDATE to expire old memberships
  (`.neq("start_date", startDateStr)`).
- `app/admin/members/page.tsx:~296-330` — renewal logic, same date-math
  pattern, same two-separate-queries-no-transaction shape.
- `app/api/admin/members/onboard/route.ts:183-272` — onboarding creates the
  initial membership; same expire-then-insert shape, no transaction.
- **Architecturally, none of this is a `SECURITY DEFINER` RPC** — it's 100%
  app-layer JS, meaning no DB-level atomicity guarantee at all. All 25
  `SECURITY DEFINER` functions in the migrations are auth/kiosk/reporting/
  notifications — none touch payment state.

**New concrete risks surfaced** (beyond the original "write characterization
tests" framing):
1. **No transaction boundary** between "insert new membership" and "expire
   old memberships" — a failure between the two steps leaves a member with
   two simultaneously-active memberships (double-billing / access risk) or
   zero active memberships (wrongly locked out).
2. **Timezone mismatch** — `new Date()` runs in the browser's local
   timezone; the DB `DATE` columns are naive/tz-less. A staff member in a
   different timezone than the gym's "true" local time could shift day
   boundaries by one day.
3. **Silent failure on the expiry UPDATE** — success/error toast is wired to
   the INSERT, not the follow-up UPDATE; a failed expire-old-memberships
   step fails silently.
4. **No `end_date >= start_date` constraint** at the DB level — a
   zero/negative `duration_days` would silently create an invalid
   membership.

**Recommendation**: Phase 5 should still be test-first (write integration
tests pinning current behavior before any refactor), but the refactor target
now has a clearer shape: wrap insert-new + expire-old in a single
`SECURITY DEFINER` RPC (transactional by nature in Postgres) once the
characterization tests are green — this turns a "just add tests" phase into
"add tests, then extract a transactional RPC," which is a more valuable
outcome and directly addresses risk #1 above.

---

## Phase 6 — Documentation: **still valid**, scope confirmed/expanded

- `CLAUDE.md` exists and has the TDD policy section already (Phase 7
  content is technically already documented).
- Composite-index documentation deferred from Phase 1
  (`idx_memberships_gym_created`, `idx_attendance_gym_checkin`,
  `idx_profiles_gym_role_status`) is still not documented in `CLAUDE.md`.
- New from this audit: `MIGRATION_SYNC_GUIDE.md` is stale (references
  migrations `005-009` as pending; `011-013` have since shipped) — needs an
  update or should be superseded by a section in `CLAUDE.md`.
- Doc consolidation (see Phase 3 above) — `TESTING_PLAN.md`,
  `TEST_WITHOUT_CRON.md`, `context-history.md`, `OTP-AUTH-GUIDE.md`,
  `DB_STAFF_ONBOARDING_SQL_EDITOR_STEPS.md`, `STREN_GUIDE.md`,
  `CACHE-VERIFICATION.md` should be folded into `CLAUDE.md` or moved to a
  `docs/` subfolder rather than left scattered at repo root. Do this as one
  pass alongside Phase 3's cleanup, not twice.

---

## Phase 7 — TDD as standing methodology: **policy already documented, enforcement still undecided**

`CLAUDE.md` already states the test-first policy for new features (this was
apparently written earlier than the phase table suggested). What's still
open, per the original plan: whether to add a CI enforcement mechanism
("tests touched when feature code touched" check or a coverage floor) —
this remains a proposal, not a decision. No new information from this audit
changes that; it's a policy decision for you, not a code-diagnostic finding.

---

## Recommended execution order

1. **Immediate (before Phase 3)**: fix the notification-system RPC family —
   `process_daily_notifications` (Critical), `create_member_notification`
   (Critical), `kiosk_update_streak` (High), `can_send_member_notification`
   (Medium) — one standalone migration `014_...sql`, same pattern as `013`.
   No known legitimate caller breaks (verified above). Bundle the two Medium
   `app/api/` findings (revalidate-gym gym-ownership check, avatar
   `avatarUrl` validation) into the same PR if convenient, otherwise take
   them up early in Phase 3.
2. **Phase 3** — dead weight removal + doc consolidation (do this together
   with Phase 6's doc work in one pass, not two).
3. **Phase 5** — money-path tests, now scoped to include the transactional
   RPC extraction as the refactor target once tests are green (this is
   higher-value than the original "just add tests" framing and touches
   real production risk).
4. **Phase 4** — design system (admin token Tailwind utilities +
   `lib/admin-ui.tsx` migration).
5. **Phase 6** — remainder (composite-index docs, `MIGRATION_SYNC_GUIDE.md`
   refresh) — mostly folded into step 2 already.
6. **Phase 7** — decide on CI enforcement mechanism (policy decision, no
   code change required unless you opt in).

## Standing constraints (unchanged)

- Treat Supabase data as production — never run destructive SQL without
  explicit confirmation.
- All DB changes as migration files in `supabase/migrations/`, applied via
  Supabase CLI/MCP — never via the dashboard.
- PRs target `qa`; `qa` → `main` after manual sign-off (the Phase 2.5 hotfix
  chain was the explicit exception, merged straight through since prod was
  broken).
- Version bump + `CHANGELOG.md` entry per phase — none has been done since
  `v1.1.0`; consider bumping before starting the next phase of work.
