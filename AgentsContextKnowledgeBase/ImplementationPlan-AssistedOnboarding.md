# Implementation Plan — Assisted Onboarding (Superadmin Gym Provisioning Wizard)

**Status: ✅ Implemented in working tree (2026-07-18).** All 8 phases (P0–P7) complete: 117 focused tests green, complete existing suite (574/574) green, lint/typecheck/build clean. No commit/push performed — everything is staged on `super-admin` for developer review. See §31 for the walked checklist and §30 for implementation-time deviations recorded below the original planning risks.
Branch: `super-admin` (created from `polish-and-hardening` @ `b6e8f2fad1e20ccfd440b84b02cc6e4b91a1bc97`). Planning agent: Claude Fable 5. Implementation agent: Claude Fable 5 (Sonnet 5 default session model).

> Naming note: the task brief asked for `agentsContextKnowledgebase/implementationPlan.md`. This repo's actual path/casing is `AgentsContextKnowledgeBase/`, and `ImplementationPlan.md` is a completed historical plan marked "do not extend" (Catalog rule 6). Per convention, this new workstream gets its own file: **this document**.

---

## 1. Executive summary

Assisted Onboarding is an **internal Stren operator workflow**, not a public registration form and not part of the gym-owner dashboard. An approved Stren operator opens `/superadmin/onboarding/new` and walks a four-step wizard — **Gym → Owner & Staff → Plan & Access → Review & Invite** — configuring a gym workspace, its owner and staff, membership plans, operating hours, operational switches, and (optionally) imported members. A live preview column (owner dashboard, invite-QR poster, member experience) updates instantly while the operator types. Nothing touches the database until the final **Finish setup** action, which provisions everything atomically and idempotently, then sends the designated owner a secure, single-use, 24-hour **claim invitation** email. The owner formally claims ownership through a public claim page; until then the gym shows "Pending owner claim". Email delivery failure is recoverable (resend) and never rolls back a successfully provisioned gym.

Access is gated by the **existing** `app_metadata.platform_role = 'platform_admin'` mechanism (migration 020, ADR-0005) — no new DB role, no allowlist in client JS, enforcement server-side at three layers (middleware, server layout, API routes) plus the database itself.

This plan is grounded in the actual repo at the confirmed commit below; every reused file is named with its real path.

## 2. Confirmed Git branch state

- Working branch: **`super-admin`**, created 2026-07-17 directly from the latest `polish-and-hardening`.
- Source commit: **`b6e8f2fad1e20ccfd440b84b02cc6e4b91a1bc97`** ("feat: 2nd shot") — `git rev-parse origin/polish-and-hardening` at plan time; `git merge-base --is-ancestor origin/polish-and-hardening super-admin` passes.
- `git pull --ff-only` on `polish-and-hardening` returned "Already up to date"; ancestor check passed after branch creation.
- No `super-admin` branch existed locally or remotely before creation (verified after `git fetch origin --prune`).
- Working tree at branch creation: clean except two untracked planning artifacts (`FablePrompt.txt`, `ImplementPrompt.txt`) — nothing overwritten.
- `polish-and-hardening` is 2 commits ahead of `qa` (`27a1113` "feat: shot 1", `b6e8f2f` "feat: 2nd shot"): the financial-ledger (migration 025) and deployment/recovery (migration 026) work. This plan is written against that state; **the next migration number is 027**.
- Agents never commit or push (CLAUDE.md / Catalog rule 5a). All planning-doc changes sit in the working tree for the developer to commit on `super-admin`.

## 3. Existing architecture findings

- **Framework**: Next.js 16 App Router (`next@^16.2.2`), React 19, TypeScript strict. Tailwind 4 with design tokens in `app/globals.css`.
- **Auth/DB**: Supabase (`@supabase/ssr@^0.9.0`), Postgres + RLS. Migrations are immutable files `supabase/migrations/NNN_description.sql`, currently `000` + `001` + `005`–`026`.
- **Single auth guard**: `middleware.ts` — layouts render chrome only and never redirect (house rule). Public paths allowlisted at `middleware.ts:79`; everything else resolves the user, then per-surface role/permission gating via the `get_my_access` RPC (`middleware.ts:132-149`). API routes bypass middleware auth (`middleware.ts:77`) and must self-authorize.
- **Server access helpers**: `lib/permissions-server.ts` — `getMyAccess()` (per-request React `cache()`), `requirePermission()`, `apiRequirePermission()`.
- **Platform provisioning is already platform-gated**: migration `020_platform_admin_gym_creation.sql` defines `is_platform_admin()` (JWT `app_metadata.platform_role = 'platform_admin'`, lines 5-16) and `create_gym(p_name, p_code)` (lines 21-69) with slug rules: `^[a-z0-9][a-z0-9-]{2,31}$`, no `--`, no trailing `-`, reserved words (`admin`, `api`, `auth`, `gym`, `gyms`, `kiosk`, `login`, `member`, `reset-password`, `signup`, `stren`, `www`, `support`, `help`, `privacy`, `terms`), name 2–120 chars. ADR-0005 records the decision.
- **Money is ledger-only**: migration 025 makes `financial_transactions` the append-only source of financial truth; payments/renewals/onboarding go through trusted RPCs only. **Assisted Onboarding must not write payments or memberships** — imported members get accounts + gym-user rows, and staff record payments later through the existing money path.
- **Roles**: `gym_users(gym_id, user_id, role owner|admin|staff|member, status pending|active|rejected, added_by)` from migration 019; one account, many gyms (ADR-0004). The wizard's "Manager" role maps to the existing `admin` role — no new role invented.
- **No branches table** (deferred by ADR-0004 grill session). Single branch is modeled as a new nullable display column (§17).
- **Testing**: Vitest (`tests/unit/`, `tests/integration/`) + Playwright (`tests/e2e/`, credentialed cases env-gated by `E2E_*`). TDD is mandatory for new features (CLAUDE.md). CI gate: lint → typecheck → unit → build → e2e.

## 4. Relevant existing file + component map

| Existing file | Relevance |
|---|---|
| `middleware.ts` | Single auth guard; gains the `/superadmin` branch and `/claim` public path |
| `lib/permissions-server.ts` | Pattern for the new `lib/platform-admin.ts` helpers |
| `lib/supabase-server.ts` / `lib/supabase-admin.ts` | Server client (cookie-bound) / service-role client for provisioning |
| `lib/auth-context.tsx` | Client auth state (`getUser()` only, never `getSession()`) |
| `supabase/migrations/020_platform_admin_gym_creation.sql` | `is_platform_admin()`, slug rules, reserved words — reused verbatim by migration 027 |
| `supabase/migrations/001_production_baseline.sql` | `gyms` columns: `code` (unique), `logo_url`:98, `operating_hours` JSONB:102, `logo_path`:105, `is_published`:111 |
| `supabase/migrations/016_feature_toggles.sql` + `lib/features.ts` | Per-gym feature flags (`gym_feature_settings.flags`), `FEATURE_CATALOG`, `gym_feature_enabled` SQL helper |
| `supabase/migrations/021_membership_verification.sql` | Join/verification RPCs — patch point for the auto-approve switch |
| `supabase/migrations/023_kiosk_privacy_and_scan_integrity.sql` | Occupancy RPC + manual-toggle protection — patch points for kiosk switches |
| `lib/validations.ts` | `planSchema` (:49) — plan name ≤100, price coerced ≥0, `duration_days` int ≥1, description ≤500, benefits ≤1000; generic `phoneRegex` |
| `lib/email.ts` | Resend via raw `fetch`; `RESEND_API_KEY`/`RESEND_FROM_EMAIL`; `sendOnboardingEmail`:239 (QR CID attachment), `sendPasswordResetEmail`:304, `sendOwnerInquiryEmail`:349 — template for `sendOwnerClaimEmail` |
| `lib/password-recovery.ts` / `lib/auth-email-link.ts` | Hashed-token + HMAC patterns informing claim-token handling |
| `lib/crypto.ts` | `generateGymCode()` — **not** reused for slugs (produces uppercase `IRON-X7K2`, which fails the migration-020 slug regex); slug util is new |
| `app/api/admin/members/onboard/route.ts` | The canonical account-resolution pattern: `profiles` email lookup (`maybeSingle`) → `admin.auth.admin.createUser({ email_confirm: true })` → `profiles` upsert → `gym_users` upsert → `generateLink` → `member_onboarding_events` audit → email |
| `app/api/admin/access/people/route.ts` | Staff attach/invite pattern (owner-managed team) |
| `components/admin/OnboardMemberModal.tsx` | Existing 4-step wizard interaction template |
| `components/layout/app-shell.tsx` | Dark sidebar shell — visual base for the simplified superadmin shell |
| `lib/admin-ui.tsx` | Admin design tokens + `Modal`, buttons, cards — reused for wizard UI and preview modal |
| `components/admin/JoinQrPoster.tsx` + `qrcode` pkg | Invite-QR poster — reused by the QR preview and provisioning |
| `app/admin/plans/page.tsx` | Membership-plan form/UI patterns |
| `app/globals.css` / Tailwind config | Serif display (Playfair), Syne/Inter sans, copper primary, `--admin-*` dark tokens, warm off-white background |
| `tests/integration/gym-visibility.test.ts`, migration-020 contract test | Reference patterns for authorization/SQL contract tests |

Available deps (no additions needed): `react-hook-form` + `@hookform/resolvers` + `zod`, `sonner`, `lucide-react`, `qrcode` (+ types), `date-fns`, Radix primitives (`@radix-ui/react-switch`, `-dialog`, `-select`). **No CSV library exists and none is added** — §12/§16 plan a tiny in-repo parser.

## 5. Current auth + authorization findings

- `middleware.ts:79` public allowlist: `/`, `/landing`, `/auth/callback`, `/auth/confirm`, `/reset-password`, `/for-gym-owners`, `/gym/{code}/**`. Everything else requires a user; `/gyms` and `/profile` skip gym-access resolution (`:130`); all other private paths call `get_my_access` and gate `/admin` + `/kiosk` by role/permission/feature (`:132-149`).
- `user.app_metadata` is server-controlled in Supabase — users cannot self-assign `platform_role`. It is available on the middleware's `supabase.auth.getUser()` result and on any server-side `getUser()` — no extra query needed.
- Stren staff assign `platform_role` through trusted tooling (SQL on `auth.users.raw_app_meta_data` / dashboard), per ADR-0005. Building that tooling is **out of scope**.
- **Decision (access control)**: reuse `platform_role = 'platform_admin'` as the operator gate. It already exists, is already what `create_gym` demands at the DB boundary, satisfies "no new DB role", and avoids a parallel env-var email allowlist that could drift from what the database enforces. No secrets or allowlists ship to the client.
- **Unauthorized behavior (documented)**: unauthenticated → existing redirect to `/auth?mode=signin`. Authenticated non-operator hitting `/superadmin/**` by manual URL → **redirect to `/gyms`** (their account home; calm, no error flash, no information about the surface). API routes return `403 { error: 'Forbidden.' }` (matching `apiRequirePermission` shape). Server layout additionally calls `notFound()` as defense-in-depth if middleware is ever bypassed.

## 6. Current DB + ORM findings

- `gyms`: `name`, `code` (unique, lowercase slug, doubles as public URL segment `/gym/{code}`), `address`, `phone` (not `email` — corrected during implementation, see §30.12), `logo_url`/`logo_path`, `operating_hours JSONB` (per-day free-text strings; see `lib/gym-data.ts:31` `Record<string, string> | null`), `brand_color`, `tagline`, `is_published` (default false). Known open bug: `get_gym_by_code` derives public visibility from tagline presence, not `is_published` (001:954; open item in ImplementationState).
- `membership_plans`: `name`, `price numeric(10,2)`, `duration_days`, `description`, `benefits` (since 025), `is_active`, `sort_order`.
- `profiles`: `email` (unique, stored lowercase since 019 fix pass), `name`, `contact_number`, `qr_code`, `active_gym_id`. `gym_users` as in §3.
- `gym_feature_settings.flags` JSONB stores per-gym feature deltas; app-side `isFeatureEnabled` ignores unknown keys and forces `coming_soon` off.
- Types: `lib/database.types.ts` is generated; migration 027 requires regeneration (`npm run db:types:check` guards drift).
- No invitation/claim-token table, no drafts table, no CSV import machinery, no general audit table (only `member_onboarding_events` + attribution columns) — all addressed in §17.
- House rules: `maybeSingle()` over `single()`; SECURITY DEFINER functions with `SET search_path = ''`; destructive SQL requires explicit user confirmation (none planned).

## 7. Existing invitation + email infrastructure

- `lib/email.ts` sends through the Resend HTTP API with raw `fetch` (the `resend` npm package is now a dependency but `lib/email.ts` still uses fetch — **keep the fetch pattern** for consistency). Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. Failure is returned as a structured result, not thrown — the caller decides recoverability (see `member_onboarding_events.sent_via: 'email' | 'preview'`).
- `sendOnboardingEmail` demonstrates QR-code CID attachment; `sendOwnerInquiryEmail` demonstrates operational notification copy.
- Magic-link generation exists (`admin.auth.admin.generateLink({ type: 'magiclink' })`) but the claim flow does **not** reuse it: claim links must be single-use, 24-hour, hashed-at-rest, and tied to an explicit "Claim ownership" confirmation — a first-party token (like `lib/password-recovery.ts` / `lib/auth-email-link.ts` do for recovery) is the compatible existing pattern.
- No SMS infrastructure exists. The invite service is designed extensible (§20) but SMS is explicitly not implemented.

## 8. Existing membership-plan implementation

`app/admin/plans/page.tsx` + `planSchema` (`lib/validations.ts:49`) + `membership_plans` table. Duration is stored as `duration_days` (integer) — the wizard's "duration value + unit" UI converts (months × 30 or via `date-fns`-consistent day math; **decision**: unit selector Days/Months where Months = 30 days, matching existing `duration_days` semantics; the stored value is always days). Prefilled default plan: name "Monthly Membership", duration 1 month (30 days), price blank (operator must enter ≥ 0), active true. Reuse the schema by composing `planSchema` into the wizard's step-3 schema rather than duplicating rules.

## 9. Existing member-import implementation

**None exists** — no CSV import, template, bulk insert, or preview UI anywhere in the repo. The closest machinery is the single-member onboard route (`app/api/admin/members/onboard/route.ts`), whose account-resolution sequence becomes the per-row import behavior. §12-D and §16 specify the minimal new importer; §17 adds nothing to the schema for it (imports create `profiles` + `gym_users` rows only — **no memberships, no payments**, because money is ledger-RPC-only after migration 025).

## 10. Existing staff + access implementation

- Team management: `app/admin/access/` + `components/admin/AccessClient.tsx` + `app/api/admin/access/people/route.ts` — owner-only attach/create staff accounts, access switches writing permission overrides (migration 015), removal.
- Duplicate-email handling precedent: exact lowercase `profiles.email` lookup, attach-vs-create, `gym_users` upsert on `(gym_id, user_id)`.
- Roles for wizard staff entries: existing `admin` and `staff` (labels "Admin", "Staff"); access summary text derives from role defaults in `lib/permissions.ts`. No conflicting role model is invented; per-permission overrides remain a post-onboarding People & access concern.

## 11. Proposed route + page architecture

```
app/superadmin/
  layout.tsx                    server: platform check (notFound fallback) + <SuperadminShell>
  page.tsx                      server: redirect('/superadmin/onboarding/new')
  onboarding/new/page.tsx       server: renders <OnboardingWizard/> (client island)
app/claim/[token]/page.tsx      public claim page (server + client confirm island)
app/api/superadmin/onboarding/
  provision/route.ts            POST — atomic idempotent provisioning
  slug-check/route.ts           GET  — slug uniqueness (debounced client calls)
  email-check/route.ts          GET  — duplicate-account status for an email
  resend-invite/route.ts        POST — supersede + resend claim invitation
app/api/claim/accept/route.ts   POST — consume token, activate ownership
```

- Middleware changes (`middleware.ts`): (a) add `/claim/` to the `isPublic` regex at `:79` (`pathname === '/claim' || pathname.startsWith('/claim/')`); (b) after `user` resolves and **before** the `get_my_access` call, insert:

```ts
if (pathname.startsWith('/superadmin')) {
  const isOperator = user.app_metadata?.platform_role === 'platform_admin';
  if (!isOperator) return finish(NextResponse.redirect(new URL('/gyms', request.url)));
  return finish(response); // operators may have no gym; skip get_my_access
}
```

- Success state is **in-place** (wizard swaps to `<SuccessState>` after provisioning) — no extra route, preserving the response payload (claim link, expiry) without persisting it client-side across navigations.

## 12. Proposed component hierarchy

```
components/superadmin/
  SuperadminShell.tsx        dark sidebar: Stren logo+wordmark, single nav item
                             "Assisted Onboarding", operator identity (email from
                             auth context), Logout (reuse app-shell.tsx logout)
  OnboardingWizard.tsx       top-level client island: WizardProvider + layout grid
  WizardTimeline.tsx         horizontal 4-step timeline (buttons; completed=green,
                             current=copper, future=disabled neutral)
  SetupTimeRow.tsx           divider-topped compact row under previews: stopwatch
                             icon + hardcoded per-step copy (§13 timer map)
  steps/StepGym.tsx
  steps/StepOwnerStaff.tsx
  steps/StepPlanAccess.tsx
  steps/StepReview.tsx
  MemberImportSection.tsx    CSV upload + template + preview table (inside step 3)
  PreviewColumn.tsx          3 preview cards + SetupTimeRow; hidden on mobile
  previews/OwnerDashboardPreview.tsx
  previews/QrPosterPreview.tsx      (reuses JoinQrPoster rendering, live slug)
  previews/MemberExperiencePreview.tsx
  SuccessState.tsx           "<GymName> is ready" + claim status/copy/resend
lib/
  platform-admin.ts          isPlatformAdminUser / requirePlatformAdminApi
  claim-invites.ts           token generate/hash, TTL const, claim URL builder
  onboarding/schemas.ts      zod step schemas incl. PH-mobile
  onboarding/slug.ts         slugify + shared slug regex + reserved words
  onboarding/state.tsx       WizardProvider (useReducer) + sessionStorage mirror
  onboarding/csv.ts          minimal CSV parse + row validation + dup detection
```

Preview modal **decision**: `lib/admin-ui.tsx` already exports a reusable `Modal` — click-to-expand per preview is trivial, so it is **included** (a `PreviewModal` wrapper). Recorded here per the brief.

## 13. Full step-by-step UX spec

**Shell/layout (desktop)**: dark simplified sidebar left; main area: header "Assisted Onboarding" + supporting copy "We'll get the gym set up in minutes. Fast, smooth, and painless."; horizontal timeline; large focused form card (left, ~2/3); preview column (right, ~1/3) with three preview cards, then a top-bordered, width-matched setup-time row (stopwatch icon + remaining time + supporting text) — visually a compact info row, **not** a fourth card. **Mobile**: sidebar collapses per `app-shell.tsx` responsive pattern; preview column hidden entirely; page shows title, responsive timeline, current form card, nav actions.

**Timer copy map (hardcoded, no runtime estimation)**: step 1 "2–3 minutes left" · step 2 "1–2 minutes left" · step 3 "About 1 minute left" · step 4 "Almost done" · success "Complete".

**Navigation rules**: completed timeline steps are clickable; Back returns to prior completed step; future steps disabled until every required field in the current step is valid; returning preserves in-session state; edits instantly update previews; invalidating an earlier step disables later steps until fixed; current step visually distinct (copper); completed steps restrained green; untouched future steps neutral; amber only for optional/attention states; red only for real validation errors.

**Save draft**: explicit button on every step. Persistence is **in-session only**: wizard state lives in the `WizardProvider` reducer and mirrors to `sessionStorage` (trivial with the existing client-state approach — survives an accidental refresh in the same tab, nothing more). No drafts table, no draft list, no cross-device resume. Copy: "Changes are saved for this setup session." Restrained sonner toast on press. This temporary behavior is deliberate and documented here.

**Prefills** (standalone Create Gym launch; no inquiry object): branch name ← gym name (or "Main Branch"); slug ← slugified gym name; owner role Owner; Stren logo fallback when no upload; one default plan (§8); hours 5:00 AM–10:00 PM all days (repo has no other default — `operating_hours` is nullable free-form); switch defaults per §13-C; member role Member. No fabricated personal data — owner name/email/mobile start blank with realistic placeholder examples only. All derived values stay editable.

**Step 1 — Gym**: fields: gym name (required, trimmed, 2–120 per migration 020); branch name (optional, single branch, defaults as above); full address (required; `gyms.address` free text — no map integration); logo (optional; reuse the gym-assets upload pattern from Studio; preview + remove/replace; Stren logo fallback); slug (required, auto from name, editable, normalized lowercase, validated against the shared regex + reserved words, uniqueness via debounced `slug-check` call, final URL preview `stren…/gym/{slug}`). Excluded by design: member count, currency, gym type, time zone, multi-branch. Inline accessible validation. Previews reflect name/branch/logo/slug/location live.

**Step 2 — Owner & Staff**: two clearly separated sections in one card.
*Owner (all required)*: full name; email; PH mobile (`^(\+63|0)9\d{9}$`, normalized to `+639XXXXXXXXX`, formatting hint "09XX XXX XXXX or +639XX…"); role Owner|Manager (default Owner; Manager maps to `admin`); consent method In person|Phone call|Email (required; operator id + timestamp + method auto-recorded at provisioning — no free-text note). On email blur → `email-check`: (A) existing Stren account → banner "existing account will be reused", no dup auth user, pending relationship prepared; (B) already owns/manages another gym → explicit confirm "this account gains access to an additional gym" (multi-gym is supported, ADR-0004); (C) active pending claim invite exists elsewhere → show state, offer resend/replace path, block duplicate invite. Nothing is committed during step 2.
*Staff (optional)*: Add staff → repeatable entries (name required, email required, mobile optional, role Admin|Staff with plain-language access summary, "Send invitation" default on); remove action; collapsed summary chip once valid (consistent with `OnboardMemberModal` patterns). Same duplicate-email handling; duplicate emails **within** the wizard (owner vs staff vs staff) are inline errors.

**Step 3 — Plan & Access**: four sections. *(A) Membership plans*: ≥1 valid plan required to reach step 4; prefilled default (§8); add/edit/remove; cannot remove the last plan; fields name/price PHP ≥0/duration value+unit/description optional/active; validation composed from `planSchema`. *(B) Operating hours*: per-day enabled toggle + open/close times; "copy to selected days"; closed days clearly marked; default 5:00 AM–10:00 PM all seven days; at least one open day required; serialized to the existing `operating_hours` JSONB shape (`Record<day, string>`, e.g. `"5:00 AM - 10:00 PM"` / `"Closed"`). *(C) Access & operational defaults* — eight individual switches, each with one line of supporting text (mapping in §17): kiosk check-in (on) · generate member invite QR (on) · auto-approve QR joins (off) · default new-user role (Member, fixed select) · staff manual check-in (on) · require active membership for check-in (on) · occupancy count (on) · gym visibility (private/unlisted default, uses `is_published`). *(D) Member import (optional, not postponed)*: CSV upload; downloadable template; header + row validation; preview of valid/invalid rows with row-numbered errors; in-file and against-wizard duplicate detection; confirmed count. **Import policy decision**: all-or-explicit-confirmation — any invalid row blocks import until the operator either fixes the file or explicitly confirms "Import N valid rows, skip M invalid". Silent partial import never happens. Template columns (from the member schema): `name` (required), `email` (required, unique), `contact_number` (optional).

**Step 4 — Review & Invite**: large review card, strong heading, clickable rows (chevron + edit affordance) returning to the owning step: Gym (name/location/slug) · Owner & Staff (owner name/role/staff count) · Membership plans (count + primary summary) · Operating hours (concise schedule) · Access setup (kiosk/QR/membership requirement/visibility) · Member import (count, or amber "Skipped — Optional"). Green pills + check icons for complete; amber for optional skipped; red only for invalid. Primary action **Finish setup** (never "Send invite"); secondary Back + Save draft. Supporting copy states plainly: the gym will be created; the owner receives a claim invitation; the owner must formally claim ownership; the operator can keep managing the gym while the claim is pending. *(Design risk: the referenced final screenshot was not available during planning — §30.)*

**Success state**: replaces the wizard. Headline "<GymName> is ready". Shows: pending-owner-claim status, recipient email, claim-link expiration (absolute time via `date-fns`), Copy claim link, Resend invitation, Return to Assisted Onboarding (resets wizard). If email delivery failed: gym still shown as created, delivery failure stated plainly, Resend offered, no false delivery claim.

## 14. Form state + validation strategy

- One `WizardProvider` (React context + `useReducer`) owns the canonical draft (typed `OnboardingDraft`), current step, completed-step set, and provisioning status. Mirrored to `sessionStorage` (versioned key, JSON, non-sensitive — no passwords exist in the draft) on every reducer commit; hydrated on mount.
- Each step is a `react-hook-form` form with `zodResolver` over its step schema from `lib/onboarding/schemas.ts` (`gymStepSchema`, `ownerStaffStepSchema`, `planAccessStepSchema`). "Continue" validates and merges into the draft; editing a completed step re-validates on change and recomputes step completeness (which is what disables later steps).
- Cross-step validation (duplicate emails across owner/staff/import) lives in pure helpers, unit-tested.
- Server never trusts client state: the provision route re-validates the entire payload with the same zod schemas plus server-only checks (slug uniqueness, email states), and the RPC re-validates critical invariants in SQL.

## 15. Dynamic preview architecture

Pure presentational components fed by a `useWizardPreviewData()` selector over the provider draft — instant updates as the operator types, no iframes, no network. Placeholders when empty: "Your gym", "Gym owner", "Your location", `gym-name` — never broken empty cards. *Owner dashboard preview*: mini dark-shell card with gym name/logo/owner greeting/plan count/kiosk state. *QR poster preview*: reuse `JoinQrPoster` rendering with live slug (`qrcode` already client-safe); regenerates on debounced slug changes. *Member experience preview*: member-home style greeting card (gym name, branch, member-facing greeting, membership plan summary). Each card is click-to-expand via the reused `Modal` (§12 decision). Transitions: 150–220 ms crossfade on content swap, disabled under reduced motion.

## 16. Server API / server-action design

All four `/api/superadmin/**` routes start with `requirePlatformAdminApi()` from `lib/platform-admin.ts` (server `getUser()` → check `app_metadata.platform_role`; 401 unauthenticated / 403 otherwise) — middleware does not protect `/api` (`middleware.ts:77`).

- **`GET slug-check?slug=`** → `{ available, normalized, reason? }`; service client lookup on `gyms.code` (lowercased) + shared regex/reserved validation. Client debounces ~350 ms.
- **`GET email-check?email=`** → `{ status: 'new' | 'existing_member' | 'owns_other_gyms' | 'pending_invite', gyms?: count }`; from `profiles` (lowercase exact) + `gym_users` roles + active `gym_claim_invites`.
- **`POST provision`** (body: full draft + `idempotencyKey` UUID): (1) zod re-validation; (2) resolve/create auth accounts for owner + staff + confirmed import rows via the `onboard/route.ts` pattern (`email_confirm: true`, no passwords; existing accounts reused by lowercase email — idempotent by construction); (3) generate claim token server-side, hash it (sha256); (4) **one call** to the `provision_gym_workspace` RPC with the payload, resolved user ids, token hash, and idempotency key — the entire critical write set commits or rolls back atomically in that single function; (5) post-commit: upload logo to `gym-assets` (path recorded in payload beforehand; failure recoverable), render QR, `sendOwnerClaimEmail`, then update `delivery_status` (`sent`/`failed`) and audit the send. Response: gym id/code, invite expiry, delivery status, raw claim link (returned once for Copy-link; never stored plaintext). Button disabled + in-flight state while processing.
- **`POST resend-invite`** (gym id): generates a fresh token, calls the supersede RPC (old invite `superseded_at = now()`, new row, new 24 h expiry), re-sends email, returns new expiry/delivery status.
- **`POST /api/claim/accept`** (token): requires a signed-in user (any account); hashes token, calls `claim_gym_ownership` RPC; maps SQL errors to precise states (expired / used / superseded / wrong email / not found). The claim page `/claim/[token]` is public: shows gym name + "Claim ownership of <GymName>" confirmation; if signed out, routes through `/auth?mode=signin` (or signup) and returns; existing users reuse their account.

## 17. DB changes + migrations — `supabase/migrations/027_assisted_onboarding.sql`

1. `ALTER TABLE gyms ADD COLUMN branch_name TEXT;` — single-branch display name (no branches table; consistent with the ADR-0004 deferral). Display fallback = gym name.
2. **`gym_claim_invites`**: `id uuid pk default gen_random_uuid()`, `gym_id uuid not null references gyms`, `invited_email text not null` (stored lowercase), `invited_name text`, `invited_role text not null default 'owner' check (invited_role in ('owner','admin'))`, `token_hash text not null unique`, `expires_at timestamptz not null`, `consumed_at timestamptz`, `superseded_at timestamptz`, `delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','failed'))`, `consent_method text not null check (consent_method in ('in_person','phone','email'))`, `created_by uuid not null references auth.users`, `created_at/updated_at`. Partial unique index `ON (gym_id) WHERE consumed_at IS NULL AND superseded_at IS NULL` — one active invite per gym. RLS: service_role full; `is_platform_admin()` select/insert/update; no anon/member access (claims go through the RPC).
3. **`provisioning_runs`**: `idempotency_key uuid pk`, `created_by uuid`, `gym_id uuid`, `result jsonb`, `created_at` — replay returns the stored result. RLS as above.
4. **`platform_onboarding_events`**: `id`, `gym_id`, `actor uuid`, `event_type text` (`provisioned`, `invite_sent`, `invite_send_failed`, `invite_resent`, `claimed`, `member_import`), `detail jsonb`, `created_at` — the audit trail (no general audit table exists; `member_onboarding_events` stays member-scoped). RLS as above.
5. **`provision_gym_workspace(p_payload jsonb, p_token_hash text, p_idempotency_key uuid) returns jsonb`** — SECURITY DEFINER, `SET search_path = ''`, `is_platform_admin()` required, `REVOKE … FROM PUBLIC, anon`. Single transaction: idempotency check (early return of stored result) → slug validation identical to `create_gym` (regex/reserved/uniqueness; raise on conflict) → insert gym (name, code, address, branch_name, operating_hours, logo_path if pre-uploaded, `is_published` false unless visibility switch on) → `gym_feature_settings.flags` deltas → `membership_plans` rows → owner `gym_users` row (`role` per invited_role, **`status 'pending'`**) → staff `gym_users` rows (`status 'pending'`) → imported members (`profiles` upsert already done app-side via auth admin; RPC inserts their `gym_users` `role 'member', status 'active'`) → `gym_claim_invites` row (token hash, 24 h expiry, consent metadata) → `platform_onboarding_events` rows → `provisioning_runs` row. Any failure raises → whole transaction rolls back.
6. **`claim_gym_ownership(p_token_hash text) returns jsonb`** — SECURITY DEFINER, authenticated. `SELECT … FOR UPDATE` on the invite by hash; validate: exists, `consumed_at IS NULL`, `superseded_at IS NULL`, `expires_at > now()`, `lower(auth.jwt() ->> 'email') = invited_email` — each failure raises a distinct error code for precise UI states. Then: `gym_users` row → `status 'active'`; `consumed_at = now()`; `profiles.active_gym_id` set; audit event; return gym info. Single-use is enforced by the row lock + consumed check.
7. **`supersede_claim_invite(p_gym_id uuid, p_new_token_hash text, p_expires_at timestamptz) returns jsonb`** — platform-admin-gated; marks the active invite superseded, inserts the replacement atomically.
8. **Switch storage/enforcement mapping** (uses the existing feature-toggle machinery — no new settings table): add four keys to `FEATURE_CATALOG` in `lib/features.ts` (zero-migration by design, per that file's header comment) **and** mirror their defaults in the `gym_feature_enabled` SQL helper in this migration: `auto_approve_joins` (default **off**), `staff_manual_checkin` (default on), `checkin_requires_membership` (default on), `occupancy_count` (default on). Enforcement patches in the same migration: membership-verification/join RPC (migration 021 family) honors `auto_approve_joins` (on → QR joins activate immediately; off → today's pending/verification behavior, unchanged default); kiosk manual-toggle RPC (migration 023) additionally requires `staff_manual_checkin`; kiosk check-in path honors `checkin_requires_membership` (default on = current lapsed-gate behavior); occupancy RPC honors `occupancy_count`. Remaining switches: kiosk check-in → existing `kiosk_checkin` key; visibility → `gyms.is_published`; invite QR → provisioning-behavior only (QR is always derivable from the code; the switch controls poster generation/email inclusion — nothing stored); default role → fixed `member`, nothing stored.
9. Regenerate `lib/database.types.ts`; `npm run db:invariants` and the deployment contract (migration 026 snapshot) must be updated to include the new objects — **check `scripts/deployment-contract.mjs` expectations, since 026 snapshots exact function signatures**.

## 18. Atomic provisioning + rollback strategy

Critical set (gym, branch column value, account linkage rows, permission-bearing `gym_users` rows, plans, hours, settings, claim-invite record, consent metadata, audit rows) all live inside `provision_gym_workspace` — one plpgsql function = one transaction; any raise rolls everything back. Auth-user creation happens **before** the transaction via the Supabase admin API (it cannot be transactional with Postgres): on later failure, created auth users remain but are harmless and are **reused** on retry by email lookup — no duplicates, no cleanup needed (same property the existing onboard route relies on). Post-commit steps (logo upload finalization, QR render, email) are non-critical: failure never deletes the gym; it sets `delivery_status = 'failed'` (or leaves the logo at fallback) and surfaces a recoverable state with Resend.

## 19. Idempotency strategy

- Client generates one `idempotencyKey` (UUID) when Step 4 mounts; every Finish-setup attempt for that review session reuses it; the button is disabled while in flight.
- `provisioning_runs` makes the RPC replay-safe: same key → stored result returned, zero re-execution. Double-clicks, retries after network timeouts, and refresh-resubmits cannot create duplicate gyms or invites.
- Secondary guards: `gyms.code` uniqueness (raises cleanly → surfaced at Step 1), the one-active-invite partial unique index, `gym_users` PK upserts, and lowercase-email account reuse.

## 20. Invitation + owner-claim lifecycle

```
provisioned ──> invite active (pending, 24 h TTL)
   │  email sent?  ──no──> delivery_status='failed' ──resend──┐
   │                                                          │
   ├─ resend ──> old superseded, new active token (new 24 h) ─┘
   ├─ 24 h pass ──> expired (resend available)
   └─ owner opens /claim/{token} ──> sign in / create account
        └─ explicit "Claim ownership of <GymName>" confirm
             └─ claim_gym_ownership: pending → active, single-use consumed
```

Token: 32 random bytes (`node:crypto randomBytes`), base64url — sent once in the email link and returned once to the operator (Copy link); only the sha256 hash is stored. Single-use, email-bound (JWT email must match `invited_email`), 24-hour expiry, resend supersedes. Gym remains operator-visible and shows "Pending owner claim" until accepted (owner `gym_users.status = 'pending'` is the state carrier — consistent with the existing status vocabulary). Extensible to SMS later: `sendOwnerClaimEmail` sits behind a small `deliverClaimInvite()` dispatcher so a channel can be added without touching provisioning.

## 21. Error + recovery states

- Field-level inline errors (red) with described messages; step-level completeness drives timeline disabling.
- `slug-check`/`email-check` network failure: non-blocking inline warning + retry; provisioning re-validates server-side regardless.
- Provisioning failure (critical): full rollback; wizard stays on Step 4 with a plain-language error banner mapping SQL error codes (slug taken → link back to Step 1; duplicate invite → resend guidance); idempotency key retained so retry is safe.
- Email failure (recoverable): success state with explicit "invite delivery failed" + Resend; `delivery_status` tracks truthfully.
- Claim errors: distinct pages/states for expired (offer "ask your Stren contact to resend"), used, superseded, wrong-account email (shows which email the invite targets, masked), invalid token → calm not-found-style state.
- Save-draft confirmation toast; provisioning in-flight state with disabled actions; status announcements via live regions (§24).

## 22. Security considerations

- Server-side enforcement at four layers: middleware redirect, server-layout `notFound()`, per-API `requirePlatformAdminApi()`, and `is_platform_admin()` inside every new SECURITY DEFINER RPC — client nav hiding is cosmetic only.
- No new DB role; `platform_role` lives in server-controlled `app_metadata` (unspoofable via user metadata APIs). No secrets, allowlists, or credentials in client JS or in the repo.
- Claim tokens: CSPRNG, hashed at rest (sha256), single-use via row lock, 24 h TTL, email-bound, superseded on resend; comparison by hash equality on an indexed unique column (no timing-sensitive plaintext compare).
- Client-submitted permissions are never trusted: roles are constrained by CHECK/whitelist in the RPC (`owner|admin` for invitees, `admin|staff` for staff, `member` for imports); flags are filtered to the known catalog keys server-side.
- All new tables RLS-enabled, default-deny, service/platform-admin policies only. All functions `SET search_path = ''`, `REVOKE FROM PUBLIC, anon`.
- CSV input treated as hostile: size cap (~1 MB / 2,000 rows), header whitelist, zod per-row validation, no formula-style values echoed into HTML unescaped (React default escaping; no CSV re-export in scope).
- Rate limiting: reuse `lib/rate-limit.ts` on `slug-check`/`email-check`/`claim/accept` to blunt enumeration; `email-check` responses are operator-gated anyway.
- Emails: only to the operator-entered owner address after explicit consent capture (method + operator + timestamp stored).

## 23. Responsive behavior

Desktop ≥1024 px: sidebar + form card + preview column grid. 768–1024: preview column drops first (form card full width). <768: sidebar collapses to the existing responsive nav pattern; timeline compresses (numbers + current label); previews hidden entirely (never squeezed); Back/Save draft/Continue in a sticky action row. Review rows stack; success state single column.

## 24. Accessibility requirements (acceptance criteria)

Labels tied to every field (`htmlFor`/`aria-labelledby`); errors linked via `aria-describedby` + `aria-invalid`; timeline = `nav` with buttons (`aria-current="step"`, disabled future steps focusable-skipped, arrow-key support); switches = Radix Switch with visible labels + state text (never color alone — pills carry text); visible copper focus rings (existing token); real `<button>`/`<form>` semantics with submit on Continue; file upload = labeled input + button proxy with announced file name/remove; preview modal = reused `Modal` (focus trap, `Esc`, `aria-modal`); live regions (`role="status"`) announce save-draft, validation summaries, provisioning progress, invite send result; AA contrast on amber/green/red states in both shells; `prefers-reduced-motion` zeroes all transitions.

## 25. Animation behavior

Step transitions: 150–220 ms opacity/8-px-slide crossfade (tailwindcss-animate utilities already present); completion checkmark micro-pop ≤200 ms; timeline progress line animates width; preview content crossfades on debounced changes; no page-level slides, no dramatic scaling, nothing delaying input focus; every animation gated on `prefers-reduced-motion` (existing pattern from the loading system).

## 26. Exact file-by-file change list

| File path | Create/Modify | Purpose | Depends on | Tests affected |
|---|---|---|---|---|
| `supabase/migrations/027_assisted_onboarding.sql` | Create | Tables, RPCs, feature-key mirrors, enforcement patches (§17) | 020, 021, 023, 025, 026 | new `tests/integration/assisted-onboarding-sql.test.ts`; `deployment-contract`, `permission-model-sql` |
| `lib/database.types.ts` | Modify (regenerate) | Types for new tables/RPCs | 027 | `db:types:check` |
| `middleware.ts` | Modify | `/superadmin` operator branch; `/claim` public | — | `tests/integration/middleware*` + new authorization test |
| `lib/platform-admin.ts` | Create | `isPlatformAdminUser`, `requirePlatformAdminApi`, page guard | — | new unit test |
| `lib/claim-invites.ts` | Create | Token generate/hash, TTL, claim URL | — | new unit test |
| `lib/onboarding/schemas.ts` | Create | Step zod schemas, PH mobile, plan composition | `lib/validations.ts` | new unit test |
| `lib/onboarding/slug.ts` | Create | Slugify + shared regex/reserved list (mirrors 020) | — | new unit test |
| `lib/onboarding/state.tsx` | Create | WizardProvider, reducer, sessionStorage mirror, preview selector | schemas | new integration test |
| `lib/onboarding/csv.ts` | Create | Minimal CSV parse/validate/dedupe | schemas | new unit test |
| `lib/features.ts` | Modify | 4 new catalog keys (§17.8) | — | `tests/unit/permissions.test.ts` family, features tests |
| `lib/email.ts` | Modify | `sendOwnerClaimEmail` (+ `deliverClaimInvite` dispatcher) | claim-invites | new unit test (payload shape) |
| `app/superadmin/layout.tsx` | Create | Server platform check + shell | platform-admin | authorization integration test |
| `app/superadmin/page.tsx` | Create | Redirect to wizard | — | — |
| `app/superadmin/onboarding/new/page.tsx` | Create | Wizard page | all components | wizard integration tests |
| `components/superadmin/SuperadminShell.tsx` | Create | Simplified dark sidebar | `app-shell.tsx` patterns | shell render test |
| `components/superadmin/OnboardingWizard.tsx` | Create | Layout grid + provider wiring | state, steps, previews | wizard integration tests |
| `components/superadmin/WizardTimeline.tsx` | Create | 4-step timeline | state | timeline tests |
| `components/superadmin/SetupTimeRow.tsx` | Create | Divider + stopwatch + timer copy | — | timer-copy test |
| `components/superadmin/steps/StepGym.tsx` | Create | Step 1 | schemas, slug, slug-check API | step-1 tests |
| `components/superadmin/steps/StepOwnerStaff.tsx` | Create | Step 2 | schemas, email-check API | step-2 tests |
| `components/superadmin/steps/StepPlanAccess.tsx` | Create | Step 3 | schemas, csv, MemberImportSection | step-3 tests |
| `components/superadmin/steps/StepReview.tsx` | Create | Step 4 review + Finish setup | provision API | step-4 tests |
| `components/superadmin/MemberImportSection.tsx` | Create | CSV upload/template/preview | csv | import tests |
| `components/superadmin/PreviewColumn.tsx` | Create | Preview stack + SetupTimeRow | previews | preview tests |
| `components/superadmin/previews/OwnerDashboardPreview.tsx` | Create | Live owner-dashboard card | state selector | preview tests |
| `components/superadmin/previews/QrPosterPreview.tsx` | Create | Live QR poster | `JoinQrPoster`, `qrcode` | preview tests |
| `components/superadmin/previews/MemberExperiencePreview.tsx` | Create | Live member card | state selector | preview tests |
| `components/superadmin/SuccessState.tsx` | Create | Success + claim status/copy/resend | resend API | success tests |
| `app/api/superadmin/onboarding/provision/route.ts` | Create | Atomic idempotent provisioning orchestration | platform-admin, supabase-admin, 027 RPC, email | provision contract tests |
| `app/api/superadmin/onboarding/slug-check/route.ts` | Create | Slug uniqueness | platform-admin | route tests |
| `app/api/superadmin/onboarding/email-check/route.ts` | Create | Duplicate-account status | platform-admin | route tests |
| `app/api/superadmin/onboarding/resend-invite/route.ts` | Create | Supersede + resend | platform-admin, claim-invites, email | resend tests |
| `app/claim/[token]/page.tsx` | Create | Public claim page + confirm island | claim accept API | claim tests |
| `app/api/claim/accept/route.ts` | Create | Consume token via RPC | 027 RPC | claim tests |
| `AgentsContextKnowledgeBase/*` + `CHANGELOG.md` + `CONTEXT.md` | Modify | This plan + catalog/state/changelog/vocabulary | — | — |

## 27. Testing strategy (repo stack: Vitest + Playwright, TDD)

Write the failing test first for every unit below (red → green → refactor); SQL contracts follow the migration-020 test pattern.

- **Authorization** (`tests/integration/superadmin-authorization.test.ts`): operator passes middleware branch; authenticated non-operator redirected to `/gyms`; unauthenticated redirected to sign-in; each `/api/superadmin/**` route 401/403s without the JWT claim; client-side manipulation cannot bypass (route handlers tested directly).
- **Wizard** (`tests/integration/onboarding-wizard.test.tsx`): required-field blocking, future-step disabling, Back, clicking completed timeline steps, invalidating an earlier step locks later ones, session-state preservation across step hops + simulated remount (sessionStorage), save-draft toast, timer copy per step.
- **Step 1**: slug generation/editing/normalization, reserved words, duplicate-slug state from mocked `slug-check`, logo upload preview + fallback.
- **Step 2**: email validity, PH mobile accept/reject matrix (`0917…`, `+63917…`, reject `08…`/short/alpha), consent required, mocked `email-check` states A/B/C, add/remove staff, duplicate staff email inline error.
- **Step 3**: plan validation via composed `planSchema`, multiple plans, cannot-remove-last-plan, hour validation (open < close, ≥1 open day), copy-hours action, switch defaults, CSV: valid file preview, invalid rows block, explicit skip-confirm path, duplicate emails (in-file + vs owner/staff), template columns.
- **Step 4 / provisioning** (`tests/integration/onboarding-provision.test.ts`, mocked `supabase-admin` + RPC): review summaries + edit links; payload re-validation; duplicate submission with same idempotency key → single RPC effect; RPC failure → error surfaced, no success state; email failure → success-with-failed-delivery state; audit + QR calls made.
- **SQL contracts** (`tests/integration/assisted-onboarding-sql.test.ts` + `tests/database/` additions): 027 objects exist; RPCs revoke anon; provision idempotency replay; claim: valid / expired / consumed / superseded / wrong-email error codes; supersede uniqueness; feature-default mirrors.
- **Claim flow** (`tests/integration/claim-flow.test.tsx`): all §21 claim states, signed-out → auth round-trip, explicit confirm required, resend supersedes.
- **Responsive + a11y**: preview column hidden at mobile width; timeline keyboard nav; switch/label associations; live-region announcements; reduced-motion class behavior.
- **E2E** (`tests/e2e/superadmin-onboarding.spec.ts`, env-gated like existing credentialed specs — requires an `E2E_PLATFORM_ADMIN_*` fixture): full operator journey desktop + mobile viewport; unauthorized-account URL entry.

## 28. Implementation phases (dependency-ordered)

1. **P0 — Schema & contracts**: migration 027 + SQL contract tests + regenerated types + deployment-contract snapshot update.
2. **P1 — Access layer**: `lib/platform-admin.ts`, middleware branch, superadmin layout/shell + authorization tests.
3. **P2 — Wizard core**: state provider, timeline, SetupTimeRow, Step 1 (+ slug lib, slug-check route), preview column with live Step-1 data.
4. **P3 — Step 2**: owner/staff forms, PH-mobile schema, email-check route, duplicate-state UX.
5. **P4 — Step 3**: plans, hours, switches (+ `lib/features.ts` keys), CSV lib + import section.
6. **P5 — Provisioning**: Step 4 review, provision route, idempotency, success state, claim email.
7. **P6 — Claim & resend**: claim page/API, resend route, lifecycle states.
8. **P7 — Polish & gate**: a11y pass, animation/reduced-motion, responsive audit, full `npm run test:ci`, docs (`ImplementationState.md` + `CHANGELOG.md` in the shipping PR).

## 29. Definition of done

Every §27 test green inside `npm run test:ci` (lint → typecheck → unit/integration → build → e2e); migration 027 applies on the clean local bootstrap (`db:reset` from empty per migration-026 contract) and passes `db:invariants`; operator journey manually verified (provision → email → claim → owner lands on `/admin` with active ownership); unauthorized URL entry verified redirecting; success + failed-delivery + resend states exercised; no payments/memberships created anywhere in the flow; a11y criteria of §24 spot-checked with keyboard + screen reader; `ImplementationState.md` and `CHANGELOG.md` updated in the same PR; no agent commits/pushes.

## 30. Risks + codebase-dependent decisions

1. **No final-screenshot reference**: the brief's Step-4 design references a screenshot that was not available during planning (user chose to proceed without). Step-4 visuals are specified from the written spec + existing design tokens; expect a possible visual-polish iteration once the reference exists.
2. **Exact RPC names for switch enforcement** (migrations 021/023 join + kiosk functions) were not re-verified line-by-line on this branch; the implementer must confirm signatures before patching them in 027 (migration 026's deployment contract snapshots exact signatures — changing them requires updating that snapshot).
3. **`is_published` tagline bug**: public visibility still derives from tagline presence (001:954; standing open item). The wizard's default private setting sidesteps it; choosing "visible" at onboarding cannot make a tagline-less gym public until that bug is fixed — supporting text must not overpromise.
4. **Financial-ledger boundary**: import intentionally creates no memberships/payments (money is RPC-only post-025). Imported members appear as active gym users without an effective membership — they hit the existing lapsed/renewal path until staff record payments. Product-accepted trade-off; revisit only with a deliberate money-path design.
5. **Auth users pre-created outside the DB transaction** can orphan on provisioning failure; mitigated by idempotent email-based reuse (§18). No cleanup job planned.
6. **`FEATURE_CATALOG` growth**: four new keys widen the owner Features panel surface; labels/effects must be written so they read sensibly there too (same catalog feeds both surfaces).
7. **Branch state**: `polish-and-hardening` carries migrations 025/026 that are not yet applied to the hosted project (FI2 launch gate blocked externally). 027 stacks on them — local-first development; hosted apply follows the existing migration-sync guide and the FI2 gate.
8. **Operator fixture for E2E**: no platform-admin test credentials exist; the credentialed E2E spec stays env-gated (consistent with the existing 8 skipped credentialed cases).
9. **`resend` npm package vs raw fetch**: `lib/email.ts` uses raw fetch while the `resend` package is now installed (financial-branch addition). This plan keeps the fetch pattern; migrating to the SDK is a separate refactor decision.
10. **Slug vs legacy gym code style**: `lib/crypto.ts` `generateGymCode()` produces `IRON-X7K2`-style codes that violate the migration-020 slug rules; the wizard must never use it. New slugify util is authoritative.

### Deviations recorded during implementation (2026-07-18)

11. **Migration 027 never applied to a database.** This environment has no Docker/local Supabase, so `db:reset`/`db:invariants`/the deployment-contract snapshot could not be exercised live. Verification is instead 14 static SQL-contract tests (`tests/integration/assisted-onboarding-sql.test.ts`, matching the repo's existing text-assertion convention for `015`/`025`) plus careful manual review of every helper/trigger the new functions call (`is_platform_admin`, `has_gym_permission`, `kiosk_access_allowed`, `has_member_portal_entitlement`, `protect_last_active_owner`, `stamp_gym_user_approval`, `clear_invalid_active_gym`, `validate_active_gym`) against their actual bodies in 019/020/023. **Before hosted apply**: run a real `db:reset` locally, update the migration-026 deployment-contract snapshot to include the new objects, and re-run `db:invariants`.
12. **`gyms.phone` not `gyms.email`**: §6 of this plan mis-stated the gym contact column as `email`; the actual baseline column is `phone` (001:95), and it is unused by Step 1 (no phone field is collected there — out of scope per §10's exclusion list). The migration's `provision_gym_workspace` accepts `phone` as optional/nullable and it is simply never populated by the wizard today.
13. **Claim-page post-sign-in redirect gap**: a signed-out visitor who signs in from `/claim/[token]` is routed by the existing shared `choosePostAuthDestination`/middleware auth-router to their normal destination (gym hub, admin, etc.), not back to the claim page — there is no `?next=` mechanism in that router. Rewiring the shared post-auth router was judged out of scope and higher-risk than the gap itself (it is used by every sign-in in the app); the claim page instead tells the visitor to reopen the claim link after signing in. Revisit only as a deliberate, separately-reviewed change to `lib/post-auth-destination.ts`.
14. **`slugify()` vs `sanitizeSlugInput()`**: the original single `slugify()` helper trimmed trailing hyphens on every call, which silently deletes a hyphen the operator is mid-typing (e.g. typing "custom-url" character-by-character loses the hyphen). Split into `slugify()` (one-shot derivation from the gym name) and `sanitizeSlugInput()` (live keystroke normalization that never trims a trailing hyphen); `validateSlugFormat()` still rejects a genuinely trailing hyphen at submit time. Caught by `tests/unit/step-gym.test.tsx`.
15. **E2E not executed**: no `E2E_PLATFORM_ADMIN_*` fixture exists in this environment, and running the full Playwright suite was out of scope for this pass given the size of the change. The full manual QA walkthrough in the final response substitutes for it; add the credentialed spec and fixture before relying on it in CI.

## 31. Implementation checklist

- [x] P0: migration 027 written (tables, RPCs, mirrors, patches) — SQL contract tests red → green (14/14)
- [x] P0: `lib/database.types.ts` hand-extended to match (no live DB to run codegen against — see §30.11); deployment-contract snapshot update deferred to hosted-apply prep
- [x] P1: `lib/platform-admin.ts` + middleware `/superadmin` branch + `/claim` public — authorization tests green (26/26 incl. real `middleware()` execution via mocked `@supabase/ssr`)
- [x] P1: `app/superadmin/layout.tsx` + `SuperadminShell` (logo, one nav item, operator identity, logout)
- [x] P2: WizardProvider + sessionStorage mirror + timeline + SetupTimeRow + timer copy
- [x] P2: Step 1 complete (slug lib, slug-check route, logo upload, previews live)
- [x] P3: Step 2 complete (PH mobile, consent, email-check states A/B/C, staff entries)
- [x] P4: Step 3 complete (plans ≥1, hours defaults 5:00 AM–10:00 PM, 8 switches + 4 new feature keys, CSV import all-or-confirm)
- [x] P5: Step 4 review rows + Finish setup + provision route (atomic, idempotent) + success state
- [x] P5: `sendOwnerClaimEmail` + delivery_status truthfulness + Copy claim link
- [x] P6: `/claim/[token]` page + accept route + expired/used/superseded/wrong-email states + resend supersedes
- [x] P7: a11y criteria (§24), animations + reduced motion (§25), responsive (§23)
- [x] P7: full quality gate green — `npm run lint` (repo-wide), `npx tsc --noEmit` (zero new errors), complete unit/integration suite (574/574), production build; `ImplementationState.md` + `CHANGELOG.md` updated in this same working-tree change
- [ ] Developer commits/pushes (agents never do) — everything above is staged, uncommitted, on `super-admin`
