# Shot A Prompt — Production Security & Tenant Closure

Use **GPT Codex 5.6 Sol** with **xhigh effort**.

You are implementing Shot A of Stren's production-readiness closure in `C:\Users\Zurax\Github.Repositories\stren`.

Read completely before acting:

1. `AGENTS.md`
2. `AgentsContextKnowledgeBase/Catalog.md`
3. `AgentsContextKnowledgeBase/AboutProject.md`
4. `AgentsContextKnowledgeBase/ImplementationState.md`
5. `AgentsContextKnowledgeBase/ImplementationPlan-ProductionSecurityAndFinancialClosure.md`
6. `AgentsContextKnowledgeBase/ImplementationPlan-FinancialIntegrityAndRecovery.md`
7. `docs/adr/0007-financial-ledger-separates-money-from-access.md`
8. `CLAUDE.md`
9. `CONTEXT.md`

Implement **Shot A only: security, tenant, and privileged-write closure**. Work continuously from failing tests through implementation and verification. Do not stop after producing a plan, and do not implement Shot B's financial/reporting/recovery closure.

## Baseline

The initial financial/recovery shots are commits `27a1113` and `b6e8f2f`. They are substantial but the post-implementation audit found these open production blockers:

1. Migration 019's broad profile selection lets a same-gym member read full owner/staff profiles, including email and reusable QR data.
2. Migration 019's `gym_users_update` boundary permits a caller with `members:manage` to update `role`, enabling admin-to-admin promotion.
3. Attendance policies originating in migration 011 do not prove member/gym consistency. A Gym A admin can insert a Gym B member ID and cause that identity to appear in Gym A dashboard data.
4. `verify_gym_membership` from migration 021 allows a rejected user with historical membership evidence to become active again.
5. The staff onboarding route generates and returns a magic sign-in URL and stores it in a manager-readable onboarding event.
6. Member onboarding creates/updates account, profile, and gym affiliation before the financial step can fail; it can leave partial active state, overwrite global profile data, or implicitly reactivate a rejected record.
7. Privileged role/status, verification, attendance, plan, and membership actions do not share a complete immutable audit contract.

Treat these as reproducible findings, but inspect current definitions and create red tests before selecting the smallest reliable fixes.

## Required outcome

- Replace broad base-profile visibility with a deliberately minimal directory projection/RPC. Keep private fields self-only or limited to roles with a specific operational need. Never expose QR secrets/tokens through shared profile reads.
- Separate member/status administration from role assignment. Revoke direct role mutation and implement a PostgreSQL-owned, non-delegable hierarchy: no caller may promote themselves or grant authority at or above their own level. Former/disabled staff must lose access immediately, including through stale sessions.
- Enforce attendance tenant consistency with database constraints/keys and trusted RPCs. A member from Gym B must never be inserted, inferred, returned, or counted in Gym A. Prevent concurrent unintended open sessions and keep manual corrections/overrides attributable.
- Model verification transitions explicitly. Rejected, withdrawn, expired, pending, and approved states must not enter contradictory combinations; terminal decisions require an authorized new decision rather than self-reactivation.
- Remove one-time sign-in URLs, token hashes, and equivalent credentials from staff responses, database event details, logs, URLs, and analytics. Delivery happens server-side; staff receive only a truthful non-secret delivery/result state.
- Refactor onboarding into a preflighted, resumable workflow. Validate all permissions and business inputs before durable writes; do not overwrite an existing account's global profile from gym-entered data; do not implicitly reactivate rejected/disabled affiliation; represent partial external-email failure truthfully and allow safe retry without duplicate membership/payment/account state.
- Add an append-only privileged audit event contract containing actor, gym, action, target, before/after, timestamp, and reason/note where relevant. Ordinary gym staff cannot alter audit events, and attribution survives account disablement.
- Update all affected application queries/routes/types to consume the secured database contracts.

## Mandatory regression tests

Use real local PostgreSQL/Supabase execution for RLS, grants, constraints, functions, concurrency, and rollback. SQL-text regex tests are supplemental only.

At minimum prove:

1. A member cannot select another member's or staff member's private email, contact, QR, payment, or attendance data; authorized narrow directory data still works.
2. Owner/admin/staff/member sessions have the expected profile surface, and changing the active gym does not retain stale access.
3. Admin/staff cannot self-promote or grant equal/higher authority; authorized owner changes work; role/status changes take effect immediately for an already issued session.
4. A Gym A actor cannot create, read, update, count, or infer attendance for a Gym B member by changing any ID. Add a database-level tenant-consistency failure test.
5. Two simultaneous check-ins create at most one valid open attendance session.
6. Rejected/withdrawn/expired verification cannot self-reactivate; authorized transitions create immutable audit evidence.
7. No onboarding response/event/log contains a magic link, OTP, token, token hash, or reusable credential.
8. Injected failure at each onboarding stage leaves a documented, resumable state and never creates duplicate membership/payment rows or unauthorized active access on retry.
9. Direct table/API requests cannot bypass each new RPC/policy boundary.
10. Audit events are tenant-isolated, immutable to ordinary gym actors, and retain actor snapshots after disablement.

## Execution rules and definition of done

- Inspect the working tree and next migration number; use new forward migrations only. Never edit an applied migration.
- Preserve unrelated developer changes. Never commit, push, merge, rebase, tag, reset, or rewrite history.
- Do not apply a hosted migration, mutate production, send real email, enable paid infrastructure, or perform a restore without explicit approval.
- Use test-driven development and keep changes within Shot A. Prefer revoking unsafe broad access and adding a narrow contract over adding UI-only checks.
- Run focused tests while iterating, then clean database reset/seed, all relevant PostgreSQL suites, lint, typecheck, unit/integration coverage, production build, and practical E2E checks.
- Regenerate `lib/database.types.ts` and update `AgentsContextKnowledgeBase/ImplementationState.md`, `CHANGELOG.md`, package version if required, and Catalog entries for any new document.
- Leave changes uncommitted. In the final response, list exact migrations/files, each finding's expected versus new behavior, executable evidence, commands/results, and anything still blocked.

