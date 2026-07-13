# ADR 0006: Model member self-identification as membership verification

- **Status:** Accepted
- **Date:** 2026-07-13

## Context

The unified-account release represented self-service gym connection as a “join request.” That language makes an existing paying member feel as if they are applying to a private group, and the blocking `/gyms` empty state offers little value while staff checks the record. A shared gym code also cannot safely prove private-data entitlement.

Stren already has two separate facts: a billing `memberships` record and an access-bearing `gym_users` row. Public gym data is available independently. Phone numbers are stored but not verified because phone OTP is deferred.

## Decision

Member-facing flows call this **membership verification**. “I’m already a member” attempts a deterministic match. An email-confirmed account that already owns a billing membership row for the same gym activates its member gym-user immediately; every other self-service attempt remains pending for staff confirmation. We do not match unverified phone data.

Saving a published gym is a separate bookmark relation and never grants access. Public profiles continue to expose only the established public payload. Pending accounts may verify with multiple gyms, withdraw, and send at most one reminder per gym every seven days. Only another active gym user with `members:manage` may confirm a pending account; the confirmation RPC checks the explicit gym and rejects self-confirmation.

The no-active-gym route is a useful authenticated member home rather than a blocking form. Unsupported tools are explicitly beta/coming soon, and the demo dashboard uses labeled sample data with no real mutations.

## Consequences

- Existing `gym_users.status = 'pending'` storage remains compatible, while UI copy stops exposing join-request/approval framing.
- Possession of a gym code or QR code cannot unlock private data.
- Automatic matching is intentionally conservative until verified phone or a richer member-record identity exists.
- In-app notifications are supported now. Email, SMS, and push are not promised by this decision.
- `saved_gyms` and verification reminders require migration 021 and generated database types.

## Rejected alternatives

- **Grant access from a shared code or QR:** possession is not identity proof.
- **Match the stored phone number:** Stren cannot currently prove that number belongs to the account.
- **Keep “request to join” and only soften the empty-state copy:** preserves the wrong domain model.
- **Invent Personal Mode or functional member tools:** would misrepresent unavailable product capabilities.
