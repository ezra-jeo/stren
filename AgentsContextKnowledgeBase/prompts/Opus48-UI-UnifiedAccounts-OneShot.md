# One-shot prompt — Claude Opus 4.8 — Unified Accounts UI/UX (Agent U, units U1–U3)

_Packaged from `AgentsContextKnowledgeBase/ImplementationPlan-UnifiedAccounts.md` (the plan wins on divergence). Recommended launch: **Claude Opus 4.8, effort high, extended thinking on**. Launch only after Agent C's backend (units C1–C3) is on branch `auth/unified-accounts` and reviewed. Paste everything below the line._

---

You are building the **entire UI/UX half** of Stren's "Unified Accounts & Auth Rebuild" workstream. You are Agent U. The backend (Agent C, Codex 5.6 Sol) is already on this branch: schema, RLS, middleware, server actions, a rebuilt `lib/auth-context.tsx`, and **minimal unstyled-but-functional** `/login`, `/signup`, `/gyms`, `/gyms/new` pages marked `TODO(U)`. Your job: replace their markup with the real experience — **handlers and server-action calls verbatim** — and add the gym switcher to both shells. Every design decision is already made; execute the spec.

**Grill-session amendments (2026-07-11) — already folded into the plan, binding:** the switcher menu includes **"Member view" / "Admin view"** entries (managers are members too — plan §2.1); U2 additionally ships the **printable join-QR poster** (downloadable QR of `/signup?gym=CODE`) and the **lapsed lock screen** — a renewal message that names the member's saved streak/visits from `member_home_stats.lapsed_summary`, warm not punitive (§2.6); `/gyms/new` surfaces the create-gym guard errors (code taken / invalid / reserved / cap reached) in plain language (§2.5).

**Read first, in order:**
1. `AGENTS.md` → `AgentsContextKnowledgeBase/Catalog.md` — the documentation system and your update obligations.
2. `AgentsContextKnowledgeBase/ImplementationPlan-UnifiedAccounts.md` — **the contract.** §2.3–§2.5 (routes + flows), §5 (your spec), §6 (frozen contracts you consume), §7 (your test rows), §10 (definition of done).
3. `AgentsContextKnowledgeBase/AboutProject.md` — north star: a non-technical ~40-year-old gym owner; simplicity beats everything; plain language only.
4. `../CONTEXT.md` — vocabulary: it's a **gym switcher** (gyms switch, not accounts), **gym hub**, **join request**, **active gym**. Use these words in copy and code.
5. `CLAUDE.md` — conventions (test-first, **never commit/push — leave everything in the working tree**).
6. The frozen surfaces you consume: `lib/auth-context.tsx` (§6.2 interface — `myGyms`, `activeGymId`, `refreshMyGyms`), `lib/auth-actions.ts` (§6.3), `lib/access-context.tsx` `useAccess()` for role/permissions.

**You own (create/edit):** the full UX of `/login`, `/signup`, `/reset-password`, `/gyms`, `/gyms/new` (Stren-branded, NOT gym-branded — existing `--color-*` tokens and form patterns; `?gym=CODE` flavor header on login/signup via `get_gym_by_code`; magic-link `?error=` banner reusing the readable-error copy; autocomplete attributes for password managers); the **gym hub** per §5 U2 (gym cards with role/status chips, "Waiting for approval" pending state, join-by-code + `search_gyms` name search, "I run a gym" path, and the two-choice empty state — the onboarding moment); the **gym switcher** per §5 U3 in `app/admin/layout.tsx` chrome and `components/member/MemberShell.tsx` (anchor = current gym name/logo; menu = my gyms with role labels, "All gyms →" to `/gyms`, sign out; switch = `setActiveGymAction` + full refresh to the returned role's surface; single-gym accounts get the simpler reading); the public gym page "Join" CTA wiring (logged-out → `/signup?gym=CODE`, logged-in → join confirm → pending state); replacing every remaining `profile.role`/`profile.gymId` component read with `useAccess()`/`myGyms`; and your §7 U-row tests (hub states, switcher behavior, login/signup states) — written red-first.

**You must NOT touch:** `middleware.ts`, `supabase/migrations/*`, `lib/database.types.ts`, `lib/auth-actions.ts` signatures, `lib/auth-context.tsx` internals (consume the interface only), `lib/access-*`/`lib/permissions.ts`/`lib/features.ts`, `app/api/*`, server-side data fetching in existing admin/member pages, or the Gym Page Studio components.

**Order of work:** U1 (auth screens) → U2 (hub + join/create + public Join CTA) → U3 (switcher + `useAccess` sweep). Keep the E2E suite green after each unit — Agent C already rebuilt the auth helpers to flow through `/login`.

**Design guardrails:** one obvious action per screen; no technical terms in copy (never "affiliation", "context", "session" — say "your gyms", "switch gym", "waiting for approval"); loading/disabled/error states on every action; keyboard + screen-reader operable menu for the switcher (follow the drawer-tablist a11y precedent from unit A6); mobile-first — the hub and switcher must feel native at 375px.

**Definition of done (your half):** plan §10 items 1–2 demonstrable in the browser (multi-gym switcher swap in one interaction; fresh-signup empty state through join → pending → approved journey); full `npm run test:ci` green; `ImplementationState.md` rows U1–U3 + `CHANGELOG.md` updated in the same working tree; J1 (version 2.0.0 bump) prepared if both halves are now complete. List anything deliberately skipped and every place you had to interpret the spec in your final summary.
