# Auth Session & Account Access Recovery

**Status:** ✅ Completed — 2026-07-13  
**Branch:** `auth/cohesive-auth-owner-onboarding`  
**Depends on:** [`ImplementationPlan-UnifiedAccounts.md`](ImplementationPlan-UnifiedAccounts.md) and migrations 019–021

## Contract

This corrective workstream fixes the case where a valid authenticated account was displayed as a new no-gym account, profile loading never completed, and mobile sign-in retried indefinitely. It does not change the unified-account data model.

## Required behavior

- A successful password sign-in resolves the destination through the same confirmed browser Supabase session. It must not immediately depend on a second server-action cookie read.
- `get_my_gyms`, profile, `get_my_access`, and `set_active_gym` errors fail closed. An error must never be converted into an empty affiliation list or a valid no-gym state.
- A successful gym lookup may still route an owner/member when optional profile metadata fails; profile recovery remains independently visible.
- `/gyms` and `/profile` show the authenticated email, bounded retry, and sign-out controls when account data is unavailable. Genuine no-gym home also identifies the signed-in account.
- Middleware and callback routing carry account-resolution failures to an explicit recovery state without a redirect loop.
- No placeholder account or fake affiliation is created.

## Verification

- Red-first regressions cover RPC-error-as-empty, browser-session owner routing, bounded setup recovery, gym-hub fail-closed UI, and profile recovery.
- Final gates: lint, typecheck, all unit/integration tests, production build with the standard CI placeholder environment, and public E2E where the local runner permits.
- The linked hosted project must have canonical migration history through 021 and `mailer_autoconfirm = false`. `npm run verify:deployment` checks the externally observable Auth and RPC contract before deploy.

## Hosted deployment recovery — 2026-07-13

- The hosted project was verified at 001–012 plus a timestamped copy of local migration 013. The timestamped SQL matched local 013 after comment/whitespace normalization, so history was reconciled to canonical 013 before any schema push.
- Migrations 014–021 were applied in order. Migration 019 required two unapplied-file corrections discovered by the real PostgreSQL run: alias the longest-member leaderboard expression as `value`, and replace three hosted `storage.objects` policies that depended on legacy `profiles.role`/`gym_id` before those columns are dropped.
- Hosted Auth email auto-confirm was disabled with a one-field Management API patch; existing site URL and redirect allow-list were preserved. The project still uses Supabase's limited built-in mailer and needs custom SMTP for production delivery volume.
- Live verification proves the owner account resolves to `/admin`, the member account resolves to `/member`, `/profile` loads, and neither sign-in requires a refresh.
- The production build accepts either legacy `NEXT_PUBLIC_SUPABASE_*` variables or Supabase's modern `SUPABASE_PROJECT_ID` + `SUPABASE_PUBLISHABLE_KEY`; only publishable values enter the browser bundle. The standard bounded-worker suite passes all 310 unit/integration tests with coverage.
