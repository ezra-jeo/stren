# Shot B Prompt — Financial, Reporting & Recovery Closure

Use **GPT Codex 5.6 Sol** with **xhigh effort**.

Run this only after the developer has committed Shot A and the working tree is clean. You are implementing Shot B of Stren's production-readiness closure in `C:\Users\Zurax\Github.Repositories\stren`.

Read completely before acting:

1. `AGENTS.md`
2. `AgentsContextKnowledgeBase/Catalog.md`
3. `AgentsContextKnowledgeBase/AboutProject.md`
4. `AgentsContextKnowledgeBase/ImplementationState.md`
5. `AgentsContextKnowledgeBase/ImplementationPlan-ProductionSecurityAndFinancialClosure.md`
6. `AgentsContextKnowledgeBase/ImplementationPlan-FinancialIntegrityAndRecovery.md`
7. `docs/adr/0007-financial-ledger-separates-money-from-access.md`
8. `docs/operations/BACKUP_AND_RECOVERY.md`
9. `CLAUDE.md`
10. `CONTEXT.md`

Implement **Shot B only: financial, reporting, database, and recovery closure**. Work continuously from failing tests through implementation and verification; do not merely issue another report.

## Baseline findings to close

1. Authenticated clients can still insert, update, and delete legacy `payments`, including invalid negative values, through older grants/policies in migrations 011/015. Migration 025 did not close all of them.
2. Financial idempotency compares too little request intent. Reusing a reversal key with a different amount/reason/revoke flag can return the first result as a successful replay.
3. `start_date + duration_days` plus inclusive entitlement grants 31 calendar days for a 30-day plan.
4. Dashboard/report membership buckets disagree with access: rejected gym users can count active, and a historical cancellation can suppress a later expired period and inflate cancelled counts.
5. Dashboard/report query errors are converted to plausible zero-valued business data.
6. Financial PostgreSQL behavior tests are not reliably mandatory in CI; the current financial fixture collides with the Shot B recovery seed.
7. Paid-period overlap protection is not a concurrency-safe database exclusion invariant across every write path.
8. The development seed guard is not sufficiently explicit for production-like private networks.
9. Deployment verification proves many object names but does not adequately detect changed policy/function/grant/trigger definitions or behavior.
10. Hosted deployment snapshot, scheduled encrypted off-site generations, retention, PITR/equivalent, hosted configuration recreation, monitoring, and an isolated hosted restore remain unproven.

Inspect the current code and reproduce each applicable finding with failing executable tests before implementing the smallest reliable fix.

## Required outcome

- Revoke authenticated insert/update/delete on legacy `payments`; retain historical read/migration/recovery access only where explicitly required and least-privileged. Add database monetary checks for any retained rows.
- Persist a canonical request fingerprint for every idempotent financial RPC. Same gym/key/same intent returns the original result; same gym/key/different material intent fails clearly. Include amount, target, kind, reason, access-revocation choice, plan/promo/member, method, dates, and other outcome-affecting inputs as appropriate.
- Define paid access date semantics unambiguously. A `duration_days = 30` purchase grants exactly 30 Manila calendar dates. Fix creation, renewal, entitlement, reporting, snapshots, and fixtures consistently. Inventory existing rows and use a documented non-destructive migration rule; do not silently rewrite settled history.
- Create one PostgreSQL-owned effective membership/access status contract that incorporates gym-user active/rejected/banned/disabled state, membership dates, cancellation, and supported freeze/suspension semantics. Use it consistently for access, dashboards, reports, exports, and counts.
- Do not turn report/dashboard errors into zeroes. Show an explicit unavailable/error state, preserve observability without PII, and keep genuine zero distinguishable.
- Add or harden database constraints for monetary ranges, tenant consistency, valid states, unique retry keys, reversal limits, and concurrency-safe non-overlapping paid periods. Historical-data validation must be inventoried and forward-safe.
- Make every critical PostgreSQL financial/RLS/rollback/concurrency suite run in CI from a clean production-shaped database. Remove fixture collisions with generated/isolated identifiers and make test omission a failing condition.
- Require explicit development-seed opt-in plus an allowlisted local project identity; fail closed on ambiguous/private hosted endpoints.
- Strengthen deployment verification using normalized definitions and/or executable behavior so drift in functions, RLS policies, grants, triggers, constraints, migrations, and buckets is detected.
- Re-run exact database/Auth/Storage backup and isolated restore reconciliation locally. Update the recovery runbook and evidence format. Do not claim production recovery until approved off-site retention, PITR/equivalent, monitoring, hosted configuration, and a separately approved isolated hosted restore are evidenced.

## Mandatory regression and recovery tests

At minimum prove with actual PostgreSQL/Supabase behavior:

1. Authenticated owner/admin/staff/member cannot directly insert/update/delete legacy payments or ledger events; authorized RPCs still work.
2. Every same-key/same-intent retry returns one logical result, and every same-key/different-intent retry fails without new or misleading state.
3. Concurrent payment, renewal, reversal, and overlap attempts preserve one valid ledger/access outcome and fully roll back injected failures.
4. Fixed/percentage discounts, cent rounding, nonnegative final amounts, partial/full reversal limits, and signed reconciliation remain exact.
5. Thirty-day, month-end, leap-year, future-start, early-renewal, Manila-midnight, and backdated cases follow the documented date contract.
6. Rejected/banned/disabled/frozen/cancelled/expired users have identical effective status in access, dashboard, reports, and exports; historical cancellation does not misclassify a later period.
7. A query failure renders an explicit unavailable state rather than zero revenue/member counts.
8. CI demonstrably executes all named financial database suites after a clean reset, with non-colliding fixtures and a failing sentinel if a suite is skipped.
9. Deployment verification fails when a protected definition/grant/policy/trigger is intentionally drifted and passes after restoration.
10. An isolated restore reproduces database rows, Auth identities, Storage bytes/checksums, RLS, audit history, financial snapshots, and exact per-gym reconciliation within recorded RPO/RTO.

## Execution rules and definition of done

- Use new forward migrations only; never edit applied migrations. Preserve historical ledger and membership meaning.
- Preserve unrelated changes. Never commit, push, merge, rebase, tag, reset, or rewrite history.
- Do not apply hosted migrations, mutate a hosted project, purchase/enable services, send external messages, or restore production without explicit approval. Record those as external gates, not false passes.
- SQL-text regex checks do not prove financial, RLS, transaction, concurrency, or recovery behavior.
- Run clean reset/seed, generated-type parity, all database invariant suites, deployment checks, lint, typecheck, full unit/integration coverage, build, practical E2E, backup freshness checks where evidence exists, and an isolated local restore drill.
- Update `lib/database.types.ts`, the recovery runbook where needed, `AgentsContextKnowledgeBase/ImplementationState.md`, `CHANGELOG.md`, package version if required, and Catalog entries for new docs.
- Leave changes uncommitted. Final output must map every baseline finding to exact files/functions/tables/policies, tests, database evidence, remaining external blockers, and an honest launch recommendation.

