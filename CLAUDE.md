# Stren — Developer Guide

This file is the authoritative reference for **conventions** (architecture rules, commands, testing, branching). Keep it up to date as the project evolves.

---

## ⚠ Read the knowledge base FIRST

Project context, mission, plans, and live status do **not** live in this file — they live in **`AgentsContextKnowledgeBase/`**. At the start of every session:

1. Read `AgentsContextKnowledgeBase/Catalog.md` — it indexes every document, the reading order, and your update obligations.
2. Check `AgentsContextKnowledgeBase/ImplementationState.md` before starting work; **update it (plus `CHANGELOG.md`) in the same PR that ships your work** — a PR without those updates is not done.
3. `CONTEXT.md` (repo root) is the vocabulary; `docs/adr/` records why load-bearing decisions were made.

These rules apply to **every** agent (Claude, Codex/GPT, or otherwise — `AGENTS.md` routes non-Claude agents here too).

---

## Project Overview

Stren is a gym management platform built with Next.js (App Router), Supabase, and TypeScript. It serves three user roles:

| Role | Entry | Primary area |
|------|-------|-------------|
| `owner` | `/gym/{code}/login` | `/admin` |
| `admin` / `staff` | `/gym/{code}/login` | `/admin` |
| `member` | `/gym/{code}/login` | `/member` |

The kiosk (`/kiosk`) is a staff-facing check-in terminal — requires `owner`/`admin`/`staff` auth.

---

## Architecture

- **Framework**: Next.js 15 App Router, TypeScript strict mode.
- **Database / Auth**: Supabase (Postgres + Row Level Security + Supabase Auth). All schema changes go through migration files in `supabase/migrations/` — never touch the dashboard directly.
- **Auth guard**: `middleware.ts` is the single auth guard. Layouts (`app/admin/layout.tsx`, `components/member/MemberShell.tsx`) handle chrome and loading states only — they do NOT redirect.
- **Server components**: Admin dashboard, reports, member home, and leaderboard are Server Components that fetch via `createServerSupabaseClient()`. Client islands handle mutations and real-time state.
- **Client auth state**: `lib/auth-context.tsx` — use `getUser()` everywhere, never `getSession()`.

---

## Database rules

- Every schema change must be a new file in `supabase/migrations/` following the `NNN_description.sql` naming pattern.
- Never run destructive SQL (`DROP`, `TRUNCATE`, `DELETE` without `WHERE`) without explicit user confirmation.
- Use `maybeSingle()` not `single()` for queries that may return no rows — avoids 406 errors.

---

## Commands

```bash
npm run dev              # local dev server
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm run test:unit        # Vitest unit + integration (once)
npm run test:unit:watch  # Vitest in watch mode (use during TDD red-green loop)
npm run test:e2e         # Playwright E2E
npm run test:ci          # full CI gate: lint → typecheck → unit → build → e2e
```

---

## Testing & Test-Driven Development

### Policy

**New features are built test-first.** Write a failing test that specifies the behavior, then write the minimum code to make it pass, then refactor. This is not optional for new feature work.

The red → green → refactor loop:
1. Write a test that fails for the right reason.
2. Write the simplest code that makes it pass.
3. Refactor for clarity — tests stay green throughout.

PRs adding new feature behavior must include tests written in the same change. The test should visibly drive the implementation: in branch history, the test commit comes before (or alongside) the implementation commit.

**Exception**: pure refactors and dead-weight removal (Phases 3–4 of remediation) may stay test-after, since they change structure not behavior. Use judgment — if a refactor changes a public API surface, write a test first.

### Test layers

| Layer | Runner | Location | Use for |
|-------|--------|----------|---------|
| Unit | Vitest + jsdom | `tests/unit/` | Pure functions, helpers, utilities |
| Integration | Vitest + jsdom | `tests/integration/` | Access-control logic, Supabase RPC flows, business rules |
| E2E | Playwright | `tests/e2e/` | Critical user journeys: login, checkout, signup, kiosk check-in |

**Reference patterns:**
- Integration: `tests/integration/gym-visibility.test.ts` — role-based access control logic
- E2E: `tests/e2e/admin-gym-preview.spec.ts` — login → navigate → assert

### Vitest config

`vitest.config.ts` includes `tests/unit/**` and `tests/integration/**`. E2E tests are excluded from Vitest (Playwright runs them separately). Shared mocks (`next/link`, `next/image`) live in `tests/setup/vitest.setup.tsx`.

### Money paths (payments, renewals, expiry)

Payment recording, renewal date math, and membership-expiry transitions are the highest-risk surfaces. Before modifying any of this logic, write integration tests that characterize current correct behavior and get them green. Then refactor against that safety net.

### CI gate

`.github/workflows/test-suite.yml` runs: lint → typecheck → unit/integration → build → E2E. All must pass before merge to `qa`.

---

## Branch & release conventions

- Feature branches target `qa`; `qa` merges to `main` after manual sign-off.
- Branch naming: `feat/`, `fix/`, `perf/`, `auth/`, `chore/`.
- Bump `package.json` version and add a `CHANGELOG.md` entry per phase/release.
- Never force-push to `main` or `qa`.

---

## Current work & status

Canonical, always-current status (remediation phases + the active workstream) lives in **`AgentsContextKnowledgeBase/ImplementationState.md`** — do not duplicate a status table here.

The active workstream (Gym Page Studio + permissions & feature toggles) is fully specified in **`AgentsContextKnowledgeBase/ImplementationPlan.md`**; security diagnostic detail remains in `PHASE_3_TO_7_DIAGNOSTIC_AND_PLAN.md`.
