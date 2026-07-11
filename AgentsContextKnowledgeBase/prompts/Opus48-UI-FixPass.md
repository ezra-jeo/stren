# Fix-pass prompt — Claude Opus 4.8 — UI half (Agent A, unit A6)

_Produced by Fable's 2026-07-11 review of the Agent A one-shot. Recommended launch effort: **high**. Paste everything below the line into the agent._

---

You previously implemented the UI half of the "Gym Page Studio + Permissions & Feature Toggles" workstream for Stren (units A1–A5, all green: 189/189 unit+integration tests, lint, typecheck). A review found **six fix items** — five code fixes and one polish. Your boundaries are unchanged: **UI only**; do not touch `supabase/migrations/`, `middleware.ts`, `app/api/`, `lib/permissions-server.ts`, `lib/engagement-hooks.ts`, `lib/gym-public.ts`, `lib/database.types.ts`. Read `AgentsContextKnowledgeBase/Catalog.md` and `AgentsContextKnowledgeBase/ImplementationPlan.md` §7–§8 first if you lack context. Work test-first where a behavior changes; keep all existing tests green.

## Fix 1 — HIGH: Studio breaks and lies about publish state until migration 017 lands

`components/admin/gym-studio/GymPageStudio.tsx`:

- The primary load SELECT (~line 306) includes `cover_focal, section_visibility`. Those columns do not exist until Agent B's migration 017, so **every load currently errors into the fallback SELECT** (~line 323) — which omits `is_published` and `secondary_color`. Result: a **published gym displays "Hidden"** in the Studio header and visibility pill, and the secondary color resets to default in the editor.
- The save payload (~lines 881-882) always includes `cover_focal` / `section_visibility`, so **every save fails** (unknown column) until 017 lands.

Required fix (make Agent A's half genuinely standalone, per the plan's degradation rule):

1. Three-tier load: (a) try the full SELECT including the two 017 columns; (b) on error, retry WITHOUT those two columns but WITH `is_published, secondary_color` (they have existed since migrations 008/009 — the current fallback is a relic of an older schema); (c) keep the existing legacy fallback as the last resort. Track which tier succeeded in state, e.g. `studioMetaColumnsAvailable: boolean`.
2. Include `cover_focal` and `section_visibility` in the save payload **only when `studioMetaColumnsAvailable` is true**. When false, also show a one-line muted notice near the focal/sections controls: "Focal point and section visibility will start saving after the next system update." (they still affect the live preview).
3. Integration test: mock the 017-less schema (first select rejects with a column error), assert the Studio loads with the correct `is_published`, and assert the save payload omits the two keys.

## Fix 2 — MEDIUM: `/admin/access` has no client-side owner gate

`app/admin/access/page.tsx` renders `AccessClient` unconditionally; middleware's coarse role gate lets any admin/staff open the URL and see the full switch UI (flips only fail at save). UI hiding is a courtesy layer, but it must exist here too (the server guard is Agent B's job).

Fix: in `components/admin/AccessClient.tsx`, read `useAccess()`; when `!access.permissions.has('roles:manage')`, render a simple owner-only state (title + "Only the owner can manage people & access.") instead of the team list. Extend `tests/integration/access-page.test.tsx` to cover it.

## Fix 3 — LOW: misleading partial-save toast

`GymPageStudio.tsx` save() (~line 910): when the gym write fails and **no feature flags were dirty** (`shouldSaveFlags === false`), the toast still says "Your feature settings saved, but the page content didn't". Fix: in that case say "Failed to save your page content — try again." Keep the §7.3.1 messages for genuine two-write cases. Adjust the existing test if it pins the string.

## Fix 4 — LOW: multi-key Access switch writes are not atomic

`components/admin/AccessClient.tsx` `flip()` saves override rows sequentially (the money switch = 2 keys); if the second write fails, the DB is half-flipped while the UI fully reverts. Fix: batch each flip — build all upsert rows and all delete keys, then issue at most one `upsert` (array of rows) and one `delete().in('permission', […])` via new batch variants in `lib/access-data.ts` (extend the module; keep `saveOverride` for single-key switches or refactor callers). On failure, refetch that person's overrides instead of guessing. Update the integration test for multi-key flips.

## Fix 5 — LOW: drawer tab strip lacks tablist semantics

`components/admin/gym-studio/MobileStudioSheet.tsx`: the desktop `PreviewToolbar` uses `role="tab"` correctly; the mobile drawer's tab strip is plain buttons. Give the drawer strip `role="tablist"` / `role="tab"` / `aria-selected` to match §7.10.

## Fix 6 — POLISH: Join preview never shows the member-count badge

`GymPreviewData.memberCount` is a dead field — `JoinBody` in `components/gym/GymLandingPreview.tsx` omits the mockup's "N active members" chip. Render the chip only when `memberCount > 0` (avoids "0 active members" in the Studio, matches the mockup on the live page).

## Definition of done

`npm run lint && npm run typecheck && npm run test:unit` green; new/updated tests for fixes 1–4; update `AgentsContextKnowledgeBase/ImplementationState.md` row **A6** to Shipped and extend the `CHANGELOG.md` entry in the same commit. List anything you deliberately did not do in your final summary.
