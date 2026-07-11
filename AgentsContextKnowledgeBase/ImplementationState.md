# Implementation State

_Live status of everything. **Update this file in the same PR that ships the work** (Catalog rule 3). One row per unit; keep rows one line. Statuses: `Queued` · `In progress (who)` · `Shipped (date, PR/commit)` · `Blocked (why)` · `Cut (why)`._

Last updated: 2026-07-11 (Agent A UI half implemented and **reviewed by Fable — passed with 6 fix items → unit A6**; Agent B logic/enforcement implemented and locally validated on `CustomizationPermissionsToggles`, awaiting PR/merge; both one-shot prompts packaged in `prompts/`).

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
| A6 | Review fix pass (spec: `prompts/Opus48-UI-FixPass.md`): pre-017 load/save resilience (HIGH), `/admin/access` client gate (MED), partial-save toast copy, atomic multi-key switch writes, drawer tablist a11y, join member-count badge | Queued |

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

### Joint

| Unit | Scope | Status |
|---|---|---|
| J1 | Full `npm run test:ci` green on the combined branch; §10 definition of done walked | In progress (exact `npm run test:ci` green: lint/typecheck, 211 unit/integration tests, production build, and 4 public E2E tests; 8 credentialed E2E cases skipped because credentials are unavailable) |
| J2 | `CLAUDE.md` phase row, `CHANGELOG.md` entry, version bump | In progress (`v1.2.0` + changelog prepared; no CLAUDE phase-status row exists to update—plan prompt is inconsistent with the canonical status location) |

## Open items needing the user

- Migration 016 `is_published` bugfix sign-off (changes public visibility for gyms relying on the buggy tagline-derived behavior).
- Approve deletion of stale `STREN_GUIDE.md` and `context-history.md` (quarantined in Catalog).
