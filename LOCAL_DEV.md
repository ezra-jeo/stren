# Local Development — Supabase Stack

Run the full app against a **local** Supabase instance (Postgres + Auth + Studio)
so testing never touches production data.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Docker Desktop** | Must be running before `npm run db:start` |
| **Node 18+** | Already required by the project |
| Supabase CLI | Bundled as `supabase` in `devDependencies` — no global install needed |

---

## First-time setup

```bash
# 1. Boot the local Supabase stack (pulls Docker images on first run — takes ~2 min)
npm run db:start

# 2. Print the local API URL and keys
npx supabase status
```

Copy the output values into a new `.env.local` file (use `.env.local.example` as
your template):

```bash
cp .env.local.example .env.local
# Then open .env.local and fill in the values from `npx supabase status`
```

The keys to copy:

| `.env.local` variable | `supabase status` label |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon key` |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role key` |

`NEXT_PUBLIC_APP_URL` is already `http://127.0.0.1:3000` in the example — leave it.

```bash
# 3. Apply all migrations + seed test data
npm run db:reset

# 4. Start the Next.js dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Seeded test accounts

All passwords: **`password123`**

| Email | Role | Gym |
|---|---|---|
| `owner@ironworks.test` | owner | Iron Works Gym (`IRONWORKS`) |
| `member1@ironworks.test` | member | Iron Works Gym |
| `member2@ironworks.test` | member | Iron Works Gym |
| `owner@pulsefit.test` | owner | Pulse Fitness Studio (`PULSEFIT`) |
| `member@pulsefit.test` | member | Pulse Fitness Studio |
| `orphan@nogym.test` | member | *(no gym — tests wrong-gym & reset-gate paths)* |

---

## Daily workflow

```bash
npm run db:start     # start containers (if not already running)
npm run db:status    # check that everything is up
npm run dev          # start Next.js

npm run db:reset     # re-apply all migrations + seed (wipes local data)
npm run db:stop      # shut down Docker containers
```

---

## Useful local URLs

| URL | Purpose |
|---|---|
| `http://127.0.0.1:3000` | Next.js app |
| `http://127.0.0.1:54321` | Supabase REST API |
| `http://127.0.0.1:54323` | Supabase Studio (table editor, SQL editor) |
| `http://127.0.0.1:54324` | Inbucket — catches all outbound emails (magic links, reset links) |

---

## Local vs production — how the switch works

The app reads `NEXT_PUBLIC_SUPABASE_URL` and related env vars at build/run time.

- **Local:** `.env.local` points to `http://127.0.0.1:54321` → all Supabase calls hit Docker.
- **Production:** `.env.local` absent → Next.js falls back to the real env vars set in Vercel/your hosting → calls go to the live project.

`.env.local` is gitignored. **No code changes are needed to switch between environments.**

---

## Applying migrations to production

Local resets (`npm run db:reset`) only affect your Docker DB. To push migrations
to the linked remote project:

```bash
npx supabase db push --linked
```

> ⚠️ This touches production. Only run it when you're ready to deploy a migration.
> Confirm the migration is correct locally first.
