# Implementation State

_Live status of everything. **Update this file in the same PR that ships the work** (Catalog rule 3). One row per unit; keep rows one line. Statuses: `Queued` · `In progress (who)` · `Shipped (date, PR/commit)` · `Blocked (why)` · `Cut (why)`._

Last updated: 2026-07-11 (all four workstream commits on `CustomizationPermissionsToggles`: Opus UI `272d876`, Codex backend `e031d89`, B7 fix `dc7e9b4`, A6 fix `673b108`. **Fable re-review of both fix commits: passed** — migration 018 verified, all six A6 fixes verified, local gate green (lint, typecheck, 217 tests, build). **Code is prod-ready**; remaining pre-prod items are decisions/ops, not code — see checklist below.)

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

## Active workstream: Gym Page Studio + Permissions & Feature Toggles

Spec: [ImplementationPlan.md](ImplementationPlan.md). Agent A = Claude Opus 4.8 (UI only). Agent B = GPT 5.5/Codex (logic/backend only). Shared-file rule: A re-skins `app/admin/gym-profile/page.tsx` first; B converts it to a server page strictly after A's merge.

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
