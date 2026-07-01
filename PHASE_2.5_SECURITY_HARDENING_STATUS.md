# Phase 2.5 — Security & Shippability Hardening: Status & Continuation Notes

_Last updated: 2026-07-01_

This is Phase 2.5 of the remediation plan (see the phase table in `CLAUDE.md`):
RLS/kiosk lockdown (migration `011`), login/gym-search/reset bugfixes
(migration `012`), and the password-reset stabilization documented below
(migration `013` + app/dashboard changes). All of it targets one goal — making
the app shippable — and all of it is now ✅ shipped.

## Current state: ✅ RESOLVED

Password reset (forgot-password → email link → set new password) is confirmed
working end-to-end on `qa--stren.netlify.app` as of commit `ba11055` /
`db05ac5`. `main`, `qa`, and `feat/auth-security-hardening` are all in sync at
this point — no outstanding branch drift. This closes out the last open item
of Phase 2.5.

## What was broken and what fixed it

The reset flow went through several failed iterations before landing on the
current design. Root causes, in the order they were found:

1. **Supabase strips `redirect_to` query params on this project.** Any
   approach relying on `?next=`/`?gym=` surviving the `redirect_to`
   allow-list round-trip (the default `resetPasswordForEmail` → auto-redirect
   with `?code=` behavior) silently lost those params. This broke every
   `?next=/reset-password` variant we tried.

2. **Fix — switch to the `token_hash` template flow.** The Supabase recovery
   email template was changed (dashboard, not code) to build the link
   directly:
   ```
   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
   ```
   This is a literal string substitution done by Supabase's template engine —
   it does not go through the `redirect_to` allow-list redirect logic, so the
   params are never stripped. `app/auth/callback/route.ts` already had a
   `tokenHash && tokenType` branch (`verifyOtp`) and a `next === "/reset-password"`
   forwarding branch — no code change was needed there.

3. **`{{ .SiteURL }}` vs `{{ .RedirectTo }}` — cross-environment links.**
   Initially the template used `{{ .SiteURL }}`, which is a fixed dashboard
   setting (`https://stren.netlify.app`, i.e. prod). Testing from
   `qa--stren.netlify.app` still emailed prod links. Fixed by switching the
   template to `{{ .RedirectTo }}`, which resolves to whatever `redirectTo`
   the client passed to `resetPasswordForEmail()` (already `window.location.origin`-based
   in `components/auth/LoginForm.tsx`), *provided* it matches the Redirect
   URLs allow-list (`https://*.netlify.app/auth/callback` wildcard is in
   place for this).

4. **Double-`?` bug (`missing_code`).** Once the template appended its own
   `?token_hash=...&type=recovery&next=/reset-password`, the old
   `LoginForm.tsx` was *also* appending `?next=...&gym=...` onto `redirectTo`
   — producing two `?` characters in the final URL. Only the first query
   string parses in a browser, so `/auth/callback` received neither
   `token_hash` nor `type` and errored `missing_code`. Fixed in
   `components/auth/LoginForm.tsx`: `redirectTo` is now the bare
   `${window.location.origin}/auth/callback` (no query string at all).

5. **Gym-membership gate stopped matching real members
   (`This email is not registered as a member of this gym.`).**
   `check_gym_membership` (migration `012`) compared
   `u.email = lower(trim(p_email))` — lowercasing only the *input*, not the
   stored `auth.users.email`. Accounts with any uppercase characters in their
   stored email never matched. Fixed in migration
   `013_fix_gym_membership_email_case.sql` (lowercases both sides); applied
   directly to the production DB via Supabase MCP `apply_migration` and
   committed to the repo for history.

6. **Safety net (defense-in-depth, not the primary fix).**
   `app/page.tsx` and `app/landing/page.tsx` now detect a stray `?code=` or
   `?token_hash=` (e.g. if Supabase ever falls back to Site URL and drops the
   params some other way) and forward to `/auth/callback` instead of
   swallowing the auth params into `/landing`.

## Manual/dashboard changes made (not in git, documented here for the record)

- **Authentication → Email Templates → Reset Password**, link set to:
  ```
  {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
  ```
- **Authentication → URL Configuration → Redirect URLs** includes:
  - `https://stren.netlify.app/auth/callback`
  - `https://stren.netlify.app/reset-password`
  - `https://*.netlify.app/auth/callback`
  - `https://*.netlify.app/reset-password`
- Site URL remains `https://stren.netlify.app` (only used as a fallback now
  that the template uses `{{ .RedirectTo }}`).

## Known limitation (documented tradeoff, not a bug)

The reset link no longer carries a `?gym=` param (dropped to avoid the
double-`?` bug). Gym-membership enforcement now happens **only at send-time**
via `check_gym_membership` in `LoginForm.handleForgotPassword` — a non-member
never receives an email in the first place. The defense-in-depth re-check
inside `app/reset-password/page.tsx` (`if (gymCode && signInResult.profile)`)
is now effectively a no-op since `gymCode` is never present on this path. This
is acceptable and intentional; flagged here so it isn't "rediscovered" as a
regression later.

## DB migrations applied to production (Supabase project `wmcjkhstykgyhtpmlvuw`)

Confirmed via `list_migrations`: `001`, `005`–`010`, `011` (security
hardening), `012` (login/gym-check fixes), `20260701155422`
(`fix_gym_membership_email_case`, = local file `013`). All in sync with what's
committed on `main`/`qa`.

## Branch state

`main`, `qa`, and `feat/auth-security-hardening` are all at the same commit
(`main`/`qa` merge commits sit on top of `feat/auth-security-hardening`'s tip
`db05ac5`). No open PR is pending for this work — PRs #41–#44 are merged.
`feat/auth-security-hardening` can be treated as done/mergeable-clean; safe to
delete once confirmed no longer needed, or keep as the working branch for the
next phase.

---

# Remaining Work (from the broader remediation plan)

Full detailed plan lives at `/root/.claude/plans/stateless-humming-parnas.md`
(local to the planning session — not in the repo). Summary of what's left:

| Phase | Status |
|-------|--------|
| Phase 0 — Repo as source of truth | ✅ Shipped |
| Phase 1 — Performance / server components | ✅ Shipped |
| Phase 2 — Auth & routing (single guard) | ✅ Shipped |
| Phase 2.5 — Security & shippability hardening (RLS/kiosk lockdown [011], login/gym-search/reset bugfixes [012], password-reset stabilization [013] — this doc) | ✅ Shipped |
| **Phase 3 — Dead weight removal** | Queued |
| **Phase 4 — Design system** | Queued |
| **Phase 5 — Money path tests (test-first pilot)** | Queued |
| **Phase 6 — Documentation completion** | Queued |
| **Phase 7 — TDD as standing methodology** | Queued |

### Phase 3 — Dead weight removal (next up)
Remove unused routes/components and duplication. Note: `app/dashboard/*` and
`app/qr-login/page.tsx` were already deleted as part of the login-fixes
migration (`012`-adjacent commit `17aa348`). Remaining candidates: stale docs,
any leftover duplicate signup flows, unused components flagged in prior
audits. Test-after is acceptable for this phase (pure refactor/removal).

### Phase 4 — Design system
Consolidate `lib/admin-ui.tsx` + CSS variables into a coherent token system.

### Phase 5 — Money path tests (test-first pilot)
Write integration tests characterizing current correct behavior of payment
recording, renewal date math, and membership-expiry transitions **before**
any refactor. This is the pilot for Phase 7's TDD policy.

### Phase 6 — Documentation completion
`CLAUDE.md` already exists with the TDD policy (Phase 7 content) — confirm
it's current, and fill in composite-index documentation deferred from Phase 1
(`idx_memberships_gym_created`, `idx_attendance_gym_checkin`,
`idx_profiles_gym_role_status`).

### Phase 7 — TDD as standing methodology
Already documented as policy in `CLAUDE.md` (test-first for new features).
Enforcement mechanism (CI gate for "tests touched when feature code touched")
is still an open proposal, not yet decided/implemented.

### Standing constraints (unchanged, still apply)
- Treat Supabase data as production — never run destructive SQL without
  explicit user confirmation.
- All DB changes as migration files in `supabase/migrations/`, applied via
  Supabase CLI/MCP — never via the dashboard directly.
- PRs target `qa`; `qa` → `main` only after manual sign-off (this hotfix was
  the exception — merged straight through per explicit user request since
  prod was broken).
- Version bump + CHANGELOG entry per phase (not yet done for this hotfix —
  consider bumping before starting Phase 3).
