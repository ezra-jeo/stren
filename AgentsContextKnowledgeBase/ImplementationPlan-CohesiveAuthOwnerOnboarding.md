# Cohesive Auth & Assisted Gym Onboarding — Implementation Plan

_✅ Completed 2026-07-13. Status lives in `ImplementationState.md`; the provisioning decision is recorded in `docs/adr/0005-platform-managed-gym-provisioning.md`._

## Outcome

Stren has one public authentication route: `/auth?mode=signin|signup`. Both forms are two states of one stationary, responsive surface; the branded panel moves between them and URL history remains authoritative. Account creation and joining a gym remain separate.

Public gym creation is removed. People who run gyms use `/for-gym-owners`, which sends an assisted-onboarding inquiry through the existing Resend delivery path. Gym organizations can be provisioned only by an authenticated account whose server-controlled `app_metadata.platform_role` is `platform_admin`.

## Contracts

- Landing actions: Sign In → `/auth?mode=signin`; Create Account → `/auth?mode=signup`; For Gym Owners → `/for-gym-owners`.
- Legacy `/login`, `/signup`, per-gym auth URLs, `/gyms/new`, `/register-gym`, `/gym-registration`, and `/for-gyms` use permanent redirects.
- Post-auth routing: no active gym → `/gyms` (Join a gym); one active gym → its role surface; multiple active gyms → `/gyms`; pending-only accounts remain on the hub.
- Joining requires authentication. QR camera access is user-initiated, always has code entry as fallback, and creates the existing pending join request unless existing business logic returns active.
- `create_gym` is defense-in-depth protected in migration 020; removing the page/action is not the authorization boundary.
- Owner inquiries are validated, honeypot-protected, rate-limited, HTML-escaped, and delivered with `reply_to` set to the submitter.

## Verification

- Focused auth, post-auth, landing CTA, middleware redirect, join QR/code, owner inquiry, and platform-provisioning tests.
- Full lint, typecheck, unit/integration, production build, and public E2E gates.
- Desktop and 390 px visual checks; covered panes are `aria-hidden` and `inert`; reduced motion is supported.

## Deliberate limits

- No social login, phone OTP, public pricing/paywall, or parallel authentication stack.
- Migration 020 must be applied through the normal migration pipeline; no dashboard edits.
- Real email delivery needs `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `OWNER_INQUIRY_TO_EMAIL`.
