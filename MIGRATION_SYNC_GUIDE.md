# Migration & Hosted Auth Sync Guide

The repository migration history is canonical. As verified on 2026-07-13, the linked hosted project and this repository are aligned at `001`, then `005` through `021`.

All schema changes go through `supabase/migrations/`; never edit schema in the dashboard. Hosted Auth configuration is a separate deployment concern and must also match the application contract.

## Before every deployment

1. Provide `SUPABASE_ACCESS_TOKEN` and, when the CLI cannot create temporary database access, `SUPABASE_DB_PASSWORD` through a secure local/CI environment.
2. Inspect history:

   ```bash
   npx supabase migration list --linked
   ```

3. Preview the exact pending files. `--include-all` is required while the new
   idempotent migration `000_bootstrap_prerequisites.sql` is not yet recorded
   remotely, because it sorts before the already-applied baseline:

   ```bash
   npx supabase db push --linked --dry-run --include-all
   ```

4. Confirm `npm run db:reset:clean`, `npm run db:types:check`, and
   `npm run db:invariants` pass from empty. Capture non-sensitive pre-apply
   counts and financial reconciliation, and verify the latest database and
   Storage backups. Apply only after the preview is expected and the user has
   explicitly approved the hosted mutation. Never add `--include-seed`:

   ```bash
   npx supabase db push --linked --include-all
   ```

5. Re-run the history check and the external runtime contract:

   ```bash
   npx supabase migration list --linked
   npm run verify:deployment
   ```

`verify:deployment` requires the project URL/ID, a publishable or anon key, and a server secret/service-role key so it can inspect the complete service-only schema snapshot. It never prints credentials or provider response bodies. Netlify and the production deploy job run this check before building.

The current complete contract requires a server secret and verifies Auth plus
all required migrations and application objects through migration 026,
including kiosk migrations 022-024 and the Shot 1 ledger/reconciliation
contract. A dedicated end-user account alone cannot inspect schema metadata.

## Failure and forward-repair procedure

- If a migration fails before commit, stop and preserve the exact error and
  migration history. Check for non-transactional statements, fix with a new
  idempotent migration, and replay on an isolated production-shaped copy. Do
  not mark the failed version applied to continue.
- If the migration committed but the application deployment failed, keep the
  committed schema. Retain/redeploy the prior application only if compatibility
  is proven, otherwise use maintenance mode while shipping a forward repair.
- Never promise a down migration or SQL rollback unless that exact path has
  been executed and reconciled. For suspected corruption, restore a verified
  backup into an isolated project and follow
  `docs/operations/BACKUP_AND_RECOVERY.md` before a production decision.

## History mismatch

Do not use `migration repair` merely to make the two columns line up.

1. Identify every remote-only migration.
2. Retrieve its recorded SQL through a read-only database or Management API query.
3. Compare it with the candidate local migration after normalizing comments and whitespace.
4. Only when the SQL is proven equivalent, mark the duplicate remote version reverted and the canonical local version applied.
5. Run `db push --dry-run` again before applying anything.

On 2026-07-13, remote version `20260701155422` was proven equivalent to local `013_fix_gym_membership_email_case.sql`; only then was history reconciled to `013`.

## Google OAuth

Google OAuth is Auth configuration, not a migration. The application sends browser sign-in through the existing PKCE callback at `/auth/callback`; `npm run verify:deployment` fails unless the hosted Auth settings report `external.google = true`.

Create a Google **Web application** client with the production JavaScript origin `https://stren.netlify.app` and the Supabase redirect URI `https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback`. For local development use `http://127.0.0.1:3000` and `http://127.0.0.1:54321/auth/v1/callback` respectively. Store its ID and secret only in the secure deployment environment, then patch the hosted project Auth configuration with `external_google_enabled`, `external_google_client_id`, and `external_google_secret` through `PATCH /v1/projects/{ref}/config/auth`.

Do not put the client secret in a `NEXT_PUBLIC_` variable or run `supabase config push` against production. Local `supabase/config.toml` intentionally reads `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` from the root `.env`; use the committed `.env.example` placeholders as the local template.

## Hosted email confirmation

The application requires email confirmation, so the hosted Auth setting must expose `mailer_autoconfirm = false`. Check this through:

```bash
npm run verify:deployment
```

Do not run `supabase config push` from the local `supabase/config.toml` against production: that file intentionally contains localhost development redirect URLs. Update only the required hosted Auth field through the Supabase Management API or maintain a separate reviewed production configuration.

Supabase's built-in mailer is suitable only for limited testing and is rate-limited. Configure custom SMTP before relying on confirmation or password-reset delivery at production volume.
