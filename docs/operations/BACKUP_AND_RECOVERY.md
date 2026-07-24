# Backup and Recovery

This is Stren's canonical recovery runbook. It covers PostgreSQL (including Auth and Storage metadata), Supabase Storage object bytes, configuration, verification, and financial reconciliation. A database backup is not a Storage backup, and a listed backup is not accepted as recoverable until an isolated restore passes this runbook.

## Safety boundary

- Never test a restore over production.
- Never run `supabase db push`, restore a hosted project, enable PITR, change retention, create paid infrastructure, or delete a hosted recovery project without explicit user approval.
- Never use `--include-seed` against a hosted database. `supabase/seed.sql` is development-only and aborts outside the local container marker.
- Never print or commit access tokens, database URLs, service-role keys, member data, dumps, object manifests, setup links, or backup contents.
- Validate the target project reference twice before a destructive restore. The restore scripts additionally require `RECOVERY_TARGET_CONFIRM=ISOLATED_NON_PRODUCTION` and reject a target URL equal to the source URL.
- Prefer forward repair. Stren has no tested general-purpose down-migration path; do not describe SQL rollback as safe.

## Recovery targets and launch gates

| Gate | Required control | Target |
|---|---|---|
| Before real member PII | Database and every Storage bucket backed up daily, encrypted off-site, retained at least seven days | Recovery Point Objective (RPO) at most 24 hours; Recovery Time Objective (RTO) at most 4 hours |
| Before real payments | PITR or an explicitly approved equivalent | RPO at most 15 minutes; RTO at most 4 hours |
| Before launch and quarterly | Isolated hosted restore including database, Auth, RLS/functions, Storage and financial reconciliation | All validation gates below pass |

The committed policy is `config/backup-policy.json`. It intentionally requires the payment PITR gate; monitoring must fail rather than silently downgrade it.

## Ownership and secure configuration

- Accountable owner: the Stren product owner.
- Backup operator: the developer/on-call person assigned to the daily backup workflow and quarterly drill.
- Incident commander: the product owner unless delegated in the incident decision log.
- Production identity: read `SUPABASE_PROJECT_ID` and region from the approved deployment environment/Dashboard at run time. Do not write the project reference, organization ID, or connection string into this repository.
- Required secure values: Supabase Management API token, direct database URL, project URL, service-role/server secret, off-site S3-compatible bucket/prefix, restricted destination credentials, region/endpoint, and backup encryption passphrase.
- Store secrets only in the approved GitHub Actions or operator secret store. The encryption key must be separate from the off-site bucket credentials and available to two authorized people.

The off-site destination must be outside the Supabase project and support server-side encryption, access logging, versioning/object lock where available, and a lifecycle retaining at least seven daily generations. Grant the backup identity write/list access only to the Stren prefix; grant restore access only during a drill or incident. Choosing or creating that destination requires user approval.

## Daily backup and monitoring

`.github/workflows/backup-and-monitor.yml` runs at 01:15 Asia/Manila and can also be dispatched manually. It:

1. Exports database roles, schema, and data (including `public`, `auth`, and `storage` metadata) with the Supabase CLI.
2. Enumerates every Storage bucket, downloads every object separately, and records byte length plus SHA-256 in an encrypted manifest.
3. Creates separate database and Storage archives, encrypts each with AES-256-CBC/PBKDF2, and uploads only encrypted archives to the approved off-site destination.
4. Lists retained off-site generations and queries the Supabase database-backup/PITR Management API.
5. Publishes a non-sensitive status file and fails on a missing/stale database or Storage backup, less than seven days of retained history, an uncovered required bucket, disabled PITR, or a recovery point older than fifteen minutes.

GitHub Actions failure notifications are the first alert path; the backup operator must route them to the repository's monitored owner/on-call channel. A failed or missing scheduled run is an incident, not a warning to ignore. Run locally against already-downloaded non-sensitive status with:

```text
npm run backup:check -- <status-file>
```

Provider backups cover the database, not Storage object bytes. Supabase documents this distinction; the Storage export is mandatory even when daily database backup or PITR is enabled.

## Migration and deployment procedure

### Read-only comparison and preflight

From the reviewed release revision, load credentials without echoing them, then run:

```text
npx supabase migration list --linked
npx supabase db push --linked --dry-run --include-all
```

`--include-all` is required because migration `000_bootstrap_prerequisites.sql` sorts before already-recorded hosted migrations. The dry run must list only reviewed, expected files. Do not use `migration repair` to make columns visually align. For any remote-only version, retrieve its SQL read-only, normalize comments/whitespace, and prove equivalence before changing history.

Before approval to apply:

1. Confirm a fresh local `npm run db:reset:clean`, `npm run db:types:check`, and `npm run db:invariants` pass.
2. Record non-sensitive source counts and financial reconciliation.
3. Confirm a fresh database/Storage backup and acceptable latest recovery point.
4. Confirm the application revision expects migration 029 and no seed option is present.

### Apply and post-apply

Only after explicit approval:

```text
npx supabase db push --linked --include-all
npx supabase migration list --linked
npm run verify:deployment
```

Then run owner financial reconciliation for every gym and compare counts/totals to the preflight evidence before deploying the application. `verify:deployment` requires a server secret and checks Auth configuration, every required migration, critical tables/columns, exact RPC signatures, RLS policies, grants, financial constraints/triggers, and the `gym-assets` bucket.

### Failure handling

- Failure before the migration transaction commits: stop. Preserve the exact error and migration history, inspect whether any non-transactional statement ran, fix with a new idempotent forward migration, and repeat on an isolated production-shaped copy. Never mark the failed version applied merely to continue.
- Migration committed but application deployment failed: leave the committed schema in place. If the prior application is proven compatible, keep/redeploy it while preparing a forward application or migration repair. Otherwise enter maintenance mode. Re-run the deployment contract and reconciliation after the repair.
- Suspected corruption or incompatible committed change: do not improvise a down migration. Restore the latest verified backup into an isolated project, prove the recovery point, and obtain an incident decision before any production restore.

## Isolated restore drill

### 1. Authorization and evidence clock

Record incident/drill ID, approver, source project reference (in the private incident log), target project reference, requested recovery point, operator, and UTC start time. Hosted project creation, paid clone/restore, PITR enablement, and later deletion each require explicit approval.

Capture read-only source evidence immediately before the backup/restore without retaining PII:

- Auth user, profile, gym-user, membership, attendance, onboarding-audit, privileged-audit, ledger, and idempotency-request counts;
- newest `financial_transactions.occurred_at`;
- per-gym payment/refund/void/adjustment/net totals, reversal remaining balances, missing links, actor/plan snapshot completeness, and `financial_reconciliation` output;
- non-sensitive SHA-256 digests of Auth identities, exact financial snapshots, idempotency intent records, membership periods, both audit streams, and protected database definitions;
- Storage bucket/object counts, manifest digest, and sampled SHA-256 values.

### 2. Provision the target

Create a disposable Supabase project in the approved region and organization with no production custom domain, outbound mail, webhooks, cron, or real payment integration. Label it recovery-only. Confirm the target URL is different from production before continuing.

### 3. Restore the database

Prefer the provider's supported restore/duplicate-to-new-project path. For the encrypted logical export, decrypt only on the controlled runner, restore roles/schema/data in that order, and keep the plaintext only in its scoped temporary directory. Restore must include `auth.users`, `public.profiles`, `public.gym_users`, migrations, ledger, memberships, attendance, audit data, Storage bucket/object metadata, functions, policies, grants, and triggers.

The exercised local logical-restore contract uses a unique, version-matched Supabase target, applies the repository migrations with seed disabled, then restores a custom-format archive containing the durable `public`, `auth`, `storage`, and `supabase_migrations` schemas plus Stren's `pg_trgm`, `uuid-ossp`, `pgcrypto`, and `btree_gist` extensions. Object ownership is preserved. Supabase Realtime messages and generated GraphQL APIs are intentionally not backup payloads: the target platform provisions them, and Realtime messages are transient. The archive is restored by the isolated target's matching PostgreSQL client rather than an arbitrary workstation client.

Do not assume custom role passwords, project secrets, or hosted Auth settings are present in a database dump. Physical daily backups may also be non-downloadable; the operator must follow the currently supported Supabase restore path.

### 4. Restore Storage bytes separately

After the target database is available, decrypt the Storage archive and set only isolated-target variables:

```text
RECOVERY_TARGET_CONFIRM=ISOLATED_NON_PRODUCTION
SOURCE_SUPABASE_URL=<source-url>
RECOVERY_TARGET_SUPABASE_URL=<different-target-url>
RECOVERY_TARGET_SERVICE_ROLE_KEY=<target-secret>
STORAGE_BACKUP_MANIFEST=<decrypted-manifest-path>
npm run restore:storage
npm run verify:storage-restore
```

The exporter covers every bucket returned by Storage, not just `gym-assets`. The verifier compares every bucket/object count and a deterministic sample of up to 25 object hashes. For a small backup, sample all objects.

### 5. Recreate configuration that is not in the database

- Auth site URL and exact redirect allow-list;
- email confirmation, custom SMTP, templates and rate limits;
- Google OAuth client ID/secret and callback registration;
- project API/server keys and application secret rotation;
- Edge Function secrets, cron schedules, webhooks and external integrations;
- Storage CORS/public-bucket settings and any S3 credentials;
- Netlify/environment variables, domain/DNS and monitoring destinations.

Keep outbound email, webhooks, cron and production integrations disabled in the isolated target unless the drill specifically approves safe test endpoints.

### 6. Mandatory validation

1. Run the complete migration/object deployment contract and regenerate/check TypeScript database types. For migration 029, also verify the platform provisioning fingerprint/resume rows, private-by-default gyms, owner-only claim invites, invite lifecycle states, and the absence of raw claim credentials from results, audit state, and recovery evidence.
2. Compare Auth/profile/gym-user counts and sign in with representative owner/admin/staff/member recovery accounts; verify expected `/admin`, `/member`, and no-gym routing.
3. Probe at least two gyms under actual user JWTs. Each role must see only permitted rows; cross-gym ledger, membership, attendance, profile and Storage access must fail closed.
4. Compare ledger row counts and signed totals by kind/gym, remaining reversal balances, exact/reconstructed snapshot counts, missing membership links, actor/plan snapshot completeness, and every gym's Shot 1 `financial_reconciliation` output to source evidence.
5. Verify memberships do not overlap incorrectly, restored attendance timestamps are ordered, and audit foreign keys/counts match.
6. Compare every Storage bucket/object count, the encrypted manifest digest, and sampled content SHA-256 values.
7. Record the newest source transaction timestamp, newest recovered transaction timestamp, restore completion UTC time, and any manual configuration still absent.

RPO is the difference between the newest committed source transaction at backup/incident time and the newest recovered transaction. RTO is elapsed time from the recorded drill start to all mandatory validation passing—not merely database availability.

### 7. Decision and cleanup

Recovery is accepted only if every comparison passes and RPO/RTO meet the signed target. A real production restore requires a separate explicit decision documenting selected recovery point, expected data loss, downtime, customer communication, owner approval, and rollback/forward-repair choice. Delete a disposable hosted project only after evidence is retained and explicit deletion approval is recorded.

### Local executable drill

With the source local Supabase stack running, execute:

```text
npm run recovery:drill:local
```

The command refuses non-loopback databases, creates a timestamp-unique target with source-matched PostgreSQL/Auth/Storage versions, disables seed and the network-dependent Edge Runtime only in that disposable target, copies and applies every repository migration, performs the durable database and every-bucket Storage restore, and stops without deleting the target. It checks generated types, the full deployment snapshot, two-gym RLS, source/target aggregate evidence, actual `financial_reconciliation`, Storage counts/hashes, and live Auth sign-in/routing for all seven development-only role fixtures. Edge Functions, hosted Auth redirects/SMTP/OAuth, secrets, cron, webhooks, DNS, and production integrations still require the manual hosted steps above.

The successful 2026-07-16 evidence-v1 local drill recorded:

- source and target counts matched: 7 Auth users, 7 profiles, 6 gym-user rows, 2 memberships, 2 attendance rows, 1 onboarding audit event, and 2 ledger events;
- both gyms had zero missing links, impossible reversals, or incomplete actor/plan snapshots; reconciliation net totals were PHP 800 and PHP 900;
- all seven owner/admin/staff/member/no-gym fixtures signed in and resolved to the expected `/admin`, `/member`, or `/gyms` route;
- one Storage bucket and one synthetic object matched by object count and SHA-256;
- newest source and recovered financial transaction timestamps were identical (`2026-07-16T10:15:08.538856Z`), for measured RPO 0.00 minutes;
- all validation passed in 1.95 minutes measured RTO, and the isolated target was stopped but retained for evidence.

Shot B upgrades this to evidence format v2 and explicitly archives `btree_gist`. The 2026-07-23 v2 isolated local drill passed:

- source and target counts matched: 7 Auth users, 7 profiles, 6 gym-user rows, 2 memberships, 2 attendance rows, 1 onboarding audit event, 6 privileged-audit events, 2 ledger events, and 2 financial idempotency records;
- Auth identity, financial snapshot, idempotency, membership, audit, and protected-definition hashes matched exactly through migration 028;
- both gyms reconciled at PHP 800 and PHP 900 with zero invalid links, reversals, snapshots, attendance, audit references, or overlapping paid periods;
- one Storage bucket and one synthetic object matched by count and SHA-256;
- newest source and recovered financial transaction timestamps were identical (`2026-07-23T15:34:17.468277Z`), for measured RPO 0.00 minutes;
- all validation passed in 1.27 minutes measured RTO, and the isolated target was stopped but retained for evidence.

## Evidence template

Store only non-sensitive evidence in the approved incident record:

```text
Drill/incident:
Operator and approver:
Source and isolated target references (private record):
Start UTC / validation-pass UTC:
Backup generation and provider recovery point:
Newest source transaction / newest recovered transaction:
Actual RPO / actual RTO:
Auth/profile/gym-user counts match:
Two-gym role/RLS probes:
Ledger counts/signed totals/reversal balances/snapshot and idempotency digests:
financial_reconciliation match:
Membership/attendance/onboarding-audit/privileged-audit checks and digests:
Storage bucket/object counts and sampled hashes:
Manual configuration recreated or still missing:
External operations performed:
Result and remaining blockers:
```

## Current gate

The repository is intended to bootstrap from empty through migration 030. The Phase 3 local schema reset, guarded seed, generated-type check, deployment contract, drift rollback probe, and database invariant/security/financial suites pass through migration 030. The clean-reset wrapper did not complete its seed phase without a separately guarded local seed, and the migration-030 isolated recovery drill was not performed after required escalation was rejected. Existing evidence-v2 proves isolated local database/Auth/Storage restore through migration 028; it does not prove recovery of migrations 029/030. Production backup retention, the off-site destination, PITR capability, hosted manual configuration, and a full isolated hosted restore remain unverified until credentials, budget, and explicit approval are supplied. The production launch/recovery gate remains blocked; local evidence does not establish hosted recoverability.
