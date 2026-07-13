# Unified Accounts & Auth Rebuild — Implementation Guide

_✅ Completed 2026-07-13 and shipped to `main` via `f04fb2f`. Agent C = Codex 5.6 Sol; Agent U = Claude Opus 4.8. Kept as historical contract per Catalog rule 6._

---

## 0. The decision (user-approved 2026-07-11)

Stren moves from **Canvas-style per-gym logins** (one account per gym, remembered via login-origin cookies) to **one account for all of Stren**:

1. **One account per person.** Email + password, created once at `/signup`. `profiles` becomes pure identity (name, email, avatar, QR) — **`role`, `gym_id`, and `status` leave `profiles`**.
2. **Gyms attach to the account** through a new **`gym_users`** table: one row per (gym, user) with a per-gym `role` and `status`. The same person can be owner of gym A and member of gym B.
3. **One gym context at a time.** A server-side **active gym** (`profiles.active_gym_id`, changed only via `set_active_gym()`) keeps the existing `get_gym_id()` / `is_manager()` / `get_my_access()` contracts working — the entire RLS + permission + feature-toggle stack from migrations 011–018 survives with rewritten internals, not rewritten policies.
4. **Auth routes are rebuilt from scratch, old code deleted** (not debugged): one `/login`, one `/signup`, a **gym hub** at `/gyms` (list / join / create), and a **gym switcher** in the admin and member shells. Every legacy auth URL becomes a permanent redirect.
5. Production data does not need preserving beyond a mechanical backfill. **The column drops in §3 are pre-approved by this plan** (CLAUDE.md's destructive-SQL confirmation is satisfied by the user's sign-off on this document).

Non-goals (explicitly cut from this workstream): leaving/archiving a gym from the member side, platform-level account bans, path-scoped tenant URLs (`/gym/{code}/admin` — see ADR-0004 alternatives), OAuth/social login, merging today's duplicate accounts (none worth keeping).

Deferred with a recorded composition path (grill session 2026-07-11; the account model must not block these, and doesn't):
- **Phone-OTP login** — a later workstream once revenue absorbs per-SMS cost; accounts are channel-agnostic (Supabase phone identities bolt on), signup stays name/email/password now.
- **Organizations / multi-branch** — each branch is its own gym for now (owner owns several from the hub); a future `orgs` layer (`gyms.org_id`, org-scoped plans, cross-branch leaderboards) is the path when a chain customer appears.
- **Owner email digest** of recorded payments — needs email infra; in-app owner alerts ship now (§2.7).

---

## 1. Current state (verified 2026-07-11, main @ `3e52c95`)

### Auth surfaces (the "shenanigans")

| Surface | What it actually does | Fate |
|---|---|---|
| `app/login/page.tsx` | Not a login form — client redirect dispatcher: `?gym=` → per-gym login; else login-origin cookie/localStorage; else `/gym-select`. Also renders magic-link `?error=` states | **Rebuild** as the real login page |
| `app/gym/[code]/login/page.tsx` + `components/auth/LoginForm.tsx` | The real per-gym login; validates email belongs to gym via `check_gym_membership` RPC | **Delete** → redirect |
| `app/gym/[code]/signup/page.tsx` + `components/auth/GymSignUpForm.tsx` | Per-gym member signup | **Delete** → redirect |
| `app/signup/page.tsx`, `app/signup/member/page.tsx` | Member signup with gym search (`search_gyms`, `get_gym_by_code`), signUp + immediate signInWithPassword | **Rebuild** `/signup` as account-only; delete `/signup/member` |
| `app/signup/admin/page.tsx` | Owner signup → `create_gym_and_owner` RPC | **Delete** → `/gyms/new` |
| `app/kiosk/signup/page.tsx` | Dead stub redirecting to `/gym-select` | **Delete** |
| `app/gym-select/page.tsx` | Public "find your gym's login page" search | **Delete** → `/gyms` |
| `app/reset-password`, `app/auth/callback` | PKCE recovery + code exchange | **Keep**; re-point post-auth routing |
| `middleware.ts` | Single auth guard, but also login-origin cookie writer, `resolveLoginPath` guessing, per-surface profile lookups | **Rewrite** (simpler: no origin tracking) |
| `lib/auth-context.tsx` (~700 lines) | Session lifecycle + login-origin + gym-derived sign-out routing + role-based redirects + password-setup flags + profile cache | **Rebuild** lean (Codex-owned; §6.2 contract) |
| `lib/login-origin.ts`, `lib/sign-out-routing.ts` | Cookie/localStorage origin plumbing | **Delete** |

### Single-gym keystones in the database

- `profiles.role`, `profiles.gym_id`, `profiles.status` — the one-gym-per-account assumption.
- `public.get_gym_id()` (reads `profiles.gym_id`) — used by ~50 RLS policies/RPCs across migrations 010–018. `get_user_role()`, `is_manager()` read `profiles.role`.
- `get_my_access()`, `has_gym_permission()`, `validate_permission_override()` read role/gym from `profiles`.
- `handle_new_user()` trigger hardcodes `role='member'` into the profile.
- `check_gym_membership(email, gym)` (012/013) exists only to serve per-gym login.
- `create_gym_and_owner` sets the caller's profile role/gym.
- `app/api/admin/members/onboard` (service role) creates a **new auth user per gym** — the exact multi-account pain this workstream removes.
- Hidden one-gym-per-member uniques: `streaks.member_id UNIQUE`, `member_notification_preferences.member_id UNIQUE`, `notification_cooldowns UNIQUE(member_id, notification_type)` — all must become per-gym composites (and their RPC `ON CONFLICT` targets updated).
- `profiles.email` is already `UNIQUE` — global accounts are half-true today; the blocker is the single `gym_id` pointer.

---

## 2. Target architecture

### 2.1 Identity model

- **Account** = `auth.users` row + `profiles` row (id, email, name, contact_number, avatar_*, qr_code, active_gym_id, created_at). No role, no status, no gym.
- **`gym_users`** (see §3.1) = one row per (gym_id, user_id): `role` (`owner|admin|staff|member`) + `status` (`active|pending|rejected`) + timestamps. This is the **security truth** for "who is what, where".
- Invariants: a gym always has ≥1 active owner (trigger blocks demoting/removing the last one); QR codes stay per-account (kiosk validates the scanned account has an **active** `gym_users` row at the kiosk's gym); every `gym_users` row records **who added it** (`added_by`; NULL for self-joins until approval stamps the approver).
- **Managers are members too** (grill decision): one row, one role — a manager role is a superset. `/member`, kiosk QR check-in, streaks, and feed work for **any active affiliation regardless of role**; managers appear on the leaderboard only if they actually check in (no special-casing). The switcher exposes "Member view" (admin shell) and "Admin view" (member shell, managers only). No dual profiles, ever.

### 2.2 Context resolution (why nothing else has to change)

- `profiles.active_gym_id` holds the currently selected gym. Written **only** by `set_active_gym(p_gym_id)` (RPC validates an active affiliation) and by `create_gym` / post-auth auto-select; a `BEFORE UPDATE` trigger rejects any value without a matching active `gym_users` row (NULL always allowed).
- `get_gym_id()` is **re-implemented, same signature**: returns `active_gym_id` iff a matching active `gym_users` row exists, else NULL. NULL fails every `gym_id = get_gym_id()` policy closed — a user with no gym (or a stale selection) simply sees nothing and gets routed to `/gyms`.
- `get_user_role()` / `is_manager()` / `get_my_access()` / `has_gym_permission()` re-read from `gym_users` (§3.2). **Same signatures, same return shapes** — `lib/access-data.ts`, `lib/permissions.ts`, middleware's `get_my_access` call, and all 011–018 policies keep working.
- Multi-tab caveat (accepted, ADR-0004): switching gyms in one tab changes the context other tabs see on their next request — the Instagram-switcher trade-off, correct for this product.
- **Kiosk exception — pinned gym** (grill decision): the kiosk must NOT ride the active gym (a multi-gym owner switching contexts on their phone would silently re-point a live front-desk tablet — wrong-gym check-ins). `/kiosk` captures its gym explicitly at launch (from the operator's active gym at that moment, persisted on the device/URL), and **every kiosk RPC takes an explicit `p_gym_id` validated affiliation-based** ("caller has an active manager row at that gym"), never via `get_gym_id()` equality.

### 2.3 Route map (canonical — settle once and for all)

| Route | Status | Behavior |
|---|---|---|
| `/login` | **Rebuilt** | THE login form (email + password). `?gym=CODE` renders gym-flavored header and post-auth lands in that gym (§2.4). Renders magic-link `?error=` banner. Links: forgot password, create account |
| `/signup` | **Rebuilt** | Create the one Stren account (name, email, password). Optional `?gym=CODE` = join intent carried through §2.4 |
| `/gyms` | **NEW** | Gym hub (auth required): my gyms with role/status chips, tap to enter; join a gym (code entry + `search_gyms`); "I run a gym" → `/gyms/new`; pending/rejected states |
| `/gyms/new` | **NEW** | Create gym (name, code) → `create_gym` RPC → owner of it, active, → `/admin` |
| `/reset-password` | Kept | PKCE recovery; visual reskin only |
| `/auth/callback` | Kept | Code exchange; post-auth destination per §2.4 |
| `/admin/*`, `/member/*`, `/kiosk`, `/gym/[code]` (public) | Unchanged paths | Middleware resolves the active gym; pages keep reading `get_my_access` / `x-gym-id` |
| `/gym/[code]/login` | **308** | → `/login?gym=CODE` (posters/QRs in the wild) |
| `/gym/[code]/signup` | **308** | → `/signup?gym=CODE` |
| `/signup/admin` | **308** | → `/gyms/new` |
| `/signup/member` | **308** | → `/signup` |
| `/gym-select` | **308** | → `/gyms` |
| `/kiosk/signup` | **308** | → `/kiosk` |

Redirects live in one static map at the top of `middleware.ts` (no auth, no cookies). The login-origin cookie, `lib/login-origin.ts`, `lib/sign-out-routing.ts`, and every localStorage mirror of them are deleted, not deprecated.

### 2.4 Post-auth destination rules (one function, used by login action, callback, and middleware's authed-on-auth-route branch)

1. `?gym=CODE` present and account has an **active** affiliation there → `set_active_gym` → that gym's role surface (`/admin` for owner/admin/staff, `/member` for member).
2. `?gym=CODE` present, no affiliation → `/gyms?join=CODE` (hub with the join card pre-opened).
3. Valid `active_gym_id` → its role surface.
4. Exactly one active affiliation → `set_active_gym` → its role surface.
5. Otherwise (zero gyms, several with no valid selection, pending-only) → `/gyms`.

Sign-out always lands on `/login`. No origin memory.

### 2.5 Joining and inviting

The complete join-path matrix (grill-resolved). All self-joins land **pending**; only the staff path is instant:

| # | Path | Mechanics | Result |
|---|---|---|---|
| 1 | Staff onboards | `/api/admin/members/onboard` | **Active** immediately |
| 2 | Type the code | Hub join card → `get_gym_by_code` → `join_gym` | Pending |
| 3 | Public page "Join" CTA | Logged-in confirm → `join_gym`; logged-out → `/signup?gym=CODE` | Pending |
| 4 | Scan a poster QR | QR encodes the same `/signup?gym=CODE` URL — phone cameras open URLs natively, **no in-app scanner**; owner downloads a printable join-QR poster from the admin side (U2) | Pending |

- **Pending flow**: staff approve at `/admin/members/pending` (same screen as today, re-pointed to `gym_users.status`; approval stamps `added_by`). Pending users see a "waiting for approval" chip in the hub; no member surface access.
- **Unpublished gyms**: join-by-code **works** (the code is a capability the owner hands out — a new gym onboards members before publishing); name **search** surfaces published gyms only.
- **Staff onboarding** (`/api/admin/members/onboard`): if the email already has an account → **attach** (insert active `gym_users` member row, `added_by` = the staffer; send QR email, no magic link, no new account — this replaces today's "email already in use" dead end); if not → create account + profile + active member row + magic-link invite + QR, as today.
- **Owner path**: any account may `create_gym` (name + code, carrying over `create_gym_and_owner`'s validation) → active owner row + active gym set. Guards: slug format validation, a reserved-code list (`admin`, `login`, `signup`, `api`, `kiosk`, `member`, `gyms`, `stren`, …), and a **soft cap of 3 unpublished gyms per account** (published gyms don't count; plain-language error on the 4th).
- Role changes (promote member→staff etc.) = updating `gym_users.role`, manager-gated (`members:manage`); People & access overrides are untouched (already keyed `(gym_id, user_id)`).

### 2.6 Lapsed members — locked with the loss visible (grill decision)

A member whose gym affiliation is active but whose **subscription** (billing `memberships` row) has expired:

- Member portal surfaces for that gym render a **renewal lock screen that names what's saved** ("Your 47-visit streak and 8 months of stats are saved — renew at the front desk to unlock them") instead of stats/feed/leaderboard. Data is **never deleted**; unlock is instant on renewal (the gate reads current subscription status, no state to flip).
- Check-in stays blocked (already today's behavior); lapsed members **drop off the gym leaderboard** while lapsed (active roster only).
- This is a product gate over the member's *own* data, not a security boundary: `member_home_stats` returns `subscription_status` + a small `lapsed_summary` (streak, total visits, member-since) so the lock screen can render its tease; full payloads are simply not fetched while lapsed.
- Fresh accounts with zero gyms see the hub's two-choice empty state (§5 U2); removed/rejected affiliations just lose the gym from the hub.

### 2.7 Payment attribution + owner alerts (grill decision)

Owner peace-of-mind against fabricated/unattributable records. Payments are already insert-only at the DB layer (015 defines only SELECT/INSERT policies — no UPDATE/DELETE — so records can't be silently rewritten). This workstream adds the two missing pieces, both zero-running-cost:

- **Attribution columns**: `payments.recorded_by`, `memberships.created_by` (nullable `UUID REFERENCES profiles(id)`, existing rows stay NULL), set by the app in every recording flow; `gym_users.added_by` per §2.1.
- **Owner in-app alert**: recording a payment inserts a notification to the gym's owner(s) ("{staff} recorded ₱{amount} {method} — {member}") through the existing notifications system (extend `notification_type` if needed; Codex decides on inspection). Email digest = deferred (§0).

---

## 3. Database migration plan — Agent C, unit C1

One migration: **`019_unified_accounts.sql`** — idempotent, ordered exactly as below (backfill before any drop, in one transaction). Regenerate `lib/database.types.ts` after. The type regeneration is the sweep-net: dropped profile columns disappear from types and `tsc` finds every stale consumer.

### 3.1 New table + context column

```sql
CREATE TABLE IF NOT EXISTS public.gym_users (
  gym_id     UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       public.user_role NOT NULL DEFAULT 'member',
  status     public.profile_status NOT NULL DEFAULT 'active',
  added_by   UUID REFERENCES public.profiles(id),  -- NULL for self-joins until approval stamps the approver
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, user_id)
);
CREATE INDEX IF NOT EXISTS gym_users_user_idx ON public.gym_users (user_id);
```

(Verify `public.profile_status` values cover `active|pending|rejected`; extend the enum if not.) Then `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL;`

### 3.2 Backfill, then re-implement the helper stack (same signatures)

- Backfill: `INSERT INTO gym_users (gym_id, user_id, role, status) SELECT gym_id, id, role, status FROM profiles WHERE gym_id IS NOT NULL ON CONFLICT DO NOTHING;` then `UPDATE profiles SET active_gym_id = gym_id WHERE gym_id IS NOT NULL;`
- `get_gym_id()` → `active_gym_id` iff an **active** `gym_users` row backs it, else NULL. `get_user_role()` / `is_manager()` → from `gym_users` at `get_gym_id()`. `has_gym_permission(p_permission, p_gym_id)` → role/status from `gym_users` at `p_gym_id` (affiliation-based, not active-pinned — it already takes the gym explicitly; still tenant-safe). `get_my_access()` → same JSONB shape, resolved via the above; raises as today when there is no usable gym.
- `validate_permission_override()` → target role/gym from `gym_users`. `handle_new_user()` → bare profile (id, email, name), **no role/status/gym**; drop the role metadata path.
- **RLS-recursion rule**: `gym_users` policies must never subquery `gym_users` directly — express everything through the SECURITY DEFINER helpers (`get_gym_id()`, `is_manager()`, new `is_manager_of(p_gym_id)` if needed), following the migration-011 conventions (`SECURITY DEFINER`, `SET search_path = ''`, explicit GRANT/REVOKE).
- `gym_users` policies: SELECT own rows; SELECT rows of my active gym when `is_manager()`; UPDATE (role/status) of non-owner rows in my active gym behind `has_gym_permission('members:manage')`; no direct INSERT/DELETE for `authenticated` (writes go through the RPCs below + service role). Last-active-owner protection trigger on UPDATE/DELETE.
- `profiles` policies: rewrite the `gym_id = get_gym_id()` manager clause as "target user has a `gym_users` row at my active gym" via a definer helper.

### 3.3 New RPCs (shapes are frozen contracts — §6.1)

- `get_my_gyms()` → SETOF (gym_id, code, name, logo_url, role, status) for `auth.uid()`, any status, SECURITY DEFINER (the gyms-table RLS is active-gym-pinned; the hub needs all of mine).
- `set_active_gym(p_gym_id)` → validates active affiliation, updates `active_gym_id`, returns `jsonb {role}`.
- `join_gym(p_gym_id)` → inserts `(member, pending)`, `ON CONFLICT DO NOTHING`, returns the row's current status.
- `create_gym(p_name, p_code)` → carries over `create_gym_and_owner` validation **plus the §2.5 guards** (slug format, reserved-code list, soft cap: 3 unpublished gyms per creating account); creates gym + active owner row (`added_by` = self) + sets active gym; returns the gym. **Drop `create_gym_and_owner`.**
- **Drop `check_gym_membership`** (all overloads; 012/013 exist only for per-gym login).

### 3.4 Per-gym data fixes + function sweep

- Uniques: `streaks.member_id` → `UNIQUE (member_id, gym_id)`; `member_notification_preferences.member_id` → `UNIQUE (member_id, gym_id)`; `notification_cooldowns (member_id, notification_type)` → `(member_id, gym_id, notification_type)`. **Update every RPC `ON CONFLICT` target that referenced the old constraints** (`kiosk_update_streak`, notification helpers in 006/011/014/018).
- Sweep: `grep -n "public.profiles" supabase/migrations/*.sql` — every function/policy reading `role`, `gym_id`, or `status` from `profiles` gets re-pointed to `gym_users` (onboarding RPCs from 010, kiosk RPCs, `member_home_stats`, notification guards). Functions that only call `get_gym_id()`/`is_manager()` need nothing.
- Kiosk check-in RPCs: **take an explicit `p_gym_id`** (§2.2 pinned-gym rule) and validate (a) the *caller* has an active manager affiliation at `p_gym_id`, (b) the *scanned account* has an active `gym_users` row there (replaces both profile-gym equality checks). Never resolve the kiosk's gym via `get_gym_id()`.
- Member surfaces: `member_home_stats` gains `subscription_status` (`active|expired|none`) + `lapsed_summary` (current/best streak, total visits, member-since) for the §2.6 lock screen; the leaderboard query/RPC excludes members whose subscription at that gym is not active.
- Attribution + alerts (§2.7): `payments.recorded_by` + `memberships.created_by` columns; the payment-recording flow sets them and inserts the owner notification (extend `public.notification_type` if required, idempotently).

### 3.5 Drops (pre-approved, after backfill in the same migration)

`ALTER TABLE public.profiles DROP COLUMN IF EXISTS role, DROP COLUMN IF EXISTS gym_id, DROP COLUMN IF EXISTS status;` — plus any now-orphaned indexes/policies that referenced them.

---

## 4. Server & app-logic plan — Agent C, unit C2

- **`middleware.ts` rewrite**: static 308 map (§2.3) → security headers → public routes pass → auth routes (authed users → §2.4 destination) → everything else: one `get_my_access()` call for **all** protected surfaces (manager surfaces keep the permission/feature map; member surfaces check any active affiliation); access failure or no active gym → `/gyms` (not `/login`) when authed, `/login` when not. Delete the login-origin cookie writer, `resolveLoginPath`, and the member-vs-admin profile fallback lookup. Keep refresh-token-recovery cookie clearing and `x-gym-id`/`x-user-role` forwarding.
- **`lib/auth-actions.ts`** (new, server actions): `signUpAccount(name, email, password, joinGymCode?)`, `resolvePostAuthDestination(gymCode?)` (implements §2.4, calls `set_active_gym`), `setActiveGymAction(gymId)` (RPC + `revalidatePath` roots), `joinGymAction(gymId)`, `createGymAction(name, code)`, `signOutAction`. Thin wrappers over the §3.3 RPCs — validation lives in SQL.
- **`lib/auth-context.tsx` rebuild** (Codex owns the logic; §6.2 is the frozen interface): keep the hardened session lifecycle verbatim where it's orthogonal (hash-token magic-link handling, invalid-refresh-token recovery, benign-lock retry, password-setup flags, profile cache minus dropped fields); delete login-origin, sign-out routing, `resolvePostAuthPath`, and the `role` param on `signUp`; `signOut` → `/login` always; expose `myGyms` + `activeGymId` + `refreshMyGyms()` via `get_my_gyms`. Role/permissions stay the job of `lib/access-context.tsx` (unchanged).
- **Onboard route** (`app/api/admin/members/onboard`): per §2.5 — existing account → attach + QR email only; new → today's create+invite path + active member row; both write `gym_users`, never profile role/gym.
- **App-side query sweep**: every `.from("profiles")` filter/select on `role`/`gym_id`/`status` (members lists, payments joins, member home/settings, `lib/engagement-hooks.ts`, admin APIs) → join/select through `gym_users` (nested FK select). `lib/types.ts`: `Profile` → account-only `AccountProfile` + new `GymUserRole`/`GymUserStatus`/`MyGym` types; let `tsc` find the rest.
- **Minimal functional pages** (Codex builds them bare + correct, marked `{/* TODO(U-unit): Opus reskin */}`; Opus replaces the markup, handlers verbatim): `/login`, `/signup`, `/gyms`, `/gyms/new`.
- **Kiosk pinning** (§2.2): `/kiosk` captures its gym at launch (operator's active gym at that moment → device/URL state) and passes `p_gym_id` to every kiosk call; a gym mismatch or lost pin shows the existing friendly kiosk-off pattern, never a silent re-point.
- **Lapsed gate** (§2.6): member pages branch on `member_home_stats.subscription_status` — expired renders the lock screen (Opus builds its UX; Codex ships a functional placeholder) and skips fetching full payloads; leaderboard exclusion comes from §3.4.
- **Attribution + owner alert** (§2.7): every payment/subscription write path sets `recorded_by`/`created_by` and inserts the owner notification; membership approval and onboarding stamp `gym_users.added_by`.
- **Cache check** (per `docs/CACHING.md`): verify every `unstable_cache` key/tag on admin/member data includes the gym id, so switching gyms can never serve another gym's cache. Fix any that key by user only.
- **Deletions** (unit C3, after the minimal pages exist): the §1 "Delete" rows — pages, `LoginForm.tsx`, `GymSignUpForm.tsx`, `lib/login-origin.ts`, `lib/sign-out-routing.ts`, their tests, every `LOGIN_ORIGIN`/`gym-select` reference (grep-zero), plus quarantining `OTP-AUTH-GUIDE.md` in the Catalog's Stale table and rewriting the E2E auth helpers/specs (`admin-gym-preview`, `feature-toggles`, `member-rpc-authorization`) to authenticate through `/login`.

---

## 5. UI/UX plan — Agent U (Opus 4.8)

Design language: these are **Stren's pages, not a gym's** — neutral Stren branding (the per-gym theming stays on `/gym/[code]` public pages and inside the shells). North star applies: one obvious action per screen, plain language, no technical terms. Reuse the existing design tokens (`--color-*` variables) and form patterns.

- **U1 — Auth screens**: `/login` (email, password, "Forgot password?", "Create account", gym-flavored header when `?gym=` resolves to a real gym via `get_gym_by_code`, magic-link `?error=` banner with the existing readable-error copy), `/signup` (name, email, password; join-intent notice when `?gym=`), `/reset-password` reskin. States: loading, invalid credentials, unverified/pending magic-link errors, password-manager-friendly autocomplete attributes.
- **U2 — Gym hub + join/create**: `/gyms` — "Your gyms" cards (logo, name, role chip; pending → "Waiting for approval" chip, rejected → quiet explanatory row), tap = enter (calls `setActiveGymAction` then routes by role); "Join a gym" (code entry + name search via `search_gyms`, confirm card → `joinGymAction` → pending state); "I run a gym" → `/gyms/new` (name + code → `createGymAction` → `/admin`; surface the soft-cap and reserved-code errors in plain language). The **empty state is the onboarding moment**: two big choices — "Join your gym" / "I run a gym". Public gym page "Join" CTA: logged-out → `/signup?gym=CODE`, logged-in → join confirm → pending. Also: the **printable join-QR poster** (admin side, likely in the Studio's Essentials or the members screen — a downloadable QR of `/signup?gym=CODE` with the gym name/logo), and the **lapsed lock screen** (§2.6): renewal message that names the saved streak/visits/member-since from `lapsed_summary`, front-desk renewal instruction, no dead ends.
- **U3 — Gym switcher**: in `app/admin/layout.tsx` nav chrome and `components/member/MemberShell.tsx`: current gym name/logo as the anchor; menu lists the account's gyms (role-labeled) via `myGyms`, **"Member view"** (admin shell) / **"Admin view"** (member shell, shown only when the active-gym role is a manager — §2.1 managers-are-members), "All gyms →" (`/gyms`), divider, sign out. Switching calls `setActiveGymAction` + full refresh to the new role surface. Single-gym accounts see the gym name without a pointless menu (or a menu with just the view toggle/"All gyms"/sign-out — pick the simpler reading). Mobile: same control in the existing mobile nav patterns. Replace every `profile.role`/`profile.gymId` read in components with `useAccess()`/`myGyms` equivalents.
- **Must not touch**: `middleware.ts`, `supabase/migrations/*`, `lib/auth-actions.ts` signatures, `lib/auth-context.tsx` internals (consume its interface), `lib/access-*`/`lib/permissions.ts`/`lib/features.ts`, API routes. Server-page conversions stay with Codex.

---

## 6. Frozen contracts (Codex creates in C1–C2; Opus consumes; neither changes shapes without updating this section)

### 6.1 SQL/RPC shapes

- `get_my_gyms()` → rows `{ gym_id: uuid, code: text, name: text, logo_url: text|null, role: user_role, status: profile_status }`
- `set_active_gym(p_gym_id uuid)` → `jsonb { role: text }` (raises on no active affiliation)
- `join_gym(p_gym_id uuid)` → `jsonb { status: text }` (existing row returns its current status)
- `create_gym(p_name text, p_code text)` → the new gym row (raises on taken code, invalid name/code)
- `get_my_access()` → **unchanged**: `{ role, gym_id, permissions: text[], features: jsonb }`
- `member_home_stats` (additions) → `subscription_status: 'active'|'expired'|'none'` + `lapsed_summary: { current_streak, best_streak, total_visits, member_since }`
- Kiosk RPCs → every one takes explicit `p_gym_id`; caller must hold an active manager row at it (§2.2)
- `create_gym` errors (plain-language mapped in `createGymAction`): code taken · invalid code format · reserved code · unpublished-gym cap reached

### 6.2 TypeScript (`lib/types.ts` + `lib/auth-context.tsx`)

```ts
type GymUserRole = 'owner' | 'admin' | 'staff' | 'member'
type GymUserStatus = 'active' | 'pending' | 'rejected'
interface MyGym { gymId: string; code: string; name: string; logoUrl: string | null; role: GymUserRole; status: GymUserStatus }
interface AccountProfile { id: string; email: string; name: string; contactNumber: string | null; avatarUrl: string | null; /* avatar cooldown fields as today */ qrCode: string; createdAt: string }
interface AuthContextValue {
  user: User | null; profile: AccountProfile | null; myGyms: MyGym[]; activeGymId: string | null
  isLoading: boolean; isSigningOut: boolean; needsPasswordSetup: boolean
  signIn(email: string, password: string): Promise<{ error: string | null }>
  signOut(): Promise<void>; completePasswordSetup(userId?: string | null): void
  refreshProfile(): Promise<void>; refreshMyGyms(): Promise<void>
}
```

### 6.3 Server actions (`lib/auth-actions.ts`)

`signUpAccount(input: { name: string; email: string; password: string; joinGymCode?: string }) → { error: string | null }` · `resolvePostAuthDestination(gymCode?: string) → string` · `setActiveGymAction(gymId: string) → { role: GymUserRole }` · `joinGymAction(gymId: string) → { status: GymUserStatus }` · `createGymAction(input: { name: string; code: string }) → { gymId: string; code: string } | { error: string }` · `signOutAction() → void`

The §2.3 route map and §2.4 rules are also contracts.

---

## 7. Test plan (test-first per CLAUDE.md; owner marked per row)

| Layer | Test | Owner |
|---|---|---|
| Integration | `gym-users-access.test.ts` — multi-gym matrix: owner@A+member@B sees admin data only when active=A, member data only when active=B; NULL/stale active gym fails closed; pending/rejected rows grant nothing | C |
| Integration | `set-active-gym.test.ts` — RPC accepts active affiliations only; trigger blocks direct column writes; affiliation removal invalidates selection | C |
| Integration | `join-and-approve.test.ts` — join → pending → members:manage approval → active; duplicate join returns current status; last-owner protection | C |
| Integration | `onboard-existing-account.test.ts` — onboard route attaches existing email (no new auth user) vs creates+invites new email | C |
| Integration | `post-auth-destination.test.ts` — all five §2.4 rules | C |
| Integration | Existing `payments-access.characterization.test.ts` and 015/016 permission/feature suites stay green (only helper internals changed) | C |
| Unit | `auth-actions` validation + error mapping; middleware redirect-map table test | C |
| Integration | `kiosk-pinned-gym.test.ts` — kiosk RPCs reject a caller without an active manager row at `p_gym_id`; switching the operator's active gym does NOT re-point kiosk calls; cross-gym QR scan rejected | C |
| Integration | `lapsed-member-gate.test.ts` — `subscription_status`/`lapsed_summary` correctness; lapsed member excluded from leaderboard; renewal restores instantly; manager check-ins appear on leaderboard like members' | C |
| Integration | `payment-attribution.test.ts` — recording flows set `recorded_by`/`created_by`; owner notification row created; approval/onboard stamp `gym_users.added_by` | C |
| Integration | `create-gym-guards.test.ts` — reserved codes, slug format, 4th unpublished gym blocked, published gyms don't count | C |
| Integration | Lapsed lock screen renders the tease from `lapsed_summary`; join-QR poster link renders the correct URL | U |
| Integration | Hub renders gyms/roles/pending states from `get_my_gyms` fixtures; join flow states; create-gym flow | U |
| Integration | Switcher: lists gyms, switch calls action + refresh, single-gym rendering; shells read role via `useAccess` only | U |
| Integration | `/login` + `/signup` states (errors, `?gym=` flavor, join intent) | U |
| E2E | Rebuilt auth journey: signup → hub empty state → create gym → /admin; second account joins by code → pending → approved → /member; switcher swaps gyms; legacy URLs 308 | C rebuilds helpers/specs, U keeps green |

---

## 8. Sequencing

```
C1 (migration 019 + types + SQL/integration tests)
  → C2 (middleware, actions, auth-context, onboard, sweep, minimal pages)
  → C3 (deletions, E2E rewrite, docs)          ← Codex one-shot, one branch
  → Fable review → Codex fix pass (if needed)
  → U1 → U2 → U3                               ← Opus one-shot, same branch
  → Fable review → Opus fix pass (if needed)
  → J1: full `npm run test:ci` green, DoD walk, version 2.0.0 + CHANGELOG + ImplementationState
```

Branch: `auth/unified-accounts` off `main`, PR to `qa`. Codex's minimal pages keep the app usable between the two agents; Opus replaces their markup with the real UX, handlers verbatim.

## 9. Handoff prompts

Paste-ready packaged prompts (kept in sync with this plan; the plan wins on divergence):

- `prompts/Codex-Backend-UnifiedAccounts-OneShot.md` — Agent C, launch effort **xhigh**
- `prompts/Opus48-UI-UnifiedAccounts-OneShot.md` — Agent U, launch effort **high** (extended thinking on)

## 10. Definition of done (whole workstream)

1. One email = one account everywhere; the same account can hold owner@A + member@B and swaps context through the switcher in one interaction; the §7 access matrix proves per-gym isolation.
2. Fresh signup with no gym lands on the hub's two-choice empty state; join → pending → staff approval → member surfaces work end-to-end.
3. Staff onboarding an already-registered email attaches it (no duplicate account, no error); a new email still gets the invite + QR flow.
4. Any account can create a gym from the hub and immediately owns it, keeping any other memberships.
5. Every legacy auth URL 308s per §2.3; `grep -ri "login-origin\|LOGIN_ORIGIN\|sign-out-routing\|check_gym_membership\|gym-select"` over `app lib components middleware.ts` returns nothing.
6. Kiosk check-in accepts only accounts with an active row at the kiosk's **pinned** gym; a gym-B member's QR at gym A is rejected; the owner switching gyms on another device does not re-point a running kiosk; a manager's own QR checks them in like a member.
6a. A lapsed-subscription member sees the lock screen naming their saved streak/stats, is absent from the leaderboard, and regains everything instantly on renewal; new payments/subscriptions carry `recorded_by`/`created_by` and produce an owner notification; `create_gym` enforces format/reserved/cap guards.
7. Payments/renewal characterization tests untouched and green; permission/feature suites green; full `npm run test:ci` green including rebuilt E2E.
8. `package.json` → 2.0.0; `CHANGELOG.md` + `ImplementationState.md` updated in the same PR; `OTP-AUTH-GUIDE.md` quarantined; this plan marked completed in its header when shipped.
