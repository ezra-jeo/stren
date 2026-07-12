# One account per person; gyms attach via `gym_users`; context via a server-side active gym

Login was Canvas-style: each gym had its own login/signup pages (`/gym/{code}/login`), and an account belonged to exactly one gym (`profiles.role/gym_id/status`). Someone training at two gyms needed two accounts (two emails — `profiles.email` is unique), and the app grew login-origin cookies, sign-out routing tables, and a `check_gym_membership` RPC just to remember which door a user came in through. We decided: **one Stren account per person** (`profiles` = pure identity), a **`gym_users`** table holding one `(gym, user)` row with a per-gym role and status, and **one gym context at a time** stored server-side in `profiles.active_gym_id` (writable only through `set_active_gym()`, which requires an active `gym_users` row). `get_gym_id()`, `is_manager()`, `get_my_access()` and `has_gym_permission()` keep their signatures and are re-implemented over `gym_users` — so the entire RLS/permission/feature-toggle stack (ADR-0001, migrations 011–018) carries over without policy rewrites. Auth surfaces collapse to `/login`, `/signup`, a `/gyms` hub, and an in-shell gym switcher; all per-gym auth routes 308-redirect and their code is deleted.

## Considered options

- **Status quo (per-gym accounts)** — rejected: multi-gym users must hold multiple accounts; discovery-avoidance (the original Canvas rationale) is already served by the public gym pages being code-addressed, not by fragmenting identity.
- **Multi-account switcher (Gmail/Instagram-style: several signed-in accounts)** — rejected: it keeps the duplicate-identity problem and multiplies session handling; what users actually switch is the *gym*, not who they are.
- **Path-scoped tenancy (`/gym/{code}/admin`, `/gym/{code}/member`)** — rejected for now: honest URLs and multi-tab-safe, but it rewrites every route, link, and middleware rule in the app for a marginal v1 benefit. The `gym_users` model doesn't preclude it later; only the context-resolution layer would change.
- **Active gym in a cookie or JWT claim instead of the database** — rejected: `get_gym_id()` is called inside ~50 RLS policies and RPCs that can't read request cookies, so a cookie would force rewriting every policy to affiliation-based checks; JWT claims go stale on role/status changes until token refresh.

## Consequences

- Roles and approval status are per-gym facts (`gym_users.role/status`); "pending approval" gates one gym, not the account. A rejection at gym A no longer blocks joining gym B.
- Everything is pinned to the active gym: a user acts in one gym at a time, and switching in one tab changes what other tabs see on their next request (Instagram-switcher trade-off, accepted). Cross-gym data access requires switching — no widening versus today.
- A NULL or stale `active_gym_id` fails every `gym_id = get_gym_id()` policy closed; the app routes such users to the gym hub instead of an error.
- Per-member-per-gym data needed real composite keys: the `streaks`, `member_notification_preferences`, and `notification_cooldowns` uniques (and their `ON CONFLICT` call sites) became `(member_id, gym_id, …)`.
- Staff onboarding an email that already has an account now *attaches* the gym instead of failing on the unique email — the multi-gym unlock for front-desk flows.
- The billing table keeps the name `memberships` (subscription periods); the person↔gym link is deliberately named `gym_users` to avoid colliding with it. Vocabulary: CONTEXT.md "Accounts & gyms".

## Follow-on decisions (grill session, 2026-07-11)

- **Kiosk is the one surface that must NOT follow the active gym**: a multi-gym owner switching contexts on their phone would silently re-point a live front-desk tablet (wrong-gym check-ins). The kiosk pins its gym at launch; kiosk RPCs take an explicit gym and validate the caller's affiliation there.
- **Managers are members too**: manager roles are a superset — one row, one role; member surfaces and kiosk accept any active affiliation. Rejected: dual profiles per person (Instagram-style), which would break the `(gym_id, user_id)` key and reintroduce duplicate identity.
- **Phone-OTP login deferred, not rejected**: the account model is auth-channel-agnostic (Supabase phone identities bolt on later). Deciding factors: per-SMS cost with zero revenue, PH number recycling as an account-takeover vector, and the observation that unified accounts already reduce login frequency to ~once per device.
- **Multi-branch = separate gyms for now**; a future Organizations layer (`gyms.org_id`, org-scoped plans/leaderboards) is the composition path — nothing in this schema blocks it.
- **Lapsed subscriptions lock the member portal with the loss visible** (saved streak/stats named on the renewal screen); data is never deleted, and the gate is a product gate over the member's own data, not a security boundary.
- **Attribution over trust-me**: `payments.recorded_by`, `memberships.created_by`, `gym_users.added_by` + an owner in-app alert per recorded payment; payments were already insert-only under RLS (015), which is the tamper-proofing half of the audit story.
