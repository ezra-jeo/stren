# Member Onboarding & Auth Recovery

**Status:** ✅ Completed — 2026-07-13  
**Branch:** `auth/cohesive-auth-owner-onboarding`  
**Decision:** [`docs/adr/0006-membership-verification-not-join-requests.md`](../docs/adr/0006-membership-verification-not-join-requests.md)

## Contract

This iteration keeps the unified-account architecture and refines the first-run member experience. It must fix the post-sign-in loading race, use Supabase Auth’s official password-recovery flow, make `/gyms` useful before a gym is connected, and replace member-facing join-request language with membership verification. Public gym exploration and saving never grant private access.

## Product behavior

- A successful credential exchange is confirmed with `auth.getUser()` before membership-aware navigation begins. Credential exchange, account resolution, and client navigation each have a bounded recovery state; no spinner is allowed to run forever.
- `/reset-password` starts with an email request. The server calls `resetPasswordForEmail`, always returns enumeration-safe copy for an accepted request, and reports missing site/email configuration truthfully. Recovery codes are exchanged by Supabase, expire, and are single-use. A ten-minute server-signed, HTTP-only proof binds completion to the recovered account; an ordinary session cannot unlock the form, and successful password change consumes the proof and ends the local recovery session.
- An account with no active gym lands on a warm authenticated member home: gym search by supported name/location/code, explicit QR scan, saved gyms, multiple verification states, a non-mutating sample-data demo, profile completion, and honest beta tiles. There is no Personal Mode and no unsupported filter UI.
- Public gym pages expose only their existing public payload. An authenticated account may save a published gym or say “I’m already a member.” Saving never creates or changes a `gym_users` row.
- Membership verification activates immediately only when the auth email is confirmed and the same account already owns a billing membership row at that gym. Otherwise it creates or retains a pending member gym-user. Phone matching is excluded until Stren has a verified phone channel.
- A pending verification may be withdrawn. Reminders have a database-enforced seven-day cooldown. Authorized staff confirm another account through a `members:manage`-guarded SECURITY DEFINER RPC; an account cannot confirm itself. Existing in-app notifications announce the pending and connected states. No email/SMS/push delivery is claimed where none exists.
- Landing and public gym pages hydrate the real browser session before showing account-sensitive actions. Signed-in landing visitors see “Open Stren,” not Create Account, and signed-in gym explorers can save or verify. Direct auth-route visits continue through the existing membership-aware resolver.
- “Continue with Google” is an honest UI preview in both auth modes. It starts no OAuth request and reports that the provider is coming soon.

## Data and enforcement

Migration `021_membership_verification.sql` owns `saved_gyms`, reminder cooldown storage, save/list/verify/remind/withdraw/confirm RPCs, notification copy/types, grants, and RLS. SECURITY DEFINER functions use `SET search_path = ''` with explicit grants/revokes. Active `gym_users` remains the only gym-access grant; all existing private-data RLS and `get_my_access()` gates stay authoritative.

## Verification

Red-green coverage must include the sign-in resolver/router timeouts, official reset request/recovery/callback behavior, search and QR fallback, save-without-access, immediate match vs pending verification, multiple pending gyms, reminder cooldown, withdrawal, staff-only confirmation, public profile actions, demo/beta honesty, authenticated landing calls to action, and account-profile editing. Final gates are lint, typecheck, all unit/integration tests, production build, public E2E, and credentialed E2E where credentials exist.

## Explicitly deferred

Google OAuth configuration, phone OTP/verified-phone matching, Personal Mode, production SMS/push, and invented member tools remain out of scope.
