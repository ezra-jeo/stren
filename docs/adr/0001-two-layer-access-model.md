# Two-layer access model: permissions × feature toggles, enforced in the database

Access control was scattered role checks (`is_manager()`, `ownerOnly` nav flags, client-side redirects) with no way to vary capability per user or per gym. We decided on two separate, layered systems: **permissions** (can this user do this action? — role defaults + per-user overrides) and **per-gym feature toggles** (is this capability enabled for this gym?). Every gated surface checks feature first, then permission, and the **source of truth is RLS policies and RPC-internal checks** — API routes return 403, middleware redirects, and UI hiding are progressively outer conveniences that can never be the only gate.

## Considered options

- **Status quo (scattered role checks)** — rejected: no per-user or per-gym variation, and UI hiding was effectively the only enforcement on several surfaces (member-callable `admin_dashboard_stats` proved this).
- **One combined ACL table** (user × capability rows for everything) — rejected: conflates "who may act" with "what the gym offers"; disabling a gym feature would require touching every user's rows.
- **Middleware-only enforcement** — rejected: RPCs and REST are reachable without passing middleware-rendered pages.

## Consequences

- A capability is available only when BOTH layers pass (e.g. staff with `kiosk:use` at a gym with `kiosk_checkin` off → blocked).
- A disabled feature blocks everyone at the gym, including the owner, everywhere except the owner's Features panel.
- Owners short-circuit to `true` for every permission key, so new keys can never lock owners out; for non-owners, unknown keys raise loudly (typo protection) instead of silently denying.
