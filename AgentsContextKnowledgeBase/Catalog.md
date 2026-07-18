# Agents Context Knowledge Base — Catalog

**Every agent (Claude, Codex/GPT, or any other) reads this file first, every session.** It tells you what to read, in what order, and what you are obligated to keep updated. `CLAUDE.md` and `AGENTS.md` at the repo root both route here.

---

## Session-start reading order

1. **This file** — orientation + your update obligations.
2. [AboutProject.md](AboutProject.md) — what Stren is, mission, north star, product principles. Read once per session; internalize before making any product-facing decision.
3. [ImplementationState.md](ImplementationState.md) — what is shipped, in progress, and queued. Check before starting anything so you don't redo or collide.
4. [ImplementationPlan-ProductionSecurityAndFinancialClosure.md](ImplementationPlan-ProductionSecurityAndFinancialClosure.md) — the active two-shot closure contract for tenant security, privileged writes, financial/reporting correctness, database enforcement, and production recovery evidence.
5. [ImplementationPlan-FinancialIntegrityAndRecovery.md](ImplementationPlan-FinancialIntegrityAndRecovery.md) — the implementation record and architecture contract for the initial ledger/reporting and recovery shots.
6. [ImplementationPlan-AccountSessionRecovery.md](ImplementationPlan-AccountSessionRecovery.md) — the latest completed corrective contract for confirmed-session routing, fail-closed gym access, and profile recovery.
7. [../CLAUDE.md](../CLAUDE.md) — coding conventions, commands, test policy, branch rules. **Applies to ALL agents, not just Claude.**
8. [../CONTEXT.md](../CONTEXT.md) — the project vocabulary. Use these terms exactly; they are canonical.

---

## Core documents (this folder)

Active implementation plan: [ImplementationPlan-ProductionSecurityAndFinancialClosure.md](ImplementationPlan-ProductionSecurityAndFinancialClosure.md).

| File | What it is | Who updates it | Update trigger |
|---|---|---|---|
| `Catalog.md` | This index + the maintenance rules | Any agent | Any doc is added, moved, renamed, or goes stale |
| `ImplementationPlan-ProductionSecurityAndFinancialClosure.md` | **Active workstream**: two ordered closure shots for tenant/authorization safety followed by financial/reporting/database/recovery correctness | Implementing and reviewing agents | Finding status, sequencing, closure evidence, or launch-gate changes |
| `ImplementationPlan-FinancialIntegrityAndRecovery.md` | Initial financial-ledger/reporting and recovery implementation record; its unresolved production gate is carried by the active closure plan | Implementing agents | Underlying financial architecture or recovery-contract changes |
| `ImplementationPlan-GoogleOAuth.md` | In-progress supporting workstream: Google OAuth application contract, hosted Auth configuration, and verification | Implementing agent | Scope/configuration changes |
| `ImplementationPlan-AccountSessionRecovery.md` | **Latest completed plan**: browser-session post-auth routing and fail-closed account/profile recovery | Implementing agent | Scope/decision changes |
| `ImplementationPlan-MemberOnboardingRecovery.md` | **Latest completed plan**: bounded auth completion, secure recovery, useful no-gym home, saved gyms, membership verification | Implementing agent | Scope/decision changes |
| `AboutProject.md` | Mission, north star, audience, product principles, roadmap teasers | User-approved changes only — agents propose, never silently rewrite | Product direction changes |
| `ImplementationPlan-CohesiveAuthOwnerOnboarding.md` | **Latest completed plan**: cohesive `/auth`, membership-aware join routing, assisted owner onboarding, platform-only gym provisioning | Implementing agent | Scope/decision changes |
| `ImplementationPlan-UnifiedAccounts.md` | Completed plan: Unified Accounts & Auth Rebuild (shipped to `main` 2026-07-13 via `f04fb2f`) | — | Historical; do not extend |
| `ImplementationPlan.md` | Completed plan: Gym Page Studio + permissions & feature toggles (shipped to `main` 2026-07-11; kept per rule 6) | — | Historical; do not extend |
| `ImplementationState.md` | Live status of every phase and work unit | **The agent that ships the work, in the same PR** | Every merged PR |
| `prompts/` | Packaged, paste-ready prompts for implementation and independent review agents | Planning agent | When an active plan's implementation/review prompts change |
| `prompts/Codex-Production-Security-Tenant-Closure-OneShot.md` | Paste-ready Shot A prompt: profile privacy, role hierarchy, tenant-safe attendance, verification, onboarding credentials, and privileged audit | Planning/implementing agent | Shot A scope or verification changes |
| `prompts/Codex-Financial-Reporting-Recovery-Closure-OneShot.md` | Paste-ready Shot B prompt: legacy-payment closure, idempotency, dates/status, reports, CI/database constraints, deployment and recovery evidence | Planning/implementing agent | Shot B scope or verification changes |
| `prompts/Codex-Production-Readiness-Oversight.md` | Paste-ready independent audit prompt used after both closure shots are committed | Planning/reviewing agent | Audit method, evidence requirements, or launch labels change |
| `prompts/Codex-Financial-Integrity-Reports-OneShot.md` | Paste-ready Shot 1 prompt: ledger, atomic/idempotent money path, discounts, reporting and reconciliation | Planning/implementing agent | Shot 1 scope or verification changes |
| `prompts/Codex-Data-Recovery-Migrations-OneShot.md` | Paste-ready Shot 2 prompt: fresh migrations, deployment parity, backups and isolated restore | Planning/implementing agent | Shot 2 scope or recovery gates change |

## Root-level canonical documents

| File | What it is | Update trigger |
|---|---|---|
| `../CLAUDE.md` | Developer conventions (all agents) | Conventions change |
| `../AGENTS.md` | Router for non-Claude agents → this catalog + CLAUDE.md | Rarely |
| `../CONTEXT.md` | Vocabulary glossary (no implementation details ever) | A term is coined or sharpened |
| `../CHANGELOG.md` | **The only changelog.** Keep-a-Changelog format, entry per release/phase; every merged PR adds or extends an entry | Every merged PR |
| `../docs/adr/` | Architecture Decision Records — why load-bearing decisions were made | A hard-to-reverse, surprising, trade-off decision is made |
| `../docs/adr/0007-financial-ledger-separates-money-from-access.md` | Accepted decision: memberships grant access; append-only financial transactions own money and reporting | Financial ledger or correction semantics change |
| `../docs/operations/BACKUP_AND_RECOVERY.md` | Canonical database/Storage backup, monitoring, migration failure, isolated restore and reconciliation runbook | Backup policy, provider capability, restore procedure, ownership, RPO/RTO or recovery gate changes |

## Reference documents (read on demand only)

| File | Read when |
|---|---|
| `../docs/CACHING.md` | Touching `unstable_cache`, revalidation, public payload |
| `../docs/PERFORMANCE_PLAN.md` | Performance work |
| `../LOCAL_DEV.md` | Setting up / running locally |
| `../TESTING_PLAN.md` | Extending the test suite beyond the active plan |
| `../MIGRATION_SYNC_GUIDE.md` | Applying/syncing Supabase migrations |
| `../DB_STAFF_ONBOARDING_SQL_EDITOR_STEPS.md` | Staff onboarding data ops |
| `../TEST_WITHOUT_CRON.md`, `../CACHE-VERIFICATION.md` | The specific verification they describe |
| `../PHASE_2.5_SECURITY_HARDENING_STATUS.md` | Historical record of Phase 2.5 |
| `../PHASE_3_TO_7_DIAGNOSTIC_AND_PLAN.md` | Security-phase detail; its findings are already folded into `ImplementationPlan.md` §0 |

## Stale — do NOT trust (superseded; kept only as history)

| File | Why stale |
|---|---|
| `../OTP-AUTH-GUIDE.md` | Describes the pre-rebuild per-gym auth/OTP flows (per-gym login pages, login-origin cookies, `check_gym_membership`) — all deleted by the Unified Accounts workstream (migration 019 + auth rebuild). Superseded by `ImplementationPlan-UnifiedAccounts.md` §2 |
| `../STREN_GUIDE.md` | v0 scaffold README: mock auth, localStorage, wrong stack description. Superseded by `AboutProject.md` + `CLAUDE.md` |
| `../context-history.md` | Early rebrand-era project context. Superseded by `AboutProject.md` + `CONTEXT.md` |

(Recommend deleting both after user confirmation; until then this section is the quarantine.)

---

## Maintenance rules — how this system stays alive

These are obligations, not suggestions. A PR that violates them is not done.

1. **Before creating ANY new `.md`:** check this catalog. If an existing doc covers the topic, extend it. One source of truth per topic: plan → `ImplementationPlan.md` · status → `ImplementationState.md` · vocabulary → `CONTEXT.md` · history → `CHANGELOG.md` · decisions → `docs/adr/` · mission → `AboutProject.md`. Never restate status inside the plan, or plan details inside status.
2. **Every new doc gets a catalog row** in the same commit that creates it.
3. **Every merged PR updates `ImplementationState.md` and `CHANGELOG.md`** in that same PR.
4. **Found a stale doc?** Move it to the Stale table (same commit). Delete only with explicit user approval.
4a. **Default to one continuous Codex task for requested diagnosis and implementation.** Do not create GitHub issues, configure an issue tracker, or pause for issue-tracker setup unless the user explicitly asks. When user input is genuinely required, ask the smallest direct question in the current task and continue with safe in-scope work where possible.
5. **Renames/moves:** update every reference (grep for the old path) and the catalog row in the same commit.
5a. **Agents never commit or push — developers do, exclusively.** No agent runs `git commit`/`git push`/`git merge`/`git rebase` or rewrites history. "Same commit/PR" obligations in these rules mean: stage the related changes together in the working tree so the developer can commit them as one unit.
6. **When a workstream completes**, its plan stays in place marked "✅ Completed <date>" in its header, `ImplementationState.md` records the final state, and the next workstream gets a new plan file (e.g. `ImplementationPlan-<name>.md`) plus a catalog row — the newest plan is always the "active" one named in this catalog.
