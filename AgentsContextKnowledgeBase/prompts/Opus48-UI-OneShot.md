# One-shot prompt — Claude Opus 4.8 — UI half (Agent A)

_Packaged from `AgentsContextKnowledgeBase/ImplementationPlan.md` §10.A; if this file and the plan ever diverge, **the plan wins**. Recommended launch effort: **high** (see ImplementationPlan §10 note / session log). Paste everything below the line into the agent._

---

You are implementing the **entire UI half** of the "Gym Page Studio + Permissions & Feature Toggles" workstream for Stren, in one pass. You are Agent A. Every design decision has already been made — your job is faithful, high-craft execution, not design.

**Read first, in order:**
1. `AgentsContextKnowledgeBase/Catalog.md` — the documentation system and your update obligations.
2. `AgentsContextKnowledgeBase/AboutProject.md` — mission and product principles; the target user is a ~40-year-old non-technical gym owner, and simplicity is the top priority.
3. `AgentsContextKnowledgeBase/ImplementationPlan.md` — **the contract.** §7 (full design spec) and §8 (frozen TypeScript contracts) are your spec; §9 lists your tests (rows marked A); §10 defines your boundaries.
4. `CLAUDE.md` — conventions (test-first policy, commands, branching). They bind you.
5. `CONTEXT.md` — vocabulary; use these terms exactly.
6. The design bundle `stren-gym-page-studio/project/Stren Gym Page Studio.dc.html` — read it in full, top to bottom, including its embedded 1c build spec. It is the layout/interaction reference; its colors and fonts are prototype placeholders — production uses the app's CSS tokens per plan §7.0. The Features panel (§7.8) and People & access page (§7.9) are NOT in the bundle; their complete designs are in the plan. Follow them verbatim.

**You own (create/edit):**
- `lib/permissions.ts`, `lib/features.ts`, `lib/access.ts`, `lib/access-data.ts`, `lib/access-context.tsx` — exactly per plan §8; these are frozen contracts the logic agent builds against. Also `tests/fixtures/role-permission-defaults.json`.
- `components/gym/GymLandingPreview.tsx` — extraction per §7.1. The public pages must render **pixel-identically** before/after; prove it with the existing e2e.
- `components/admin/gym-studio/*` — the full Studio per §7.2–§7.8 (desktop two-pane, mobile drawer, focal editor, checklist, brand group, FeaturesGroup with the four Coming-soon teasers).
- `components/admin/AccessClient.tsx` + the client part of `app/admin/access/page.tsx` — People & access per §7.9 (owner row first with "Owner — full access" badge; exactly the 8 Access switches per admin; staff rows static).
- The client-side JSX of `app/admin/gym-profile/page.tsx` — keep every state/upload/compress/hash/cleanup/save/revalidate handler **verbatim**; you are re-skinning around them. The file stays a `'use client'` page in your hands; the server conversion happens after your merge.
- Nav filtering in `app/admin/layout.tsx`, `components/member/MemberShell.tsx`, `components/member/MemberHomeClient.tsx`, `components/gym/GymTopNav.tsx` — consume the §8.5 props/`useAccess()` hook with safe defaults so nothing breaks before the backend lands.
- `contrastRatio` + `generatePalette` in `lib/brand-color.ts` (existing exports untouched).
- Public gym pages only as far as swapping their bodies to `GymLandingPreview`.

**You must NOT touch:** anything in `supabase/migrations/`, `middleware.ts`, anything in `app/api/`, `lib/permissions-server.ts`, `lib/engagement-hooks.ts`, `lib/gym-public.ts`, `lib/database.types.ts`, or server-side gates in page files. If a task seems to need them, it belongs to the logic agent — leave a `TODO(logic)` comment and move on.

**Order of work (test-first — each stage's tests are written failing before its implementation):**
1. Contract modules + fixture + unit tests (§8; §9 unit rows marked A).
2. `GymLandingPreview` extraction + focal/section-visibility props + pixel-parity e2e proof.
3. Studio desktop: header (Publish only with `gym_page:publish`, else the §7.3.1 caption), control-rail groups, preview pane with tabs/device/safe-area, checklist banner, brand group.
4. Mobile drawer + focal-point editor (drag + keyboard, §7.5) + states/a11y (§7.10, including the unsaved-changes guard).
5. FeaturesGroup (grouped rows + teasers, owner-only) + People & access + nav filtering, with the §9 integration tests marked A.

**Rules:** production colors/fonts = app CSS tokens (§7.0); owners never see technical keys; no website-builder features (no drag-reorder, no font/spacing/layout controls); `role="switch"` / `aria-expanded` / keyboard-operable focal point; dirty-state guard per §7.10; save behavior per §7.3.1 (partial failure stays dirty and names the failed half; save always revalidates). Where backend pieces don't exist yet (`get_my_access`, `gym_feature_settings`, `cover_focal`), code against the §8 contracts — `fetchMyAccess` falls back to role defaults and your tests mock the supabase client (`tests/setup/vitest.setup.tsx`).

**Definition of done for this run:** `npm run lint && npm run typecheck && npm run test:unit` green, existing e2e green (pixel parity), all §9 A-tests present and green. Then update `AgentsContextKnowledgeBase/ImplementationState.md` (rows A1–A5) and add a `CHANGELOG.md` entry in the same PR, and list every remaining `TODO(logic)` in your final summary.
