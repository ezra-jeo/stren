# Shot 2 Prompt — Data Recovery, Backups & Migrations

Use **GPT Codex 5.6 Sol** with **high effort**. Use **xhigh effort** if credentials and approval are available for a real isolated hosted restore drill.

You are implementing Shot 2 of Stren's production-readiness remediation in `C:\Users\Zurax\Github.Repositories\stren`.

Read these completely before acting:

1. `AGENTS.md`
2. `AgentsContextKnowledgeBase/Catalog.md`
3. `AgentsContextKnowledgeBase/AboutProject.md`
4. `AgentsContextKnowledgeBase/ImplementationState.md`
5. `AgentsContextKnowledgeBase/ImplementationPlan-FinancialIntegrityAndRecovery.md`
6. `docs/adr/0007-financial-ledger-separates-money-from-access.md`
7. `CLAUDE.md`
8. `CONTEXT.md`
9. `MIGRATION_SYNC_GUIDE.md`

Confirm that Shot 1's immutable ledger, reconciliation contract, migrations and tests exist. Shot 2 depends on them. If they are absent or incomplete, report the concrete dependency instead of inventing a competing financial model.

Then implement **Shot 2 only: Production data resilience** from the plan. Work continuously through local artifacts and verification; do not stop at another proposal.

## Required outcome

Make Stren reproducible from an empty database, prove exact deployment parity, establish database and Storage backup coverage, and demonstrate recovery in an isolated environment with financial reconciliation.

The completed shot must include:

- a new earlier-sorting idempotent bootstrap-prerequisite migration that fixes migration 001's fresh-database ordering defect without editing migration 001 or losing hosted data;
- a current `supabase/seed.sql` using `gym_users`, `profiles.active_gym_id`, and current schema names, with an unmistakable development-only guard;
- clean Supabase reset/seed/type/invariant testing in CI from an empty environment;
- deployment verification covering every application-required migration/object through the current latest migration, including 022-024 and Shot 1—not only 019/021;
- safe migration comparison, preflight, post-apply, forward-repair and app-deploy-failure procedures;
- a cataloged `docs/operations/BACKUP_AND_RECOVERY.md` runbook;
- verifiable database backup/PITR retention and backup-age monitoring;
- separate backup of every Supabase Storage bucket containing member/gym assets;
- documented off-site destination, encryption/access, RPO/RTO, ownership and alerting;
- a restore-to-isolated-project procedure covering database, Auth, RLS/functions, Storage and manual configuration/secrets;
- an actual isolated restore drill when credentials and explicit approval are available;
- post-restore schema checks, two-gym RLS probes, Storage object/hash checks, and Shot 1 financial reconciliation;
- measured recovery point and recovery time with non-sensitive evidence.

## Mandatory execution rules

- Preserve unrelated working-tree changes.
- Never commit, push, merge, rebase, tag, or rewrite history.
- Never edit an applied migration; use new idempotent migrations.
- Never restore over production for testing.
- Never enable paid PITR, create paid infrastructure, change production retention, apply hosted migrations, or delete a disposable hosted project without explicit user approval.
- Do not print or commit secrets, tokens, member PII, database dumps, setup links, or backup contents.
- Database backup does not prove Storage backup. Verify both separately.
- Provider capability does not prove recoverability. Do not mark the shot complete without an isolated restore that passes reconciliation.
- Prefer forward repair. Do not promise rollback safety unless it has been executed and verified.
- Destructive commands require explicit scope validation and approval.

If hosted credentials, plan capability, budget, or an off-site Storage destination are unavailable, complete all safe local work and the exact runbook, then mark the external recovery gate blocked. Do not downgrade the definition of done or present an untested procedure as a completed restore.

## Required recovery targets

Document and verify, or explicitly flag for user approval:

- before real member PII: daily database and Storage backups, at least seven days retention, RTO no greater than four hours;
- before real payments: PITR or equivalent with an agreed RPO no greater than fifteen minutes;
- an isolated restore drill before launch and at least quarterly afterward.

## Tests and drills that must pass

1. A completely empty local database applies every migration and the current seed.
2. The clean schema matches generated types and required RLS/grant invariants.
3. Deployment verification fails when any required table, column, function/signature, policy contract, or schema version is absent.
4. Seed execution cannot be confused with production provisioning.
5. Backup-age monitoring detects missing/stale database and Storage backups.
6. An isolated restored database passes Auth/profile/gym-user counts, representative sign-in routing and two-gym RLS probes.
7. Restored ledger counts, signed totals, reversal balances, actor/plan snapshots and reconciliation match the source.
8. Restored memberships, attendance and audit records meet their constraints.
9. Restored Storage bucket/object counts and sampled hashes match the backup manifest.
10. The drill records actual newest recovered transaction time and elapsed restore time.

## Definition of done

- Every Shot 2 requirement and verification gate in `ImplementationPlan-FinancialIntegrityAndRecovery.md` is satisfied or an external approval dependency is explicitly marked blocked.
- Clean reset CI, lint, typecheck, build, full tests and deployment-contract tests pass.
- The backup/recovery runbook is complete, cataloged and executable by a developer other than its author.
- Isolated restore evidence contains no secrets or PII and includes Shot 1 reconciliation.
- Package version, `CHANGELOG.md`, `AgentsContextKnowledgeBase/Catalog.md`, and `ImplementationState.md` are updated in the working tree.
- The final response lists files, migrations, commands/tests, backup/restore evidence, actual RPO/RTO, external operations performed or not performed, and remaining launch blockers.
- Leave all changes uncommitted for the developer.

