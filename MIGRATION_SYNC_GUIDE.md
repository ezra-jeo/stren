# Migration Sync Guide

This repo currently has:
- Remote applied: `001` to `004`
- Local pending: `005` to `009`

## Recommended path (safe, no history rewrite)

1. Verify drift:

```bash
npx supabase migration list --linked
```

2. Apply pending local migrations to remote:

```bash
npx supabase db push --linked
```

3. Verify both local and remote are aligned:

```bash
npx supabase migration list --linked
```

Expected result: `001` to `009` appear in both Local and Remote columns.

## If `db push` fails

1. Confirm your branch has latest migrations from repo.
2. Re-run:

```bash
npx supabase migration list --linked
```

3. If remote already has equivalent manual changes and only migration history is missing, mark specific versions as applied (history repair only, no SQL execution):

```bash
npx supabase migration repair --status applied 005
npx supabase migration repair --status applied 006
npx supabase migration repair --status applied 007
npx supabase migration repair --status applied 008
npx supabase migration repair --status applied 009
```

Only use repair when you are sure the remote schema already matches those migrations.

## Ongoing best practices

- Keep unique sequential migration versions (no duplicate numbers).
- Do not edit old applied migration files.
- Add new schema changes as a new migration only.
- Before release, always run:

```bash
npx supabase migration list --linked
```

- Optional drift check (requires Docker Desktop):

```bash
npx supabase db diff --linked --schema public
```
