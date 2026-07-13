# Implementation State

_Live status of everything. **Update this file in the same PR that ships the work** (Catalog rule 3). One row per unit; keep rows one line. Statuses: `Queued` · `In progress (who)` · `Shipped (date, PR/commit)` · `Blocked (why)` · `Cut (why)`._

Last updated: 2026-07-13 (**Auth Session & Account Access Recovery is implemented and verified against the linked hosted project.**)

---

## Platform remediation phases

| Phase | Status |
|-------|--------|
| Phase 0 — Repo as source of truth | ✅ Shipped |
| Phase 1 — Performance / server components | ✅ Shipped (v1.1.0, 2026-06-09) |
| Phase 2 — Auth & routing (single guard) | ✅ Shipped |
| Phase 2.5 — Security & shippability hardening | ✅ Shipped |
| Phase 2.6 — Notification-RPC hardening | In progress (Agent B — implemented/validated on branch as unit B0; not merged) |
| Phase 3 — Dead weight removal | Queued (scope: `PHASE_3_TO_7_DIAGNOSTIC_AND_PLAN.md`) |
| Phase 4 — Design system | Queued |
| Phase 5 — Money path tests | Queued (partially pulled forward: B3 characterization tests below) |
| Phase 6 — Documentation completion | Queued |
| Phase 7 — TDD as standing methodology | Queued |

## Workstream (implemented in working tree 2026-07-13): Member Area Redesign

| Unit | Scope | Status |
|---|---|---|
| D1 | Responsive Stren member shell and Home/Ranks/Profile/Settings presentation | Implemented (Codex, working tree, 2026-07-13) — desktop sidebar, mobile bottom navigation, one primary content column, QR-backed check-in, honest recommendations, responsive ranks, and preserved profile/settings flows |
| D2 | Weekly member-consistency streak contract | Implemented (Codex, working tree, 2026-07-13) — migration 022 calculates one qualifying visit per Monday–Sunday week in Asia/Manila, retains the open-week grace period, and uses the same rule on the weekly leaderboard |
| D3 | Member redesign verification | Implemented (Codex, working tree, 2026-07-13) — lint, typecheck, production build, focused member/weekly suites, and the full 319-test unit/integration suite are green |

## Workstream (completed in working tree 2026-07-13): Auth Session & Account Access Recovery

Spec: [ImplementationPlan-AccountSessionRecovery.md](ImplementationPlan-AccountSessionRecovery.md) · branch `auth/cohesive-auth-owner-onboarding`.

| Unit | Scope | Status |
|---|---|---|
| R1 | Reproduce false no-gym routing, profile infinite loading, and mobile post-sign-in server-cookie race with red regressions | Implemented (Codex, working tree, 2026-07-13) — regressions fail on the previous implementation and pass after correction |
| R2 | Resolve sign-in through the confirmed browser session; separate profile and gym-access errors; fail closed in server action, middleware, and callback | Implemented (Codex, working tree, 2026-07-13) — one active owner routes to `/admin`, member to `/member`, multi-gym to `/gyms` |
| R3 | Add explicit `/gyms` and `/profile` recovery states with real account email, retry, and sign out; identify the signed-in account on genuine no-gym home | Implemented (Codex, working tree, 2026-07-13) — no placeholder identity and no error-as-onboarding fallback |
| R4 | Final verification and deployment handoff | Implemented (Codex, working tree, 2026-07-13) — lint/typecheck, **310/310** unit/integration tests with coverage, focused public E2E checks, real owner/member browser journeys, and production build green; full E2E command previously timed out after all 12 public checks passed and 8 credentialed checks skipped |
| R5 | Hosted schema/Auth recovery and deployment contract | Applied and verified (Codex, linked project + working tree, 2026-07-13) — reconciled the timestamped duplicate of 013, applied 014–021, fixed migration-019 leaderboard alias and hosted Storage-policy dependencies, disabled Auth auto-confirm without changing redirect settings, and live-verified owner `/admin`, member `/member`, and `/profile`; deploy preflight now blocks schema/Auth drift, and Next maps Supabase's modern project/publishable environment names without exposing the server secret |

## Workstream (completed in working tree 2026-07-13): Member Onboarding & Auth Recovery

Spec: [ImplementationPlan-MemberOnboardingRecovery.md](ImplementationPlan-MemberOnboardingRecovery.md) · decision: `docs/adr/0006-membership-verification-not-join-requests.md` · branch `auth/cohesive-auth-owner-onboarding`.

| Unit | Scope | Status |
|---|---|---|
| M1 | Diagnose and bound credential exchange, session confirmation, post-auth membership resolution, and client navigation; honest Google preview in both auth modes | Implemented (Codex, working tree, 2026-07-13) — focused timeout/loading/auth UI tests green |
| M2 | Official Supabase password-reset request, enumeration-safe API, recovery callback/session validation, signed HTTP-only completion proof, password update, used/expired handling, truthful email-configuration errors | Implemented (Codex, working tree, 2026-07-13) — request/page/callback/completion tests green |
| M3 | Migration 021: saved gyms, deterministic membership match, multiple pending verifications, cooldown reminder, withdrawal, staff-only confirmation, in-app notifications; generated types and server actions | Implemented (Codex, working tree, 2026-07-13) — SQL/action contracts green |
| M4 | Responsive no-gym member home, lean public gym discovery + QR, public profile save/verify actions, demo/beta/profile states, authenticated landing CTA correction | Implemented (Codex, working tree, 2026-07-13) — focused component and real-session bootstrap-policy tests green |
| M5 | Full lint/typecheck/unit/build/E2E gates, reference-led responsive checks, documentation and environment handoff | Implemented (Codex, working tree, 2026-07-13) — lint/typecheck, 293 unit/integration tests, production build, and 12 public desktop/mobile E2E checks green; 8 credentialed E2E checks skipped; local DB apply blocked before migration 021 by the pre-existing migration-001 ordering defect |

## Workstream (completed 2026-07-13): Cohesive Auth & Assisted Gym Onboarding

Spec: [ImplementationPlan-CohesiveAuthOwnerOnboarding.md](ImplementationPlan-CohesiveAuthOwnerOnboarding.md) · decision: `docs/adr/0005-platform-managed-gym-provisioning.md` · branch `auth/cohesive-auth-owner-onboarding`.

| Unit | Scope | Status |
|---|---|---|
| A1 | Shared `/auth?mode=signin\|signup` surface, responsive sliding panel, URL/history state, accessible errors/focus/inert panes, automatic signup session or honest verification state | Implemented (Codex, working tree, 2026-07-13) — focused component + browser coverage green |
| A2 | Membership-aware post-auth routing and `/gyms` Join a gym experience with explicit QR camera activation, code fallback, trusted confirmation, pending/error states | Implemented (Codex, working tree, 2026-07-13) — routing and QR/code tests green |
| A3 | Remove public gym creation; permanent legacy redirects; migration 020 platform-admin authorization; assisted `/for-gym-owners` inquiry using validated/rate-limited Resend delivery | Implemented (Codex, working tree, 2026-07-13) — public action/page removed and database guard test-pinned |
| A4 | Landing/drawer CTA rewrite, callback/reset/auth-context/QR-poster re-pointing, service-worker cache audit, E2E auth helper rewrite | Implemented (Codex, working tree, 2026-07-13) |
| A5 | Full verification, docs, migration/env handoff, version 2.1.0 | Implemented (Codex, working tree, 2026-07-13) — lint ✅ · typecheck ✅ · unit/integration **257/257** ✅ (incl. migration-020 authorization contract) · production build ✅ · public E2E desktop/mobile **8/8** ✅; 8 credentialed E2E cases skipped (no `E2E_*` credentials); real local migration apply could not reach 020 because the existing migration 001 fails first (`public.profiles` absent when `get_gym_id()` is created) |

## Workstream (shipped 2026-07-13): Unified Accounts & Auth Rebuild

Spec: [ImplementationPlan-UnifiedAccounts.md](ImplementationPlan-UnifiedAccounts.md) · decision: `docs/adr/0004-one-account-many-gyms.md` · prompts: `prompts/Codex-Backend-UnifiedAccounts-OneShot.md`, `prompts/Opus48-UI-UnifiedAccounts-OneShot.md`. Agent C = Codex 5.6 Sol, effort xhigh (backend, ships first). Agent U = Claude Opus 4.8, effort high (UI, ships second, reskins C's minimal pages — handlers verbatim). Branch `auth/unified-accounts` → `qa`.

| Unit | Scope (plan ref) | Status |
|---|---|---|
| C1 | Migration `019_unified_accounts.sql` (`gym_users` incl. `added_by`, `active_gym_id`, helper re-implementations, new RPCs + create-gym guards, kiosk `p_gym_id` reworks, lapsed/attribution columns, unique fixes, pre-approved column drops) + regenerated types + SQL/integration tests (§3, §7) | Implemented (Codex, working tree) — Fable-reviewed 2026-07-12; **all 3 open items resolved by the fix pass (2026-07-12)**: approval stamp now `COALESCE(auth.uid(), NEW.added_by)` (service-role safe); `gym_users_update` WITH CHECK blocks promoting to owner unless caller is owner (test-pinned in `join-and-approve.test.ts`); `set-active-gym.test.ts` reconciled to the REVOKE+trigger design |
| C2 | Middleware rewrite + 308 map, `lib/auth-actions.ts`, `lib/auth-context.tsx` rebuild, onboard attach-vs-create, kiosk gym pinning, lapsed gate wiring, attribution + owner payment alerts, profiles-query/type sweep, minimal `/login` `/signup` `/gyms` `/gyms/new`, cache-key audit (§4, §6) | Implemented (Codex, working tree) — Fable-reviewed 2026-07-12; **open items resolved by the fix pass (2026-07-12)**: onboard email lookup now case-insensitive (`ilike` with `%`/`_`/`\` escaping; `handle_new_user` lowercases stored emails). Cache-key audit verified clean: `unstable_cache` sites (`gym-public`, `gym-member`) key by gym code/id via args, public data only; `/gym/[code]` ISR keys by path; `permissions-server` uses per-request React `cache()`; service worker never caches admin/member/kiosk/api. Auth-context keeps the documented `gymId`/`role:'member'` shim for page islands (safe: real role flows via `useAccess()`/`get_my_access`; TODO retained) |
| C3 | Deletion sweep (old auth pages/components/libs, grep-zero), E2E auth rewrite, `OTP-AUTH-GUIDE.md` quarantine (§4) | Implemented (Codex/U, working tree) — Fable-reviewed 2026-07-12: grep-zero clean; **leftover resolved by the fix pass (2026-07-12)**: `OTP-AUTH-GUIDE.md` row moved to the Catalog **Stale** table |
| U1 | `/login`, `/signup`, `/reset-password` full UX (Stren-branded, `?gym=` flavor, error states) (§5) | Implemented in working tree (Agent U, 2026-07-12) — `auth-shell` + `lib/auth-error-copy`; `auth-screens.test.tsx` green |
| U2 | Gym hub `/gyms` + `/gyms/new` (guard errors in plain language) + join flow + public-page Join CTA + join-QR poster + lapsed lock screen + pending/empty states (§5) | Implemented in working tree (Agent U, 2026-07-12) — `GymHub`/`JoinGymPanel`/`gym-badges`, `JoinQrPoster` + `/admin/join-code`, `LapsedLockScreen` (+ `MemberHomeClient` branch), `lib/create-gym-error-copy`; public Join CTA satisfied via 308 + `?join=` (no preview change); `gym-hub`/`gym-new`/`join-qr-and-lapsed` tests green |
| U3 | Gym switcher in admin + member shells incl. Member/Admin view toggle; `useAccess()` sweep of remaining `profile.role` reads (§5) | Implemented in working tree (Agent U, 2026-07-12) — `GymSwitcher` in both shells; admin layout footer role now via `useAccess()`; `gym-switcher.test.tsx` green. Page-island `profile.gymId` reads left on the auth-context shim (functionally = `activeGymId`; shim removal lives in auth-context internals, Codex-owned) |
| J1 | Full `npm run test:ci` green; §10 definition of done walked; version 2.0.0 + `CHANGELOG.md` | Done in working tree (Agent C fix pass, 2026-07-12) — lint/typecheck/unit-integration **249/249**/build (CI env) all green; version **2.0.0** + Agent C CHANGELOG entry added. §10 DoD walked: items 1–6a proven by the integration suites + grep-zero; item 7's E2E leg and the credentialed E2E cases **not executed locally** (no `E2E_*` credentials — run against staging before prod, same as the 1.2.0 checklist item). Awaiting developer commit → PR to `qa`. |

**Agent U handoff note (2026-07-12) — SUPERSEDED by the Fable review above** (the tsc/build failures and the two named C-owned test failures it lists are fixed; the actual failing set is `set-active-gym` / `join-and-approve` / `onboard-existing-account`, see C rows). Kept for history:
- **C2 sweep unfinished:** `app/admin/members/page.tsx`, `app/admin/payments/page.tsx`, `app/gym/[code]/page.tsx` (`canCurrentUserPreviewUnpublishedGym`), `app/member/settings/page.tsx`, `lib/engagement-hooks.ts` still read the dropped `profiles.role`/`gym_id`/`status`; `npx tsc --noEmit` fails on them (and thus `npm run build`).
- **C-owned test failures:** `kiosk-disabled-state.test.tsx` (imports `app/kiosk/page`) and `onboard-existing-account.test.ts` (source-checks the onboard route) — C kiosk/onboard work.
- **C3 leftover done by U to unblock the suite:** deleted `tests/integration/gym-auth-flow.test.tsx` (imported the deleted `LoginForm`/`GymSignUpForm`).
- **Lapsed gate wiring (C2):** the lock-screen UX + `MemberHomeClient` branch are in place with a safe default; the server page (`app/member/page.tsx`) still needs to pass `subscription_status`/`lapsed_summary`/gym name from `member_home_stats` into `MemberHomeData` (one mapping) to activate it.

Deferred by grill session 2026-07-11 (recorded in plan §0 + ADR-0004; queue as future workstreams when triggered): phone-OTP login channel · Organizations/multi-branch layer · owner email digest of recorded payments.

## Workstream (shipped 2026-07-11): Gym Page Studio + Permissions & Feature Toggles

Landed on `main` via qa merge `3e52c95`. Spec: [ImplementationPlan.md](ImplementationPlan.md) (completed; kept per Catalog rule 6). Agent A = Claude Opus 4.8 (UI only). Agent B = GPT 5.5/Codex (logic/backend only). Shared-file rule: A re-skins `app/admin/gym-profile/page.tsx` first; B converts it to a server page strictly after A's merge.

### Agent A — UI

| Unit | Scope (plan ref) | Status |
|---|---|---|
| A1 | Contract modules (`lib/permissions.ts`, `features.ts`, `access.ts`, `access-data.ts`, `access-context.tsx`) + fixture + unit tests (§8, §9) | Shipped (2026-07-11, branch `CustomizationPermissionsToggles`) — also `lib/focal.ts`, `contrastRatio`/`generatePalette` in `brand-color.ts` |
| A2 | `GymLandingPreview` extraction, pixel-parity proof (§7.1) | Shipped (2026-07-11) — public home + contact/pricing/locate swapped; `toGymPreviewData` in `gym-data.ts`; parity guard `tests/integration/gym-landing-preview.test.tsx` + e2e |
| A3 | Studio desktop: header, rail groups, preview pane, checklist, brand group (§7.3, §7.6, §7.7) | Shipped (2026-07-11) — `components/admin/gym-studio/*`; `gym-profile/page.tsx` re-skinned (client), handlers verbatim |
| A4 | Mobile drawer + focal editor + states/a11y (§7.4, §7.5, §7.10) | Shipped (2026-07-11) — `MobileStudioSheet`, `FocalPointEditor` (drag+keyboard), unsaved-changes guard |
| A5 | FeaturesGroup (+ 4 teasers) + People & access UI + nav filtering (§7.8, §7.9) | Shipped (2026-07-11) — `AccessClient`, `app/admin/access`, nav filtering via `useAccess`/feature props with safe defaults; §9 A integration tests green |
| A6 | Review fix pass (spec: `prompts/Opus48-UI-FixPass.md`): three-tier load/save resilience + `studioMetaColumnsAvailable` gate, `/admin/access` client owner gate, honest partial-save toast, atomic multi-key switch writes (`saveOverridesBatch`/`fetchPersonOverrides` + refetch-on-failure), drawer tablist a11y, Join active-members chip | Shipped (2026-07-11, commit `673b108`) — Fable-verified all six fixes; tests: `studio-load-fallback`, extended `access-page` + `gym-landing-preview` |

### Agent B — logic & enforcement

| Unit | Scope (plan ref) | Status |
|---|---|---|
| B0 | **Slice 0 security hotfix**: migration 014 + revalidate-gym scope + avatar URL validation (§0, §5) — ships first, own PR | In progress (Agent B — implemented and isolated-schema/app validated; awaiting separate PR/merge) |
| B1 | Migration 017: `cover_focal` + `section_visibility` (§5) — early, unblocks A | In progress (Agent B — implemented, idempotency validated; awaiting PR/merge) |
| B2 | Payments characterization tests (money-path rule, §9) | In progress (Agent B — characterization coverage green; awaiting PR/merge) |
| B3 | Migration 015: permission model, policy swaps, dashboard/reports gating (§5) | In progress (Agent B — implemented, generated types refreshed, focused tests green; awaiting PR/merge) |
| B4 | Migration 016: feature toggles, `get_gym_by_code` rework incl. `is_published` bugfix (**needs user sign-off**), leaderboard/kiosk gates (§5) | In progress (Agent B — feature enforcement implemented; `is_published` correction intentionally withheld pending approval; awaiting PR/merge) |
| B5 | Server enforcement wiring: middleware map, API hardening, page gates, kiosk-off screen, announcements page verify/fix, engagement hooks, member-home fix (§6) | In progress (Agent B — implemented; fail-closed/bearer/kiosk audit fixes and tests green; awaiting PR/merge) |
| B6 | `gym-profile/page.tsx` server conversion — **strictly after A3–A5 merge** | In progress (Agent B — server wrapper completed after A3–A5 landed on branch; awaiting PR/merge) |
| B7 | **Review fix** (spec: `prompts/Codex-Backend-FixPass.md`): migration 018 restores the service-role cron path broken by 014's guards, keeping target-scope checks for service callers and all non-service guards verbatim | Shipped (2026-07-11, commit `dc7e9b4`) — Fable-verified; `is_published` correctly left untouched (still awaiting sign-off) |

### Joint

| Unit | Scope | Status |
|---|---|---|
| J1 | Full `npm run test:ci` green on the combined branch; §10 definition of done walked | In progress (exact `npm run test:ci` green after B7: lint/typecheck, 212 unit/integration tests, production build, and 4 public E2E tests; 8 credentialed E2E cases skipped because credentials are unavailable) |
| J2 | `CLAUDE.md` phase row, `CHANGELOG.md` entry, version bump | In progress (`v1.2.0` + changelog prepared; no CLAUDE phase-status row exists to update—plan prompt is inconsistent with the canonical status location) |

## Open items needing the user (pre-prod checklist)

~~1. B7~~ ✅ Shipped (`dc7e9b4`). ~~5. A6~~ ✅ Shipped (`673b108`).

1. **`is_published` decision** (product, not blocking if consciously deferred): public visibility still derives from tagline presence, not the real `gyms.is_published` column — an owner who unpublishes but keeps a tagline stays publicly visible. Approve the fix → one small migration (019, one-line change in `get_gym_by_code`); defer → document acceptance here and close.
2. **Credentialed E2E on staging** (strongly recommended): 8 E2E cases (permissions, feature toggles, member RPC probes — the security regression suite) have never executed. Set `E2E_*` credentials against staging and run once before prod.
3. **Release mechanics** (repo convention: branch → `qa` → manual sign-off → `main`): merge `CustomizationPermissionsToggles` → `qa`; apply migrations **014 → 015 → 016 → 017 → 018 in order** to the production database via Supabase CLI; deploy the app build immediately after, one release window.
4. Approve deletion of stale `STREN_GUIDE.md` and `context-history.md` (quarantined in Catalog).
