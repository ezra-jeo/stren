# Fix-pass prompt — Claude Opus 4.8 — UI half (Agent A, unit A6) — REVISED

_Revised 2026-07-11 after the backend (Agent B) landed: the original Fix 1 is downgraded and Fix 2's server half is done, so this pass is now **non-blocking polish** — it may ship with or after the prod release. Recommended launch effort: **high**. Paste everything below the line into the agent._

---

You previously implemented the UI half of the "Gym Page Studio + Permissions & Feature Toggles" workstream for Stren (units A1–A5). The backend half has since landed (migrations 014–017, server guards, middleware). A review left **five polish fixes**. Boundaries unchanged: **UI only**; do not touch `supabase/migrations/`, `middleware.ts`, `app/api/`, `lib/permissions-server.ts`, `lib/engagement-hooks.ts`, `lib/gym-public.ts`, `lib/database.types.ts`, or server-side gates in page files (note: `app/admin/gym-profile/page.tsx` and `app/admin/access/page.tsx` are now **server** pages owned by the backend agent — your surface is the client components they render). **Never run `git commit` or `git push` — leave changes in the working tree** (standing rule in `CLAUDE.md`/`AGENTS.md`). Read `AgentsContextKnowledgeBase/Catalog.md` + `ImplementationPlan.md` §7–§8 first if you lack context. Keep all existing tests green (`npm run lint && npm run typecheck && npm run test:unit`).

## Fix 1 — Rollback resilience in the Studio load/save (was HIGH, now LOW — migrations 017 exists, this only matters if the DB is ever behind the app, e.g. a migration rollback)

In `components/admin/gym-studio/GymPageStudio.tsx`: when the primary load SELECT (which includes `cover_focal, section_visibility`) errors, the fallback SELECT drops `is_published` and `secondary_color`, so a published gym would display "Hidden". Make the fallback three-tier: (a) full select; (b) on error, retry without the two Studio-meta columns but **with** `is_published, secondary_color`; (c) the existing legacy fallback. Track `studioMetaColumnsAvailable` and include `cover_focal`/`section_visibility` in the save payload only when true. Add an integration test mocking tier-(b).

## Fix 2 — Client-side owner gate in AccessClient (belt over the server guard)

The server page now has `requirePermission('roles:manage')`. Add the client courtesy layer anyway (defends the direct-render path and tests): in `components/admin/AccessClient.tsx`, when `useAccess().permissions.has('roles:manage')` is false, render a simple owner-only state ("Only the owner can manage people & access."). Extend `tests/integration/access-page.test.tsx`.

## Fix 3 — Misleading partial-save toast

`GymPageStudio.tsx` `save()`: when the gym write fails and no feature flags were dirty (`shouldSaveFlags === false`), the toast wrongly says "Your feature settings saved, but the page content didn't". Say "Failed to save your page content — try again." in that case; keep the two-write messages for genuine two-write cases.

## Fix 4 — Atomic multi-key Access switch writes

`AccessClient.tsx` `flip()` writes override rows sequentially (the money switch = 2 keys); a mid-flip failure leaves the DB half-flipped while the UI fully reverts. Batch each flip: one array `upsert` for grants/revokes plus one `delete().in('permission', […])` for back-to-default keys (add batch variants in `lib/access-data.ts`); on failure, refetch that person's overrides instead of guessing. Update the multi-key integration test.

## Fix 5 — Small a11y/visual parity items

- `MobileStudioSheet.tsx`: give the drawer tab strip `role="tablist"` / `role="tab"` / `aria-selected` (the desktop toolbar already complies).
- `GymLandingPreview.tsx` `JoinBody`: render the "N active members" chip when `memberCount > 0` (dead field today; mockup shows it; hidden at 0 so the Studio never says "0 active members").

## Definition of done

Lint/typecheck/test:unit green; new/updated tests for fixes 1, 2, 4; update `AgentsContextKnowledgeBase/ImplementationState.md` row **A6** and extend `CHANGELOG.md` — all left uncommitted for the developer.
