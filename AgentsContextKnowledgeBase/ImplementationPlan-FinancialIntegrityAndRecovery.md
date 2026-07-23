# Financial Integrity, Reporting & Recovery

**Status:** Initial shots committed (`27a1113`, `b6e8f2f`) on 2026-07-16. Superseded as the active workstream by [Production Security & Financial Closure](ImplementationPlan-ProductionSecurityAndFinancialClosure.md) after the post-implementation audit found unresolved production blockers. This document remains the ledger/recovery architecture and implementation record.
**Closure update (working tree, 2026-07-23):** migration 028 adds canonical request fingerprints, exact inclusive paid dates, one effective membership status, exclusion-based overlap protection, protected-definition hashes, and recovery evidence v2. The v2 isolated local database/Auth/Storage restore passed with exact source/target hashes, RPO 0.00 minutes, and RTO 1.27 minutes; hosted recovery gates remain blocked.
**Audit source:** Production-readiness audit completed 2026-07-15.
**Recommended model / effort:** GPT Codex 5.6 Sol; Shot 1 `xhigh`, Shot 2 `high` (`xhigh` when an actual hosted restore drill is included).
**Prompts:** [Shot 1](prompts/Codex-Financial-Integrity-Reports-OneShot.md) · [Shot 2](prompts/Codex-Data-Recovery-Migrations-OneShot.md)

## 1. Objective and launch boundary

Stren must stop treating a membership row as both access state and a payment receipt. This work establishes one immutable source of financial truth, rebuilds reporting from it, and proves that the resulting data can be migrated, backed up, restored, and reconciled.

Until both shots pass their gates, Stren remains suitable for synthetic internal testing only. Neither shot authorizes an agent to apply migrations to the linked hosted project, enable a paid Supabase add-on, restore a project, or mutate production data without explicit user approval.

The two shots are ordered:

1. **Shot 1 — Financial source of truth and reporting.** Introduce the ledger, atomic/idempotent financial write path, server-enforced discounts, historical backfill, and ledger-derived dashboards/reports.
2. **Shot 2 — Production data resilience.** Repair clean database creation, migration/deployment verification, backup coverage, restore procedure, and an isolated recovery drill that re-runs Shot 1 reconciliation.

Shot 2 depends on Shot 1. A backup is not considered verified merely because a provider says one exists; an isolated restore must reproduce the ledger, audit records, memberships, Auth data, RLS contract, and Storage assets.

## 2. Canonical domain decisions

These decisions are fixed by [ADR 0007](../docs/adr/0007-financial-ledger-separates-money-from-access.md):

- A **membership** is a paid access period. It is not a payment receipt and not a revenue row.
- A **financial transaction** is one append-only ledger event. Confirmed payments add value; refunds, voids, and adjustments append compensating events and never overwrite the original.
- `financial_transactions` is the only source for revenue, payment history, reconciliation, and financial exports after cutover.
- Plans and promos remain mutable operational definitions. Every confirmed payment snapshots the exact plan and discount facts used at that moment.
- The client never supplies an authoritative final amount. It supplies identifiers and intent; PostgreSQL resolves the plan, promo, permissions, dates, and amount inside one transaction.
- All financial writes are gym-pinned, actor-attributed, transactional, and idempotent.
- All business dates and report boundaries use `Asia/Manila` through one shared database helper for this Philippine-only release.
- Legacy records are preserved. Reconstructed snapshots are labeled as reconstructed rather than presented as historically exact.
- Direct authenticated table writes to the ledger are forbidden. Trusted RPCs are the write boundary.

## 3. Scope boundaries

### Included

- Manual cash and GCash membership payments.
- Payment confirmation, full/partial refund, void, and reasoned adjustment.
- Atomic creation of the membership access period associated with a payment.
- Retry and concurrent-submission safety.
- Active promo validation and server-side fixed/percentage calculation.
- Historical migration/backfill from the current membership-based money path.
- Payment history UI, admin dashboard, reports, and reconciliation.
- The narrow membership invariants required by the money path: start-date entitlement, paid-time-preserving renewal, overlap prevention, and explicit cancellation when a reversal is chosen to revoke access.
- Fresh database bootstrap, seed repair, deployment parity, database/Storage backup, restore and recovery verification.

### Excluded

- Online payment-gateway integration or webhooks.
- Card storage, PCI scope, settlement or chargeback automation.
- A full membership lifecycle redesign beyond the invariants required above (scheduled freeze completion, broad upgrade/downgrade product design, and ban/verification remediation remain separate workstreams).
- A general privacy/retention program, except retaining financial/audit history and including it in recovery.
- Unrelated tenant-isolation, QR, role-escalation, attendance, or authentication findings from the production-readiness audit.
- Applying migrations or restoring the linked hosted project without explicit approval.

## 4. Shot 1 — Financial source of truth and reporting

### 4.1 Migration and ledger contract

Use the next available migration number after inspecting the working tree (expected next migration is `025`). Never edit an already-applied migration.

Create an append-only `financial_transactions` table with, at minimum:

- identity and scope: `id`, `gym_id`, `member_id`, optional `membership_id`;
- event semantics: `kind` (`payment`, `refund`, `void`, `adjustment`), `source`, optional `reverses_transaction_id`;
- money: `ledger_amount` as the signed reporting amount, `gross_amount`, `discount_amount`, `currency` fixed to `PHP`, and payment method where applicable;
- immutable context: `plan_snapshot`, optional `discount_snapshot`, `actor_snapshot`, and `snapshot_quality` (`exact` or `reconstructed`);
- attribution: `actor_id`, `occurred_at`, `created_at`, mandatory reason for refund/void/adjustment;
- retry safety: caller-provided `idempotency_key` with a unique `(gym_id, idempotency_key)` constraint.

Required invariants:

- A payment has nonnegative gross/discount, discount cannot exceed gross, and `ledger_amount = gross - discount`.
- A refund or void is negative, references an earlier positive transaction in the same gym/member/currency, and cannot reverse more than the remaining unreversed value.
- An adjustment is nonzero and requires a reason.
- Actor and plan snapshots remain interpretable if the related account or plan is later disabled, renamed, archived, or deleted.
- Ordinary `UPDATE` and `DELETE` are rejected by grants and a defensive immutability trigger. Corrections append events.
- Tenant-consistency constraints prove that the membership/member belongs to the transaction gym.

Do not drop the existing `payments` table or financial columns on `memberships` in this shot. Mark them legacy in code/types and stop new application writes after cutover.

### 4.2 Plan and promo snapshots

The exact payment snapshot contains:

- plan ID, name, price, duration, description and structured included benefits;
- promo ID/name/type/value and validity window when used;
- gross price, discount amount, final amount, method, currency and effective membership dates.

If structured plan benefits do not exist, add the smallest compatible field to `membership_plans` and its admin form. Do not infer historical benefits during backfill: store the current known description/benefits and mark the snapshot `reconstructed`.

Promo validation happens in PostgreSQL:

- feature enabled;
- promo active;
- gym and optional plan match;
- gym-local date inside its validity window;
- percentage in `0..100`, fixed value nonnegative;
- computed discount cannot make the payment negative;
- caller holds the required payment/discount capability.

Add database checks to plans/promos for nonnegative price, positive duration, valid discount type/range, and ordered validity dates. The browser may preview the amount but is never authoritative.

### 4.3 Trusted RPC write boundary

Implement typed RPCs (names may change only if the final names are documented consistently):

1. `record_membership_payment(...)`
   - requires the effective payment and member-management permissions;
   - pins the active gym and locks the member/gym payment sequence;
   - resolves the plan/promo and Manila business date;
   - returns an existing result for a repeated idempotency key;
   - preserves remaining paid time by starting an ordinary renewal after the current effective end date;
   - inserts the membership and financial transaction in one PostgreSQL transaction;
   - never leaves one without the other.

2. `reverse_financial_transaction(...)`
   - permits `refund` or `void`, requires a reason and the dedicated reversal permission;
   - locks the original and its prior reversals;
   - rejects over-refund and cross-gym/currency/member references;
   - appends the compensating event;
   - requires an explicit choice whether the associated membership access remains or is cancelled; it must never silently alter access.

3. `record_financial_adjustment(...)`
   - owner-only for this release;
   - requires a reason and append-only event.

Add `payments:reverse` as owner-only and non-delegable in this release. If the implementation adds a distinct discount permission, define it in both TypeScript and SQL defaults and test parity. Do not reuse `members:manage` as authorization to change money.

Replace direct `.from('memberships').insert/update` payment and renewal mutations in:

- `app/admin/payments/page.tsx`;
- `app/admin/members/page.tsx`;
- `app/api/admin/members/onboard/route.ts`.

The onboarding route must call the same trusted database boundary rather than reproduce the algorithm under the service role.

### 4.4 Narrow membership invariants

Because ordinary renewal now preserves paid time, the access predicate must require:

```text
status permits access
AND start_date <= Manila business date
AND end_date >= Manila business date
```

Add the smallest reliable database protection against overlapping paid access periods for the same `(gym_id, member_id)`. If a replacement must start immediately, it must be an explicit mode with a reason; do not infer replacement from plan differences.

Use an explicit cancelled state/metadata when a reversal is intentionally chosen to revoke membership access. Full freeze/upgrade/downgrade design is outside this plan.

### 4.5 Legacy inventory and backfill

Before writing backfill SQL, run a read-only inventory against a production-shaped copy:

- counts and sums for `memberships` grouped by gym/method/date/status;
- count/sum and sample shape of the legacy `payments` table;
- duplicate/same-day memberships, null members/plans/actors, cross-gym references, invalid dates and negative amounts.

The current application and reports treat `memberships` as the legacy money source. Backfill each historical membership once using a deterministic key such as `legacy-membership:<membership_id>`.

Do not silently double-import the legacy `payments` table. If it is nonempty, produce a reconciliation report and require an explicit mapping/deduplication decision before cutover. Backfill is rerunnable and must result in the same row count and totals.

### 4.6 Reporting contract

Rebuild payment history, `admin_dashboard_stats()` and `admin_reports_data()` from the ledger and an effective-membership source of truth.

Required semantics:

- revenue = confirmed payment ledger amounts plus signed refund/void/adjustment events;
- transaction date filters use `occurred_at` at Manila boundaries, not membership `created_at`;
- total members count active `gym_users` whose role is `member`, never owners/admins/staff;
- active/expired/frozen/cancelled counts are distinct members under the effective membership predicate, not raw rows;
- occupancy remains derived from valid open attendance sessions and is not replaced by a counter;
- lists use server pagination; UI totals cannot silently stop at the PostgREST row cap;
- financial fields remain omitted unless the caller has the existing finance-report permission.

Add an owner-only `financial_reconciliation` query/RPC that reports, by gym and requested Manila date range:

- payment, refund, void, adjustment and net totals;
- legacy-backfill totals during transition;
- membership rows missing a transaction link;
- ledger rows missing an expected membership link;
- duplicate idempotency keys or impossible reversal balances (expected zero).

Definition of financial correctness:

```text
sum(ledger_amount for included events)
= dashboard revenue
= reports revenue
= paginated/exported transaction total
```

### 4.7 Shot 1 test-first and verification gate

Tests must execute business behavior, not merely regex-check SQL source. Start with failing tests for:

- duplicate idempotency key returns one payment/membership;
- simultaneous distinct requests serialize without overlapping access;
- rollback leaves neither ledger nor membership after injected failure;
- caller-supplied amount/actor/gym is ignored or rejected;
- fixed and percentage discounts, expiry, plan scope, invalid ranges and rounding;
- full/partial refund, void, over-refund and repeated reversal;
- plan/staff edits do not alter historical snapshots;
- ordinary ledger update/delete fails;
- early renewal preserves remaining paid time and future access does not activate early;
- two-gym and permission isolation;
- backfill rerun is idempotent and reconciles;
- dashboard/report fixtures reconcile across Manila midnight and refund/void cases;
- payment history paginates beyond 1,000 rows.

Shot 1 is not complete until:

- local migration apply succeeds on a production-shaped copy;
- pre/post backfill counts and amounts are recorded without exposing PII;
- full unit/integration suite, lint, typecheck and build pass;
- executed database tests prove RLS, rollback and concurrency;
- `lib/database.types.ts`, `ImplementationState.md`, `CHANGELOG.md`, and package version are updated in the implementation working tree;
- no hosted migration has been applied without explicit approval.

## 5. Shot 2 — Production data resilience

### 5.1 Fresh database bootstrap and seed

Do not edit migration 001. Add a new earlier-sorting, idempotent bootstrap prerequisite migration (expected `000_bootstrap_prerequisites.sql`) that safely creates only the extensions/types/tables required by migration 001's early helper definitions. It must be harmless when applied to the existing hosted schema and must not lose data.

Update `supabase/seed.sql` to the final unified-account schema (`gym_users`, `profiles.active_gym_id`, current gym color/name columns). Keep recognizable development-only accounts, but add an explicit guard so seed behavior cannot be mistaken for production provisioning.

Add CI that starts local Supabase, performs a completely clean reset, applies every migration and seed, regenerates or checks database types, runs database invariants, and tears the environment down.

### 5.2 Migration and deployment contract

Extend deployment verification to prove the full application-required schema through the latest migration, including Shot 1 and kiosk migrations 022-024. Verification must cover required functions/signatures, tables/columns, RLS/grants and the financial contract—not only 019/021.

Provide safe commands for:

- read-only local/remote migration comparison;
- dry-run or preflight before applying;
- post-apply contract and reconciliation;
- recovery from a migration that fails before commit;
- response to a migration that committed but the app deployment failed.

Never claim SQL rollback is safe unless a tested down path exists. Prefer forward repair and restore from a verified isolated copy.

### 5.3 Backup policy

Create and catalog `docs/operations/BACKUP_AND_RECOVERY.md` as the canonical runbook. It must define:

- owners and required credentials;
- production project and region identification without committing secrets;
- target RPO/RTO;
- database backup/PITR configuration and retention;
- separate Storage-object backup for every bucket containing member/gym assets;
- off-site destination and encryption/access policy;
- backup-age and failure monitoring;
- restore-to-isolated-project steps;
- Auth, RLS, functions, secrets/configuration and Storage reconfiguration that database restore alone does not cover;
- post-restore validation, including Shot 1 financial reconciliation;
- escalation and decision log for a real production restore.

Conservative targets for sign-off:

- before real member PII: daily database and Storage backup, at least seven days retention, RTO at most four hours;
- before real payments: PITR or an equivalent process with an agreed RPO at most fifteen minutes;
- isolated restore drill at least quarterly and before first launch.

Enabling paid PITR, creating an off-site bucket, or changing production retention requires explicit user approval. If credentials, plan capability, budget, or destination are missing, complete every local artifact and mark the external gate blocked rather than pretending the work is finished.

### 5.4 Isolated restore drill

Never restore over production for verification. Restore or clone into a disposable isolated project, then verify:

- schema/migration contract and generated types;
- Auth user/profile/gym-user counts and representative sign-in routing;
- RLS with at least owner/admin/staff/member and two gyms;
- ledger row counts, signed totals, reversal balances, actor/plan snapshots and reconciliation;
- membership and attendance counts/invariants;
- audit records;
- Storage bucket/object counts and sampled content hashes;
- required configuration that must be recreated manually;
- measured recovery time and newest recovered transaction timestamp.

Delete the disposable recovery environment only after recording non-sensitive evidence and receiving approval for any external deletion.

### 5.5 Shot 2 verification gate

Shot 2 is complete only when:

- clean reset/seed CI passes from an empty database;
- full deployment contract detects any missing required migration or object;
- backup age is programmatically verifiable;
- database and Storage backup procedures are documented and exercised;
- an isolated restore passes the same financial reconciliation as the source;
- actual RPO/RTO measurements and remaining manual configuration are recorded;
- `Catalog.md`, `ImplementationState.md`, `CHANGELOG.md`, package version, and operational docs are updated in the implementation working tree;
- no production restore, paid add-on, commit, or push was performed without the required human action.

Current evidence (2026-07-16): clean bootstrap/seed/types/contracts pass, and an isolated local database/Auth/Storage restore passed with two-gym RLS, live representative sign-in routing, exact Storage hashes and Shot 1 reconciliation at measured RPO **0.00 minutes** / RTO **1.95 minutes**. The hosted/off-site/PITR portions remain an external approval dependency and are not represented as complete.

## 6. Cross-shot file ownership and sequencing

Shot 1 may touch financial/membership/reporting UI, server routes, permissions, generated types, tests, and new forward migrations. Shot 2 owns bootstrap/seed, deployment verification, CI, backup scripts/runbook and restore evidence. Shot 2 may add a forward repair migration but must not redesign Shot 1's ledger contract.

If both shots use one branch, finish and verify Shot 1 before starting Shot 2. Keep the changes reviewable as two logical groups even though agents never commit or push.

## 7. Required handoff

Each implementing chat reports:

- files changed and migrations added;
- exact tests/commands run and results;
- backfill/reconciliation results without PII;
- external operations performed or explicitly not performed;
- remaining launch blockers;
- working-tree state for the developer who will commit and deploy.
