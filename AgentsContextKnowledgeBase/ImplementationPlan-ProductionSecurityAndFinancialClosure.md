# Production Security & Financial Closure

**Status:** Shot A implemented and verified in the working tree on 2026-07-18; Shot B remains queued and must not begin until the developer reviews and commits Shot A.
**Audit source:** Post-implementation audit of commits `27a1113` and `b6e8f2f`, completed 2026-07-16.
**Launch boundary:** Synthetic internal testing only. Stren is not approved for a real-gym pilot or real payments.
**Recommended execution:** Shot A — GPT Codex 5.6 Sol, `xhigh`; Shot B — GPT Codex 5.6 Sol, `xhigh`; independent gate review — GPT 5.6 Terra, `xhigh`.
**Prompts:** [Shot A](prompts/Codex-Production-Security-Tenant-Closure-OneShot.md) · [Shot B](prompts/Codex-Financial-Reporting-Recovery-Closure-OneShot.md) · [Gate review](prompts/Codex-Production-Readiness-Oversight.md)

## 1. Why this is a new workstream

The financial-ledger and recovery work in migrations 025 and 026 is substantial: it establishes an append-only ledger, server-owned financial RPCs, snapshotting, reconciliation, local clean bootstrap, and an isolated local restore. A hostile database-behavior review nevertheless found production blockers in older policies and in edge cases around the new contracts. A passing UI response or unit test is not sufficient evidence for these workflows.

This plan supersedes `ImplementationPlan-FinancialIntegrityAndRecovery.md` as the active plan. That earlier document remains the implementation record and architecture contract for the initial two shots. This closure plan owns the unresolved production gate.

The two shots are deliberately sequential. Shot A changes tenant, role, attendance, verification, and onboarding boundaries. Shot B then builds financial/reporting constraints, fixtures, deployment verification, and recovery evidence against that secured schema. Do not run the shots concurrently; both may need new migrations, regenerated types, database fixtures, and CI changes.

## 2. Audit baseline and open findings

### Critical

1. **Same-gym profile disclosure.** The broad `profiles_select` policy created through migration 019 allows a member sharing any active gym to read full profile rows, including staff/owner email and reusable QR material. Public-directory data must be exposed through a deliberately narrow projection or RPC, while private profile fields remain self/authorized-staff only.
2. **Role self-escalation.** The migration-019 `gym_users_update` boundary accepts `members:manage` for updates that include `role`; an admin can promote a member to admin. Role assignment must use a separate, non-delegable server boundary that prevents callers from granting authority at or above their own level.
3. **Cross-gym attendance injection and disclosure.** Attendance policies from migration 011 and dashboard logic do not prove that the attendance member belongs to the attendance gym. A Gym A admin was able to insert a Gym B member ID and cause Gym B identity data to appear in Gym A's dashboard. Tenant consistency must be a database invariant, not an application convention.
4. **Rejected membership verification can be reactivated.** `verify_gym_membership` in migration 021 permits a rejected gym user with historical membership evidence to return to an active state. Terminal and allowed verification transitions must be explicit, permissioned, and auditable.
5. **One-time credential exposure.** The onboarding route generates and returns a magic sign-in URL and records it in an event surface readable by managers. One-time tokens/URLs must never be returned to staff clients, persisted in application tables, or logged.
6. **Production recovery is unproven.** Hosted deployment verification lacks the expected snapshot RPC/evidence; approved off-site retention, PITR/equivalent, hosted configuration recreation, and an isolated hosted restore remain unverified. This is an operational Critical until evidence exists; no prompt authorizes a hosted mutation or paid service without explicit approval.

### High

1. **Legacy payment writes remain open.** Authenticated insert/update/delete on `payments` still succeeds, including negative values. The cutover did not close every older grant/policy.
2. **Idempotency fingerprints are incomplete.** At least the reversal path accepts a repeated key with materially different amount/reason/revoke intent and returns the first result as if the second request matched. Every idempotent RPC must compare a canonical request fingerprint and reject mismatched reuse.
3. **Membership duration is off by one.** `start_date + duration_days` combined with inclusive entitlement grants 31 calendar days for a 30-day plan. The date contract and treatment of existing future periods must be explicit.
4. **Report membership buckets disagree with access.** Active counts can include rejected gym users; historical cancellation can suppress a currently expired membership and inflate cancellation counts. One effective-status contract must drive access, dashboard, reports, and export boundaries.
5. **Onboarding is a partial-write saga without safe resumption.** Account/profile/gym affiliation can be created or reactivated before payment fails, and the route can overwrite global profile data. Preflight, transition control, resumability, and truthful result states are required.
6. **Critical PostgreSQL tests are not reliably in CI.** The current financial fixture collides with the recovery seed, and the CI path does not prove all financial database suites execute. Tests must run from a clean, production-shaped database using unique or dynamically generated fixture identities.
7. **Reporting failures become plausible zeroes.** Admin dashboard/report pages silently replace query errors with zero-valued business data. Failures must be visible and must not masquerade as reconciled totals.
8. **Privileged non-financial changes lack a general immutable audit trail.** Role/status changes, attendance correction/override, plan archival, verification decisions, and membership access changes need actor, gym, target, before/after, timestamp, and reason where relevant.

### Medium follow-ups

- Membership overlap prevention is trigger/locking based rather than a database exclusion constraint that closes every concurrent/direct-write path.
- The development seed guard accepts addresses in ranges that can represent non-local infrastructure; it must use an explicit opt-in and allowlisted project identity.
- Deployment verification checks several object names but not enough normalized definitions/behavior to detect policy or function drift.

## 3. Shot A — security, tenant, and privileged-write closure

Shot A owns Critical findings 1–5, High findings 5 and 8, and the authorization portion of the audit. Its required vertical slice is:

- replace broad profile-row visibility with a minimal public/member directory surface and explicit private-profile authorization;
- split gym-user status/member administration from role assignment, revoke direct role mutation, and enforce a non-delegable role hierarchy in PostgreSQL;
- add tenant-consistent attendance keys/constraints and trusted check-in/correction boundaries; prevent cross-gym member IDs and unintended multiple open sessions;
- make verification transitions an explicit state machine with rejected/withdrawn/expired handling and immutable decisions;
- remove one-time sign-in URLs/tokens from responses, event records, logs, analytics, and manager-readable surfaces;
- make member onboarding preflighted and resumable, with no unsafe global profile overwrite or implicit rejected-user reactivation;
- add an append-only privileged-action audit trail for the actions within this shot and establish a reusable contract for Shot B;
- add real PostgreSQL/Supabase tests using at least two gyms and representative owner/admin/staff/member sessions.

The smallest reliable fix is preferred, but revoking a broad base-table policy and introducing a safe projection/RPC is smaller than trying to enumerate sensitive columns in every caller. Existing historical rows must be migrated forward without deleting financial, membership, attendance, verification, or onboarding evidence.

## 4. Shot B — financial, reporting, database, and recovery closure

Shot B starts only after Shot A is committed by the developer and the working tree is clean. It owns Critical finding 6, High findings 1–4, 6–7, and the Medium database/operations follow-ups:

- revoke every authenticated legacy `payments` write path and prove the legacy table is read-only except for an explicitly privileged migration/recovery context;
- persist and compare canonical request fingerprints for payment, reversal, adjustment, onboarding, and other financial idempotency keys;
- fix the paid-period date contract and provide a documented, non-destructive migration decision for existing/future membership rows;
- define one Manila-time effective membership/access status and use it consistently in access decisions, dashboard counts, reports, and exports;
- make reporting errors explicit and distinguish unavailable data from a genuine zero;
- add database constraints for monetary ranges, tenant relationships, role/state transitions, and concurrency-safe paid-period overlap where compatible with historical data;
- repair financial database fixtures and make all critical PostgreSQL behavior/concurrency suites mandatory in CI;
- harden the development seed guard and deployment contract so function, policy, grant, constraint, and trigger drift is detected by definition or behavior;
- produce exact backup/restore artifacts and reconciliation evidence locally, then leave hosted retention/PITR/restore steps blocked until the user separately approves credentials, budget, and external mutations.

## 5. Cross-shot non-negotiable contracts

- Every schema change is a new migration using the next available number. Never edit an applied migration.
- The database is the final authorization and integrity boundary. UI hiding and TypeScript validation are supplemental only.
- Critical invariants require executable PostgreSQL/Supabase tests. Regex tests over SQL text do not count.
- Tests are written red-first where practical, then made green. Every Critical/High finding receives a regression test.
- Multi-row financial/access operations are atomic; retries are idempotent; same-key/different-intent reuse fails visibly.
- Historical financial, membership, attendance, actor, plan, and audit meaning is retained. Corrections append; they do not erase.
- Tests must cover two gyms, direct API/RPC calls, stale sessions, repeated requests, concurrent requests, and rollback after injected failure where applicable.
- No hosted migration, production mutation, paid infrastructure change, restore, commit, push, merge, rebase, or history rewrite is authorized.
- Each shot updates generated database types, package version when required by repository convention, `ImplementationState.md`, and `CHANGELOG.md` in the same working tree.

## 6. Production gate and acceptance evidence

After both shots, an independent reviewer must inspect the exact diffs after `b6e8f2f`, reset a clean local database, execute all unit/integration/build/database/concurrency checks, and rerun adversarial probes for every finding above. The reviewer must verify database state and authorization outcomes, not merely response status.

Stren may advance beyond synthetic internal testing only when:

1. every Critical and High code finding has an executable passing regression;
2. no direct authenticated legacy payment, role, tenant-crossing attendance, or credential-disclosure path remains;
3. access, reporting, and exports agree on membership status and Manila boundaries;
4. financial reconciliation is exact after retries, reversals, restore, and historical changes;
5. the full CI gate, clean migration bootstrap, deployment contract, and isolated restore pass;
6. hosted recovery evidence is either completed with explicit approval or the launch recommendation remains no higher than an internal/non-payment environment whose data can be discarded.
