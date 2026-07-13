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
- QA must have migrations 019, 020, and 021 applied in order. The repository contains them, but this workspace has no linked Supabase access token and therefore cannot prove or repair the remote migration state.
