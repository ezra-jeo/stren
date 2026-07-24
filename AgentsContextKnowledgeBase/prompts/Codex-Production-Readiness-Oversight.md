# Oversight Prompt — Independent Production-Readiness Gate Review

Use **GPT 5.6 Terra** with **xhigh effort** for an independent audit. If the task is expanded to implementing fixes in the same chat, switch to **GPT Codex 5.6 Sol** with **xhigh effort**.

You are the independent production-readiness reviewer for Stren in `C:\Users\Zurax\Github.Repositories\stren`. The developer has run the two production-closure implementation prompts in separate, sequential chats and committed both results. Your first job is to audit them, not to assume their summaries are correct and not to implement new fixes unless the user explicitly asks after seeing the audit.

Read completely:

1. `AGENTS.md`
2. `AgentsContextKnowledgeBase/Catalog.md`
3. `AgentsContextKnowledgeBase/AboutProject.md`
4. `AgentsContextKnowledgeBase/ImplementationState.md`
5. `AgentsContextKnowledgeBase/ImplementationPlan-ProductionSecurityAndFinancialClosure.md`
6. `AgentsContextKnowledgeBase/ImplementationPlan-FinancialIntegrityAndRecovery.md`
7. `AgentsContextKnowledgeBase/prompts/Codex-Production-Security-Tenant-Closure-OneShot.md`
8. `AgentsContextKnowledgeBase/prompts/Codex-Financial-Reporting-Recovery-Closure-OneShot.md`
9. `docs/adr/0007-financial-ledger-separates-money-from-access.md`
10. `docs/operations/BACKUP_AND_RECOVERY.md`
11. `CLAUDE.md`
12. `CONTEXT.md`

If available, also read `C:\tmp\stren-production-readiness-audit-handoff.md`. Treat it as a navigation handoff; the repository plan and current code are authoritative.

## Audit method

1. Confirm the working tree/branch and identify every commit after baseline `b6e8f2f`; review the complete diffs, including migrations, routes, generated types, tests, CI, runbooks, and knowledge-base claims.
2. Build a finding-to-fix matrix for every Critical, High, and Medium item in the active plan. A code change or frontend success is not closure evidence by itself.
3. Reset a clean local Supabase database and inspect the effective schema after the full migration chain. Verify grants, RLS, policies, functions, triggers, constraints, indexes, and seeded relationships.
4. Execute the full quality gate and every financial/security PostgreSQL suite. Confirm CI actually invokes those suites. Report timeouts or skipped/gated tests as unverified, not passed.
5. Independently run adversarial database/API probes using at least two gyms and representative owner/admin/staff/member identities. Cover ID tampering, stale sessions, direct table writes, role escalation, private-profile reads, cross-gym attendance, verification reactivation, credential leakage, duplicate/retried/different-intent requests, concurrency, rollback, date boundaries, report/access parity, and historical immutability.
6. Inspect durable state after each probe: ledger, membership, payment, attendance, gym-user, audit, onboarding/verification, and report results. Roll synthetic probes back or use disposable local data.
7. Run deployment drift checks and an isolated local database/Auth/Storage restore with reconciliation. Hosted checks may be read-only if credentials already exist; do not apply migrations, change configuration, enable paid services, or restore/mutate a hosted project without explicit approval.
8. Look for regressions outside the named findings where the new policies/RPCs changed public, staff, member, onboarding, kiosk, reporting, or recovery workflows.

## Required output

Lead with an evidence-based launch verdict:

- Not ready
- Ready for an internal test only
- Ready for a controlled pilot without real payments
- Ready for a controlled pilot with real payments

Then provide:

1. an executive summary;
2. a table of all remaining Critical and High findings;
3. a finding-by-finding closure matrix with expected behavior, current behavior, exact files/functions/tables/policies, severity, reproducible test, smallest reliable fix, and automated-test coverage;
4. verification commands and exact outcomes, distinguishing pass/fail/timeout/skipped/external-blocked;
5. missing regression tests and database constraints/migrations;
6. remaining authorization and historical-integrity risks;
7. recovery evidence and unproven operational assumptions;
8. a prioritized remediation list: before any real gym, before real payments, during pilot, deferable.

Update `AgentsContextKnowledgeBase/ImplementationState.md`, the active plan status, and `CHANGELOG.md` only with verified audit evidence, keeping changes uncommitted for the developer. Do not weaken or remove a launch gate merely because an implementation chat claimed completion.

