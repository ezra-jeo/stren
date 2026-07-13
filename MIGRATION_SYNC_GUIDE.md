# Migration & Hosted Auth Sync Guide

The repository migration history is canonical. As verified on 2026-07-13, the linked hosted project and this repository are aligned at `001`, then `005` through `021`.

All schema changes go through `supabase/migrations/`; never edit schema in the dashboard. Hosted Auth configuration is a separate deployment concern and must also match the application contract.

## Before every deployment

1. Provide `SUPABASE_ACCESS_TOKEN` and, when the CLI cannot create temporary database access, `SUPABASE_DB_PASSWORD` through a secure local/CI environment.
2. Inspect history:

   ```bash
   npx supabase migration list --linked
   ```

3. Preview the exact pending files:

   ```bash
   npx supabase db push --linked --dry-run
   ```

4. Apply only after the preview is expected:

   ```bash
   npx supabase db push --linked
   ```

5. Re-run the history check and the external runtime contract:

   ```bash
   npx supabase migration list --linked
   npm run verify:deployment
   ```

`verify:deployment` requires the project URL/ID, a publishable or anon key, and either a server secret/service-role key or a dedicated deployment-check account. It never prints credentials or provider response bodies. Netlify and the production deploy job run this check before building.

## History mismatch

Do not use `migration repair` merely to make the two columns line up.

1. Identify every remote-only migration.
2. Retrieve its recorded SQL through a read-only database or Management API query.
3. Compare it with the candidate local migration after normalizing comments and whitespace.
4. Only when the SQL is proven equivalent, mark the duplicate remote version reverted and the canonical local version applied.
5. Run `db push --dry-run` again before applying anything.

On 2026-07-13, remote version `20260701155422` was proven equivalent to local `013_fix_gym_membership_email_case.sql`; only then was history reconciled to `013`.

## Hosted email confirmation

The application requires email confirmation, so the hosted Auth setting must expose `mailer_autoconfirm = false`. Check this through:

```bash
npm run verify:deployment
```

Do not run `supabase config push` from the local `supabase/config.toml` against production: that file intentionally contains localhost development redirect URLs. Update only the required hosted Auth field through the Supabase Management API or maintain a separate reviewed production configuration.

Supabase's built-in mailer is suitable only for limited testing and is rate-limited. Configure custom SMTP before relying on confirmation or password-reset delivery at production volume.
