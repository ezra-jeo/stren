# Pickup prompt — Fable finishes Agent C's backend (Unified Accounts)

_Codex 5.6 Sol ran out of budget mid-implementation; Fable picks up. Recommended launch: **Fable, effort high** — the expensive audit is already done and encoded below; the remaining work is surgical. Paste everything below the line into a fresh chat._

---

You are finishing the **backend half (Agent C)** of Stren's "Unified Accounts & Auth Rebuild" on branch `auth/unified-accounts`. Codex 5.6 Sol implemented ~95% of it; Opus 4.8 finished all UI (U1–U3). Everything sits **uncommitted in the working tree** (no commits on the branch — correct; you never commit either). A full Fable review (2026-07-12) already audited the tree: **do not re-implement anything — the remaining work is exactly the numbered list below.** Past parallel-agent runs caused duplicate code; your prime directive is to fix in place, never rebuild alongside.

**Read first, in order:**
1. `AgentsContextKnowledgeBase/Catalog.md` — doc system and update obligations.
2. `AgentsContextKnowledgeBase/ImplementationState.md` — the Unified Accounts table; the C1–C3 rows carry this same review verdict. The Agent U handoff note is superseded — ignore its claims.
3. `AgentsContextKnowledgeBase/ImplementationPlan-UnifiedAccounts.md` — the contract (§2 architecture, §3 migration spec, §6 frozen contracts, §10 definition of done).
4. `CLAUDE.md` — conventions (idempotent migrations, test-first, money paths, **never commit/push**).

**Verified state — trust this, then re-verify yourself before changing anything** (run: `npm run lint && npm run typecheck && npm run test:unit`, then `NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co' NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key' npm run build` — CI injects those fallback env vars; env-less builds have never worked, don't "fix" that):
- lint ✅ · typecheck ✅ · build ✅ (CI env) · unit/integration **246/249**.
- Done and reviewed (hands off unless a fix below requires touching it): migration `019_unified_accounts.sql` (1,742 lines — gym_users/active_gym_id/helpers/RPCs/kiosk-`p_gym_id`/lapsed/attribution/drops, recursion-safe RLS), rewritten `middleware.ts` (`LEGACY_AUTH_REDIRECTS`, reuses `lib/post-auth-destination.ts`), `lib/auth-actions.ts` + validation/copy modules, rebuilt `lib/auth-context.tsx` (§6.2 interface + a documented `gymId`/`role:'member'` shim for page islands — **leave the shim**, real roles flow via `useAccess()`; keep its TODO), onboard route attach-vs-create, all legacy-auth deletions (grep-zero verified), regenerated types, and every U surface (auth screens, hub, switcher, JoinQrPoster, LapsedLockScreen).

**The pickup list (all of it, nothing more):**
1. **`stamp_gym_user_approval`** (migration 019, ~line 475): `NEW.added_by := auth.uid();` → `NEW.added_by := COALESCE(auth.uid(), NEW.added_by);` — service-role approvals (`auth.uid()` NULL) must not erase the stamp. Satisfies `tests/integration/join-and-approve.test.ts`.
2. **Owner-promotion hole** (migration 019, `gym_users_update` policy): `USING` blocks *targeting* owner rows but `WITH CHECK` doesn't block *promoting to* owner — any `members:manage` holder could mint owners. Add a guard so only owners may set `role='owner'` (e.g. `AND (role <> 'owner' OR public.get_user_role() = 'owner')` in WITH CHECK — pick the cleanest form consistent with the file's helper conventions). Extend `tests/integration/join-and-approve.test.ts` or `gym-users-access.test.ts` to pin it (test-first).
3. **`set-active-gym.test.ts` reconciliation**: the test demands a `set_config('stren.active_gym_update_…')` handshake; the implementation instead uses `REVOKE UPDATE(active_gym_id) … FROM authenticated` + SECURITY DEFINER `set_active_gym` + the `validate_active_gym` affiliation trigger. **The implementation's design is sound and simpler — fix the test** to assert the real mechanism (REVOKE, trigger presence, affiliation check in the RPC), not the abandoned handshake. Do not add `set_config`.
4. **Onboard email case bug** (`app/api/admin/members/onboard/route.ts` ~line 25): `.eq('email', body.email)` is case-sensitive — the exact bug class migration 013 fixed. Normalize (lowercase/trim) consistently with how `handle_new_user` in 019 stores emails (verify it lowercases; if not, fix there too so lookup and storage agree), satisfying `tests/integration/onboard-existing-account.test.ts` (it expects case-insensitive matching; if you satisfy it via `ilike`, escape `%`/`_` in the input).
5. **`OTP-AUTH-GUIDE.md` quarantine**: it's only annotated in `AgentsContextKnowledgeBase/Catalog.md` — move its row to the Catalog's **Stale** table per C3.
6. **Cache-key audit** (plan §4, claimed but unverified): confirm every `unstable_cache`/cache key or tag on admin/member data includes the gym id (per `docs/CACHING.md`) so gym-switching can never serve another gym's cache; fix any miss.

**Then J1 (finish line):**
- Full gate green: lint, typecheck, unit/integration **249/249**, build (CI env). Run E2E if `E2E_*` credentials exist; otherwise note the skip.
- `package.json` → **2.0.0**; add the Agent C entry under `## [Unreleased]` in `CHANGELOG.md` (Agent U's entry is already there); update `ImplementationState.md` C1–C3 open items to resolved + J1 row, all in the working tree.
- Walk plan §10's definition of done and list any item you cannot prove locally (e.g. credentialed E2E) in your final summary, plus every place you had to interpret this list.

**You must NOT touch:** any U-owned surface (`components/auth/auth-shell.tsx`, `components/gyms/*`, `components/admin/JoinQrPoster.tsx`, `components/member/LapsedLockScreen.tsx`, the visual JSX of `/login` `/signup` `/gyms` `/gyms/new` pages, `GymSwitcher`, shells), `lib/permissions.ts` / `lib/features.ts` / `lib/access*.ts(x)`, the billing `memberships`/`payments` schemas beyond what already exists in 019, or anything in the "done and reviewed" list except where a numbered fix explicitly lands there. Migrations stay idempotent; no destructive SQL beyond what 019 already contains; branch `auth/unified-accounts`; leave all changes uncommitted and report.
