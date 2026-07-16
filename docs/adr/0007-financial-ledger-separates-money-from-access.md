# ADR 0007: Separate the financial ledger from membership access

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

Stren currently uses `memberships` as both a paid access period and the application's payment history. The separate `payments` table is not the active application source. Reports sum `memberships.amount_paid`, payment screens join mutable plan rows, and payment/renewal flows perform multiple client-side writes. This prevents immutable history, safe correction, retry protection, exact reconciliation, and reliable recovery.

A membership and a payment have different business meanings. A membership answers whether and when a member has access. A payment records money received or reversed, the commercial facts agreed at that time, and who performed the action. Conflating them makes both models ambiguous.

## Decision

Stren will use an append-only financial ledger as the sole financial source of truth.

- A **membership** is a paid access period. It may reference its originating financial transaction but is not revenue.
- A **financial transaction** is an immutable ledger event. Payments add value; refunds, voids, and adjustments append compensating events referencing the original. They never edit or erase it.
- The ledger snapshots plan, benefits, price, discount, method, final amount, currency, actor identity, and effective membership dates.
- PostgreSQL calculates authoritative amounts and performs the payment plus membership transition in one gym-pinned, idempotent transaction.
- Revenue, payment history, reports, exports, and reconciliation derive only from signed ledger events after cutover.
- Mutable plan, promo, profile, or staff records cannot change the meaning of historical ledger events.
- Reconstructed legacy snapshots are labeled `reconstructed`; Stren does not present current mutable values as exact historical facts.
- Database and Storage recovery is only accepted after an isolated restore reproduces the ledger and passes reconciliation.

## Consequences

- Existing membership financial columns remain temporarily for compatibility and backfill, but new application writes stop using them as the financial source.
- The unused legacy `payments` table is not silently merged or deleted; nonempty data requires explicit reconciliation.
- Refund/void permissions, reasons, idempotency keys, actor snapshots, and append-only enforcement become part of the database contract.
- Dashboards and reports must be rewritten in the same implementation shot as the ledger to avoid two competing revenue definitions.
- Ordinary renewal preserves remaining paid time; access predicates must honor membership start dates so a future renewal does not activate early.
- Backups must include both the database and Supabase Storage objects, and restore drills must run financial reconciliation.

## Rejected alternatives

- **Keep using memberships as payment rows:** cannot represent partial refunds, corrections, immutable snapshots, or multiple financial events for one access period.
- **Make the existing payments table mutable but add more columns:** preserves unsafe update/delete semantics and does not establish an append-only correction chain.
- **Recompute history from current plans and profiles:** retroactively rewrites historical meaning.
- **Let the browser calculate and submit the final amount:** direct requests and stale clients can bypass promo, amount, permission, and expiry rules.
- **Ship the ledger without report changes:** creates two financial sources of truth during the highest-risk transition.

