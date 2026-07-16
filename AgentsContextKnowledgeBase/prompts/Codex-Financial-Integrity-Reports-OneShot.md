# Shot 1 Prompt — Financial Integrity & Reporting

Use **GPT Codex 5.6 Sol** with **xhigh effort**.

You are implementing Shot 1 of Stren's production-readiness remediation in `C:\Users\Zurax\Github.Repositories\stren`.

Read these completely before acting:

1. `AGENTS.md`
2. `AgentsContextKnowledgeBase/Catalog.md`
3. `AgentsContextKnowledgeBase/AboutProject.md`
4. `AgentsContextKnowledgeBase/ImplementationState.md`
5. `AgentsContextKnowledgeBase/ImplementationPlan-FinancialIntegrityAndRecovery.md`
6. `docs/adr/0007-financial-ledger-separates-money-from-access.md`
7. `CLAUDE.md`
8. `CONTEXT.md`

Then implement **Shot 1 only: Financial source of truth and reporting** from the plan. Work continuously through implementation and verification; do not merely produce another plan.

## Required outcome

Replace the current membership-as-payment behavior with one immutable, tenant-safe financial ledger and make every payment/membership write atomic, server-calculated, and idempotent. Rebuild payment history, dashboard revenue, report revenue, and member counts from the new source of truth.

The completed vertical slice must include:

- a new append-only `financial_transactions` ledger migration using the next available migration number;
- exact/reconstructed plan, benefits, discount, final amount, method, currency and actor snapshots;
- immutable payment/refund/void/adjustment events with linked reversals and reasons;
- defensive grants/RLS/trigger enforcement preventing ordinary ledger update/delete;
- unique `(gym_id, idempotency_key)` retry protection;
- tenant-consistency and monetary constraints;
- PostgreSQL-owned promo validation and fixed/percentage amount calculation;
- a transactional `record_membership_payment` RPC used by payments, renewals, and member onboarding;
- a locked reversal RPC supporting full/partial refund and void without erasing the original;
- an owner-only reasoned adjustment RPC;
- remaining-paid-time preservation for ordinary renewals;
- a start-date-aware Manila-time membership entitlement predicate and overlap protection required by those renewals;
- an idempotent, explicitly labeled legacy backfill from membership payment history;
- a read-only inventory and fail-closed decision if the legacy `payments` table is nonempty—never silently double-import it;
- payment/member UI and server route cutover away from direct membership money writes;
- ledger-derived `admin_dashboard_stats`, `admin_reports_data`, payment history and owner reconciliation;
- pagination beyond the PostgREST 1,000-row cap;
- regenerated database types and required permission-catalog parity.

Follow the exact domain and scope decisions in the implementation plan and ADR. Do not redesign unrelated membership lifecycle, authentication, QR, attendance, role, privacy, or general tenant work.

## Mandatory execution rules

- Preserve all unrelated user changes in the working tree.
- Never commit, push, merge, rebase, tag, reset history, or apply destructive cleanup.
- Every schema change is a new migration. Never edit an applied migration.
- Do not mutate the linked hosted project or production data without the user's explicit approval after local verification and a reviewed backfill preview.
- Use test-driven development for the financial behavior. Tests that only regex-check SQL text are insufficient for the critical invariants.
- The client may preview money but never supplies an authoritative final amount, actor, gym, snapshot, or status.
- Trusted RPCs enforce permissions, active gym, tenant relationships, locks, calculations, idempotency, and rollback.
- Corrections append ledger events; no ordinary code updates or deletes a financial event.
- Keep legacy columns/tables during cutover. Do not drop historical data.
- Use one canonical `Asia/Manila` business-date helper across access and reporting.

## Tests that must fail first, then pass

At minimum, execute tests proving:

1. Repeating one idempotency key returns one financial transaction and one membership.
2. Simultaneous payment attempts do not overlap or double-record.
3. Injected failure rolls back ledger and membership together.
4. Caller-supplied amount, actor, gym, expired promo, invalid discount and cross-gym IDs are rejected or ignored safely.
5. Fixed and percentage discounts calculate correctly at cent boundaries.
6. Partial/full refund, void, repeated reversal and over-refund behavior is correct.
7. Ledger update/delete fails and plan/staff edits do not change snapshots.
8. Early renewal preserves remaining paid time while future access remains inactive until its start date.
9. Backfill is rerunnable and reconciles counts/amounts.
10. Dashboard, reports and paginated payment history equal signed ledger totals across refunds, voids and Manila midnight.
11. Two-gym RLS and finance-permission boundaries hold for every new table/RPC.

Use a real local PostgreSQL/Supabase execution path for RLS, transactions and concurrency. If Docker or required infrastructure is unavailable, exhaust safe alternatives but do not claim the critical database workflow is verified.

## Definition of done

- All Shot 1 requirements and verification gates in `ImplementationPlan-FinancialIntegrityAndRecovery.md` are satisfied.
- Lint, typecheck, build, focused database tests and the complete unit/integration suite pass.
- Pre/post backfill inventory and reconciliation are reported without PII.
- `lib/database.types.ts`, package version, `CHANGELOG.md`, and `AgentsContextKnowledgeBase/ImplementationState.md` are updated in the same working tree.
- Any newly created documentation is cataloged.
- The final response lists exact files, migrations, tests, reconciliation results, external actions not taken, and remaining blockers.
- Leave all changes uncommitted for the developer.

