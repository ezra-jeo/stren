# RFID Kiosk Implementation Plan

**Planned:** 2026-07-24

**Implementation target:** GPT-5.6 Luna XHigh, in exactly three ordered implementation slices

**Status:** Planning complete; no RFID feature code or migration has been written

**Schema baseline inspected:** migrations `000` through `030`; the next migration number is `031`

**Approved visual reference:** `C:\Users\Zurax\AppData\Local\Temp\codex-clipboard-f5d192e9-556b-40da-9d5a-98c68d76c292.png`

This section is the codebase-grounded execution contract for adding keyboard-emulation RFID as a third input mode inside Stren's existing `/kiosk`. The previously active Super Admin integration plan and the older Gym Page Studio appendix are retained verbatim after the `RFID_KIOSK_IMPLEMENTATION_PLAN_END` marker so their historical contracts and existing `ImplementationPlan.md` section references are not destroyed.

Legend used throughout:

- **Confirmed** means verified in the current working tree.
- **Proposed** means the implementation contract for this feature.
- **Open issue** means the repository or approved requirements do not yet establish the fact; the implementation slice must resolve it at the stated gate rather than guessing.

## 1. Objective

Add an optional `RFID Tap` mode beside the existing `QR Scan` and `Search` tabs in `app/kiosk/page.tsx`. A keyboard-emulation reader supplies a UID; the server resolves an active card assignment and invokes the same transaction-owned attendance transition used by QR and authorized manual attendance. Successful taps create or close ordinary `attendance` sessions, so all existing occupancy, streak, dashboard, member-history, and reporting consumers continue to use the same source of truth.

The finished MVP includes:

- assigned-card check-in and checkout;
- checkout for an already-open session even if membership or gym-user eligibility changed after entry;
- server-enforced duplicate protection and request idempotency;
- durable logging of successful, denied, duplicate, invalid, and unknown attempts;
- a privacy-limited recent-five RFID list;
- owner/admin card lifecycle management in the existing member-details interface;
- password-reauthenticated unknown-card assignment for owner, admin, and front-desk `staff`;
- access-event history and filters in the existing Reports surface;
- device/browser-local kiosk-mode persistence;
- the approved single featured-result layout, with no RFID sidebar page and no persistent multi-state strip.

Out of scope:

- native PC/SC integration;
- WebUSB or WebHID reader discovery/management;
- a desktop helper application;
- multiple currently assigned RFID cards per member;
- biometric verification;
- a dedicated RFID sidebar route;
- hardware-level reader connection telemetry or a claim that the browser can detect a reader;
- advanced anti-passback beyond a five-second cooldown, request idempotency, and the existing open-attendance state;
- door-relay control, turnstiles, or physical lock integration;
- cryptographic smart-card challenge/response; a UID-only card remains cloneable and is an identifier, not a secret authenticator;
- changing Stren's four gym roles (`owner`, `admin`, `staff`, `member`).

## 2. Codebase findings

### 2.1 Route and kiosk shell

| Status | Actual path/symbol | Finding and RFID consequence |
|---|---|---|
| Confirmed | `app/kiosk/layout.tsx` — `KioskLayout` | Owns the existing `Stren Kiosk` header and upper-right `/admin` link with `Shield`. RFID must render inside this shell; no admin sidebar or new operational route is needed. |
| Confirmed | `app/kiosk/page.tsx` — `KioskPage` | One 798-line client component owns both current modes, camera lifecycle, search, occupancy, result timers, network state, and account-connect dialog. `KioskMode` is currently only `"qr" \| "search"`. RFID should be added without duplicating this entire component; mode-specific UI should be extracted into bounded kiosk components. |
| Confirmed | `app/kiosk/kiosk.module.css` | Defines the kiosk-only cream/orange design tokens (`--kiosk-peach`, `--kiosk-surface`, borders/shadows), two-column pill tabs, the featured result card, responsive breakpoint at `42rem`, and reduced-motion behavior. The approved mockup matches this existing language. RFID should extend this module: three equal tab columns; left-photo/right-result desktop card; stacked mobile card; recent taps beneath. |
| Confirmed | `middleware.ts` and `lib/permissions.ts` — `permissionForPath` | `/kiosk` requires an authenticated manager role, `kiosk:use`, and the `kiosk_checkin` feature. Members cannot open the kiosk. RFID endpoints must still perform their own server/database checks; middleware is not the security boundary. |
| Confirmed | `app/kiosk/page.tsx` local storage key `stren.kiosk.gymId` | The kiosk pins the first resolved active gym in browser storage, while effective `kiosk_access_allowed` also requires that gym to equal `profiles.active_gym_id`. Add mode persistence under `stren.kiosk.mode:<pinnedGymId>` so it is local to this browser and gym. Restore mode before starting a camera or RFID listener; fall back to QR when storage is unavailable or RFID is disabled. |

### 2.2 Current QR and Search behavior

| Status | Actual path/symbol | Finding and RFID consequence |
|---|---|---|
| Confirmed | `app/kiosk/page.tsx` — `startScanner`, `performScan`, `showResult`, `returnToScanning` | QR uses `html5-qrcode`, a 10-second RPC timeout, a 180ms delayed processing overlay, `KioskScanGate`, and two timer refs. It calls `kiosk_checkin`, adjusts occupancy locally by `+1/-1`, then refreshes `kiosk_get_occupancy`. RFID should use the same network/offline vocabulary and feedback utility, but use its approved 1.5s/3.5s/persistent timing contract. |
| Confirmed | `lib/kiosk-scan-gate.ts` — `KioskScanGate` | This gate solves a camera-specific problem: it rearms only after four empty QR frames. It cannot prevent same-UID requests from another tab/device or retries. Keep it for QR; add a distinct client RFID gate and database cooldown/idempotency. |
| Confirmed | `lib/kiosk-feedback.ts` — `playKioskFeedback` | Provides best-effort success/error audio and vibration after a real user gesture. Reuse it for RFID; it must remain non-blocking and optional. |
| Confirmed | `app/kiosk/page.tsx` — `performSearch` | Search debounces 280ms and calls `kiosk_search_members` for at least three characters. It displays name and masked email, at most eight rows. It does **not** check a member in/out; copy directs a manager to Admin. Reuse this minimal search RPC inside the authenticated unknown-card assignment flow rather than create a second member directory. |
| Confirmed | `supabase/migrations/023_kiosk_privacy_and_scan_integrity.sql` — `kiosk_search_members` | Requires `kiosk_access_allowed` plus `members:view`, filters active gym users, and returns only `id`, `name`, `email`. This matches front-desk `staff` defaults and is the correct member-search primitive after reauthentication. Assignment itself still needs a separate one-time server boundary. |
| Confirmed | `app/kiosk/page.tsx` | Switching to Search stops/clears the camera; returning to QR starts it. Visibility changes stop/restart the camera; unmount clears result timers and scanner state. RFID needs symmetric activation/suspension and cleanup. |

### 2.3 Attendance, occupancy, and eligibility

| Status | Actual path/symbol | Finding and RFID consequence |
|---|---|---|
| Confirmed | `public.attendance`, created in `supabase/migrations/001_production_baseline.sql`, hardened in `027_production_security_tenant_closure.sql` | Current columns are `id`, non-null `gym_id`, non-null `member_id`, non-null `check_in`, nullable `check_out`, nullable `duration_min`, `source`, and actor/correction columns. A composite FK to `gym_users(gym_id,user_id)` and partial unique index `attendance_one_open_session_key` enforce tenant consistency and at most one open session. RFID must continue using this table, not create RFID attendance rows. |
| Confirmed | `027_production_security_tenant_closure.sql` — attendance grants/RLS | Authenticated clients have SELECT only; trusted SECURITY DEFINER functions own writes. Direct insert/update/delete is revoked. RFID attendance mutation must be an RPC transaction, not a browser table write or service-role bypass. |
| Confirmed | `027_production_security_tenant_closure.sql` — `kiosk_checkin` | The effective QR implementation validates the pinned gym, finds an active member gym-user by `profiles.qr_code`, checks `has_member_portal_entitlement`, takes a member/gym advisory lock, toggles the open session, calls `kiosk_update_streak` on entry, and returns photo/name. It is the behavioral base to refactor, not copy. |
| Confirmed discrepancy | `027_production_security_tenant_closure.sql` — `kiosk_checkin` | Entitlement is checked **before** the open-session lookup. Therefore an expired/frozen member cannot currently check out by QR. The required RFID rule cannot be safely met by calling this function unchanged. Extract a private shared transition that locks first, closes an existing session before entry eligibility checks, and use it from QR, member/manual, and RFID paths. This is an explicit cross-method behavior correction, not a silent product change. |
| Confirmed | `029_assisted_onboarding.sql` — `kiosk_checkin_by_member` | Manual member toggle is guarded by `kiosk_access_allowed`, `members:manage`, and `staff_manual_checkin`, then delegates to `kiosk_checkin`. It is not called by the current Search UI. Preserve its signature for compatibility and make it delegate to the shared transition without using the member's QR as an internal key. |
| Confirmed | `027_production_security_tenant_closure.sql` — `kiosk_checkout`, `close_attendance_session`, `record_attendance_override`, `correct_attendance_session` | Explicit kiosk checkout and dashboard/manual correction are separate write paths. `components/admin/AdminDashboardClient.tsx` calls `close_attendance_session` for the `Out` button. New access-event logging must cover these paths so method/outcome reporting is complete. Privileged manual corrections continue to write `privileged_audit_events`; ordinary taps do not belong in that privileged audit table. |
| Confirmed discrepancy | `attendance.duration_min` and all current migrations | `duration_min` is a plain nullable integer. No current trigger/function populates it when `check_out` changes, although kiosk RPCs return it. New shared checkout code must set `duration_min = floor(extract(epoch from (check_out-check_in))/60)` atomically. Historical nulls are compatible and can be backfilled only after an inventory in Slice 3. |
| Confirmed | `029_assisted_onboarding.sql` — `kiosk_get_occupancy` | Occupancy is computed, not stored: `count(*)` of open `attendance` rows for the gym. It returns `0` if `occupancy_count` is disabled. RFID must not introduce a counter. The RFID response should return an authoritative post-transition occupancy (nullable when the feature is off), while scheduled refresh remains reconciliation. |
| Confirmed | `028_financial_reporting_recovery_closure.sql` — `effective_membership_status`, `has_member_portal_entitlement` | PostgreSQL owns access status on the Manila business date. Effective results include `active`, `frozen`, `expired`, `cancelled`, `scheduled`, `inactive`, and gym-user states such as `rejected`, `disabled`, or `banned`. New entry is granted only for `active`; an existing open session is closable first. Renewal automatically restores access because card assignment is independent of membership. |
| Confirmed | attendance insert triggers and `kiosk_update_streak` | Attendance inserts drive notification/inactivity hooks, while the kiosk explicitly updates the streak. The shared transition must preserve these effects exactly once on granted check-in and never run them for denied/unknown/duplicate events. |

### 2.4 Members and card-management placement

| Status | Actual path/symbol | Finding and RFID consequence |
|---|---|---|
| Confirmed | `app/admin/members/page.tsx` — `MembersPage` | There is no standalone admin member-profile route. The Members page loads `get_gym_member_directory` plus memberships, and opens the existing `Modal` titled `Member Details` with personal, membership, and payment history. This modal is the primary RFID-management location. |
| Confirmed | `app/admin/members/page.tsx` | Owner/admin member mutations already rely on database permission checks, but the page is visible to staff with `members:view`. RFID lifecycle controls must be hidden unless role is `owner`/`admin` **and** `members:manage` is effective, and every endpoint/RPC must independently enforce the same rule. |
| Confirmed | `lib/admin-ui.tsx` — `Modal`, `ACard`, `Avatar`, `PrimaryBtn`, `GhostBtn`, `StatusPill` | Reuse these for the member RFID section and confirmations. Extract a `MemberRfidAccess` client component instead of further expanding the 687-line Members page. |
| Confirmed | `app/member/profile/page.tsx` and `app/api/member/avatar/route.ts` | Members manage their own name/contact/photo and QR; admins do not currently edit those fields from the member detail modal. RFID management belongs to the admin modal, not the member self-profile. The kiosk can use `profiles.avatar_url`; initials are the fallback. |
| Confirmed | `get_gym_member_directory` | Already returns `avatar_url`, although `MemberRow` currently discards it. Preserve the narrow directory contract; only thread photo data into contexts that need it. Recent taps must receive a separately privacy-reduced projection with no member name. |

### 2.5 Authentication and authorization

| Status | Actual path/symbol | Finding and RFID consequence |
|---|---|---|
| Confirmed | `lib/permissions.ts` | Roles are exactly `owner`, `admin`, `staff`, `member`. Owner/admin default to `members:manage`; staff defaults to `members:view` and `kiosk:use`; owner/admin/staff all default to `kiosk:use`. Do not add a role. |
| Proposed reuse | existing keys | Member-profile card lifecycle requires `members:manage` plus role `owner`/`admin`. Unknown-card lookup/assignment requires role `owner`/`admin`/`staff`, `kiosk:use`, `members:view`, enabled `rfid_kiosk`, and a fresh reauthentication intent. No new permission key is required. |
| Confirmed | `lib/permissions-server.ts` — `getMyAccess`, `apiRequirePermission`, `requirePermission` | Reuse these in Next route handlers. Database RPCs must repeat active-gym/role/permission checks; TypeScript checks are defense in depth. |
| Confirmed | `lib/access-context.tsx` — `AccessProvider`, `useAccess` | Admin layout already provides it; kiosk layout does not. Wrap `KioskLayout` children with `AccessProvider` so the third tab can honor an effective default-off `rfid_kiosk` feature, while the RFID RPC remains authoritative. |
| Confirmed | repository-wide reauthentication search | There is no normal-password reauthentication primitive. Password recovery proofs are not suitable: they prove a recovery link, not current-password knowledge. |
| Confirmed reusable pattern | `lib/password-recovery.ts` | Demonstrates server-only HMAC domain separation, constant-time proof checks, HttpOnly constraints, and short expiry. RFID should borrow the pattern, not the recovery proof/secret namespace. |
| Proposed | isolated Supabase Auth verification | `/api/kiosk/rfid/reauthenticate` will obtain the current user with the cookie-scoped server client, then use an isolated `@supabase/supabase-js` client (`persistSession:false`, `autoRefreshToken:false`) to call `signInWithPassword` with the current Auth email and submitted password. It must verify the returned user ID equals the current session user and discard that client. This avoids replacing kiosk cookies and never exposes password hashes or compares passwords in the browser. |
| Confirmed risk | `lib/rate-limit.ts` | Existing throttling is process-local memory only. Reuse it as a coarse per-user/IP guard, but do not treat it as distributed protection; Supabase Auth rate limiting remains the cross-instance control. Record no password or raw UID in logs. |

### 2.6 Reporting and reusable audit infrastructure

| Status | Actual path/symbol | Finding and RFID consequence |
|---|---|---|
| Confirmed | `app/admin/reports/page.tsx`, `components/admin/AdminReportsClient.tsx`, `AdminReportsCharts.tsx` | Reports is the correct historical surface. It currently shows aggregate attendance/revenue/membership data and no access-event table or filters. Add an access-history section here; do not add navigation. |
| Confirmed | `admin_reports_data` in migrations `025`/`028` | Attendance charts count check-ins from `attendance`; keep that unchanged. A separate paginated RPC should supply access methods/outcomes because denied/unknown attempts cannot be represented as attendance sessions. |
| Confirmed | `public.privileged_audit_events` and `write_privileged_audit_event` in migration `027` | This append-only table is for privileged mutations. Reuse it for assignment/replacement/deactivation/reactivation with safe card IDs/masked suffixes, but use a dedicated high-volume `access_events` table for every kiosk access attempt. |
| Confirmed | `components/admin/ReportingUnavailable.tsx` and `tests/integration/reporting-unavailable.test.tsx` | Report failures must not become plausible zeroes. Access-history failure should render an explicit section-level unavailable/retry state while keeping valid aggregate reports visible. |

### 2.7 Tests and delivery tooling

| Status | Actual path/symbol | Finding and RFID consequence |
|---|---|---|
| Confirmed | `tests/integration/kiosk-terminal.test.tsx` | Covers QR success/checkout, camera lifecycle, occupancy, inactive/unknown/offline states, Search privacy, timers, and unmount cleanup. Extend it to prove existing QR/Search behavior remains intact after component extraction and mode persistence. |
| Confirmed | `tests/unit/kiosk-scan-gate.test.ts`, `kiosk-feedback.test.ts` | Reuse patterns, but create RFID-specific buffering/gate tests rather than forcing keyboard semantics into `KioskScanGate`. |
| Confirmed weakness | `tests/integration/kiosk-pinned-gym.test.ts`, `kiosk-privacy-and-integrity.test.ts`, `kiosk-member-photo-sql.test.ts` | These inspect historical migrations `019`, `023`, and `024`, while effective kiosk definitions now live in `027` and `029`. Keep historical tests if useful, but new RFID correctness must be executed against a clean current database and/or inspect migration `031+`; source-regex alone is insufficient. |
| Confirmed | `tests/database/run-attendance-concurrency.ps1` | Runs two concurrent `kiosk_checkin_by_member` calls but only asserts no more than one open session; two calls may check in then immediately check out and still pass. RFID concurrency tests must assert the final direction/session and duplicate access event, not only `open <= 1`. |
| Confirmed | `scripts/run-production-security-tests.mjs` | Runs `production-security.sql` then the attendance concurrency wrapper. Extend it to execute the RFID behavior/concurrency suite so `npm run db:test:security` is the mandatory database gate. |
| Confirmed | `package.json` | Actual gates are `npm run lint`, `npm run typecheck`, `npm run test:unit` (both `tests/unit` and `tests/integration`), `npm run test:e2e`, `npm run build`, `npm run db:reset`, `npm run db:reset:clean`, `npm run db:types:check`, `npm run db:test:security`, `npm run db:invariants`, `npm run verify:deployment:local`, and `npm run verify:deployment:drift:local`. There is no separate integration-test script. |

## 3. Current end-to-end attendance flow

### 3.1 QR Scan today

1. `middleware.ts` confirms a signed-in manager, active gym, `kiosk:use`, and `kiosk_checkin`; `KioskPage` separately polls `kiosk_access_allowed(p_gym_id)`.
2. `KioskPage.startScanner()` dynamically starts `Html5Qrcode`. A decoded value reaches the callback only when mode is `qr`, the page is online/idle, and `KioskScanGate.tryLock(decodedText)` succeeds.
3. `performScan(qrCode)` calls `supabase.rpc("kiosk_checkin", { p_qr_code, p_gym_id: pinnedGymId })` with a 10-second client timeout.
4. Effective `public.kiosk_checkin` from migration `027`:
   - calls `kiosk_access_allowed`;
   - joins `profiles` to the pinned gym's `gym_users`, requiring role `member` and status `active`;
   - matches `profiles.qr_code`;
   - calls `has_member_portal_entitlement` **before** open-session lookup;
   - takes a transaction advisory lock on gym/member;
   - selects and locks an open `attendance` row;
   - if open, updates `check_out`, otherwise inserts `attendance(source='kiosk', recorded_by=auth.uid())` and calls `kiosk_update_streak`;
   - returns JSON with action, attendance/member IDs, name/photo, and nullable duration.
5. Attendance constraints guarantee tenant consistency and one open row; insert triggers emit the existing check-in notification/inactivity effects.
6. The UI maps expected JSON errors to inactive/unknown/error, computes `occupancy +/- 1` optimistically, bumps an epoch to protect against an older refresh, calls `kiosk_get_occupancy` for reconciliation, shows the result card, plays optional feedback, and returns to the camera after the current roughly 3.3-second cycle.
7. Dashboard/report/member consumers later query the same `attendance` rows. Occupancy is never persisted.

### 3.2 Search/manual paths today

1. Selecting `Search` calls `switchMode("search")`, clears result timers/gate state, and causes the scanner effect to stop the camera.
2. A three-character query is debounced and sent to `kiosk_search_members`; the RPC requires `kiosk_access_allowed` and `members:view` and returns at most eight `id/name/email` rows.
3. Search displays names and masked email. It has no attendance button, so no mutation or occupancy change occurs.
4. The admin dashboard's `Out` button separately calls `close_attendance_session(p_attendance_id, "Manual dashboard checkout")`, which requires `members:manage`, updates the attendance row, and writes `privileged_audit_events`.
5. The legacy `lib/engagement-hooks.ts` `handleScan(memberId)` calls `kiosk_checkin_by_member` and then duplicates client-side streak/feed behavior. Repository search found no application caller outside its tests. Do not use it for RFID; re-confirm it remains unused before deleting or reducing it in Slice 3.

### 3.3 Safest RFID integration point

The integration point is a new private PostgreSQL function, proposed as `transition_member_attendance(...)`, called only by trusted SECURITY DEFINER wrappers. It owns:

- the gym/member advisory lock;
- open-session-first checkout;
- entry eligibility;
- attendance insert/update and duration;
- streak call on check-in only;
- access-event insert;
- authoritative post-transition occupancy;
- the shared response shape.

`kiosk_checkin` resolves a QR to a member then delegates; `kiosk_checkin_by_member` delegates after its manual authorization; new `process_rfid_tap` resolves a digest/card then delegates. `kiosk_checkout` and `close_attendance_session` must append access events and use the same duration calculation, but preserve their existing authorization/correction semantics.

Do **not** implement RFID by calling `kiosk_checkin` with a synthetic QR, by copying the current PL/pgSQL toggle, by inserting attendance in a Next route, or by calling `lib/engagement-hooks.ts`.

## 4. Proposed architecture

```text
RFID-mode hidden input
  -> buffer printable keys; finish on Enter or bounded idle gap
  -> normalize candidate in shared TypeScript helper
  -> client request-ID gate and bounded FIFO (UX only)
  -> POST /api/kiosk/rfid/tap { uid, requestId }
  -> authenticate cookie user + active gym + kiosk permission/feature
  -> server-only HMAC(gym + normalized UID)
  -> process_rfid_tap RPC
       -> same-request idempotency lookup
       -> per-gym/digest advisory lock
       -> five-second server cooldown
       -> card lookup/status check
       -> transition_member_attendance
            -> per-gym/member advisory lock
            -> close open session first, regardless of later membership state
            -> otherwise require effective status = active
            -> mutate attendance once and calculate duration
            -> compute occupancy from open attendance
       -> append access_events for every expected outcome
  -> typed response + privacy-limited recent item
  -> featured result reducer/timer
  -> merge and reconcile recent five without page refresh
```

### 4.1 Client responsibilities

- [ ] Render `qr`, `rfid`, and `search` as one WAI-ARIA tablist in the existing kiosk panel.
- [ ] Restore `stren.kiosk.mode:<gymId>` only after the pinned gym and effective RFID feature are known; default to `qr`; catch local-storage errors.
- [ ] Mount/activate RFID capture only while the RFID tab is active, page visible/online, feature enabled, and no staff-authenticated dialog is active.
- [ ] Buffer keyboard-emulated input, enforce bounded candidate length, and send raw UID only to the same-origin server over HTTPS. Never log or persist it in browser storage.
- [ ] Generate one `crypto.randomUUID()` per logical tap and reuse it for a retry of that same request.
- [ ] Prevent the same finalized burst/request ID from being submitted twice; serialize up to five separately finalized bursts. A real repeat UID still reaches the server and only the server result may claim `Already processed`.
- [ ] Keep one reducer-owned featured result. A newer accepted tap cancels old timers and replaces it. Aborting a browser request on unmount does not imply the server transaction was rolled back.
- [ ] Merge the returned privacy item into recent taps, then call the recent-taps RPC to reconcile; poll while visible at a modest interval for other terminals.
- [ ] Use inline featured results for kiosk outcomes. Use Sonner toasts only for admin member-card mutations.

### 4.2 Server responsibilities

- [ ] Reject unauthenticated, wrong-gym, non-manager, missing-permission, or disabled-feature calls before digesting/mutating.
- [ ] Normalize again server-side; the server result is authoritative.
- [ ] Compute a deterministic HMAC-SHA-256 lookup digest using a dedicated `RFID_UID_HMAC_SECRET` and domain string containing digest version and gym ID.
- [ ] Never put raw UID/password in console output, errors, analytics, database rows, audit snapshots, URL parameters, or local storage.
- [ ] Invoke user-bound RPCs through `createServerSupabaseClient`; do not use `createAdminClient` to bypass gym authorization.
- [ ] Treat granted, denied, unknown, and duplicate as normal 200 responses with an `outcome`; reserve HTTP failures for malformed input/auth/config/server unavailability.
- [ ] Use an isolated, non-persisting Auth client only for password verification and verify identity equality.

### 4.3 Database responsibilities

- [ ] Enforce card/member uniqueness and card lifecycle constraints.
- [ ] Serialize by digest, then by member, in a documented lock order.
- [ ] Enforce request idempotency and the five-second same-card cooldown inside PostgreSQL so tabs/devices/retries cannot double-toggle.
- [ ] Close an existing attendance session before testing current entry entitlement.
- [ ] Log every expected RFID outcome atomically with the attendance decision; do not create attendance for denial/unknown/duplicate.
- [ ] Expose only permissioned, reduced RPC projections; authenticated clients receive no digest.
- [ ] Keep `access_events` append-only and use `privileged_audit_events` for card-management mutations.

### 4.4 UID normalization and reader assumptions

Proposed default `normalizeRfidUid` contract:

- Unicode NFKC normalization;
- remove only leading/trailing whitespace and CR/LF terminators;
- uppercase using locale-independent rules;
- accept 4–64 characters from `[A-Z0-9:_-]`;
- reject internal control characters and overflow;
- do **not** silently remove separators, prefixes, or leading zeroes because that can collapse distinct UIDs.

`useRfidKeyboardInput` should finalize on Enter, or after an implementation constant initially set near 80ms of no new character for readers without Enter. Candidate limits and inter-key timing need unit tests and named constants, not magic values in JSX.

**Open issue — pre-Slice-1 calibration gate:** no reader sample/configuration exists in the repository. Capture representative output from the intended hardware (UID length, character set, prefix/suffix, terminator, typical inter-key gap) before freezing the constants. If it violates the default contract, change the normalizer with fixtures; do not trim bytes until two distinct sample UIDs are proved not to collide.

The UI may truthfully show `Ready for RFID tap`, `Reading card…`, `Processing…`, or `Tap input paused — select Resume`. It must never show `Reader connected/disconnected`; keyboard emulation exposes no reliable physical-presence API. Missing server HMAC configuration may produce `RFID setup required`, which is genuinely detectable.

### 4.5 Error, concurrency, and idempotency policy

- One request ID maps to one access event/result through unique `(gym_id, request_id)`.
- The per-digest advisory lock prevents two distinct request IDs from checking the cooldown concurrently.
- Every separately completed reader burst receives a fresh request ID and reaches the server, even when the same UID was just processed. Any prior same-digest event within five seconds causes `duplicate/recently_processed`; that duplicate event is logged and no attendance mutation or streak/notification occurs.
- The client prevents a captured burst from being submitted twice under two IDs and serializes separately captured bursts through a five-item FIFO. It does not hide a real repeat tap under a client-only cooldown.
- The subsequent per-member lock plus `attendance_one_open_session_key` protects different active cards/QR/manual calls that resolve to the same member.
- Expected business rejection is caught and returned after inserting an access event. Unexpected database/network failure may prevent durable logging; the route emits a redacted structured operational log with request ID, gym ID, error code, and no UID/password.
- The client does not optimistically claim entry/exit. It may keep the last occupancy visible with a stale label during a slow request; it updates only from a committed server response.

## 5. Data-model changes

All schema changes are forward migrations after `030`; never edit migrations `001`, `023`, `024`, `027`, or `029`.

### 5.1 `public.rfid_cards` — migration `031_rfid_foundation.sql`

| Field | Proposed PostgreSQL definition | Constraint/use |
|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Safe internal/card-history reference. |
| `gym_id` | `UUID NOT NULL REFERENCES public.gyms(id) ON DELETE RESTRICT` | Tenant scope. |
| `member_id` | `UUID NOT NULL` | Composite FK `(gym_id,member_id)` to `gym_users(gym_id,user_id)` with `ON DELETE RESTRICT`; RPC also requires role `member`. |
| `uid_digest` | `TEXT NOT NULL` | 64 lowercase hex characters from HMAC-SHA-256; never returned to UI. Unique with `gym_id`. |
| `uid_digest_version` | `SMALLINT NOT NULL DEFAULT 1` | Makes the lookup contract explicit. |
| `uid_suffix` | `TEXT NOT NULL` | Last four normalized characters (or the whole value only if shorter, though minimum is four); the only UID-derived display value. Length/check constraint. |
| `status` | `TEXT NOT NULL DEFAULT 'active'` | CHECK in `active`, `deactivated`, `lost`, `replaced`. Only `deactivated` may reactivate. |
| `assigned_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Display/audit date. |
| `assigned_by` | `UUID REFERENCES profiles(id) ON DELETE SET NULL` | Required at creation by RPC; nullable only for historical actor deletion. |
| `deactivated_at` | `TIMESTAMPTZ NULL` | Set for every non-active state. |
| `deactivated_by` | `UUID NULL REFERENCES profiles(id) ON DELETE SET NULL` | Actor. |
| `deactivation_reason` | `TEXT NULL` | `manual`, `lost`, or `replaced` plus bounded staff reason; CHECK paired with status. |
| `replaced_by_card_id` | `UUID NULL REFERENCES rfid_cards(id) ON DELETE RESTRICT` | Old row points to its replacement; only valid with `status='replaced'`. |
| `reactivated_at` | `TIMESTAMPTZ NULL` | Latest reactivation timestamp; full lifecycle remains in privileged audit. |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Maintained by trusted lifecycle functions. |

Constraints/indexes:

- unique `(gym_id, uid_digest)` prevents a physical UID from being reassigned to another member in that gym, including after loss/replacement;
- partial unique `(gym_id, member_id) WHERE status='active'` enforces one current card per member;
- index `(gym_id, member_id, assigned_at DESC)`;
- index `(gym_id, status, updated_at DESC)`;
- authenticated users get no direct insert/update/delete; management occurs through RPCs;
- no cascade deletion. Membership expiry/freeze/cancellation never changes this table.

The one-card/one-member rule is intentionally scoped to `gym_id`, Stren's actual tenancy and attendance boundary. A card issued by Gym A never resolves or authorizes entry at Gym B; an unrelated gym may assign the same reader UID without a cross-tenant collision or disclosure. Within one gym, retaining the unique digest on lost/replaced rows prevents reassignment of that UID to a different member. This is the codebase-appropriate interpretation of the approved rule, not platform-global credential sharing.

### 5.2 `public.access_events` — migration `031_rfid_foundation.sql`

This table represents attempts/events, not attendance sessions. It is required because failed/unknown attempts cannot be safely encoded in `attendance`, and `privileged_audit_events` is the wrong high-volume semantic.

| Field | Proposed definition | Constraint/use |
|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Event ID returned to clients. |
| `gym_id` | `UUID NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT` | Tenant scope. |
| `member_id` | `UUID NULL REFERENCES profiles(id) ON DELETE SET NULL` | Null for unknown/invalid input. |
| `member_snapshot` | `JSONB NULL` | At most `{id,name}` so history remains intelligible after account removal; never returned by the recent-taps RPC. |
| `attendance_id` | `UUID NULL REFERENCES attendance(id) ON DELETE RESTRICT` | Present only for granted check-in/out. |
| `rfid_card_id` | `UUID NULL REFERENCES rfid_cards(id) ON DELETE RESTRICT` | Present for known cards. |
| `uid_digest` | `TEXT NULL` | Protected internal fingerprint for RFID cooldown/unknown assignment; never exposed. |
| `uid_suffix` | `TEXT NULL` | Masked reporting reference. |
| `access_method` | `TEXT NOT NULL` | CHECK `qr`, `rfid`, `search`, `manual`, `legacy`. `search` is reserved for a future explicit Search attendance action; current lookup alone creates no event. |
| `direction` | `TEXT NULL` | CHECK `check_in`, `check_out`; set to the attempted direction when a known card/member state makes it determinable (including entry denial), and null for unknown/invalid or a duplicate whose direction cannot be proved. |
| `outcome` | `TEXT NOT NULL` | CHECK `granted`, `denied`, `unknown`, `duplicate`, `error`. |
| `reason` | `TEXT NULL` | Stable machine reason: e.g. `membership_expired`, `membership_frozen`, `member_banned`, `card_deactivated`, `card_lost`, `card_replaced`, `recently_processed`, `invalid_uid`. |
| `membership_status` | `TEXT NULL` | Effective status snapshot at decision time. |
| `actor_id` | `UUID NULL REFERENCES profiles(id) ON DELETE SET NULL` | Signed-in kiosk/staff actor. |
| `actor_snapshot` | `JSONB NOT NULL` | Existing audit style: ID/name/role/status, never email. |
| `request_id` | `UUID NULL` | Required for live RFID requests; nullable for historical backfill. |
| `occurred_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Decision timestamp. |
| `metadata` | `JSONB NOT NULL DEFAULT '{}'` | Bounded non-secret details such as response version/warnings; no UID/name/email duplication. |
| `backfill_key` | `TEXT NULL UNIQUE` | Idempotent Slice-3 attendance-history reconstruction. |

Indexes/immutability:

- unique partial `(gym_id, request_id) WHERE request_id IS NOT NULL`;
- `(gym_id, uid_digest, occurred_at DESC, id DESC)` for cooldown;
- `(gym_id, access_method, occurred_at DESC, id DESC)` for recent/history;
- `(gym_id, outcome, occurred_at DESC, id DESC)` and `(gym_id, member_id, occurred_at DESC)`;
- immutable update/delete trigger modeled on `reject_privileged_audit_mutation`;
- revoke all authenticated table access. Only trusted writer functions, `kiosk_recent_rfid_taps`, and `admin_access_event_history` expose reduced projections.

Expected outcomes, including unknown/denied/duplicate, are inserted in the same transaction as the decision. A granted event references the one attendance mutation. No failed event increments/decrements occupancy.

### 5.3 `public.rfid_assignment_intents` — migration `032_rfid_security_and_lifecycle.sql`

| Field | Proposed definition | Constraint/use |
|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Internal intent. |
| `gym_id` | `UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE` | Bound active gym. |
| `access_event_id` | `UUID NOT NULL UNIQUE REFERENCES access_events(id) ON DELETE CASCADE` | Must refer to an unknown RFID event in the same gym. |
| `actor_id` | `UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE` | Reauthenticated manager. |
| `uid_digest` | `TEXT NOT NULL` | Copied from unknown event; never client-supplied during assignment. |
| `token_hash` | `TEXT NOT NULL UNIQUE` | SHA-256 of a server-generated high-entropy opaque token. |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Audit. |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | Five minutes after creation. |
| `consumed_at` | `TIMESTAMPTZ NULL` | Set atomically on successful assignment. |
| `cancelled_at` | `TIMESTAMPTZ NULL` | Set on explicit cancellation/replacement of flow. |
| `assigned_member_id` | `UUID NULL REFERENCES profiles(id) ON DELETE SET NULL` | Set on consume. |

No browser/table access. The raw assignment token exists only in route response and React memory. An intent is valid only for its actor, active gym, unknown event/digest, unexpired/unconsumed/uncancelled state. Expired rows may be retained for bounded audit or purged after an operational retention decision; access events/cards are never deleted by that cleanup.

### 5.4 UID storage security decision

Recommended MVP storage is a keyed lookup digest, not raw UID:

```text
hex(HMAC-SHA-256(RFID_UID_HMAC_SECRET,
  "stren-rfid:v1:<gym-id>:<normalized-uid>"))
```

Why:

- equality lookup and unique indexes remain efficient;
- an unkeyed SHA hash is weak because many RFID UID spaces are enumerable;
- including gym ID prevents cross-gym correlation and permits the same physical UID in distinct gyms;
- no decryptable/raw UID exists in the database or access logs;
- `uid_suffix` supports safe UI identification.

Tradeoff: losing/rotating the HMAC secret makes existing assignments unresolvable because raw UIDs cannot be rehashed. `uid_digest_version` documents this; back up the dedicated secret with deployment configuration. A secret rotation requires dual-key lookup during a controlled window or member retapping/reassignment. Storing encrypted raw UID would ease rotation but materially increases exposure and is not recommended for this MVP. Card UIDs are cloneable; masking/HMAC improves data handling but does not make the card cryptographically secure.

### 5.5 Migration/backfill/deletion behavior

- `031` creates full final card/access-event shapes, constraints, feature key, shared success path, and types; it adds no member cards.
- `032` adds assignment intents and lifecycle/security functions; no backfill.
- `033_rfid_reporting_hardening.sql` adds report/recent projections and idempotently backfills historical successful events:
  - existing `attendance.source='kiosk'` predates RFID and may be mapped to `qr`;
  - `manual_override` maps to `manual`;
  - `manual_correction` and `legacy` map to `legacy` where the original method cannot be proved;
  - one check-in event per row and one checkout event when `check_out` exists, keyed by `backfill_key`;
  - no historical denial/unknown events are invented.
- Inventory closed rows with null `duration_min`. If volume is small, `033` may derive it; otherwise leave historical nulls and document a separate batched maintenance operation. New checkouts always populate it.
- Card replacement/deactivation never deletes card, attendance, access-event, or privileged-audit history.
- Forward rollback disables `rfid_kiosk` and reverts the app; it does not drop tables or erase assignments/events.

## 6. API, server-action, and service changes

### 6.1 Shared TypeScript modules

#### `lib/rfid.ts` (new, isomorphic)

- [ ] Export `normalizeRfidUid`, `getMemberInitials`, `maskRfidSuffix`, named timing/length constants, Zod-compatible result types, and discriminated unions for tap/card/recent responses.
- [ ] Never export a helper that logs or stores raw UID.
- [ ] Unit-test normalization, masking, initials, bounds, terminators, leading zeroes, and Unicode/control rejection.

#### `lib/rfid-server.ts` (new, `server-only`)

- [ ] Export `digestRfidUid(gymId, normalizedUid, version=1)`, `hashAssignmentToken`, `createIsolatedPasswordVerifier`, and redacted error helpers.
- [ ] Fail closed with a configuration error when `RFID_UID_HMAC_SECRET` is absent/too short.
- [ ] Domain-separate HMAC and token hashes. Never reuse the password-recovery proof as an RFID grant.

#### `hooks/use-rfid-keyboard-input.ts` (new)

- [ ] Own the hidden input ref/buffer, Enter/idle finalization, overflow reset, focus restoration, visibility/focus listeners, and cleanup.
- [ ] Accept `enabled` and `suspended` flags. Unmount listeners and clear buffer when mode changes, staff flow opens, or component unmounts.
- [ ] Do not attach a global alphanumeric handler in Search mode or while password/member-search fields are active.

#### `lib/rfid-scan-gate.ts` (new)

- [ ] Give each finalized reader burst one UUID, prevent that burst/request from double-submitting, and serialize distinct bursts through a five-item FIFO; clear queue/controllers on reset.
- [ ] Send a separately captured repeat UID to the server so the authoritative five-second gate can return and log `duplicate`; never implement a client-only cooldown that hides the attempt.
- [ ] Return explicit `accepted`, `queued`, or `busy` decisions for local flow control. Treat this as UX only; database locking/idempotency/cooldown remains mandatory.

### 6.2 `POST /api/kiosk/rfid/tap`

**Destination:** `app/api/kiosk/rfid/tap/route.ts` (new)

Input schema:

```ts
{ uid: string /* 1..128 transport bound */, requestId: string /* UUID */ }
```

Output schema (`200` for business outcomes):

```ts
{
  requestId: string
  eventId: string
  outcome: "granted" | "denied" | "unknown" | "duplicate"
  direction: "check_in" | "check_out" | null
  reason: string | null
  processedAt: string
  attendanceId: string | null
  occupancy: number | null
  durationMin: number | null
  retryAfterMs?: number
  member: null | {
    name: string
    avatarUrl: string | null
    membershipStatus: string
    planName: string | null
    membershipEndDate: string | null
    warnings: string[]
  }
  recentTap: {
    eventId: string
    avatarUrl: string | null
    initials: string | null
    outcome: string
    direction: string | null
    occurredAt: string
  }
}
```

Authorization/validation/transaction:

- [ ] `createServerSupabaseClient().auth.getUser()`; `getMyAccess` must resolve same active gym.
- [ ] Require manager role, `kiosk:use`, `kiosk_checkin`, and proposed `rfid_kiosk`.
- [ ] Normalize/digest server-side; call `process_rfid_tap(p_uid_digest,p_uid_suffix,p_request_id)`.
- [ ] A transport-valid request whose UID fails normalization calls a guarded `record_invalid_rfid_tap(p_request_id,p_reason)` RPC and returns the logged denied/error result. Malformed JSON, unauthenticated probes, and requests that cannot establish a gym are rejected and only operationally logged because they cannot be attributed safely as gym access attempts.
- [ ] RPC validates digest/request, idempotency, locks, cooldown, card status, open-session-first transition, eligibility, attendance, event, and occupancy atomically.
- [ ] Map malformed `400`, unauthenticated `401`, permission/feature `403`, rate `429`, missing secret `503`, unexpected `500`. Do not return raw database messages or UID.
- [ ] Set `Cache-Control: no-store`.

### 6.3 `public.transition_member_attendance` and wrappers

**Destination:** `supabase/migrations/031_rfid_foundation.sql`

Proposed private signature:

```text
transition_member_attendance(
  p_member_id UUID,
  p_gym_id UUID,
  p_access_method TEXT,
  p_request_id UUID DEFAULT NULL,
  p_rfid_card_id UUID DEFAULT NULL,
  p_uid_digest TEXT DEFAULT NULL,
  p_uid_suffix TEXT DEFAULT NULL
) RETURNS JSONB
```

- [ ] Revoke execution from `PUBLIC`, `anon`, `authenticated`; only wrapper functions may call it.
- [ ] Validate caller/gym in each wrapper before delegation.
- [ ] Take member lock; load role/status/profile without requiring active state.
- [ ] If an open attendance row exists, close it and calculate duration **before** any new-entry entitlement check.
- [ ] If none exists, require role member, active gym-user, and effective membership `active`; return a stable denial reason otherwise.
- [ ] Insert/update one attendance row, call streak only for check-in, insert one access event, compute nullable authoritative occupancy, return versioned JSON.
- [ ] Replace bodies but preserve signatures/grants for `kiosk_checkin`, `kiosk_checkin_by_member`, and `kiosk_checkout`.
- [ ] Make QR/manual wrappers supply method `qr`/`manual` and log their successful/denied outcomes. The current Search lookup alone stays non-mutating.
- [ ] Update `close_attendance_session` to calculate duration and append method `manual` access event while preserving its privileged audit.
- [ ] Add user-bound `record_invalid_rfid_tap(p_request_id UUID,p_reason TEXT)` for a structurally valid kiosk request whose candidate fails normalization. It repeats kiosk/gym/feature authorization, is idempotent by request ID, inserts an RFID `error/invalid_uid` event with null member/card/digest/suffix, and returns the same reduced result shape.

### 6.4 Member RFID API

**Destination:** `app/api/admin/members/[memberId]/rfid/route.ts` (new)

`GET` output:

```ts
{ card: null | {
  id: string
  maskedId: string
  status: "active" | "deactivated" | "lost" | "replaced"
  assignedAt: string
  deactivatedAt: string | null
} }
```

`POST` input:

```ts
{ uid: string; operation: "assign" | "replace" }
```

`PATCH` input:

```ts
{ action: "deactivate" | "reactivate" | "report_lost"; reason?: string }
```

Contract:

- [ ] Require authenticated active gym, role `owner`/`admin`, and `members:manage`; feature enablement is not required to manage already-issued cards.
- [ ] Normalize/digest only in server route, then invoke user-bound `get_member_rfid_card`, `assign_member_rfid_card`, or `set_member_rfid_card_status`.
- [ ] RPC validates target is a member in the active gym and performs assign/replace/status transitions under digest/member locks.
- [ ] Replace atomically marks old active row `replaced`, creates new active row, links them, and writes privileged audits without digest.
- [ ] Reactivate only `deactivated`, only when no other active card exists. `lost` and `replaced` are terminal.
- [ ] Return `400` invalid UID/action, `401`, `403`, `404` member/card, `409` UID/member conflict, `503` secret/config, or redacted `500`.
- [ ] Never return digest/full UID.

### 6.5 Unknown-card reauthentication and assignment

#### `POST /api/kiosk/rfid/reauthenticate`

**Destination:** `app/api/kiosk/rfid/reauthenticate/route.ts`

Input:

```ts
{ accessEventId: string /* UUID */, password: string /* 1..128 */ }
```

Output:

```ts
{ assignmentToken: string; expiresAt: string }
```

- [ ] Require current role `owner`/`admin`/`staff`, `kiosk:use`, `members:view`, both kiosk features, and an unknown RFID access event in current gym.
- [ ] Apply existing process-local `rateLimit` by hashed user ID plus client address as a supplemental bound, then rely on Supabase Auth's provider control.
- [ ] Verify password server-side with the isolated client and same returned user ID; clear local variables as soon as practical and never log input.
- [ ] Generate a 32-byte random token, store only its SHA-256 hash through `create_rfid_assignment_intent`, and return raw token once.
- [ ] Use generic `401` copy for incorrect password; `403` unauthorized role/permission; `404` wrong event; `409` event no longer unknown/card already assigned; `429`; `500`.

#### `POST`/`DELETE /api/kiosk/rfid/assignment`

**Destination:** `app/api/kiosk/rfid/assignment/route.ts`

POST input:

```ts
{ assignmentToken: string; memberId: string /* UUID */ }
```

POST output:

```ts
{ assigned: true; card: { id: string; maskedId: string; status: "active"; assignedAt: string }; freshTapRequired: true }
```

DELETE input:

```ts
{ assignmentToken: string }
```

- [ ] Reconfirm current authenticated actor/gym/role/permissions.
- [ ] Hash token server-side and call `consume_rfid_assignment_intent` atomically.
- [ ] RPC locks intent/digest/member, checks expiry/actor/gym/event, ensures UID still unassigned and member has no active card, inserts card, consumes intent, and writes `rfid.card_assigned_from_kiosk` privileged audit.
- [ ] DELETE cancels the intent. Closing/unmounting after a token exists should make a best-effort cancellation; expiry remains the hard boundary.
- [ ] Assignment **does not** trigger attendance. Require a fresh tap. This avoids a password/search action silently granting entry, prevents ambiguity around the original five-second cooldown, and gives staff/member a clear confirmation boundary.

### 6.6 Recent taps and report RPCs

#### `kiosk_recent_rfid_taps(p_gym_id UUID, p_limit INTEGER DEFAULT 5)`

**Destination:** `033_rfid_reporting_hardening.sql`

- [ ] Require `kiosk_access_allowed`, enabled `rfid_kiosk`, `p_limit BETWEEN 1 AND 5`.
- [ ] Return only event ID, avatar URL, server-derived initials, outcome, direction, reason label, occurred time.
- [ ] Do not return member name, email, member ID, digest, suffix, membership, attendance ID, or actor.
- [ ] Unknown rows return null photo/initials; UI renders a generic contactless-card icon.

#### `admin_access_event_history(...)`

**Destination:** `033_rfid_reporting_hardening.sql`

Inputs: nullable method/outcome/direction/from/to filters, keyset cursor (`beforeOccurredAt`, `beforeId`), and limit `1..100`.

Output: event ID, member display name when known, timestamp, direction, method, outcome, stable reason, masked card reference, safe actor display when relevant, and cursor fields. Never return a digest.

- [ ] Require `reports:attendance:view` and active gym.
- [ ] Filter all/RFID/QR/manual/Search/legacy, success check-in/out, denied, unknown, and duplicate. `search` remains empty unless a future explicit Search attendance action writes it; the current read-only member lookup is not falsely logged as access.
- [ ] Use keyset pagination ordered `(occurred_at DESC,id DESC)` to avoid the PostgREST 1,000-row cap.
- [ ] Add an `AccessHistoryTable` client section to Reports with loading/error/empty states and `Load more`.

## 7. UI and interaction specification

### 7.1 Kiosk state machine

| State | Visible content | Actions/timing/transition | Focus, keyboard, accessibility, cleanup |
|---|---|---|---|
| `idle` | Heading `Tap to check in or check out`; short nontechnical instruction; one subtle `Ready for RFID tap` status if needed; recent five remains below. No empty featured card and no three-state strip. | Any valid completed UID moves to `processing`. QR/Search tabs remain available. | Hidden RFID input is focused with `preventScroll`; `tabIndex=-1`, descriptive label, no mobile keyboard (`inputMode="none"` where supported). Visibility/focus regain refocuses only when no dialog/interactive field owns focus. |
| `receiving` | Same layout; subtle status changes to `Reading card…`. | Buffer finalizes on Enter or bounded idle gap. Invalid/short partial input resets quietly; an Enter-completed invalid candidate reaches server and can become a logged invalid result. | Do not announce every character. Bound length and clear overflow. |
| `processing` | One featured-area loading state `Checking access…`; recent taps remain visible; tabs may remain visible and separately framed taps are queued. | Show immediately or after a very short delay; committed response selects result. A new queued tap cancels the prior result timer and becomes the next processing item. A slow-request note appears after 2s without claiming failure; 10s timeout becomes retryable server/offline result. | `aria-busy=true`; status is `aria-live=polite`. Keep the hidden capture focused but serialize requests; suspend only for mode/form/dialog/visibility rules. Abort fetch and clear the queue on unmount, then reconcile recent events on remount. |
| `successful check-in` | Prominent card: photo or two-letter initials left; full name only here; active membership badge; `Check-in successful`, `Access granted`, server time, plan/end date when present, warnings, authoritative occupancy when enabled. | Auto-dismiss after about 1,500ms; next different tap may replace it and cancels old timer. | `role=status`, atomic polite announcement; success feedback optional. On dismiss restore capture focus. |
| `successful checkout` | Same featured layout with `Check-out successful`, visit duration when non-null, checkout time, and occupancy. Membership warning may state access is inactive but checkout completed. | Auto-dismiss after about 1,500ms. | Same cleanup/focus. Duration is server-derived. |
| `denied` | Photo/initials and full name for known member; `Entry not allowed`; human reason (expired/frozen/banned/card inactive); no private extra details beyond relevant status/renewal guidance. | Hold 3,500ms (within approved 3–4s), then dismiss; manual dismiss permitted. | `role=alert`/assertive once; error feedback. Never decrement/increment occupancy. |
| `duplicate ignored` | Compact featured result `Already processed` and `Please wait a moment before tapping again`; optional retry countdown. | Hold about 1,500ms; no attendance/occupancy mutation. Client busy duplicate may be immediate; server duplicate is authoritative. | Polite status, no error alarm. |
| `unknown card` | Persistent featured card `Card not recognized`; generic contactless-card icon; masked suffix only if product copy needs it; `Find member` and `Dismiss`. | Remains until dismissed, a new scan replaces it, or staff starts assignment. `Find member` opens reauth. | Result is assertive once. While no modal is open, capture stays available so a new card can replace the result. |
| `staff reauthentication` | Modal explains `Sign in as staff to assign this card`; email may be shown read-only from current account; `current-password` field; submit/cancel; generic error. | Successful auth creates five-minute intent then opens member search. Incorrect password stays. Cancel invalidates/abandons flow. | RFID hook is suspended/unmounted; password gets focus; focus trapped/restored. Password state clears on response/cancel/unmount. Because keyboard readers are indistinguishable from keyboards, scans during this form are not processed as cards; no global handler may steal ordinary typing. |
| `member search and assignment` | Reuse Search query/result styling and `kiosk_search_members`; selected member confirmation shows name plus masked email; `Assign card`/Cancel. | Consume one-time token. On success show `Card assigned — tap again to check in`; never auto-check-in. Conflicts explain card/member state and require restart/fresh tap. | RFID capture remains suspended. Token stays in memory. Expiry (`410`) returns to persistent unknown result with `Authenticate again`. |
| `input paused/failure` | Only for detectable state: offline, tab hidden, focus could not be restored after explicit Resume, invalid reader output, server HMAC missing. Never `Reader disconnected`. | Offline remains persistent like current QR offline; Resume button retries focus; config error directs staff to Admin/support. | Cleanup all listeners/timers. Do not expose diagnostics containing UID. |

### 7.2 Mode persistence and switching

- [ ] Three tabs are `QR Scan`, `RFID Tap`, `Search`; RFID orange-selected as in the mockup.
- [ ] `rfid_kiosk` is an available, default-off Operations feature. When off, retain today's two-tab kiosk; an owner enables `Enable RFID tap` through the existing Studio Features panel. This is the safest rollout feature toggle, not a global default-mode change.
- [ ] Switching away from QR calls existing `stopScanner`; switching away from RFID disables its input hook, clears partial buffer, cancels visual timers, and cancels any unsubmitted assignment state.
- [ ] Switching to Search focuses the searchbox and no RFID/QR listener consumes typing.
- [ ] Switching back to RFID remounts/focuses capture after one animation frame and reconciles recent taps.
- [ ] Persist only successful manual tab selection. If stored RFID is no longer enabled, use and persist QR.
- [ ] Local-storage failure falls back to QR for that page load; it is not a reader error.

### 7.3 Recent five privacy

- [ ] Featured result and recent list are separate state.
- [ ] Exactly the newest five RFID access events are rendered, newest first.
- [ ] Known member: photo when available; otherwise server-derived two-letter initials. No name, email, plan, expiry, denial detail, card suffix, or member ID.
- [ ] Unknown/invalid UID: generic RFID/contactless icon, not initials derived from UID.
- [ ] Text is limited to `Check-in`, `Check-out`, `Access denied`, `Not recognized`, or `Already processed`, plus local time.
- [ ] Response merge updates immediately; reconciliation fetch/poll corrects cross-tab/terminal ordering without full-page refresh.
- [ ] Empty state: `No RFID taps yet`.
- [ ] Desktop uses five quiet equal cards/rows beneath the feature card; narrow screens use accessible horizontal overflow/snap or a vertical list, not clipped names (there are none) and not mandatory carousel controls.

### 7.4 Member-profile RFID management

- [ ] Add `components/admin/MemberRfidAccess.tsx` inside the existing Member Details modal.
- [ ] No card: `No RFID card assigned` and `Assign card`.
- [ ] Capture modal: explicit `Tap the card to assign`, active only while open; masked preview after valid UID; confirm/cancel. It must not globally capture the Members-page search input.
- [ ] Active: masked `•••• ABCD`, `Active`, assigned date, Replace, Deactivate, Report lost.
- [ ] Deactivated: status/date and Reactivate; Reactivate disabled if another active card exists.
- [ ] Lost/replaced: terminal status; no Reactivate. A new card uses Assign/Replace semantics.
- [ ] Replace/deactivate/lost require clear `Modal` confirmation. Inline section shows loading/errors; Sonner announces final success/error.
- [ ] Card assignment is allowed regardless of membership state. UI may show membership separately but must not imply the card was removed on expiry.
- [ ] Use `useAccess()` to hide controls from staff/read-only admins; server/RPC is final.

### 7.5 Responsive, motion, and accessibility

- [ ] Preserve `KioskLayout`, maximum panel width, cream background, heading font, orange tokens, border/shadow vocabulary, and `42rem` breakpoint.
- [ ] RFID featured card follows the approved mockup: horizontal photo/status composition on desktop, stacked on mobile; no page-wide sidebar.
- [ ] All state changes have a text equivalent and do not rely on red/green alone.
- [ ] The tablist has valid `role=tab`, `aria-selected`, `aria-controls`; panels have matching IDs/labels.
- [ ] Dialogs trap/restore focus and support Escape/cancel; destructive confirmations name the member/card action.
- [ ] Respect `prefers-reduced-motion`: opacity-only or no transition; timers still meet readable durations.
- [ ] Do not optimistically show granted/denied. Admin card lifecycle may show pending controls but commits UI only from server response.

## 8. Exactly three implementation slices

The feature remains behind default-off `rfid_kiosk` until Slice 3 rollout approval. This makes Slice 1 and Slice 2 independently safe even though they intentionally stop short of production enablement.

### Slice 1: RFID foundation and end-to-end happy path

#### Slice goal

With the `rfid_kiosk` fixture flag enabled, an owner/admin can assign one card in the existing Member Details modal, and an active member can tap that card in the real kiosk to check in and tap later to check out through `attendance`. Occupancy, photo/initials, membership details, mode persistence, and QR/Search regressions are verifiable. Production gyms still see no RFID tab by default.

#### Preconditions

- [ ] Confirm working tree and preserve unrelated changes.
- [ ] Read the effective definitions in migrations `027`–`030`, not only historical kiosk migrations.
- [ ] Capture at least two real intended-reader UID samples and freeze normalization fixtures.
- [ ] Provision a non-production `RFID_UID_HMAC_SECRET`; do not commit it.
- [ ] Start from schema through migration `030`.

#### Files to inspect

- [ ] `app/kiosk/page.tsx`, `layout.tsx`, `kiosk.module.css`
- [ ] `lib/kiosk-scan-gate.ts`, `kiosk-feedback.ts`, `async-guard.ts`
- [ ] `lib/features.ts`, `access-context.tsx`, `permissions.ts`, `permissions-server.ts`
- [ ] `app/admin/members/page.tsx`, `lib/admin-ui.tsx`
- [ ] migrations `023`, `024`, `027`, `028`, `029`, `030`
- [ ] `lib/database.types.ts`
- [ ] all current kiosk tests and database attendance-concurrency files

#### Files to modify

- [ ] `app/kiosk/layout.tsx` — provide effective access context.
- [ ] `app/kiosk/page.tsx` — add mode orchestration/persistence and integrate extracted RFID/shared result components without changing QR/Search behavior.
- [ ] `app/kiosk/kiosk.module.css` — three tabs and approved RFID/result responsive layout.
- [ ] `app/admin/members/page.tsx` — mount the RFID section in Member Details and pass the confirmed member/access context.
- [ ] `lib/features.ts` — add default-off available `rfid_kiosk`.
- [ ] `lib/database.types.ts` — regenerate only after clean migration.
- [ ] `tests/unit/features.test.ts`, `tests/integration/feature-toggles-sql.test.ts`, and `tests/integration/get-my-access.test.ts` — assert the new default-off flag and SQL/TypeScript access-shape parity.
- [ ] `tests/fixtures/role-permission-defaults.json` only if generation/parity tooling rewrites it; no new permission is planned.
- [ ] `scripts/run-production-security-tests.mjs` — include foundation behavior tests.

#### Files to create

- [ ] `supabase/migrations/031_rfid_foundation.sql`
- [ ] `lib/rfid.ts`
- [ ] `lib/rfid-server.ts`
- [ ] `lib/rfid-scan-gate.ts`
- [ ] `hooks/use-rfid-keyboard-input.ts`
- [ ] `components/kiosk/KioskResultCard.tsx`
- [ ] `components/kiosk/RfidPanel.tsx`
- [ ] `components/admin/MemberRfidAccess.tsx`
- [ ] `app/api/kiosk/rfid/tap/route.ts`
- [ ] `app/api/admin/members/[memberId]/rfid/route.ts`
- [ ] `tests/unit/rfid.test.ts`
- [ ] `tests/unit/rfid-scan-gate.test.ts`
- [ ] `tests/integration/rfid-kiosk.test.tsx`
- [ ] `tests/integration/member-rfid-access.test.tsx`
- [ ] `tests/integration/rfid-api.test.ts`
- [ ] `tests/database/rfid-foundation.sql`
- [ ] `tests/e2e/rfid-kiosk.spec.ts`

#### Database work

- [ ] Red-first executed tests for card uniqueness, tenant FK, grants, immutable access events, open-session-first checkout, and authoritative occupancy.
- [ ] Create full `rfid_cards` and `access_events` tables/constraints/indexes/grants.
- [ ] Add `rfid_kiosk` false default to `gym_feature_enabled` and `get_my_access`; update TypeScript/SQL feature parity.
- [ ] Add private `transition_member_attendance` and refactor effective `kiosk_checkin`, `kiosk_checkin_by_member`, `kiosk_checkout`, and `close_attendance_session` without changing public signatures.
- [ ] Populate `duration_min` for every newly closed session.
- [ ] Add basic `get_member_rfid_card`, initial `assign_member_rfid_card`, and `process_rfid_tap` for an active assigned card. Full exception/cooldown lifecycle remains off behind the feature flag until Slice 2.
- [ ] Keep attendance source compatible (`kiosk` for QR/RFID sessions); use `access_events.access_method` for method-level reporting.
- [ ] Regenerate `lib/database.types.ts`; extend deployment/protected-definition checks for new tables/functions/triggers.

#### Backend work

- [ ] Implement and test server normalization/HMAC; reject missing secret.
- [ ] Implement tap route authentication, validation, digest, RPC call, redacted mapping, and no-store response.
- [ ] Implement member RFID GET/POST initial assignment with owner/admin + `members:manage`.
- [ ] Ensure no service-role client is used for application authorization.

#### Frontend work

- [ ] Characterize current QR/Search DOM and timers before extraction.
- [ ] Extract `KioskResultCard` with compatibility props, then keep current QR tests green.
- [ ] Add third feature-gated tab and gym-scoped local mode persistence with a pre-activation hydration gate.
- [ ] Add RFID input hook/panel states idle/receiving/processing/success and basic errors.
- [ ] Render approved featured result with full name, photo/two-letter fallback, membership status/plan/end date, server time, duration, occupancy.
- [ ] Add member-detail initial assign-by-tap UI; listener exists only while capture modal is open.
- [ ] Clear all timers/listeners/requests on mode change/unmount.

#### Security and permissions

- [ ] Database and routes require active-gym tenant match.
- [ ] Tap requires manager + `kiosk:use` + both feature gates.
- [ ] Member assignment requires owner/admin role plus `members:manage`.
- [ ] Raw UID exists only in input memory and same-origin request; digest/suffix only at rest.
- [ ] No digest/full UID reaches client response or logs.

#### Tests

- [ ] Unit: normalization/buffering/masking/initials/gate/timer cleanup.
- [ ] Integration: route auth/role/feature/config/validation; member assignment; kiosk rendering/focus/mode persistence; unchanged QR/Search/camera behavior.
- [ ] Database: active card check-in, later checkout, one attendance row, duration, occupancy, streak once, card/member uniqueness, cross-gym denial, direct-write denial.
- [ ] E2E smoke: enable fixture, assign card, tap UID into hidden input, observe check-in/out and local mode restore.
- [ ] Manual: approved desktop/mobile layout and real reader sample.

#### Acceptance criteria

- [ ] An assigned active member tap returns `granted/check_in`, creates exactly one open `attendance`, and raises occupancy once.
- [ ] A later tap after the temporary foundation test interval returns `granted/check_out`, closes that row, sets duration, and lowers occupancy once.
- [ ] The featured result shows full name/photo or two-letter initials and never exposes full UID.
- [ ] QR and Search behave exactly as before except the explicit shared checkout eligibility correction.
- [ ] Refreshing the same browser/gym restores RFID mode; another browser starts at QR.
- [ ] Feature false means the existing two-mode kiosk remains.

#### Verification commands

```bash
npm run test:unit -- tests/unit/rfid.test.ts tests/unit/rfid-scan-gate.test.ts
npm run test:unit -- tests/integration/kiosk-terminal.test.tsx tests/integration/rfid-kiosk.test.tsx tests/integration/member-rfid-access.test.tsx tests/integration/rfid-api.test.ts
npm run db:reset
npm run db:types:check
npm run db:test:security
npm run db:invariants
npm run verify:deployment:local
npm run verify:deployment:drift:local
npm run lint
npm run typecheck
npm run build
npm run test:e2e -- tests/e2e/rfid-kiosk.spec.ts
```

`npm run test:unit` is the repository's combined unit/integration runner; there is no separate integration command.

#### Commit boundary

The developer may commit migration `031`, generated types, shared transition, initial secure assignment/tap routes, feature-gated UI, tests, and corresponding `ImplementationState.md`/`CHANGELOG.md` updates. Do not enable RFID for any real gym. Unknown assignment, lifecycle actions, complete denial logging, five-second distributed cooldown, recent taps, and reports remain for later slices.

### Slice 2: Exceptions, security, and card lifecycle

#### Slice goal

All operational RFID outcomes are safe: eligibility denial, checkout-after-ineligibility, inactive/lost/replaced cards, unknown cards, five-second duplicate protection across tabs/kiosks, password-reauthenticated front-desk assignment, and full owner/admin lifecycle work atomically and are durably logged. RFID remains default-off pending reporting/polish.

#### Preconditions

- [ ] Slice 1 database/application gates pass and its developer commit boundary is clean/reviewable.
- [ ] `031` is applied locally and generated types match.
- [ ] Supabase Auth password sign-in is available in the target environment and provider rate limits are documented.

#### Files to inspect

- [ ] All Slice 1 RFID files and migration `031`
- [ ] `lib/password-recovery.ts`, `lib/rate-limit.ts`, `lib/supabase-server.ts`
- [ ] `lib/auth-context.tsx` sign-in/session handling
- [ ] `kiosk_search_members` effective grants
- [ ] `privileged_audit_events` writer/immutability in migration `027`
- [ ] `tests/database/production-security.sql` and attendance concurrency wrapper

#### Files to modify

- [ ] `lib/rfid-server.ts` — isolated current-password verification and assignment-token hashing.
- [ ] `components/kiosk/RfidPanel.tsx` — denied/duplicate/unknown/staff flows and robust timers.
- [ ] `components/admin/MemberRfidAccess.tsx` — replace/deactivate/lost/reactivate states.
- [ ] `app/api/admin/members/[memberId]/rfid/route.ts` — PATCH and atomic replace.
- [ ] `app/kiosk/kiosk.module.css` — dialogs/status variants without a state strip.
- [ ] `tests/e2e/rfid-kiosk.spec.ts` — extend the Slice 1 smoke path with reauthentication, assignment, denial, lifecycle, and concurrency-facing behavior.
- [ ] `scripts/run-production-security-tests.mjs` — execute RFID concurrency.
- [ ] `lib/database.types.ts` — regenerate after `032`.
- [ ] Existing kiosk/permission/security tests as behavior changes require.

#### Files to create

- [ ] `supabase/migrations/032_rfid_security_and_lifecycle.sql`
- [ ] `components/kiosk/RfidAssignmentDialog.tsx`
- [ ] `app/api/kiosk/rfid/reauthenticate/route.ts`
- [ ] `app/api/kiosk/rfid/assignment/route.ts`
- [ ] `tests/integration/rfid-reauth-api.test.ts`
- [ ] `tests/integration/rfid-assignment-api.test.ts`
- [ ] `tests/integration/rfid-card-lifecycle.test.tsx`
- [ ] `tests/database/rfid-access-security.sql`
- [ ] `tests/database/rfid-concurrency-prepare.sql`
- [ ] `tests/database/rfid-concurrency-call.sql`
- [ ] `tests/database/rfid-concurrency-assert.sql`
- [ ] `tests/database/run-rfid-concurrency.ps1`

#### Database work

- [ ] Red-first executed test matrix for every status/outcome and role.
- [ ] Create `rfid_assignment_intents` with one-time/expiry/actor/gym checks.
- [ ] Harden `process_rfid_tap` with request replay, digest lock, five-second cooldown, full known-card states, stable denial reasons, and access-event inserts for expected failures.
- [ ] Ensure open session checkout occurs for expired/frozen/cancelled/banned/disabled member when the presented card itself remains active; a lost/deactivated/replaced card remains denied and staff can use existing manual checkout.
- [ ] Implement atomic replace/deactivate/lost/reactivate RPCs and privileged audit events containing card IDs/masked suffix only.
- [ ] Implement create/cancel/consume assignment-intent RPCs; prevent already-assigned UID/member races.
- [ ] Strengthen constraints/checks and protected-definition hashes discovered by adversarial tests.

#### Backend work

- [ ] Reauth route authenticates cookie user, role/permissions/features, event, rate limits, verifies password in isolated client, verifies same user ID, and creates one-time intent.
- [ ] Assignment route consumes/cancels without accepting UID.
- [ ] Member route exposes lifecycle actions with role + permission checks and stable conflict mapping.
- [ ] Tap route maps every expected outcome, `retryAfterMs`, and a privacy event; unexpected errors remain redacted.
- [ ] No endpoint refreshes/replaces the kiosk session during password verification.

#### Frontend work

- [ ] Add denied result variants and exact 3.5s timer.
- [ ] Add duplicate result and 1.5s timer; new event cancels stale timers by sequence/event ID.
- [ ] Keep unknown persistent and allow a new scan to replace it until staff flow begins.
- [ ] Add reauth dialog, password cleanup, search reuse, member selection, assignment confirmation, expiry/conflict/cancel states.
- [ ] Suspend RFID capture throughout staff fields; restore only after dialog fully closes.
- [ ] After assignment, show confirmation and require fresh tap.
- [ ] Complete member card replace/deactivate/report-lost/reactivate confirmations and error recovery.
- [ ] Handle tab hidden/regained, rapid mode switching, slow/failing server, and page refresh without stale state.

#### Security and permissions

- [ ] Owner/admin lifecycle = role owner/admin **and** `members:manage`.
- [ ] Unknown flow = owner/admin/staff **and** `kiosk:use` + `members:view` + fresh one-time intent.
- [ ] Incorrect password gives generic response; passwords/tokens/UIDs never logged.
- [ ] Intent token is memory-only, five minutes, one use, actor/gym/event-bound.
- [ ] Direct RPC calls, forged gym/member/event/token, service-role assumptions, and cross-gym targets are denied.
- [ ] Card lifecycle does not depend on membership and never deletes history.

#### Tests

- [ ] Unit: reducer transitions, timers, abort/unmount, password-state cleanup, client cooldown.
- [ ] API integration: correct/incorrect password, identity mismatch, rate limit, unauthorized roles, stale/expired/cancelled/replayed intent, conflict codes, missing secret.
- [ ] Component: unknown → reauth → search → assign → fresh-tap message; cancellation; another scan before flow replaces unknown; capture paused during password/Search.
- [ ] Database: all eligibility/card states, checkout exception, idempotent same request, same UID/different request cooldown, two tabs/kiosks concurrent, two different cards for same member, assignment/replace races, audit redaction.
- [ ] E2E: staff unknown assignment with real account password; owner/admin lifecycle.
- [ ] Manual: verify a scanner tap cannot be claimed as hardware-connected telemetry and normal Search/password typing is not captured by application listeners.

#### Acceptance criteria

- [ ] Two simultaneous same-card taps yield one attendance transition and one duplicate outcome; final state cannot immediately reverse.
- [ ] Expired/frozen/banned member with no open session is denied/logged and occupancy is unchanged.
- [ ] The same member with an open session and active card can check out/log successfully despite those later status changes.
- [ ] Unknown card is logged and cannot be assigned without correct current staff password.
- [ ] Front-desk `staff` can assign unknown card after reauth but cannot manage lifecycle in Member Details.
- [ ] Replacing a card immediately revokes the old; deactivated may reactivate only when appropriate; lost/replaced cannot.
- [ ] Renewal restores entry on the existing card without reassignment.
- [ ] All expected failures have access events; no failure corrupts occupancy.

#### Verification commands

```bash
npm run test:unit -- tests/unit/rfid.test.ts tests/unit/rfid-scan-gate.test.ts
npm run test:unit -- tests/integration/rfid-api.test.ts tests/integration/rfid-reauth-api.test.ts tests/integration/rfid-assignment-api.test.ts tests/integration/rfid-card-lifecycle.test.tsx tests/integration/rfid-kiosk.test.tsx
npm run db:reset
npm run db:types:check
npm run db:test:security
npm run db:invariants
npm run verify:deployment:local
npm run verify:deployment:drift:local
npm run lint
npm run typecheck
npm run build
npm run test:e2e -- tests/e2e/rfid-kiosk.spec.ts
```

#### Commit boundary

The developer may commit migration `032`, secure exception/cooldown/reauth/assignment/lifecycle behavior, generated types, adversarial/concurrency tests, and matching status/changelog updates. Do not yet enable a real gym: recent-five, full historical reporting/backfill, accessibility/observability hardening, and release evidence remain in Slice 3.

### Slice 3: History, reporting, polish, and production hardening

#### Slice goal

RFID is production-ready within MVP scope: recent five updates privately without refresh, Reports offers paginated/filterable access history, historical successful attendance is represented honestly, the approved UI is responsive/accessibility-reviewed, operations are observable without UID leakage, and complete clean-migration/CI/deployment evidence passes before a gym opts in.

#### Preconditions

- [ ] Slice 2 gates pass and migrations `031`/`032` are applied locally.
- [ ] Product owner accepts default-off `rfid_kiosk` rollout and the calibrated reader normalization.
- [ ] Deployment environment can securely provide/back up `RFID_UID_HMAC_SECRET`.

#### Files to inspect

- [ ] All RFID files/migrations/tests from Slices 1–2
- [ ] `app/admin/reports/page.tsx`
- [ ] `components/admin/AdminReportsClient.tsx`, `AdminReportsCharts.tsx`, `ReportingUnavailable.tsx`
- [ ] `scripts/check-local-deployment-contract.mjs`, `check-local-deployment-drift.mjs`
- [ ] `tests/database/recovery-invariants.sql`
- [ ] `.github/workflows/test-suite.yml`, `playwright.config.ts`
- [ ] `AgentsContextKnowledgeBase/ImplementationState.md`, `CHANGELOG.md`, `package.json`

#### Files to modify

- [ ] `components/kiosk/RfidPanel.tsx` — recent fetch/merge/poll and final accessibility.
- [ ] `app/kiosk/page.tsx`, `kiosk.module.css` — final responsive/motion/focus polish.
- [ ] `app/admin/reports/page.tsx` — initial access-history query/error contract.
- [ ] `components/admin/AdminReportsClient.tsx` — mount history section without disturbing aggregates/reconciliation.
- [ ] `scripts/check-local-deployment-contract.mjs`, `scripts/check-local-deployment-drift.mjs`
- [ ] `scripts/run-production-security-tests.mjs`
- [ ] `tests/database/recovery-invariants.sql`
- [ ] `tests/e2e/rfid-kiosk.spec.ts` — extend the committed RFID spec with recent-history, reporting, accessibility, and release-regression coverage.
- [ ] `lib/database.types.ts`
- [ ] `AgentsContextKnowledgeBase/ImplementationState.md`
- [ ] `CHANGELOG.md`
- [ ] `package.json`/lockfile only for the final release version required by repository convention.

#### Files to create

- [ ] `supabase/migrations/033_rfid_reporting_hardening.sql`
- [ ] `components/kiosk/RecentRfidTaps.tsx`
- [ ] `components/admin/AccessHistoryTable.tsx`
- [ ] `tests/integration/rfid-recent-taps.test.tsx`
- [ ] `tests/integration/rfid-access-history.test.tsx`
- [ ] `tests/database/rfid-reporting.sql`

#### Database work

- [ ] Inventory attendance counts/sources/null durations before backfill and record non-PII evidence.
- [ ] Add `kiosk_recent_rfid_taps` privacy projection and `admin_access_event_history` filters/keyset pagination.
- [ ] Backfill provable historical check-in/out events idempotently with honest method mapping and no invented failures.
- [ ] Optionally derive null historical durations only after volume/lock review; otherwise document the retained null behavior.
- [ ] Extend recovery invariants for card uniqueness, no raw UID fields, immutable events, attendance links, intent validity, and source/access-event reconciliation.
- [ ] Extend deployment definition hashes/grants/RLS/function signatures and regenerate types.

#### Backend work

- [ ] Return first Reports history page server-side without converting errors to empty history.
- [ ] Ensure recent/report RPCs never expose names in recent taps or digest anywhere.
- [ ] Add redacted structured log fields/counters: request ID, gym ID, outcome/reason/method, latency bucket; no UID/digest/password/token/member name.
- [ ] Document HMAC secret availability/backup/rotation behavior in existing deployment/operations documentation if such configuration documentation is touched; do not create a new standalone RFID document unless Catalog rules require it.

#### Frontend work

- [ ] Recent five loads on RFID entry, merges each tap, reconciles after response, polls only while visible, and stops timers on mode change/unmount.
- [ ] Known recent item shows photo/initials and no name; unknown shows generic icon.
- [ ] Add Reports filters for all methods, RFID, QR, Manual/Search/legacy; granted check-ins, granted checkouts, denied, unknown, duplicate.
- [ ] Add keyset `Load more`, loading, empty, retry, and explicit unavailable states.
- [ ] Complete approved visual comparison on desktop and current `42rem` mobile breakpoint.
- [ ] Keyboard-only, screen-reader, contrast, high zoom, reduced-motion, focus-return, and rapid-scan checks.
- [ ] Remove temporary/unused abstractions only after `rg` confirms no callers; characterize before changing legacy `lib/engagement-hooks.ts`.

#### Security and permissions

- [ ] Reports RPC requires `reports:attendance:view`; staff cannot fetch it directly.
- [ ] Recent RPC requires kiosk authorization/feature and returns privacy-minimal rows.
- [ ] Backfill/report tables remain append-only/no direct authenticated mutation.
- [ ] Logs/monitoring/configuration evidence contains no raw UID, digest, password, token, email, or member name.
- [ ] Review feature enable control: only existing `features:manage` owner path changes `rfid_kiosk`.

#### Tests

- [ ] Complete Section 9 matrix at unit/component/API/database/E2E layers.
- [ ] Privacy assertions inspect exact recent/report payload keys.
- [ ] Pagination beyond 1,000 events and filter combinations.
- [ ] Clean reset from empty database through `033`, generated type parity, protected definition drift, and recovery invariants.
- [ ] Full unit/integration suite, build, and Playwright, with any pre-existing failure clearly separated from RFID evidence.
- [ ] Manual real-reader soak: several hours, tab background/foreground, rapid different members, network interruption/recovery, restricted local storage.

#### Acceptance criteria

- [ ] Recent list shows the latest five processed RFID taps immediately and after featured result disappears, with no names/private membership details.
- [ ] Reports distinguish required methods/outcomes, paginate, and preserve safe member/actor/card references.
- [ ] Historical backfill is rerunnable with identical counts and no attendance mutation.
- [ ] Responsive UI matches the approved hierarchy and has no persistent multi-state strip/sidebar.
- [ ] All listeners, intervals, abort controllers, and result timers clean up on mode change/unmount.
- [ ] Full gates pass and the feature remains disabled until a named gym opts in after hardware/secret checks.

#### Verification commands

```bash
npm run db:reset:clean
npm run db:types:check
npm run db:test:security
npm run db:test:financial
npm run db:test:platform
npm run db:invariants
npm run verify:deployment:local
npm run verify:deployment:drift:local
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
npm run test:ci
```

`db:reset:clean` currently has recorded seed-wrapper limitations in `ImplementationState.md`; Slice 3 must either make the command complete successfully under its documented guarded local-seed configuration or record that precise pre-existing blocker. It may not claim a clean reset from separate partial commands.

#### Commit boundary

The developer may commit migration `033`, recent/history/reporting/backfill, final UI/accessibility/observability hardening, comprehensive tests, generated types, deployment/recovery contract changes, final version/lockfile, `ImplementationState.md`, and `CHANGELOG.md`. No agent commits or pushes. Hosted migration/feature enablement remains a separately reviewed deployment action.

## 9. Test matrix

| ID | Scenario | Required layer(s) | Observable pass condition |
|---|---|---|---|
| T01 | Active member checks in | DB + API + component + E2E | One open attendance; granted/check-in event; occupancy +1; one streak update. |
| T02 | Checked-in member checks out | DB + E2E | Same attendance closes; granted/check-out event; occupancy -1; duration correct. |
| T03 | Occupancy increments once | DB concurrency | Count changes by exactly one after accepted entry. |
| T04 | Occupancy decrements once | DB concurrency | Count changes by exactly one after accepted exit. |
| T05 | Duplicate tap does not reverse attendance | unit + DB + component | Within five seconds result is duplicate; open state unchanged. |
| T06 | Duplicate requests from separate tabs | DB parallel + API | Distinct request IDs/same digest yield one transition; same request ID replays one event. |
| T07 | Expired member denied entry | DB + component | Denied/`membership_expired`; no attendance/occupancy change; event logged. |
| T08 | Expired member already inside may check out | DB + E2E | Active card closes open session despite expiry. |
| T09 | Frozen member denied entry | DB | Stable frozen reason; no attendance. |
| T10 | Banned/blocked member denied entry | DB authorization | Known member denial, not unknown; no attendance. |
| T11 | Manually deactivated card denied | DB + component | `card_deactivated`; assignment retained; no attendance. |
| T12 | Unknown card logged | DB + API | Unknown event has digest/suffix internally, no member/attendance. |
| T13 | Unknown assignment requires staff password | API + E2E | Assignment endpoint has no valid token before reauth. |
| T14 | Incorrect staff password | API | Generic 401; no intent/card; secret not logged. |
| T15 | Unauthorized role | API + direct RPC | Member denied tap-management/assignment/report; no mutation. |
| T16 | Front-desk staff permitted | API + E2E | `staff` with kiosk/use+members/view can reauth/search/assign unknown card. |
| T17 | Card already assigned to another member | DB + API | 409 under sequential and concurrent attempts; original owner unchanged. |
| T18 | Member already has a card | DB + API | Assign 409; explicit replace succeeds atomically. |
| T19 | Replacement revokes old card | DB + E2E | Old status replaced/denied; new active; one active card; history retained. |
| T20 | Membership renewal restores eligibility | DB | Existing card grants entry once effective status returns active. |
| T21 | Assignment survives membership expiry | DB | Card row/status unchanged after expiry; tap denied only at access decision. |
| T22 | Recent taps conceal names | SQL projection + component | Payload/DOM has no name/email/member ID/plan/suffix. |
| T23 | Featured result displays full name | component | Full name appears only in featured result. |
| T24 | No-photo fallback initials | unit + component | First/last initials; unknown card uses icon, not UID-derived text. |
| T25 | Mode persists same device | component + E2E | Reload same browser/gym restores selected mode. |
| T26 | Mode does not propagate | E2E contexts | Fresh browser context/device/gym defaults QR. |
| T27 | Rapid mode switching | component | Camera/RFID listeners never overlap; partial UID/timers cleared. |
| T28 | Scan while Search input active | component | Search receives typing; RFID request count stays zero. |
| T29 | Scan during staff password entry | component/manual | RFID application handler is suspended; no card/attendance request is created. |
| T30 | Page refresh | E2E | Mode restores; committed event visible after recent reconciliation; no replay. |
| T31 | Tab loses/regains focus | component/E2E | Capture suspends/clears partial buffer and reliably refocuses on visible RFID tab. |
| T32 | Server failure after UID read | API + component | No false grant; retryable redacted error; occupancy unchanged; best-effort operational log. |
| T33 | Slow request | component fake timers | One processing state; no double submit; eventual result owns timer. |
| T34 | Two kiosks same card concurrently | DB parallel | One transition; other duplicate; no immediate reversal. |
| T35 | Historical report filters | DB + component | Method/outcome/direction/date combinations and keyset pagination are correct. |
| T36 | Failed attempts do not corrupt occupancy | DB | All denied/unknown/duplicate/error cases leave open-row count unchanged. |
| T37 | Checkout duration | DB | `floor((checkout-checkin)/60)` persisted/returned; never negative. |
| T38 | Timer/listener cleanup | unit + component | Fake timers/unmount show no setState, fetch, focus, poll, or listener after cleanup. |
| T39 | Card reactivation | DB + API | Only manually deactivated card with no other active assignment reactivates. |
| T40 | Lost/replaced terminal state | DB | Reactivation rejected; records/audits preserved. |
| T41 | Intent expires/cancels/replays | DB + API | 410/409; no assignment; consumed token cannot reuse. |
| T42 | Another card replaces persistent unknown | component | Before auth starts, new tap replaces featured result and preserves both access events. |
| T43 | Another card while staff flow active | component/manual | Capture is explicitly paused; active intent remains bound to original event and no silent replacement occurs. |
| T44 | Raw UID privacy | unit + API + DB schema/log inspection | Raw UID absent from DB, response, logs, audit, local/session storage. |
| T45 | Cross-gym/active-gym mismatch | DB + API | No lookup/assignment/report disclosure or mutation. |
| T46 | QR regression and checkout correction | DB + component | QR still checks in/out; known open QR may exit after expiry; scan gate/camera remain correct. |
| T47 | Manual dashboard checkout logging | DB + component | Session closes, duration/access event and privileged audit each exist once. |
| T48 | Feature disabled | middleware/component/API/DB | No RFID tab; direct tap denied; QR/Search unchanged. |
| T49 | Restricted local storage | component | Kiosk works in memory, defaults QR, and does not claim reader failure. |
| T50 | Report/recent query failure | component | Explicit unavailable/retry state; no plausible empty/zero claim. |

## 10. Rollout and migration plan

### Migration/deployment order

1. Review inventory and backup/recovery readiness; no hosted mutation is authorized by this plan.
2. Provision and back up `RFID_UID_HMAC_SECRET` in the deployment environment before any card assignment. Use the same stable secret across app instances.
3. Apply `031`, regenerate/check types and definitions, deploy Slice-1 app with `rfid_kiosk` default false.
4. Apply `032`, deploy Slice-2 app, run adversarial DB/auth checks; feature remains false.
5. Apply `033`, run idempotent backfill/report reconciliation, deploy Slice-3 app and complete full gates.
6. Enable `Enable RFID tap` through the existing owner-only Features control for one test gym/device; do not change every gym's default or selected kiosk mode.
7. Assign cards through Member Details; unknown-flow assignment is a secondary operational path, not bulk provisioning.
8. Verify occupancy/open-session integrity before widening rollout.

### Compatibility

- Existing `attendance` rows and signatures remain; old clients ignore additive JSON fields.
- A database-first deploy is safe because old app ignores new tables/feature key and false default hides RFID.
- If the app deploys before DB, false/missing feature state hides RFID; route must return setup unavailable rather than partially operate.
- Existing QR values/cards are untouched.

### Feature flag and enablement

- Add `rfid_kiosk` to `FEATURE_CATALOG` as available/default false and SQL parity.
- Owner with `features:manage` enables it in the existing Studio Operations group.
- The last selected tab remains per-browser/per-gym local storage, never a gym-wide setting.

### Rollback

- First disable `rfid_kiosk` for affected gyms.
- Roll back application code to QR/Search-compatible version; retained migrations are additive and existing RPC signatures compatible.
- Do not drop tables, revoke member assignments, or delete access/attendance history.
- Correct migration defects with a forward migration. Restore only through the existing isolated recovery process and approval boundaries.
- If the HMAC secret is lost, disable RFID; assignments require controlled retap/reassignment. Do not attempt unkeyed brute-force recovery.

### Monitoring and privacy

Monitor per gym without identifiers:

- tap request count and latency;
- granted check-in/out, denied by stable reason, unknown, duplicate, server error;
- reauth failure/rate-limit and assignment conflict counts;
- event-without-expected-attendance and attendance-without-access-event reconciliation;
- occupancy anomalies: duplicate open rows (must remain zero), negative/invalid duration (zero), kiosk displayed vs computed count;
- recent/report RPC failures.

Never log raw UID, digest, suffix where unnecessary, password, assignment token, email, or member name. Operational logs use request/event/card IDs and gym ID. Reports may show masked suffix/member/actor only to authorized managers.

### Post-release occupancy verification

- Compare `kiosk_get_occupancy(gym)` to direct authorized count of `attendance WHERE check_out IS NULL`.
- Assert no duplicate `(gym_id,member_id)` open sessions.
- Reconcile granted check-in minus granted check-out events against open attendance, accounting for historical/manual corrections.
- Sample denied/unknown/duplicate events and prove no linked attendance.
- Run before enablement, after the first operating day, and after any rollback/forward repair.

## 11. Risks and unresolved decisions

| Risk/open decision | Codebase evidence | Mitigation/required decision |
|---|---|---|
| Attendance eligibility currently precedes checkout | Effective `kiosk_checkin` in migration `027` | Slice 1 private shared transition closes open session first and adds QR/RFID/manual executable regressions. |
| Attendance logic is spread across wrappers/manual correction | `kiosk_checkin`, `kiosk_checkout`, `close_attendance_session`, `record_attendance_override`; legacy `handleScan` | Centralize normal transitions; keep privileged corrections distinct but log them. Confirm `handleScan` has no production caller before cleanup. |
| `duration_min` is never populated | Plain column; no trigger in migrations | Set atomically on every new close; inventory/backfill in Slice 3. |
| Current concurrency test can pass a check-in-then-checkout race | Assertion only checks `open_sessions > 1` | New parallel same-digest test asserts exact final state and duplicate outcome. |
| SQL tests inspect superseded migration bodies | Tests read `019`, `023`, `024`; effective definitions in `027`/`029` | Add current-migration checks and mandatory executed PostgreSQL tests; do not rely on regex. |
| Kiosk component is monolithic | `app/kiosk/page.tsx` 798 lines | Characterize first, extract shared result/RFID panel incrementally, preserve QR/Search tests. |
| No reauthentication primitive | Repository search finds only sign-in and recovery proof | Isolated server-side Auth password verification + one-time DB intent; never browser compare or session replacement. |
| Process-local rate limit is not distributed | `lib/rate-limit.ts` Map | Use as supplemental UX/security; rely on Supabase Auth throttling and monitor. Decide on distributed limiter before multi-region/high-scale rollout. |
| Keyboard reader is indistinguishable from a keyboard | Browser platform constraint | Capture only in RFID mode/explicit profile capture; suspend during Search/staff forms; never claim hardware presence. A physical tap while a password field owns focus cannot be reliably identified as a reader event without configured prefix/suffix—operationally pause taps during staff flow. |
| Reader format/timing unknown | No hardware fixture/config in repository | Calibration is a Slice-1 precondition; freeze sample-based fixtures and documented constants. |
| Local storage may be blocked | Existing kiosk already catches storage errors | Hydration gate and in-memory QR fallback; no false reader error. |
| UID hashing/secret rotation | HMAC-only storage has no raw recovery | Dedicated backed-up versioned secret; dual-key or retap plan. No unkeyed SHA/encrypted raw by default. |
| UID cloning | Keyboard UID is static identifier | State clearly in operational docs; cooldown/state checks reduce accidental duplicates, not deliberate cloning. Advanced anti-passback out of scope. |
| Card inactive while member is inside | Product says card revocation is explicit and checkout exception concerns member eligibility | Proposed: active card required; expired/frozen/banned member may exit, lost/deactivated/replaced card is denied. Staff uses existing dashboard checkout. Product must override explicitly if revoked cards should still close sessions. |
| Multi-branch meaning | Schema has gym only; `gyms.branch_name` exists, no separate branch entity in attendance | Treat `gym_id` as operational scope and return `gyms.branch_name/name` for reports if needed. Do not invent a branch FK. |
| Recent/privacy leakage | Kiosk is manager-authenticated but visible at front desk | Dedicated projection omits names/member IDs/details; unknown uses generic icon; main full name auto-dismisses. |
| Access-event growth | Every attempt is durable | Composite indexes/keyset pagination; define retention only with product/legal approval. Never prune attendance/card/audit history in this feature. |
| Backfill cannot prove every historical method | `attendance.source` is broad/overwritten by correction | Map only provable kiosk rows to QR; label ambiguous rows legacy. Do not invent past denials. |
| Feature configuration currently lives in Gym Page Studio | `FeaturesGroup` owns all feature toggles | Reuse it for MVP to avoid a new settings page. If product later moves Operations settings, migrate the control without changing key semantics. |
| Current member-admin page exposes mutations to staff UI broadly | Page route requires `members:view`; DB guards mutations | RFID controls use role+permission UI checks and server/DB checks. Do not use visibility alone. |
| Unexpected server failure may roll back its log | Atomic DB transaction | Return no false grant; emit redacted operational error. Durable logging is guaranteed for expected outcomes, not infrastructure failure that prevents a transaction. |

No unresolved item above blocks implementation code from starting. Real hardware calibration and secret provisioning block enabling RFID for a gym, not Slices 1–3 development.

## 12. Definition of done

### Functional

- [ ] RFID is a third mode inside the existing kiosk and is default-off per gym.
- [ ] Active assigned card checks in/out through ordinary attendance.
- [ ] Existing open session can close after membership/gym-user ineligibility.
- [ ] Expired/frozen/cancelled/banned entry is denied; renewal restores access without card reassignment.
- [ ] Unknown/denied/duplicate/invalid expected attempts are logged.
- [ ] One active card per member and one historical owner per gym/card digest are database-enforced.
- [ ] Assign/replace/deactivate/lost/reactivate rules and fresh-tap-after-assignment work.
- [ ] Recent five and Reports history meet method/outcome/filter requirements.

### Security/privacy

- [ ] Password verification is server-side, same-user, scoped, short-lived, rate-limited, and never exposes hashes.
- [ ] Owner/admin profile lifecycle and front-desk assignment role/permission matrices pass direct API/RPC tests.
- [ ] Raw UID/password/token never persists or appears in logs/responses/URLs.
- [ ] HMAC digest/secret strategy, backup, and rotation limitation are documented.
- [ ] Recent taps contain no member names/private membership/card details.
- [ ] Card/audit/access history is retained across lifecycle changes.

### Database integrity/concurrency

- [ ] Migrations `031`–`033` apply cleanly after `030` and generated types match.
- [ ] Shared transition, lock order, request idempotency, five-second cooldown, partial unique open attendance, and card uniqueness all pass executed concurrency tests.
- [ ] Denied/unknown/duplicate events never mutate occupancy/attendance/streak.
- [ ] Duration and occupancy reconcile with attendance truth.
- [ ] Access events are append-only and report projections are tenant/permission safe.

### UI/accessibility

- [ ] Approved quiet premium layout, header/Admin action, three-tab control, single feature card, and recent list are visually verified desktop/mobile.
- [ ] No sidebar, hardware telemetry claim, technical reader explanation, or multi-state strip.
- [ ] Timings are approximately 1.5s success, 3.5s denial, persistent unknown; rapid scans cannot race timers.
- [ ] Search/password/member fields are not consumed by RFID application listeners.
- [ ] Focus, live regions, contrast, keyboard dialogs, zoom, reduced motion, empty/error/loading states, and photo/initial fallbacks pass.

### Testing/deployment/documentation

- [ ] Section 9 matrix is represented by unit, integration, component, database, E2E, and manual evidence.
- [ ] `npm run lint`, `typecheck`, `test:unit`, `build`, `test:e2e`, database security/invariants/types, and deployment drift gates pass or a precise pre-existing blocker is recorded.
- [ ] Clean migration/reset and idempotent backfill evidence is recorded without PII.
- [ ] Feature remains off until a named gym/device passes reader/secret/occupancy smoke checks.
- [ ] Rollback is feature-disable + app rollback/forward database repair, never destructive history deletion.
- [ ] `ImplementationState.md`, `CHANGELOG.md`, package version when warranted, and operational/deployment contracts are updated in the implementation PR.
- [ ] Agents leave changes uncommitted/unpushed for the developer, per `AGENTS.md`/`CLAUDE.md`.

RFID_KIOSK_IMPLEMENTATION_PLAN_END

---

# Preserved prior implementation plans

# `polish-and-hardening` + `super-admin` Integration Plan

**Planned 2026-07-23; branch analysis refreshed 2026-07-24.** This is the three-phase execution contract for GPT-5.6 Luna High to integrate the `super-admin` branch into the current `polish-and-hardening` baseline without weakening Stren's tenant, authorization, financial, migration, or recovery guarantees.

Only the material above `SUPER_ADMIN_INTEGRATION_PLAN_END` belongs to this integration. The completed Gym Page Studio plan is retained below that marker as a historical appendix and is not required reading for these three chats.

## 1. Pinned baseline and integration direction

| Item | Contract |
|---|---|
| Protected baseline | `polish-and-hardening` at `7363c6312ae80c6418bb5984e889f6a968973535` (`feat: shot B`) |
| Incoming work | `origin/super-admin` at `3c6f047eedfab7bc76c7ecd48b31405bfc9b4e93` (`feat: superadmin prompt implemented`) |
| Merge base | `b6e8f2fad1e20ccfd440b84b02cc6e4b91a1bc97` (`feat: 2nd shot`) |
| Divergence | `polish-and-hardening` has 2 unique commits (Shots A/B); `origin/super-admin` has 23 unique commits because it merged later `main`, but only tip commit `3c6f047` is the Assisted Onboarding feature payload |
| Integration direction | Start from the protected baseline and port `super-admin` forward. Do not make the older/incoming branch the base and then try to replay hardening afterward. |
| Integration branch | A clean developer/agent-created branch based exactly on the protected baseline, recommended name `chore/super-admin-integration` |
| Current schema floor | Existing migrations through `028_financial_reporting_recovery_closure.sql`; any incoming schema change is adapted into a new forward migration numbered `029` or later |
| Current application version | `2.6.0`; change it only in Phase 3 when the final release scope is known |
| Incoming footprint | Tip commit `3c6f047` changes 59 files: 5,621 insertions and 6 deletions |

Why this direction is mandatory: `super-admin` branched at migration 026 before Shots A/B. `polish-and-hardening` now contains production tenant closure and financial/reporting/recovery closure through migration 028. Replaying incoming merged-`main` history or accepting its migration wholesale would silently reopen security and financial defects.

### 1.1 Actual conflict map

Read-only `git merge-tree` analysis against the pinned merge base found five direct both-modified files:

| Direct conflict | Required resolution |
|---|---|
| `AgentsContextKnowledgeBase/Catalog.md` | Keep current active security/financial records; add Assisted Onboarding plan row and final integrated status without replacing current rows |
| `AgentsContextKnowledgeBase/ImplementationState.md` | Preserve Shot A/B evidence and this three-phase workstream; fold incoming onboarding state into SA1-SA3 only after verification |
| `CHANGELOG.md` | Preserve current Unreleased Shot A/B entries; add integrated Assisted Onboarding entry after final evidence |
| `lib/database.types.ts` | Never hand-merge incoming types; regenerate from a clean database after migration 029 |
| `lib/email.ts` | Keep current secure onboarding/recovery functions; semantically add owner-claim delivery without exposing tokens or breaking existing call sites |

Fifty-four incoming files are one-sided additions/changes. `middleware.ts`, `app/globals.css`, and `CONTEXT.md` merge textually, but still need semantic review. Incoming `supabase/migrations/027_assisted_onboarding.sql` does not produce a path conflict because current migration 027 has a different filename; it creates a **migration-number and behavior conflict** and must not be copied as-is.

### 1.2 Mandatory adaptations discovered from actual code

1. **Port feature commit only.** Use `3c6f047^..3c6f047` or the pinned merge-base diff as source. Do not replay the 22 merged-`main` ancestry commits.
2. **Rewrite incoming migration as `029_assisted_onboarding.sql`.** Build it against the effective migration-028 schema. Never add `027_assisted_onboarding.sql`.
3. **Preserve Shot A's latest RPC bodies.** Incoming SQL replaces `join_gym`, `kiosk_checkin`, and `kiosk_checkin_by_member` with pre-hardening versions. `join_gym` must remain an alias for `verify_gym_membership`; kiosk functions must retain member-role checks, avatar output, active-gym/tenant validation, entitlement enforcement, row locking, attribution, and audit behavior.
4. **Remove unsafe access switches from v1.** Do not port `auto_approve_joins` because it bypasses explicit membership verification. Do not port a switch that disables `checkin_requires_membership` because effective membership remains mandatory for access. `staff_manual_checkin` and `occupancy_count` may be added only by composing them into current hardened RPC bodies with TypeScript/SQL catalog parity and executed tests.
5. **Provision private gyms only.** Incoming public visibility can violate `gyms_publish_requires_tagline` because the wizard collects no tagline. Remove/disable the visibility switch; provision `is_published = false`. Owner publishes later through Studio after satisfying the existing publish contract.
6. **Designated claimant must become `owner`.** Do not allow the designated owner to claim as `admin`, which can leave a gym without an active owner. Additional people may be `admin` or `staff`.
7. **Fix RPC caller context.** Incoming provision/resend routes call platform-admin-gated RPCs through the service-role client. That loses the operator's `auth.uid()`/`app_metadata` and will fail live despite mocked tests. Use the user-bound server client for authorization-sensitive RPCs; restrict admin client use to Auth account resolution and server-only Storage work.
8. **Strengthen idempotency.** Add a canonical request fingerprint to provisioning runs. Same key + same intent returns original result; same key + different intent fails. Track partial Auth-user resolution so retries resume truthfully instead of pretending the Auth and Postgres work is one transaction.
9. **Use current audit/recovery contracts.** Prefer existing immutable `privileged_audit_events` for platform provisioning/claim events. If a dedicated platform table remains necessary, give it equivalent immutability, explicit grants/revokes, protected-definition hashes, recovery evidence, and executable cross-gym tests.
10. **Do not disclose claim credentials.** Email the raw owner-claim token only to the intended owner. API responses, UI, logs, audit rows, and persisted workflow state receive delivery state/expiry only—no `claimLink`, raw token, or reusable credential.
11. **Make claim continuation work.** Replace incoming "sign in, then reopen the link" gap with a bounded first-party post-auth return path that accepts only the current `/claim/{token}` route and cannot become an open redirect.
12. **Replace simulated evidence.** Incoming migration was never applied live, types were hand-extended, deployment contract was deferred, and no E2E ran. Integration requires clean migration 029 execution, generated-type parity, executable DB behavior/concurrency tests, deployment drift coverage, and credentialed or locally seeded Super Admin E2E.
13. **Add omitted planned wiring.** Incoming commit did not modify `lib/features.ts` and did not add the planned Super Admin E2E spec. Add only approved feature keys and their parity tests; add the missing E2E coverage.
14. **Reconcile imported accounts with current verification consistency.** Imported members may not bypass the migration-027 verification state machine. Use a trusted, audited platform provisioning path that creates consistent gym-user/verification state; imported rows still create no memberships or financial transactions.

## 2. Non-negotiable merge rules

1. **Agents do not run `git merge`, `git commit`, `git push`, `git rebase`, `git cherry-pick`, tags, or history-rewriting commands.** In this plan, "merge" means inspecting the incoming diff and semantically porting the required behavior into the integration branch's working tree. The developer performs all commits and the eventual Git merge/PR.
2. **Never resolve a conflict by blindly choosing "ours" or "theirs."** Determine the behavior each side intended, preserve the hardening contract, and adapt the incoming feature to the current architecture.
3. **The current identity model wins.** Gym roles remain `owner`, `admin`, `staff`, and `member` on `gym_users`; active-gym routing remains `profiles.active_gym_id`; platform-wide authority remains server-controlled Auth `app_metadata`, currently `platform_role = 'platform_admin'`. A branch or UI label named "super admin" must not become a fifth gym role.
4. **Phase 1 must decide terminology before implementation.** Prefer keeping the stored claim `platform_admin` and treating "Super Admin" as display copy unless the incoming branch proves a separate platform role is required. Any change to the stored claim needs an explicit compatibility/migration plan and tests for old and new tokens.
5. **Database enforcement remains the truth.** UI hiding is not authorization. Platform operations need a dedicated server/RPC boundary, explicit grants, tenant-aware output, and audit evidence. Never put a service-role credential in browser code.
6. **Existing migrations are immutable integration inputs.** Do not edit migrations 000-028 to make the branch fit. Reconcile incoming SQL with a new idempotent forward migration numbered 029 or later, then extend the deployment contract and regenerate `lib/database.types.ts`.
7. **Financial and tenant closures are protected invariants.** Do not restore direct browser writes to legacy `payments`, mutable financial transactions, caller-selected authoritative gym/actor/amount values, broad profile reads, cross-gym attendance, delegable owner/platform authority, or disclosed one-time credentials.
8. **No hosted mutation.** These phases may use local Supabase and local recovery tooling only. Do not apply hosted migrations, change Auth configuration, send real email, enable paid services, or restore/delete external environments without separate user approval.
9. **Preserve unrelated working-tree changes.** Each chat starts by inspecting status and the prior phase's work. Never discard or overwrite changes merely to reduce conflicts.
10. **Test behavior, not only source text.** New authorization behavior is test-first. SQL source-contract tests may supplement but cannot replace executed allow/deny, cross-gym, rollback, and clean-migration tests.

## 3. Three-phase map

| Phase | One-chat objective | In scope | Explicitly deferred | Completion gate |
|---|---|---|---|---|
| **1. Migration 029 + authorization spine** | Verify pinned refs, then rebuild incoming database/auth foundation on top of Shots A/B | Migration 029, approved switches, platform claim boundary, request fingerprint, immutable audit, generated types, executable DB/auth tests | Full Super Admin screens, email/UI, release docs/version | Migration 029 applies cleanly; current tenant/kiosk/verification contracts remain intact; focused DB/security gates pass |
| **2. Application + UI integration** | Port incoming Assisted Onboarding journeys and components onto Phase 1's corrected boundary | 54 one-sided files, middleware/globals/context, server routes, claim continuation, email delivery, wizard/UI, five doc/type/email conflicts, integration/E2E tests | Hosted rollout, release sign-off, unrelated redesigns | Provision→invite→claim works end to end; ordinary roles remain denied; no token disclosure; lint/typecheck/unit/build/focused E2E pass |
| **3. Independent hardening + release handoff** | Audit all 59 incoming files/behaviors against both parent tips, fix regressions, run complete gates, prepare developer handoff | Completeness matrix, adversarial auth/tenant/finance checks, clean reset, deployment drift, full CI/recovery, docs/status/changelog/version | Commit, push, PR, hosted deployment | Every adaptation/omission is explained; complete local gates pass or precise no-go blocker is recorded |

## 4. Phase 1 - Migration 029 and platform authorization spine

### Step-by-step

1. Read required project context, incoming Assisted Onboarding plan from `origin/super-admin`, and only this integration section—not the archived appendix.
2. Inspect worktree. Planning-doc changes may carry forward; unrelated product changes are a stop condition. Verify all three pinned commits exactly: protected tip `7363c63`, incoming tip `3c6f047`, merge base `b6e8f2f`.
3. Create/use integration branch from protected tip. Use incoming feature commit as reference only; do not replay merged-main ancestry.
4. Reproduce the five direct conflicts and migration-number collision from §1.1. Stop on ref drift or unexplained new overlap.
5. Trace incoming authorization/provisioning end to end: Auth claim, server clients, SQL functions/tables/policies, account resolution, idempotency, audit, claim token, middleware, routes, tests.
6. Freeze canonical model before editing:
   - gym roles remain gym-scoped and unchanged;
   - platform authority is server-controlled and non-delegable;
   - platform operations use dedicated boundaries rather than bypassing every gym policy;
   - platform-wide reads expose only fields required by the Super Admin workflow;
   - privileged mutations are attributable and auditable.
7. Write failing executed tests for: authorization matrix; service-role-vs-user-bound RPC context; same-key/different-intent rejection; private-by-default provisioning; owner-only claim; immutable audit; cross-gym isolation; imported-member verification consistency; claim expiry/use/supersession/wrong-email.
8. Create `029_assisted_onboarding.sql` from current effective definitions plus approved incoming behavior. Implement every §1.2 adaptation. Do not copy incoming migration 027.
9. Add/adapt `lib/platform-admin.ts` and smallest Phase 2 server interfaces. Authorization-sensitive RPCs must receive the signed-in operator's JWT; admin client remains isolated to server-only Auth/Storage tasks.
10. Extend deployment contract/protected-definition/recovery evidence. Apply migration on clean local DB, regenerate types, run DB types, security, financial, invariant, deployment-contract/drift, and focused platform-auth tests.
11. Leave uncommitted. Report pinned refs, files/objects added, discarded incoming SQL bodies, exact test evidence, partial-Auth recovery design, and Phase 2 verdict.

### Phase 1 stop conditions

- Stop without editing if any pinned SHA or merge base changed.
- Stop and ask the user if the incoming branch intentionally grants platform admins unrestricted access to member PII or gym financial data without a narrower product requirement.
- Stop and ask the user if the incoming stored role is incompatible with `platform_role = 'platform_admin'` and compatibility cannot be preserved safely.
- Stop if migration 029 cannot prove current verification, attendance, financial, and audit suites stay green.
- Do not proceed to UI work in this phase.

## 5. Phase 2 - Application and UI integration

### Step-by-step

1. Re-read contract, inspect working tree, preserve Phase 1 changes. Recheck exact protected/incoming/base SHAs.
2. Reconstruct Phase 1 SQL/server interface from code and executed tests. Do not revert to incoming mocked assumptions.
3. Inventory incoming journey: `/superadmin` gate → four-step wizard → account resolution → atomic Postgres provisioning → invite delivery/resend → `/claim/{token}` → bounded sign-in return → explicit owner claim → `/admin`.
4. Write failing tests for every accepted journey and every §1.2 adaptation. Include 401/403, cross-gym targets, user-bound RPC context, idempotency mismatch, no raw claim token in response/state/logs, delivery failure, resend supersession, bounded claim return, and safe error/loading states.
5. Port server code first:
   - server-only claim verification;
   - dedicated route/action/RPC calls;
   - input validation and correct 401/403/404/409 responses;
   - user-bound client for platform-authorized RPCs and admin client only for server-only Auth/Storage;
   - resumable account resolution around non-transactional Auth creation;
   - active-gym behavior that does not accidentally change the operator's gym;
   - cache invalidation scoped to the affected gym;
   - no service-role or privileged secrets in browser bundles.
6. Port incoming Assisted Onboarding components/pages/lib/tests from tip commit, adapting rather than copying where §1.2 differs. Remove auto-approval, membership-bypass, public-at-provision, claimant-role, and copy-claim-link controls/copy/state. Add missing approved feature-catalog wiring and E2E spec.
7. Resolve shared-file conflicts semantically, with extra scrutiny on:
   - `middleware.ts` and post-auth routing;
   - `/claim` public routing and allowlisted post-auth continuation;
   - gym provisioning and `create_gym`;
   - profile/gym-user access;
   - `lib/database.types.ts` (generated only);
   - `lib/email.ts` (preserve all current functions, add token-safe claim delivery);
   - deployment scripts and CI;
   - the five direct conflict files from §1.1.
8. Confirm ordinary owners/admins/staff/members cannot discover or invoke platform-only operations through navigation, direct URLs, API calls, RPC calls, or forged request fields.
9. Run focused Assisted Onboarding tests plus seeded/credentialed desktop/mobile E2E, then lint, typecheck, all unit/integration tests, production build, and existing auth/tenant/onboarding/kiosk/financial regressions.
10. Leave uncommitted. Report which of 59 incoming files were ported, renamed, rewritten, or intentionally omitted; exact tests; remaining defects; Phase 3 verdict.

### Phase 2 stop conditions

- Do not add a second client-side auth state system or a second global role source of truth.
- Do not reintroduce `/login`, `/signup`, or public `/gyms/new` behavior removed by unified accounts and platform-managed provisioning.
- Do not treat platform authority as permission to bypass the ledger, tenant consistency, one-time credential, or audit contracts.
- Do not return claim links/raw tokens or offer Copy claim link.
- Do not restore removed unsafe switches under different labels.
- Do not broaden the task into a redesign of ordinary admin/member/kiosk/public surfaces.

## 6. Phase 3 - Independent hardening and release handoff

### Step-by-step

1. Approach as independent reviewer. Read protected baseline contracts, exact `3c6f047^..3c6f047` payload, Phase 1/2 diff, and tests before changing code.
2. Build a 59-file completeness matrix:
   - present as intended;
   - adapted to a named current contract;
   - intentionally omitted because it is superseded or unsafe;
   - missing and must be fixed.
3. Build an adversarial authorization matrix across unauthenticated, member, staff, admin, owner, platform admin, forged/stale token, wrong active gym, and cross-gym target cases. Exercise UI, direct route, API/action, RPC, and database layers where applicable.
4. Re-audit protected invariants:
   - private profiles and tenant-safe directory output;
   - non-delegable role/platform authority;
   - membership verification and onboarding credential secrecy;
   - attendance tenant consistency and concurrency;
   - append-only ledger, idempotency, exact paid dates, report reconciliation, and legacy-payment lockdown;
   - audit immutability and tenant isolation;
   - migration/deployment drift and recovery evidence.
5. Inspect final migration chain. Verify 000-028 byte-identical to protected baseline, `027_assisted_onboarding.sql` absent, integrated schema lives in 029+, all objects/grants/triggers/constraints have deployment hashes, seed remains local-only, generated types match clean schema.
6. Explicitly reproduce original incoming false-positive gaps: service-role platform RPC denial, same-key/different-payload reuse, public-without-tagline failure, admin claimant leaving no owner, raw claim-link disclosure, auto-approval verification bypass, membership-gate bypass, and hand-edited type drift. Final tree must close each.
7. Fix only integration defects found by audit, with regression tests first. No unrelated feature/UI work.
8. Run final local gate in this order:
   1. clean local reset/seed;
   2. generated database types check;
   3. database security, financial, invariant, deployment-contract, and drift suites;
   4. `npm run lint`;
   5. `npm run typecheck`;
   6. `npm run test:unit`;
   7. `npm run build`;
   8. `npm run test:e2e`;
   9. local recovery drill if the integration changes protected database/Auth/Storage definitions.
9. Update incoming `ImplementationPlan-AssistedOnboarding.md` claims so they reflect integrated migration 029/evidence rather than old branch assumptions. Update Catalog, ImplementationState, CHANGELOG, version/lockfile when warranted, affected operational/ADR docs. Local evidence never closes hosted gates.
10. Produce go/no-go report: all pinned SHAs; 59-file matrix; final migration/object inventory; original-gap regression results; all commands; external actions not performed; blockers; developer commit/push/PR steps. Leave uncommitted/unpushed.

### Definition of done

- The final tree retains every `polish-and-hardening` security, financial, tenant, deployment, and recovery guarantee.
- Every accepted `super-admin` behavior is present at the correct enforcement layers, and every omission is explicit and justified.
- Platform authority is server-controlled, non-delegable, separate from gym roles, least-privilege, and auditable.
- Provisioning is private-by-default, same-intent idempotent, owner-safe, claim-token confidential, and resumable across Auth/Postgres boundaries.
- Fresh migration, generated types, deployment drift, security, financial, unit/integration, build, and E2E gates pass.
- No hosted mutation, commit, merge, push, rebase, cherry-pick, or tag was performed by an agent.
- The developer can review and commit the working tree without reconstructing hidden decisions from chat history.

## 7. Paste-ready prompts for three separate GPT-5.6 Luna High chats

Run these in order against the same workspace. Each prompt deliberately re-establishes its own context from the repository so prior chat history is unnecessary.

### Prompt 1 - Migration 029 and authorization spine

```text
You are GPT-5.6 Luna High executing Phase 1 of Stren's super-admin integration.

Objective: rebuild incoming Assisted Onboarding database/Auth foundation as migration 029 on top of Shots A/B. Do not build full UI.

Read in this order:
1. AGENTS.md
2. AgentsContextKnowledgeBase/Catalog.md
3. CLAUDE.md
4. CONTEXT.md
5. AgentsContextKnowledgeBase/ImplementationState.md
6. AgentsContextKnowledgeBase/ImplementationPlan-ProductionSecurityAndFinancialClosure.md
7. AgentsContextKnowledgeBase/ImplementationPlan.md from the first line through the marker SUPER_ADMIN_INTEGRATION_PLAN_END only. Do not read the archived appendix below it.
8. Incoming plan via `git show origin/super-admin:AgentsContextKnowledgeBase/ImplementationPlan-AssistedOnboarding.md`.

Pinned refs:
- protected tip: polish-and-hardening = 7363c6312ae80c6418bb5984e889f6a968973535
- incoming tip: origin/super-admin = 3c6f047eedfab7bc76c7ecd48b31405bfc9b4e93
- merge base: b6e8f2fad1e20ccfd440b84b02cc6e4b91a1bc97
- incoming feature payload: 3c6f047^..3c6f047, 59 files, +5,621/-6
- direct both-modified files: Catalog.md, ImplementationState.md, CHANGELOG.md, lib/database.types.ts, lib/email.ts

Follow ImplementationPlan.md Phase 1 and §1.2 exactly. Inspect status; preserve user work. Planning-doc edits may carry forward; unrelated product edits -> stop. Verify all pinned SHAs/merge base before editing. If needed, create chore/super-admin-integration from protected tip. Never run git merge, commit, push, rebase, cherry-pick, tag, reset, or checkout-based replacement. Do not replay incoming merged-main ancestry.

Incoming migration 027 was never live-applied, hand-edited DB types, deferred deployment contract, replaced hardened RPCs, and was tested mostly with SQL text/mocks. Never copy it. Create 029_assisted_onboarding.sql against effective migration-028 schema. Migrations 000-028 remain byte-identical.

Required decisions:
- platform claim remains server-controlled app_metadata.platform_role=platform_admin; not fifth gym role
- join_gym remains verify_gym_membership alias
- retain latest hardened kiosk bodies and mandatory effective-membership gate
- remove auto_approve_joins and checkin_requires_membership-off switches
- optionally add staff_manual_checkin + occupancy_count only with TS/SQL parity and hardened composition
- provision is_published=false; designated claimant role=owner
- user-bound server Supabase client calls platform-gated RPCs; service-role client only resolves Auth users/server Storage
- provisioning idempotency stores request fingerprint and rejects same key/different intent
- Auth-user creation is non-transactional: persist/resume truthful partial state
- reuse immutable privileged_audit_events, or prove equivalent immutable dedicated audit
- imported members satisfy current verification consistency; create no membership/payment
- raw claim token exists only for email delivery; never response/UI/log/audit/persisted workflow

Write failing executed DB/auth tests first: unauthenticated/member/staff/admin/owner/platform-admin; forged/stale claim; cross-gym; service-role RPC denial vs user-bound success; same-key mismatch; private default; owner claim; audit immutability; import verification; invite lifecycle. Add smallest lib/platform-admin.ts/server interfaces. Extend deployment/protected-definition/recovery contracts. Regenerate lib/database.types.ts from clean DB—never hand-merge it.

Use apply_patch. Run clean local reset, db types check, db security/financial/invariants, deployment contract/drift, focused platform tests. No hosted mutation.

Final: pinned refs, changed files/objects, discarded incoming SQL bodies, idempotency/recovery design, exact commands/results, external actions not performed, Phase 2 ready/not-ready. Leave uncommitted/unpushed.
```

### Prompt 2 - Application and UI integration

```text
You are GPT-5.6 Luna High executing Phase 2 of Stren's super-admin integration in the same workspace after Phase 1.

Objective: preserve Phase 1 migration-029/auth work. Port incoming Assisted Onboarding server journeys + UI onto corrected boundary. Do not restore rejected incoming security behavior.

Read in this order:
1. AGENTS.md
2. AgentsContextKnowledgeBase/Catalog.md
3. CLAUDE.md
4. CONTEXT.md
5. AgentsContextKnowledgeBase/ImplementationState.md
6. AgentsContextKnowledgeBase/ImplementationPlan-ProductionSecurityAndFinancialClosure.md
7. AgentsContextKnowledgeBase/ImplementationPlan.md from the first line through the marker SUPER_ADMIN_INTEGRATION_PLAN_END only. Do not read the archived appendix below it.
8. Incoming plan via `git show origin/super-admin:AgentsContextKnowledgeBase/ImplementationPlan-AssistedOnboarding.md`.

Pinned refs: protected 7363c6312ae80c6418bb5984e889f6a968973535; incoming 3c6f047eedfab7bc76c7ecd48b31405bfc9b4e93; base b6e8f2fad1e20ccfd440b84b02cc6e4b91a1bc97. Verify them. Preserve all Phase 1/user edits. Never merge/commit/push/rebase/cherry-pick/tag/reset/checkout-replace.

Follow ImplementationPlan.md Phase 2 + §1.2. Reference only 3c6f047^..3c6f047. Journey:
/superadmin gate -> 4-step wizard -> account resolution -> Postgres provision -> invite delivery/resend -> /claim/{token} -> bounded sign-in return -> explicit owner claim -> /admin.

Write failing tests per slice. Port server routes first:
- platform authorization RPCs use user-bound client; admin client only Auth/Storage
- input validation + 401/403/404/409
- resumable account resolution
- scoped cache changes
- claim email receives raw token, but API/UI/log/audit/state never do
- delivery failure truthful; resend supersedes
- allowlisted /claim/{token} post-auth return, no open redirect
- no accidental active-gym mutation for operator

Port new components/lib/pages/tests with current design/auth shell. Explicitly remove:
- auto-approve QR joins
- ability to disable membership-required check-in
- public-at-provision visibility choice
- designated claimant role choice (owner only)
- Copy claim link and claimLink response/state

Keep existing kiosk switch; approved staff-manual/occupancy flags only if Phase 1 implemented them. Add missing lib/features.ts parity and desktop/mobile Super Admin E2E. Do not resurrect /login, /signup, public /gyms/new, second auth context, or fifth gym role.

Resolve five direct conflicts semantically:
- Catalog/ImplementationState/CHANGELOG preserve current Shot A/B + integration records
- lib/database.types.ts remains generated Phase 1 output
- lib/email.ts preserves every current function; add secure claim delivery
Review textual auto-merges middleware.ts, app/globals.css, CONTEXT.md.

Use apply_patch. Run focused journey/auth/token tests, seeded/credentialed desktop+mobile E2E, current auth/tenant/onboarding/kiosk/financial regressions, lint, typecheck, full unit/integration, build. No hosted systems.

Final: pinned refs; 59-file port/rename/rewrite/omit accounting; journeys; conflicts; exact commands/results; defects; external actions not performed; Phase 3 verdict. Leave uncommitted/unpushed.
```

### Prompt 3 - Independent hardening and release handoff

```text
You are GPT-5.6 Luna High executing Phase 3, the independent hardening and release gate for Stren's combined polish-and-hardening + super-admin working tree.

Objective: independently audit 59-file incoming feature integration, close merge regressions, run complete local gates, update canonical records, deliver developer-owned go/no-go. Distrust earlier focused passes.

Read in this order:
1. AGENTS.md
2. AgentsContextKnowledgeBase/Catalog.md
3. CLAUDE.md
4. CONTEXT.md
5. AgentsContextKnowledgeBase/ImplementationState.md
6. AgentsContextKnowledgeBase/ImplementationPlan-ProductionSecurityAndFinancialClosure.md
7. AgentsContextKnowledgeBase/ImplementationPlan-FinancialIntegrityAndRecovery.md
8. docs/operations/BACKUP_AND_RECOVERY.md
9. AgentsContextKnowledgeBase/ImplementationPlan.md from the first line through the marker SUPER_ADMIN_INTEGRATION_PLAN_END only. Do not read the archived appendix below it.
10. Incoming plan via `git show origin/super-admin:AgentsContextKnowledgeBase/ImplementationPlan-AssistedOnboarding.md`.

Pinned refs: protected 7363c6312ae80c6418bb5984e889f6a968973535; incoming 3c6f047eedfab7bc76c7ecd48b31405bfc9b4e93; base b6e8f2fad1e20ccfd440b84b02cc6e4b91a1bc97. Verify. Preserve worktree. Never merge/commit/push/rebase/cherry-pick/tag/reset/discard.

Follow Phase 3. Build matrix for all 59 files from 3c6f047^..3c6f047: ported, renamed, rewritten, intentionally omitted, missing. `027_assisted_onboarding.sql` must be omitted/replaced by migration 029. Verify migrations 000-028 byte-identical to protected tip.

Execute adversarial matrix: unauthenticated/member/staff/admin/owner/platform-admin; forged/stale token; wrong active gym; cross-gym target; UI/direct route/API/RPC/DB. Re-audit profiles, role non-delegation, verification, token secrecy, attendance consistency/concurrency, ledger/idempotency/dates/reconciliation/legacy lock, audit immutability, deployment drift, recovery.

Must reproduce then prove fixed:
- service-role calls platform-gated RPC -> denied; user-bound operator -> succeeds
- same idempotency key/different payload -> rejected
- public gym without tagline -> impossible; provision stays private
- claimant always owner; gym cannot finish ownerless
- no raw claimLink/token in response/UI/log/audit/persisted state
- QR join cannot auto-bypass verification
- check-in cannot bypass effective membership
- imported members satisfy verification consistency
- clean-generated types differ from neither schema nor checked-in file
- claim sign-in return cannot open-redirect

Write regression first for any defect. Smallest fix via apply_patch. No unrelated features/UI redesign.

Run the final local gates in order:
1. clean local reset/seed
2. database types check
3. database security, financial, invariant, deployment-contract, and drift suites
4. npm run lint
5. npm run typecheck
6. npm run test:unit
7. npm run build
8. npm run test:e2e
9. the local recovery drill if protected database/Auth/Storage definitions changed

Update imported ImplementationPlan-AssistedOnboarding.md so old claims (migration 027, hand types, no live DB/E2E, staged/uncommitted) become accurate integration record. Update Catalog, ImplementationState, CHANGELOG, package version/lockfile if warranted, affected ADR/ops docs. Local proof never closes hosted gates. No hosted mutation, real email, paid service, external deletion.

Final: go/no-go; pinned refs; 59-file matrix; migration/object inventory; original-gap results; every command/result; failures/no waivers hidden; external actions not performed; blockers; developer review/commit/push/PR steps. Leave uncommitted/unpushed.
```

<!-- SUPER_ADMIN_INTEGRATION_PLAN_END -->

---

# Archived Appendix: Gym Page Studio + Permissions & Feature Toggles Implementation Guide

**✅ Completed 2026-07-11** — shipped to `main` via qa merge `3e52c95` (open pre-prod items tracked in `ImplementationState.md`). Superseded as the active plan by [ImplementationPlan-UnifiedAccounts.md](ImplementationPlan-UnifiedAccounts.md); kept per Catalog rule 6. **Caution for later readers:** migration 019 re-implements the `get_gym_id()`/role helper internals over `gym_users` — this document's profile-based identity assumptions are historical.

_Authored 2026-07-10 on branch `CustomizationPermissionsToggles`. Planning document only — no product code changed yet. Every file/line reference below was verified against the working tree on this date. Revised the same date after a 35-question grilling session with the product owner; the resolved vocabulary lives in `CONTEXT.md` and the load-bearing decisions in `docs/adr/`._

This guide is the **contract** for two implementation agents working in parallel:

| Agent | Model | Owns | Section |
|---|---|---|---|
| **Agent A — UI** | Claude Opus 4.8 | Gym Page Studio, all React surfaces, shared contract modules, client wiring | §7, §8, prompts in §10.A |
| **Agent B — Logic** | GPT 5.5 (Codex) | Migrations, SQL helpers, RLS, RPC hardening, middleware, API routes, server enforcement | §5, §6, prompts in §10.B |

Neither agent designs anything. **All design decisions are made in this document** — layout, copy, component boundaries, data model, enforcement order. If something appears ambiguous, the answer is in here; if it genuinely is not, stop and ask the user rather than inventing.

Read `CLAUDE.md` first; all of its conventions apply (migrations in `supabase/migrations/`, test-first for new behavior, feature branches → `qa`, `maybeSingle()`, middleware is the single auth guard, layouts never redirect).

**Design reference**: `stren-gym-page-studio/project/Stren Gym Page Studio.dc.html` — a Claude Design export containing three sections: `1a` desktop studio, `1b` mobile studio, `1c` embedded build spec. (A duplicate folder `StrenGymCustomizationRedesign/` was byte-identical and has been deleted; this is the same bundle.) The mockup is the layout/interaction source of truth, **but its colors and fonts are prototype placeholders** — production uses the app's design tokens (§7.0). The mockup contains **no RBAC UI**; the Features panel (§7.8) and People & access page (§7.9) are designed in this document and did not come from the mockup.

---

## 0. Sequencing — what ships first, and new security findings

**Slice 0 (Phase 2.6 notification-RPC hardening) ships FIRST, in its own migration (`014_fix_notification_rpc_scope.sql`) and PR to `qa`, before any other work in this guide.** It belongs to Agent B and has no dependency on anything else here.

Rationale: the two Criticals (`process_daily_notifications()`, `create_member_notification()` — granted to `authenticated` with no caller checks, `006_notification_system.sql:687-688`) and the High (`kiosk_update_streak()`) documented in `PHASE_3_TO_7_DIAGNOSTIC_AND_PLAN.md` are live and exploitable by any authenticated user today. The fix is small, follows the proven migration-011 caller-check pattern, and must not wait on the permission-schema design cycle. The two Medium `app/api` findings (revalidate-gym gym scope, avatar `avatarUrl` validation) ride along in the Slice 0 PR as app-code changes.

### Additional verified findings (owned by Agent B, folded into the slices below)

- **High — `admin_dashboard_stats()` and `admin_reports_data(p_days)` are callable by any authenticated member.** `001_production_baseline.sql:982` and `:1077`. Both are `SECURITY DEFINER`, scoped only by `get_gym_id()`, **no role check** — a member can `supabase.rpc('admin_dashboard_stats')` and read gym-wide member lists, pending members, plan/revenue metrics. Fixed in migration 015.
- **Bug — `get_gym_by_code()` derives `is_published` from tagline presence** (`001_production_baseline.sql:954`: `'is_published', (v_gym.tagline IS NOT NULL AND TRIM(v_gym.tagline) <> '')`) instead of reading the real `gyms.is_published` column (which has had a proper tagline CHECK constraint since migration 008). An owner who unpublishes but keeps a tagline stays publicly visible. Fixed in migration 016 when the function is reworked anyway. **Confirm with the user before shipping** — it changes public visibility for any gym relying on the buggy behavior.
- **Bug — `app/member/page.tsx:15` calls `kiosk_get_checked_in()`,** which migration 011 made manager-only (`RAISE EXCEPTION 'permission denied'`). For members the RPC errors, the error is swallowed, and `peopleInGym` renders 0. Agent B replaces it with a member-safe count (§6, middleware/server table).

---

## 1. Current state (verified)

| Layer | Today |
|---|---|
| Middleware ([middleware.ts:243](../middleware.ts)) | Coarse: `/admin` + `/kiosk` require role ∈ {owner, admin, staff}. Forwards `x-gym-id`/`x-user-role`. No finer distinction. |
| Layouts | Chrome only, no redirects. [app/admin/layout.tsx:40](../app/admin/layout.tsx) has `ownerOnly` on the Gym Page nav item — **hides the link only** (filter at :89-96). |
| Pages | [app/admin/gym-profile/page.tsx:226](../app/admin/gym-profile/page.tsx) does a client-side `router.replace('/admin')` for non-owners — cosmetic, not enforcement. Other admin pages render for any manager role. |
| RLS | Gym-scoped + `is_manager()` patterns (001 + 011). `gyms_update` (001:451) allows **owner AND admin**. |
| RPCs | Kiosk family hardened (011: `auth.uid()` + `is_manager()` + gym scope + REVOKE anon). `admin_dashboard_stats` / `admin_reports_data` / leaderboards have gym scope but **no role checks**. Notification family unscoped (Slice 0). |
| API routes | Role-checked (`ADMIN_ROLES` set) but `revalidate-gym` accepts **any gym's code** (fetches the gym only to build cache tags, [route.ts:80-100](../app/api/admin/revalidate-gym/route.ts)). |
| Feature availability | Hardcoded: nav arrays in [app/admin/layout.tsx:33](../app/admin/layout.tsx), [components/member/MemberShell.tsx:14](../components/member/MemberShell.tsx), [components/gym/GymTopNav.tsx:12](../components/gym/GymTopNav.tsx); quick links [components/member/MemberHomeClient.tsx:494](../components/member/MemberHomeClient.tsx). Public subpages gate only on publish state. No way to disable feed/leaderboard/kiosk/pricing/etc. per gym. |
| Public payload | `get_gym_by_code` → `unstable_cache` tag `gym-public` ([lib/gym-public.ts:20-30](../lib/gym-public.ts)); revalidated by `/api/admin/revalidate-gym` after every Studio save ([gym-profile page:793](../app/admin/gym-profile/page.tsx)). |
| Media pipeline | [gym-profile page:359-682](../app/admin/gym-profile/page.tsx): validate → `blobHash` → `{gymId}/{kind}-{hash}.jpg` → upsert → delayed versioned cleanup (`MAX_ASSET_VERSIONS_PER_KIND = 8`) → save → revalidate. **Preserved verbatim** by this plan. |

Roles live on `profiles.role` (`owner | admin | staff | member`). SQL helpers `get_gym_id()`, `get_user_role()`, `is_manager()` exist at `001_production_baseline.sql:54-86` — new helpers follow their conventions (`SECURITY DEFINER`, `SET search_path = ''`, `STABLE` where possible, explicit GRANTs).

---

## 2. Target architecture — two layered systems

**Permissions answer "can this user perform this action?" Feature toggles answer "is this capability enabled for this gym?" Every gated surface checks BOTH**, feature first, then permission:

- Staff with `kiosk:use` at a gym with `kiosk_checkin=false` → kiosk blocked.
- Member at a gym with `leaderboards=false` → nav link hidden AND `/member/leaderboard` + `leaderboard_*` RPCs blocked.

Enforcement is layered; the innermost layer is the source of truth:

```
RLS policies + RPC-internal checks   ← truth (cannot be bypassed by any client)   [Agent B]
API route handlers                   ← 401/403 with correct status codes          [Agent B]
Server components / middleware       ← redirects, no data fetched                 [Agent B]
Client UI                            ← hide/disable affordances only              [Agent A]
```

### 2.1 Permission model

- **Role defaults** — single TypeScript source of truth: `ROLE_DEFAULT_PERMISSIONS` in `lib/permissions.ts` (§8.1), mirrored into a seeded SQL table `gym_role_permission_defaults(role, permission)`. Parity is enforced by a checked-in fixture `tests/fixtures/role-permission-defaults.json` (written by Agent A from the TS constant; Agent B generates the migration seed from it; a Vitest parity test fails CI on drift).
- **Per-user overrides** — `gym_user_permission_overrides` table (§5, migration 015). One row grants **or revokes** one permission for one user in one gym; override beats role default. Overrides are managed only by holders of `roles:manage` (owner) and are surfaced in the UI exclusively as the eight plain-language **Access switches** (§7.9) — one flat list per admin, both directions (grant what's off, revoke what's on), no roles, no permission matrices. Overrides can never touch `roles:manage`/`features:manage`/`gym_page:publish` (owner-only, never delegable) and never target `owner`/`member` profiles — enforced by trigger in SQL, mirrored in UI.
- **SQL helper** — `has_gym_permission(p_permission text, p_gym_id uuid DEFAULT public.get_gym_id())` → boolean. Owner short-circuits `true` for every key (future keys never lock owners out); override row wins; else defaults table. For **non-owner** callers, a key that does not exist in the defaults table **RAISEs** (`unknown permission: %`) instead of silently returning false — the defaults table seeds an owner row for every key, making it the canonical key registry, so typos in policies fail loudly instead of silently denying admins.
- **Batch helper** — `get_my_access()` → jsonb `{ role, gym_id, permissions: text[], features: {<key>: bool} }` so middleware/layouts fetch everything in one round trip.
- **TS API** — §8.1/§8.4. Client resolves the same matrix for UI hiding; server module `lib/permissions-server.ts` (Agent B) provides `requirePermission()` / `apiRequirePermission()`.

### 2.2 Feature toggle model

- **Table** — `gym_feature_settings(gym_id uuid PK → gyms ON DELETE CASCADE, flags jsonb NOT NULL DEFAULT '{}', updated_by uuid, updated_at timestamptz)`. Missing row or missing key ⇒ catalog default. Rollout is therefore safe: no backfill, every existing gym keeps current behavior.
- **SQL helper** — `gym_feature_enabled(p_feature text, p_gym_id uuid DEFAULT public.get_gym_id())` → boolean; reads `flags->p_feature`, falls back to defaults encoded in the function (mirrors the TS catalog; same parity-fixture treatment).
- **TS catalog** — `FEATURE_CATALOG` in `lib/features.ts` (§8.2). Technical keys are **never rendered** in owner UI — only `label`/`effect`.
- **`trainers`** is not a separate key: the team surface is `gyms.team_members` rendered on the public contact page — `public_team` covers it.
- **Teasers**: four catalog entries (`trainer_bookings`, `friends_chat`, `workout_log`, `session_posts`) with `status: 'coming_soon'`, `defaultEnabled: false`. Disabled rows in the Features panel, owner-facing only; no enforcement wiring (nothing to enforce yet). Real keys now = zero migration work when they ship.
- **Public exposure**: anon visitors can't call authenticated helpers, so `get_gym_by_code()` gains a `features` object containing **only** `publicSurface: true` keys (`public_team`, `public_pricing`, `public_location`), and **omits the underlying data** (`team_members`, `pricing_packages`, `map_embed_url`/`directions`) when the flag is off — disabled data never reaches the anon cache. Cached under the existing `gym-public` tag; the existing save→revalidate flow already busts it.

### 2.3 Combined gate

```ts
// lib/access.ts (§8.3)
canUse(access, feature, permission)  // false if feature exists and is off, OR permission exists and is missing
```

SQL side, the same composition appears inline: `public.gym_feature_enabled('kiosk_checkin') AND public.has_gym_permission('kiosk:use')`.

---

## 3. Permission matrix

`✓` = on by default. `✗` = off by default. `(s)` = covered by an **Access switch** (§7.9): the owner can flip it per admin in either direction (revoke a default, or grant an extra). Owner always has everything, including unknown/future keys. Overrides on non-`(s)` keys are possible in the schema but have no UI in v1.

| Permission | owner | admin | staff | member | Guards |
|---|---|---|---|---|---|
| `dashboard:view` | ✓ | ✓ | ✗ | ✗ | `/admin` page, `admin_dashboard_stats` RPC |
| `dashboard:finance:view` | ✓ | ✓ (s) | ✗ | ✗ | Money fields in dashboard stats (§5 exact list) — RPC omits them without it |
| `reports:attendance:view` | ✓ | ✓ | ✗ | ✗ | `/admin/reports`, attendance series in `admin_reports_data` |
| `reports:finance:view` | ✓ | ✓ (s) | ✗ | ✗ | Revenue fields in `admin_reports_data` (§5 exact list) — omitted without it |
| `members:view` | ✓ | ✓ | ✓ | ✗ | `/admin/members` read, `kiosk_search_members` |
| `members:manage` | ✓ | ✓ (s) | ✗ | ✗ | Member approve/edit/renew, `/api/admin/members/onboard` |
| `members:payment_history:view` | ✓ | ✓ | ✗ | ✗ | Per-member payment history panel + `payments` SELECT policy |
| `payments:view` | ✓ | ✓ (s) | ✗ | ✗ | `/admin/payments` list, `payments` SELECT (one switch with `payments:create`) |
| `payments:create` | ✓ | ✓ (s) | ✗ | ✗ | Record-payment flow, `payments` INSERT |
| `plans:manage` | ✓ | ✓ (s) | ✗ | ✗ | `/admin/plans`, `membership_plans` write policies |
| `promos:manage` | ✓ | ✓ (s) | ✗ | ✗ | `/admin/promos`, `promos` write policies |
| `announcements:manage` | ✓ | ✓ (s) | ✗ | ✗ | `/admin/announcements` page + `announcements` write policies (staff lose today's implicit write access — intended) |
| `gym_page:view` | ✓ | ✗ (s) | ✗ | ✗ | Open the Gym Page Studio (always granted together with `edit` — one switch, §7.9; there is no view-only Studio mode in v1) |
| `gym_page:edit` | ✓ | ✗ (s) | ✗ | ✗ | `gyms` UPDATE policy (non-publish columns), Studio editing. Resolver treats edit ⊇ view |
| `gym_page:publish` | ✓ | ✗ | ✗ | ✗ | `gyms.is_published` transitions (trigger-enforced). Never delegable |
| `features:manage` | ✓ | ✗ | ✗ | ✗ | `gym_feature_settings` writes, Features panel. Never delegable |
| `roles:manage` | ✓ | ✗ | ✗ | ✗ | Overrides writes, People & access UI. Never delegable |
| `kiosk:use` | ✓ | ✓ (s) | ✓ | ✗ | `/kiosk` route + kiosk RPC family (switch applies to admins; staff keep it) |
| `cache:revalidate` | ✓ | ✓ | ✗ | ✗ | `/api/admin/revalidate-gym`, `/api/admin/cache-health` |

Notes:

- **admin = operational management, finance visible by default** (product decision: keep it simple for ~40-year-old owners; the owner can revoke the money switch per admin if they care). No Studio by default, no feature toggles, no role management, no publish. **staff = kiosk + member lookup, nothing configurable in v1.** **member = member portal only** — the member portal is feature-gated, not permission-gated; do not invent `member:*` keys.
- `gyms_update` today allows admin (001:451). After migration 015 it requires `gym_page:edit` — admins lose gym-row writes by default; this is the intended behavior change. Verified: no operational admin flow writes to `gyms` (only the Studio save does).
- Staff can write announcements today via the `is_manager()` policy — the new `announcements:manage` key closes that (probably unintended) surface.

---

## 4. Feature toggle matrix

All defaults `true` except the four **Coming soon teasers** (always off, no enforcement wiring, owner-facing display only — see §7.8). Missing row/key ⇒ default. Group = where the row appears in the Features panel (§7.8).

| Key | Group | Owner-facing label | Effect line (exact UI copy) | Default | Public? | UI surfaces gated (Agent A) | Enforcement truth layer (Agent B) |
|---|---|---|---|---|---|---|---|
| `member_feed` | Members | Show gym feed | Members see a live feed of check-ins and milestones. | on | no | Member nav (`MemberShell`), home quick link, `/member/feed` | `feed_items` SELECT/INSERT policies `AND gym_feature_enabled('member_feed', gym_id)`; `lib/engagement-hooks.ts` skips feed inserts when off |
| `leaderboards` | Members | Show leaderboard to members | Members see workout and streak rankings. | on | no | Member nav "Ranks", home quick link, `/member/leaderboard` | `leaderboard_workouts/week_streak/longest_member` return empty set when off; page redirects |
| `public_team` | Public page | Show trainers & team | Your coaches appear on the public Contact page. | on | yes | Contact page team block; Studio Subpages→Team; preview | `get_gym_by_code` omits `team_members` when off |
| `public_pricing` | Public page | Show pricing page | Visitors can see your membership prices. | on | yes | `GymTopNav` "Pricing" link, `/gym/[code]/pricing`, preview Pricing tab | Pricing page `notFound()` when off; `get_gym_by_code` omits `pricing_packages` |
| `public_location` | Public page | Show location page | Visitors can see your map and directions. | on | yes | `GymTopNav` "Locate Us", `/gym/[code]/locate`, preview Locate tab | Locate page `notFound()` when off; payload omits `map_embed_url`/`directions` |
| `announcements` | Operations | Enable announcements | You can post announcements that members see in notifications. | on | no | `/admin/announcements` (nav item is currently commented out at [app/admin/layout.tsx:39](../app/admin/layout.tsx) — re-enable it behind this flag) | `announcements` INSERT/UPDATE policies gain `gym_feature_enabled(...)` |
| `promos` | Operations | Enable promos | You can create promo discounts to apply to payments. | on | no | `/admin/promos` nav + page, promo pickers in payments/onboarding | `promos` write policies gated; promo application checks flag |
| `kiosk_checkin` | Operations | Enable kiosk check-ins | The front-desk kiosk can check members in and out. | on | no | Admin nav "Kiosk", `/kiosk` route (friendly "turned off" screen, §6) | Every `kiosk_*` RPC adds `gym_feature_enabled('kiosk_checkin')` after its manager check; middleware also blocks `/kiosk` |
| `trainer_bookings` | Coming soon | Trainer bookings | Members can book sessions with your trainers, see their schedules, and chat with them. | off | no | Teaser row in Features panel only | None (unimplemented) |
| `friends_chat` | Coming soon | Friends & Chat | Members can add friends and message each other. | off | no | Teaser row in Features panel only | None (unimplemented) |
| `workout_log` | Coming soon | Workout routines | Members can record their own exercise routines. | off | no | Teaser row in Features panel only | None (unimplemented) |
| `session_posts` | Coming soon | Posts | Members can share their gym sessions to the feed, like a social post. | off | no | Teaser row in Features panel only | None (unimplemented) |

Interaction rules:

- A disabled feature blocks the surface for **everyone including the owner** on member/public surfaces. The Features panel is the only place the owner still sees it (as an "off" switch), and the Studio preview shows a hidden-page placeholder (§7.8).
- **No real-time push in v1**: a member with a now-disabled page open sees the change on their next navigation or refresh; data access is blocked server-side the instant the flag flips.
- Teasers are **owner-facing only** — nothing about them appears in member or public UI, they have real catalog keys (zero migration work when they ship), and there is no "notify me / interested" affordance in v1.

---

## 5. Database migration plan — Agent B

Conventions: `NNN_description.sql`, idempotent (`CREATE OR REPLACE`, `DROP ... IF EXISTS`), applied via Supabase CLI/MCP, never the dashboard. No destructive SQL. Regenerate `lib/database.types.ts` after each. Bump `package.json` + `CHANGELOG.md` per shipped slice group.

### `014_fix_notification_rpc_scope.sql` — Slice 0 (ships first, own PR)

Exactly per `PHASE_3_TO_7_DIAGNOSTIC_AND_PLAN.md` "Recommended fix":

1. `REVOKE EXECUTE ON FUNCTION public.process_daily_notifications() FROM authenticated;` (the cron route uses the service role — verified safe).
2. `create_member_notification(...)` — prepend `auth.uid()` NOT NULL + `is_manager()` + `p_gym_id = get_gym_id()` checks (kiosk pattern, 011:160-441). Internal trigger/definer callers unaffected.
3. `kiosk_update_streak(uuid, uuid)` — same caller checks; `REVOKE ... FROM PUBLIC, anon`.
4. `can_send_member_notification(...)` — require caller = the member OR a manager of the member's gym.

Rides along in the same PR (app code, no migration): gym-ownership check in `app/api/admin/revalidate-gym/route.ts` (resolve gym from `code`, require `gym.id === profile.gym_id`, else 403) and `avatarUrl` origin validation in `app/api/member/avatar/route.ts` (accept only Supabase-storage-origin URLs). Add RPC probe regression tests. Update the Phase 2.6 row in `CLAUDE.md` to ✅ when merged.

### `015_permission_model.sql`

1. Tables:

   ```sql
   CREATE TABLE IF NOT EXISTS public.gym_role_permission_defaults (
     role       public.user_role NOT NULL,
     permission TEXT NOT NULL,
     PRIMARY KEY (role, permission)
   );
   CREATE TABLE IF NOT EXISTS public.gym_user_permission_overrides (
     gym_id     UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
     user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
     permission TEXT NOT NULL,
     granted    BOOLEAN NOT NULL,
     granted_by UUID REFERENCES public.profiles(id),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (gym_id, user_id, permission)
   );
   ```

   Seed `gym_role_permission_defaults` from `tests/fixtures/role-permission-defaults.json`: **an `owner` row for EVERY key** (this makes the table the canonical key registry) plus the `admin`/`staff` `✓` cells from §3. Switch-flippable `(s)` states are not seeded per-user — they exist only as override rows once an owner flips a switch.
2. `has_gym_permission(p_permission text, p_gym_id uuid DEFAULT public.get_gym_id())` — conventions of `get_gym_id()` (SECURITY DEFINER, `SET search_path = ''`, STABLE, GRANT to `authenticated`). Logic: caller profile must exist and `gym_id = p_gym_id`; role `owner` → true (even for unknown keys — owners are never locked out); for non-owners, if the key has no row in the defaults table for any role → `RAISE EXCEPTION 'unknown permission: %'` (typo protection); else override row wins; else defaults table; special-case `gym_page:view` to also return true when the caller holds `gym_page:edit`.
3. `get_my_access()` → jsonb `{role, gym_id, permissions, features}` (features read via `gym_feature_enabled` once 016 lands; until then return the catalog defaults inline — 016 replaces the function with the final shape).
4. RLS for the new tables: defaults readable by `authenticated` (not secret); overrides SELECT for gym managers + the affected user; INSERT/UPDATE/DELETE only `has_gym_permission('roles:manage')` + gym scope; a trigger rejects overrides on `roles:manage`/`features:manage`/`gym_page:publish` (never delegable) and overrides targeting profiles with role `owner` or `member` (mirror of `prevent_profile_privilege_escalation`, 011:31). Overrides may target `staff` rows (schema-level, for the future) even though v1 UI never writes them.
5. Re-point existing policies (drop/recreate, 011 style):
   - `gyms_update` → `USING (id = public.get_gym_id() AND public.has_gym_permission('gym_page:edit')) WITH CHECK (same)`.
   - New trigger `protect_gym_publish` BEFORE UPDATE ON `gyms`: if `NEW.is_published IS DISTINCT FROM OLD.is_published` and NOT `has_gym_permission('gym_page:publish', NEW.id)` → raise.
   - `payments` SELECT → self OR `payments:view` OR `members:payment_history:view` (members keep seeing their own payment rows — confirmed product decision); INSERT → `payments:create`. **Note: `dev_all_payments` (001:539) is a wide-open `USING (true)` dev policy — replace it entirely.**
   - `plans_manage`/`plans_admin_all` → one policy on `plans:manage` (member SELECT stays).
   - `promos_manage`/`promos_admin_all` → `promos:manage`.
   - `announcements_manage`/`announcements_admin_all` → `announcements:manage` (016 adds the feature gate). This removes staff write access — intended (§3 note).
   - Leave other role-based policies alone — only tables named in §3 get permission-based policies now.
6. RPC hardening:
   - `admin_dashboard_stats()` — require `has_gym_permission('dashboard:view')` (else `RAISE EXCEPTION 'permission denied'`); the **finance fields**, built only with `dashboard:finance:view`, are exactly: `month_revenue`, `today_revenue`, and the monthly `revenue` series. Everything else (`currently_in`, `today_visits`, `total_members`, `pending_count`, `active_plans`, `expired_plans`, `frozen_plans`, attendance data) is visible to any `dashboard:view` holder. Rule of thumb the implementer must NOT re-derive: **finance = any field denominated in money**; counts and attendance are not finance.
   - `admin_reports_data(p_days)` — require `reports:attendance:view`; the **finance fields**, only with `reports:finance:view`, are exactly: `month_revenue`, `revenue_by_day`, `revenue_by_dom`, and `method_breakdown` (cash/GCash counts + totals — payment-method data is finance). `active_count`, `expired_count`, `attendance_by_day`, `peak_hours` stay.
   - Verify `components/admin/AdminDashboardClient.tsx` / `AdminReportsClient.tsx` tolerate the missing keys; adjust their TS types to mark finance fields optional and render a quiet "—" where absent. (Since admins keep finance **by default**, this path only triggers after an owner revokes the money switch.)

**Money-path caution (CLAUDE.md)**: the `payments` policy swap touches the highest-risk surface. The characterization tests in §9 must be green BEFORE this migration lands.

### `016_feature_toggles.sql`

1. `gym_feature_settings` table (§2.2) + RLS: SELECT for any authenticated user of the gym; ALL writes require `has_gym_permission('features:manage')` + gym scope.
2. `gym_feature_enabled(p_feature, p_gym_id DEFAULT get_gym_id())` with catalog defaults inline; GRANT to `authenticated`; callable from policies on anon-facing paths (it does not depend on `auth.uid()`).
3. `get_gym_by_code(p_code)` — CREATE OR REPLACE:
   - **fix `is_published` to read the real column** (§0 bug — user sign-off required);
   - add `'features', jsonb_build_object('public_team', ..., 'public_pricing', ..., 'public_location', ...)`;
   - omit `team_members` / `pricing_packages` / `map_embed_url` + `directions` when the corresponding flag is off;
   - include `logo_path`/`cover_path` if not already present (the public page reads them, [page.tsx:44-50](../app/gym/[code]/page.tsx)).
4. Feature checks in RPCs: the three `leaderboard_*` functions return an empty set when `leaderboards` is off; every `kiosk_*` function adds `gym_feature_enabled('kiosk_checkin')` to its existing guard.
5. RLS additions: `feed_select`/`feed_insert` gain `AND public.gym_feature_enabled('member_feed', gym_id)`; `announcements`/`promos` write policies gain their flags.
6. `get_my_access()` final shape (replaces 015's interim version).

### `017_gym_cover_focal_and_sections.sql`

1. `ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS cover_focal JSONB NOT NULL DEFAULT '{"x":50,"y":50}';`
2. `ADD COLUMN IF NOT EXISTS section_visibility JSONB NOT NULL DEFAULT '{"amenities":true,"hours":true,"contact":true}';` (home-page section show/hide is **page content**, so it lives on `gyms`, not in `gym_feature_settings`).
3. Surface both in `get_gym_by_code()` (sequential CREATE OR REPLACE is fine).

Land 017 **early** (it can ship right after Slice 0) so Agent A's preview work has real columns to save to.

---

## 6. Route / API / RPC hardening checklist — Agent B

### RPCs

| Function | Today | Required | Migration |
|---|---|---|---|
| `process_daily_notifications()` | Granted to `authenticated`, no checks (**Critical**) | REVOKE from authenticated; service-role/cron only | 014 |
| `create_member_notification(...)` | No caller checks (**Critical**) | `auth.uid()` + `is_manager()` + gym scope | 014 |
| `kiosk_update_streak(uuid,uuid)` | No caller checks (**High**) | Same + REVOKE PUBLIC/anon | 014 |
| `can_send_member_notification(...)` | Info disclosure (**Medium**) | Self-or-manager + gym scope | 014 |
| `admin_dashboard_stats()` | Gym-scoped, **member-callable** (High) | `dashboard:view`; finance keys only with `dashboard:finance:view` | 015 |
| `admin_reports_data(p_days)` | Same problem | `reports:attendance:view`; revenue only with `reports:finance:view` | 015 |
| `leaderboard_workouts/week_streak/longest_member` | Gym-scoped, any authenticated | + `gym_feature_enabled('leaderboards')` → empty when off | 016 |
| `kiosk_checkin`, `kiosk_checkin_by_member`, `kiosk_checkout`, `kiosk_get_checked_in`, `kiosk_search_members` | Manager+gym (011) | + `gym_feature_enabled('kiosk_checkin')`; `kiosk_search_members` keeps working for staff (`members:view`) | 016 |
| `get_gym_by_code(p_code)` | `is_published` derived from tagline (**bug**); returns all data | Fix bug; add public feature flags; omit disabled-feature data; add focal/section fields | 016+017 |
| `member_home_stats()`, `search_gyms`, `set_member_avatar_with_cooldown` | OK | Verify only, no change | — |

### API routes (`app/api/`)

| Route | Today | Required | Slice |
|---|---|---|---|
| `admin/revalidate-gym` | Role check; **any gym's code accepted** | Gym-scope check (Slice 0); later `apiRequirePermission('cache:revalidate')` | 0 + post-015 |
| `admin/cache-health` | Role check; `?code=` unscoped | Same gym-scope rule; `cache:revalidate` | post-015 |
| `admin/members/onboard` | `MANAGER_ROLES` check | `apiRequirePermission('members:manage')` | post-015 |
| `member/avatar` | `avatarUrl` accepted unvalidated (**Medium**) | Require Supabase-storage-origin URL | 0 |
| `cron-notifications` | Bearer secret + service role | No change | — |

### Middleware + server pages

| Surface | Required change |
|---|---|
| `middleware.ts` | Keep the coarse role gate. For `/admin/*` + `/kiosk`: replace the profile query with one `supabase.rpc('get_my_access')` call (same round-trip count), consult `ROUTE_PERMISSIONS` from `lib/permissions.ts`; missing permission → redirect `/admin`; `/kiosk` additionally requires the `kiosk_checkin` feature. Keep forwarding `x-gym-id`/`x-user-role`. |
| `app/admin/page.tsx`, `app/admin/reports/page.tsx` | Server components: `await requirePermission('dashboard:view' / 'reports:attendance:view')` before the RPC (belt to the RPC's suspenders). |
| `app/admin/gym-profile/page.tsx` | Becomes a thin **server** page: `requirePermission('gym_page:view')`, fetch gym row + access + feature flags, render `<GymPageStudio …/>` (Agent A's client island). Replaces the client-side `router.replace` pseudo-guard. Agent B owns this server wrapper; Agent A owns everything it renders. |
| Other `/admin/*` pages | Covered by middleware map + RLS. Add `requirePermission` only to pages that are already server components — do not convert pages just for this. |
| `app/member/layout.tsx` | Fetch effective features server-side (`get_my_access`), pass `features` prop into `MemberShell` (prop contract in §8.5). |
| `app/member/feed/page.tsx`, `app/member/leaderboard/page.tsx` | Server gate: feature off → `redirect('/member')` (RLS/RPC already return nothing; this is UX). |
| `/kiosk` page | When `kiosk_checkin` is off, render a friendly full-screen state — heading "Check-ins are turned off", body "The owner has disabled kiosk check-ins for this gym." — instead of letting scans hit RPC errors. Middleware already redirects; this covers a kiosk left open when the flag flips mid-shift. |
| `app/admin/announcements/page.tsx` | Smoke-test the page (nav item has been commented out; it may have rotted). **If broken, fix it** — user-confirmed in scope. Then re-enable the nav item behind the `announcements` feature + `announcements:manage` permission. |
| `app/member/page.tsx` | Remove the `kiosk_get_checked_in()` call (line 15). Replace `peopleInGym` with a member-safe source: add a `people_in_gym` integer to `member_home_stats()` (count of open attendance rows for the caller's gym) in migration 016. |
| `app/gym/[code]/layout.tsx` | Pass `features` from the public payload into `GymTopNav` (prop contract in §8.5). |
| `app/gym/[code]/pricing\|locate\|contact` | `notFound()` when the respective public feature is off (data already omitted from payload). Contact page stays up (it's the contact surface), but hides the team block when `public_team` off. |
| `lib/engagement-hooks.ts` | In `handleScan`, fetch the gym's `member_feed` flag once (one `gym_feature_settings` read; missing row ⇒ default true) and skip `postCheckInFeedItem`/`postStreakMilestoneFeedItem` when off. Check-in itself must still succeed; never throw from a skipped hook. |

### Client UI (hide-only — Agent A, listed for completeness)

| Surface | Change |
|---|---|
| `app/admin/layout.tsx` | Replace `ownerOnly` with `permission?: PermissionKey; feature?: FeatureKey` per nav item; filter via `useAccess()`. Nav additions: "People & access" (`roles:manage`), re-enabled "Announcements" (`announcements` feature + `announcements:manage` permission — page verified/fixed by Agent B first, §6). Kiosk item: `kiosk:use` + `kiosk_checkin`. Gym Page item: `gym_page:view`. Reports: `reports:attendance:view`. |
| `components/member/MemberShell.tsx` | Filter `NAV_ITEMS` by the `features` prop (`member_feed`, `leaderboards`). |
| `components/member/MemberHomeClient.tsx` | Same filtering for the quick links block (lines 492-497); accept a `features` prop through `MemberHomeData`. |
| `components/gym/GymTopNav.tsx` | Accept `features` prop; drop Pricing/Locate links when off. |

---

## 7. Gym Page Studio — full design specification (Agent A)

This section IS the design. Recreate the mockup's layout and interactions with the app's own design tokens. Do not rendering-copy the prototype's DOM; build idiomatic React/Tailwind matching the existing codebase style (inline `style={{ …var(--color-*) }}` + Tailwind utility classes, as every current admin page does).

### 7.0 Design-language mapping (mockup → production)

The mockup's warm cream palette and Syne font are **prototype placeholders**. Map:

| Mockup | Production token |
|---|---|
| Page background `#F6F1EA` | `var(--color-background)` |
| Card white `#fff`, border `#EBE3DA` | `var(--color-white)` / `var(--color-surface)` |
| Accent `#B47A45` / `#D4956A` | `var(--color-primary)` (+ `var(--color-primary-glow)` for tints) |
| Headings font Syne | `var(--font-heading)` |
| Body font Inter | app default |
| Success green `#4f9d6f` family | `var(--color-success)` / `var(--color-success-bg)` |
| Warning amber `#e0a83a` family | `var(--color-warning)` / `var(--color-warning-bg)` |
| Muted text `#9a8f82` | `var(--color-text-muted)`; secondary `#6a6157` → `var(--color-text-secondary)` |
| Preview stage backdrop `#e4ddd4` | `var(--color-surface)` |

**Inside the preview frame**, colors come from the gym's own brand (`brandColorVars()` output applied to the preview subtree via a scoped `<style>` or inline vars) — the preview must look like the real public page, not like the admin theme.

### 7.1 The one refactor that unlocks it (do first)

Extract the presentational body of `GymLandingPage` (currently inline in [app/gym/[code]/page.tsx:134-578](../app/gym/[code]/page.tsx)) into **`components/gym/GymLandingPreview.tsx`**:

```ts
type GymPreviewData = {            // superset of today's GymData
  name: string; code: string; tagline: string | null; description: string | null;
  address: string | null; phone: string | null;
  logoUrl: string | null; coverUrl: string | null;
  brandColor: string; secondaryColor: string | null;
  operatingHours: Record<string, string> | null;
  amenities: string[] | null;
  socialLinks: { facebook?: string; instagram?: string; website?: string } | null;
  teamMembers: { name: string; role: string; bio?: string; photo_url?: string }[] | null;
  pricingPackages: { name: string; price: string; duration: string; features: string[]; is_featured: boolean }[] | null;
  mapEmbedUrl: string | null; directions: string | null;
  memberCount: number;
  coverFocal: { x: number; y: number };                          // 0–100
  sectionVisibility: { amenities: boolean; hours: boolean; contact: boolean };
};

props: {
  gym: GymPreviewData;
  view: 'home' | 'join' | 'contact' | 'pricing' | 'locate';
  device: 'desktop' | 'mobile';
  interactive?: boolean;      // false in Studio: links/buttons render but don't navigate
  focalOverlay?: React.ReactNode; // Studio injects the FocalPointEditor here (home/join only)
}
```

- **Public pages** (`/gym/[code]`, `/contact`, `/pricing`, `/locate`) render it with `interactive` true, device resolved by the existing responsive markup (keep today's `md:hidden` / `hidden md:block` split inside the component — `device` prop only forces one branch when set, for the Studio).
- Cover focal: apply `style={{ objectPosition: \`${focal.x}% ${focal.y}%\` }}` on the cover `<Image>` (both mobile and desktop heroes).
- Section visibility: `sectionVisibility.amenities === false` hides the Amenities section even when data exists; same for hours/contact. Empty-data hiding behavior is preserved unchanged.
- `view: 'join'` renders a **non-interactive facsimile** of the signup layout (cover panel + disabled form fields per the mockup's `_renderJoin`) — it is Studio-only; the real `/gym/[code]/signup` page is NOT refactored or touched.
- `view: 'contact' | 'pricing' | 'locate'` render prop-driven bodies matching the existing public subpages (gradient header + cards). Feature flags shape them: when `public_pricing` is off, the Studio passes a flag so the tab shows the hidden-page placeholder (§7.8) — the component itself stays dumb.
- **Acceptance bar: the public pages must render pixel-identically before/after this refactor** (existing e2e passes unchanged).

### 7.2 Component tree & files

```
app/admin/gym-profile/page.tsx      // (Agent B) thin server page: guard + fetch + <GymPageStudio/>
components/admin/gym-studio/
├─ GymPageStudio.tsx                // client island; owns ALL state + save (state/handlers lifted
│                                   //   verbatim from today's page.tsx — media pipeline untouched)
├─ GettingStartedBanner.tsx         // §7.6
├─ StudioHeader.tsx                 // §7.3.1
├─ ControlRail.tsx                  // desktop left rail (w-[404px]) / mobile stacked cards
│  ├─ RailGroup.tsx                 // shared collapsible card: icon, title, sub, chevron, children
│  ├─ EssentialsGroup.tsx           // §7.3.2
│  ├─ PhotosGroup.tsx               // §7.3.3 (CoverField, LogoField)
│  ├─ BrandStyleGroup.tsx           // §7.7
│  ├─ SectionsGroup.tsx             // §7.3.4
│  ├─ SubpagesGroup.tsx             // §7.3.5
│  └─ FeaturesGroup.tsx             // §7.8 (NEW — not in mockup)
├─ PreviewPane.tsx                  // toolbar + stage
│  ├─ PreviewToolbar.tsx            // tabs · safe-area toggle · device toggle
│  ├─ DeviceFrame.tsx               // browser chrome (desktop) / phone bezel (mobile)
│  └─ FocalPointEditor.tsx          // §7.5
├─ MobileStudioSheet.tsx            // §7.4 drawer
components/gym/GymLandingPreview.tsx  // §7.1
app/admin/access/page.tsx + components/admin/AccessClient.tsx   // §7.9 (NEW)
```

`GymPageStudio` state = today's `gym-profile/page.tsx` state (lines 114-152) plus: `coverFocal`, `sectionVisibility`, `featureFlags`, `previewTab`, `previewDevice`, `showSafeArea`, `focalEditing`, `dirty`, `drawerOpen`, `openGroups`. All upload/compress/hash/cleanup/save/revalidate functions move over **verbatim** (§7.10 guardrail).

### 7.3 Desktop layout (≥1024px) — mockup 1a

Full-height two-pane inside the admin shell: banner (optional) → header → `flex` row of ControlRail (404px, own scroll) and PreviewPane (flex-1, stage scrolls).

#### 7.3.1 StudioHeader

- Left: `h1` "Gym Page" (heading font) · gym code chip (mono, muted bg) · **status pill**: `● Live` (success tint) or `● Hidden` (warning tint).
- Sub-line: "Guided edits on a polished Stren page — you choose the content, we keep the layout sharp."
- Right cluster: dirty text (`Unsaved changes` warning-tinted / `All changes saved` muted / `Saving…`) · "View public page ↗" link → `/gym/{code}` new tab · **Save changes** button (primary when dirty, muted-disabled when clean) · **Publish**/**Unpublish** button (Publish = success solid; Unpublish = outline). Publish with empty tagline → button disabled + tooltip "Add a tagline first".
- **Publish/Unpublish renders only when `access.permissions.has('gym_page:publish')`** (owner). An admin granted the Studio switch sees the status pill plus a muted caption "Only the owner can publish" where the button would be — never a button that 403s. (The DB trigger is the backstop.)
- Save and Publish are **separate actions**. Publish also saves. Both disabled while uploading (existing flags).
- **Save = two writes** (gym row update, then `gym_feature_settings` upsert when flags changed). If either fails: stay `dirty`, toast names which half failed ("Your page content saved, but feature settings didn't — try again."). No transaction in v1; re-saving flags is idempotent.
- **Save always fires the revalidation call** (existing `triggerGymPageRevalidation`), even for a flags-only or focal-only change — one path, impossible to forget, keeps the 1-hour public cache honest.

#### 7.3.2 EssentialsGroup (default open)

Icon: sliders. Sub: "Tagline & description". Contents:
1. **Public visibility row** (boxed): title "Public visibility", sub "A tagline is required to publish." + the same Published/Hidden pill-toggle behavior as today (blocked with toast when no tagline).
2. **Tagline**: label + live `{n}/120` counter (counter turns danger-colored at 0 chars trimmed); input `maxLength=120`, placeholder "Your gym's one-liner".
3. **Short description**: 3-row textarea, placeholder "What makes your gym special".

Gym name and code are NOT edited here (they stay ownership/identity data; editing them stays out of v1 Studio — remove those inputs from the UI; the save payload keeps sending current values).

#### 7.3.3 PhotosGroup (default open, "START HERE" badge)

Badge: small primary-tinted chip "START HERE" on the group header.

**CoverField**: label "Cover photo" + Remove (danger text, only when present). Thumbnail (~118px, rounded-xl): shows current cover with `background-position` from focal + bottom gradient scrim + an **"Adjust focal point"** overlay button (bottom-right, dark translucent; becomes primary-solid "Done" while editing). Empty state: dashed card, image icon, "Add a cover photo". Below: **Upload** button (opens file input; drag-and-drop onto the thumbnail also accepted — reuse existing handlers). Help copy: "Fills the hero on desktop & mobile. Drag the focal point on the preview so faces stay clear of the text." Upload spinner text: "Uploading cover image…" (existing flow).

**LogoField** (divider above): label "Logo" + Remove. 60px square preview tile ("None" placeholder text when empty) + **Upload/Replace** button + copy: "Shows in the nav, hero & signup. A square mark reads best." (Mockup's "Try another"/generated marks are prototype-only — production has real uploads exclusively.)

#### 7.3.4 SectionsGroup ("Home sections", default collapsed)

Sub: "Amenities, hours, contact". Three boxed sub-cards, each with a **Shown/Hidden pill** (success tint when shown, muted when hidden) that writes `sectionVisibility.*` and updates the preview instantly. When hidden, the sub-card's editor collapses.

1. **Amenities** — chip list with per-chip ✕ remove, input + Add button, Enter adds (existing handlers).
2. **Opening hours** — 7 rows `day | input`, placeholder "Closed" (existing handlers, placeholder change).
3. **Contact & social** — inputs: Address, Phone (**new to the form** — columns exist on `gyms`; add them to the load/save payload), Facebook, Instagram, Website (existing social handlers).

#### 7.3.5 SubpagesGroup (default collapsed)

Sub: "Team, pricing, location". Three boxed sub-cards, each with a page-tag chip ("Contact page" / "Pricing page" / "Locate page") and a **"Preview →"** text button that switches the preview tab.

1. **Team** — compact rows (avatar initial circle, name, role, ✕) + "+ Add member" dashed button → appends an editable row (name, role, bio, photo URL — reuse existing team editor fields inside an expanding row).
2. **Pricing** — compact rows (name, POPULAR tag when featured, price) + "+ Add package" → expanding editor (existing pricing fields incl. features-one-per-line + Featured checkbox).
3. **Location** — Map embed URL input + Directions textarea (existing fields + help copy "Google Maps → Share → Embed a map → copy the src URL").

Rail footer caption (muted, centered): "Layout, fonts & spacing are handled by Stren — you focus on the content."

#### 7.3.6 PreviewPane

- **Toolbar**: segmented tabs **Home · Join · Contact · Pricing · Locate** (active = white card w/ shadow) · right side: **Safe area** toggle chip (primary-tinted when on) · device segmented control (desktop/mobile icons). The device toggle and tabs are **always visible, one click, never nested in a menu** — a single stored focal point serves both crops (product decision), so instant device switching is how owners sanity-check it.
- **Stage**: neutral backdrop, centered `DeviceFrame`:
  - Desktop frame: browser chrome bar (three dots + URL pill showing the real `stren` host + `/gym/{code}`), 940px max width, ~620px scrollable viewport.
  - Mobile frame: phone bezel (320px wide, rounded-[34px] dark shell), 660px scrollable viewport.
- Inside: `GymLandingPreview` fed from **unsaved Studio state** (live mapping: tagline keystrokes, colors, focal, section pills, feature flags reflect instantly).
- Preview of an unpublished gym renders normally (the Studio *is* the preview mode); no "coming soon" branch inside the Studio.

### 7.4 Mobile layout (<1024px) — mockup 1b

- Header condenses: title + status pill; compact checklist banner (progress ring + "Finish your gym page / N of 5 essentials done" + chevron; tapping opens the first incomplete group).
- ControlRail renders as stacked full-width cards, same groups/order.
- **Sticky bottom bar** (fixed, above the admin shell's own chrome): primary button **"👁 Preview my page"** (flex-1) + square Save icon-button.
- Tapping Preview opens **MobileStudioSheet**: full overlay scrim + drawer sliding to 90% height (rounded top, grab handle), header row "Live preview" + muted chip "as members see it" + **Done** pill (dark) on the right; horizontal scrollable tab strip (pill tabs, dark = active); body = `GymLandingPreview` mobile at full width. Done closes and returns to the exact prior scroll position. Focal editing works inside the drawer the same way.

### 7.5 FocalPointEditor

Overlay injected into `GymLandingPreview` over the hero (Home + Join tabs only, only when a cover exists):

- **Focal dot**: 26px white-ringed circle at `(x%, y%)`, subtle shadow, transitions when not dragging.
- **Editing mode** (entered via "Adjust focal point" in PhotosGroup, or clicking the dot): hero dims slightly, cursor crosshair, top-center caption pill "Drag to set the focal point" + white **Done** button. Pointer events: down/move/up with pointer capture; position clamped 0–100, rounded to integers; updates `coverFocal` live (cover `object-position` follows).
- **Keyboard**: dot is a focusable element `role="slider"`-like button, `aria-label="Cover focal point"`, `aria-valuetext="X {x}%, Y {y}%"`; arrow keys nudge 1% (clamped); Escape/Enter = Done.
- **Safe-area guide** (when `showSafeArea` or editing): dashed white rounded rectangle with tag "TEXT SITS HERE" — geometry: mobile `{top:46%, left:8%, right:8%, bottom:6%}`, desktop `{top:34%, left:4%, right:46%, bottom:10%}` (matches where hero text actually renders).
- Focal is **metadata only** (`gyms.cover_focal`) — never re-crops or re-uploads the image.

### 7.6 GettingStartedBanner (checklist)

Items (exact defs):

| key | label | done when |
|---|---|---|
| `cover` | Cover photo | `coverPath \|\| coverUrl` non-empty |
| `logo` | Logo | `logoPath \|\| logoUrl` non-empty |
| `tagline` | Tagline | trimmed length > 0 |
| `contact` | Contact info | address OR phone non-empty |
| `cta` | Join button | always true (built in) |

Render: warm card (primary-tinted gradient ok) with title **"Finish your gym page"**, sub "{n} of 5 essentials done", chips per item (done = success tint + filled dot; pending = outlined), progress ring (conic-gradient, % label). Chip click opens + scrolls to the owning group (`cover/logo→Photos`, `tagline→Essentials`, `contact→Home sections`, `cta→Essentials`). Dismiss ✕ persists in `localStorage` key `stren.studio.checklistDismissed.{gymId}`; banner auto-hides at 5/5.

### 7.7 BrandStyleGroup

Sub: "Colors, no hex required". Header shows a live two-tone swatch (primary|secondary split).

1. **"Pick a palette"** — 2×2 preset grid; each row: two-tone swatch + name + ✓ when active. Presets (primary/secondary): **Grove** `#2F7D5B/#24302B`, **Terracotta** `#C1653F/#2B211C`, **Ocean** `#2C6E8F/#1B2932`, **Ember** `#B0473C/#2A1E1C`. Picking sets both colors and the ramp seed.
2. **"Fine-tune the main color"** — 5-swatch ramp of the seed primary: `generatePalette(seed)` = mixes toward white by 34% and 16%, the seed itself, and toward black by 18% and 36%. Active swatch gets a dark ring.
3. **ContrastMeter** — computes WCAG `contrastRatio('#FFFFFF', primary)`:
   - ≥ 4.5 → success tint, ✓ icon: "Great contrast — white button text is easy to read on your color."
   - ≥ 3 → success tint: "Readable — white button text works on your color."
   - < 3 → warning tint, ⚠ icon: "Low contrast — white text is hard to read. Pick a deeper shade below."
   Save is **not blocked** on low contrast (owner may accept it); the warning is persistent.
4. **"Advanced: custom color"** text-button reveals the two hex inputs (Main / Deep) with the existing `isValidHex` validation + error strings.

`lib/brand-color.ts` additions (Agent A, unit-tested):

```ts
export function contrastRatio(hexA: string, hexB: string): number; // WCAG relative luminance
export function generatePalette(seedHex: string): [string, string, string, string, string]; // +34% white, +16% white, seed, +18% black, +36% black
```

`isValidHex`, `hexDarken`, `brandColorVars` stay untouched.

### 7.8 FeaturesGroup — NEW (designed here; not in the mockup)

Last card in the ControlRail. **Rendered only when `access.permissions.has('features:manage')`** (owner). Icon: toggles/sliders. Title **"Features"**, sub "What members and visitors can use".

Layout: grouped rows under small uppercase group headers **MEMBERS**, **PUBLIC PAGE**, **OPERATIONS**, **COMING SOON** (groups/order/copy from §4). Each row:

```
[ Label                      (switch) ]
[ effect line, muted, one sentence    ]
```

- Switches are real `role="switch"` buttons with `aria-checked`, label = the row label. On/off track colors: success / muted surface.
- Toggling updates local `featureFlags` → `dirty`; persisted by the normal **Save** (one `upsert` to `gym_feature_settings` alongside the gym-row update, via `saveFeatureFlags` from §8.4).
- **Instant preview feedback**: turning `public_pricing` off while the Pricing tab is active swaps the preview body for a **hidden-page placeholder** — centered card: eye-off icon, "This page is hidden", "Visitors won't see Pricing in the menu, and the link won't work." Same for Locate. Turning `public_team` off hides the team block on the Contact tab. Nav links inside the preview's top bar drop accordingly.
- `kiosk_checkin` row shows a warning micro-line **while off**: "Front-desk check-ins are paused."
- **COMING SOON group** (last): the four teaser rows from §4 — Trainer bookings, Friends & Chat, Workout routines, Posts. Same label + effect-line format as live features, rendered at slightly reduced opacity with a muted "Coming soon" chip where the switch would be. No switch, no click action, no member-facing trace. Teasers look like features, not ads — they tell the owner "this panel is where new capabilities will appear."
- Technical keys never appear anywhere in the UI.

Non-owner with the Studio switch (`gym_page:view`+`gym_page:edit`): the FeaturesGroup is absent entirely (not disabled — absent), and Publish is replaced by the caption per §7.3.1. There is **no read-only Studio mode in v1** — the Studio switch always grants view+edit together.

### 7.9 People & access page — NEW (designed here; not in the mockup)

Route `app/admin/access/page.tsx` (server guard by Agent B: `requirePermission('roles:manage')`) rendering `components/admin/AccessClient.tsx`. Admin-nav item **"People & access"** (shield icon), visible only with `roles:manage`.

Design philosophy: **one flat list of switches per admin.** No roles, no groups, no permission matrix — deliberately simpler than Discord-style systems; the target owner is ~40 and non-technical.

Layout (matches existing admin pages: title block + white rounded-xl cards):

- Title "People & access", sub "Control what your team can see and do."
- **Card: "Your team"**, listing in order:
  1. **The owner row (always first)** — the owner's name + email, a distinct filled badge **"Owner — full access"** (primary tint, check icon), no chevron, no switches. It must be unmistakable that the owner can do everything; this row exists purely to convey that.
  2. **Admin rows** — name, email, role chip. Chevron expands to the **Access switches** panel.
  3. **Staff rows** — name, email, role chip. No chevron; static caption: "Staff can use the kiosk and look up members."
  Empty state (no admins/staff): "No admin or staff accounts yet."
- **The Access switches** (exact list — this is the frozen `ACCESS_SWITCHES` contract, §8.1). Each is a plain-language `role="switch"` row, pre-set from the admin's current effective permissions; the owner flips freely in both directions:

  | # | Switch label | Default | Permission key(s) written |
  |---|---|---|---|
  | 1 | Can see money numbers (dashboard & reports) | ON | `dashboard:finance:view` + `reports:finance:view` |
  | 2 | Can manage members | ON | `members:manage` |
  | 3 | Can record payments | ON | `payments:create` + `payments:view` |
  | 4 | Can manage plans | ON | `plans:manage` |
  | 5 | Can manage promos | ON | `promos:manage` |
  | 6 | Can post announcements | ON | `announcements:manage` |
  | 7 | Can use the kiosk | ON | `kiosk:use` |
  | 8 | Can open & edit the Gym Page studio | OFF | `gym_page:view` + `gym_page:edit` |

  Multi-key switches write one override row per key, same `granted` value. Flipping a switch back to the role default **deletes** the override rows (via `saveOverride` with `granted: null`) rather than storing a redundant row.
- Each switch saves immediately (`saveOverride`, §8.4): saving spinner on the row, toast on failure and revert. No page-level Save button.
- Never exposed as switches (owner-only, never delegable): publish, feature toggles, people & access itself, cache tools.
- Footer caption: "Owners always have full access. These switches apply to this gym only."
- No role editor, no invitations, no owner transfer, no staff switches in v1.

### 7.10 States, a11y, guardrails

States to handle: empty (dashed affordances + checklist nudges) · uploading (spinner, Save disabled) · dirty→saving→saved in header · published vs hidden (status pill; publish gated on tagline — existing rule + DB constraint 008) · low contrast warning · section hidden (instant preview removal) · focal editing · drawer open/closed · **feature off (preview placeholder)** · **partial save failure (§7.3.1 — stays dirty, names the failed half)** · **no-publish-permission (§7.3.1 caption)**.

Additional behaviors (user-confirmed):

- **Unsaved-changes guard**: `beforeunload` browser prompt while dirty, plus an in-app confirm dialog ("You have unsaved changes — leave anyway?") when a nav link is clicked while dirty.
- **Concurrent edits are last-write-wins** for the whole gym row, silently. Accepted for v1 — realistically one owner edits this; no locking or merge UI.

Accessibility: groups are real `<button>` disclosures with `aria-expanded`; all toggles `role="switch"`; focal editor keyboard-operable + announces coordinates; drawer traps focus, Escape closes; preview images get alt from gym name; tab strips are `role="tablist"`.

Guardrails (non-negotiable):

- **No** freeform canvas, drag-to-reorder, font/spacing controls, arbitrary section ordering, or nav/checkout editing. Owners cannot break the layout — that is the point. Notion/Wix-ADI confidence, not a website builder.
- **Preserve the media pipeline verbatim** (§1 table). The Studio is a UI around it, not a rewrite. Focal point is new metadata, not a re-crop.
- Save keeps the exact update payload shape of today's `handleSave` (page.tsx:728-768) + the new keys (`cover_focal`, `section_visibility`, address, phone). Revalidation call and cleanup scheduling stay as-is.
- Target users are ~40-year-old gym owners, not power users: every control is labeled in plain language, one obvious primary action per screen, no jargon, no technical keys.

---

## 8. Frozen TypeScript contracts (Agent A creates; Agent B consumes; neither changes shapes without updating this guide)

### 8.1 `lib/permissions.ts` (pure, isomorphic — no supabase imports)

```ts
export type Role = 'owner' | 'admin' | 'staff' | 'member';

export type PermissionKey =
  | 'dashboard:view' | 'dashboard:finance:view'
  | 'reports:attendance:view' | 'reports:finance:view'
  | 'members:view' | 'members:manage' | 'members:payment_history:view'
  | 'payments:view' | 'payments:create'
  | 'plans:manage' | 'promos:manage' | 'announcements:manage'
  | 'gym_page:view' | 'gym_page:edit' | 'gym_page:publish'
  | 'features:manage' | 'roles:manage'
  | 'kiosk:use' | 'cache:revalidate';

export const PERMISSION_KEYS: readonly PermissionKey[];
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, readonly PermissionKey[]>;
// §3 exactly; owner = EVERY key (the fixture seeds an owner row per key — canonical registry)

// The People & access UI (§7.9): one flat list of switches per admin, both directions.
export interface AccessSwitch {
  id: string;                                 // stable slug, e.g. 'money-numbers'
  label: string;                              // §7.9 table, verbatim
  permissions: readonly PermissionKey[];      // keys written together, same granted value
}
export const ACCESS_SWITCHES: readonly AccessSwitch[]; // the 8 rows of §7.9, in order

export interface PermissionOverride { permission: PermissionKey; granted: boolean }

export function roleHasPermission(role: Role, key: PermissionKey): boolean;
// owner ⇒ all keys (incl. unknown future ones); gym_page:edit implies gym_page:view; overrides beat defaults
export function resolvePermissions(role: Role, overrides: readonly PermissionOverride[]): ReadonlySet<PermissionKey>;

// Longest-prefix match wins; used by middleware and admin nav. Exact entries:
//   /admin/gym-profile   → gym_page:view      /admin/access   → roles:manage
//   /admin/reports       → reports:attendance:view
//   /admin/members       → members:view        /admin/payments → payments:view
//   /admin/plans         → plans:manage        /admin/promos   → promos:manage
//   /admin/announcements → announcements:manage
//   /kiosk               → kiosk:use           /admin          → dashboard:view
export const ROUTE_PERMISSIONS: readonly { prefix: string; permission: PermissionKey }[];
```

### 8.2 `lib/features.ts` (pure)

```ts
export type FeatureKey =
  | 'member_feed' | 'leaderboards' | 'public_team' | 'public_pricing'
  | 'public_location' | 'announcements' | 'promos' | 'kiosk_checkin'
  | 'trainer_bookings' | 'friends_chat' | 'workout_log' | 'session_posts'; // teasers — real keys now, zero migration when they ship

export interface FeatureDef {
  key: FeatureKey;
  label: string;                 // §4 label column, verbatim
  effect: string;                // §4 effect column, verbatim
  group: 'members' | 'public' | 'operations' | 'coming_soon';
  defaultEnabled: boolean;       // all true except the four coming_soon teasers
  status: 'available' | 'coming_soon';
  publicSurface: boolean;        // true: public_team, public_pricing, public_location
}

export const FEATURE_CATALOG: readonly FeatureDef[];
export type FeatureFlags = Partial<Record<FeatureKey, boolean>>;
export function isFeatureEnabled(flags: FeatureFlags | null | undefined, key: FeatureKey): boolean; // missing ⇒ default; coming_soon ⇒ always false
```

### 8.3 `lib/access.ts` (pure)

```ts
import type { Role, PermissionKey, PermissionOverride } from './permissions';
import type { FeatureKey, FeatureFlags } from './features';

export interface MyAccess {
  role: Role;
  gymId: string | null;
  permissions: ReadonlySet<PermissionKey>;
  features: FeatureFlags;        // effective flags (server-resolved when available)
}

export function buildAccess(role: Role, gymId: string | null, overrides: readonly PermissionOverride[], features: FeatureFlags): MyAccess;
export function canUse(access: MyAccess, feature: FeatureKey | null, permission: PermissionKey | null): boolean;
export function accessFromRoleDefaults(role: Role, gymId: string | null): MyAccess; // fallback: role defaults + catalog defaults
```

### 8.4 `lib/access-data.ts` (client data access — Agent A writes it against the SQL surface specified in §5; Agent B guarantees the backend matches)

```ts
export async function fetchMyAccess(supabase: SupabaseClient): Promise<MyAccess>;
// supabase.rpc('get_my_access'); on error or missing function → accessFromRoleDefaults() from the auth-context profile

export async function saveFeatureFlags(supabase: SupabaseClient, gymId: string, flags: FeatureFlags): Promise<void>;
// upsert into gym_feature_settings { gym_id, flags, updated_by: auth.uid(), updated_at: now }

export interface AccessPerson { userId: string; name: string; email: string; role: Role; overrides: PermissionOverride[] }
export async function listAccessPeople(supabase: SupabaseClient, gymId: string): Promise<AccessPerson[]>;
// profiles (role in admin,staff, gym scope) joined with gym_user_permission_overrides

export async function saveOverride(supabase: SupabaseClient, args: { gymId: string; userId: string; permission: PermissionKey; granted: boolean | null }): Promise<void>;
// granted=null ⇒ delete the row (back to default); else upsert
```

Plus `lib/access-context.tsx` (Agent A): `<AccessProvider>` client component fetching `fetchMyAccess` once per mount (after auth-context resolves) + `useAccess(): MyAccess` hook, wrapped around the admin layout content. Until the RPC exists / on failure it serves `accessFromRoleDefaults` — the UI degrades to today's role behavior, never crashes.

### 8.5 Server module + prop contracts (Agent B)

- `lib/permissions-server.ts`: `getMyAccess()` (server, cached per request), `requirePermission(key)` → `redirect('/admin')`, `requireFeature(key)` → `redirect`, `apiRequirePermission(key)` → `NextResponse` 403 helper.
- Prop contracts Agent B wires and Agent A consumes:
  - `MemberShell` gains `features: FeatureFlags` prop (from `app/member/layout.tsx`).
  - `MemberHomeData` gains `features: FeatureFlags`.
  - `GymTopNav` gains `features: Pick<FeatureFlags,'public_pricing'|'public_location'>` (from `app/gym/[code]/layout.tsx`, sourced from the public payload).
  - `GymPageStudio` receives from the server page: `{ initialGym, access: MyAccess, initialFeatureFlags: FeatureFlags }`.

### 8.6 Parity fixture

`tests/fixtures/role-permission-defaults.json` — written by Agent A, generated from `ROLE_DEFAULT_PERMISSIONS` (script or hand-written + parity test). Agent B copies it into the 015 seed. `tests/unit/permissions-parity.test.ts` compares the TS constant to the fixture; a second SQL-side probe test (integration) asserts `has_gym_permission` agrees with the matrix for each role.

---

## 9. Test plan (test-first per CLAUDE.md; each item lists its owner)

Reference patterns: `tests/integration/gym-visibility.test.ts`, `tests/e2e/admin-gym-preview.spec.ts`. Shared mocks in `tests/setup/vitest.setup.tsx`. Everything runs inside the existing `test:ci` gate.

### Unit (`tests/unit/`)

| Test | Owner |
|---|---|
| `permissions.test.ts` — every §3 cell × 4 roles; `resolvePermissions` grant+revoke overrides; owner gets unknown keys; edit⊇view; `ROUTE_PERMISSIONS` covers every admin nav href | A |
| `permissions-parity.test.ts` — TS matrix === fixture | A |
| `features.test.ts` — catalog defaults (all on, chat off); `isFeatureEnabled` missing row/key/explicit false; coming_soon never enabled | A |
| `access.test.ts` — combined-gate truth table incl. the two §2 named cases (staff+kiosk-off; member+leaderboards-off) | A |
| `brand-color.test.ts` (extend) — `contrastRatio` known pairs (black/white=21, #767676/white≈4.54), `generatePalette` ramp shape/order, focal clamp/normalize 0–100 + 1% nudge | A |

### Integration (`tests/integration/`)

| Test | Owner |
|---|---|
| `payments-access.characterization.test.ts` — **pin current payment read/insert behavior per role BEFORE migration 015** (money-path rule) | B |
| `admin-nav-permissions.test.ts` — nav filtering per role and per override (admin: no Gym Page/People & access/finance; staff: Members + Kiosk only; override grants reveal items) | A |
| `member-shell-features.test.ts` — `leaderboards`/`member_feed` off ⇒ nav + quick links absent | A |
| `public-nav-features.test.ts` — `GymTopNav` drops Pricing/Locate when off | A |
| `studio-features-panel.test.ts` — FeaturesGroup renders §4 copy, hides for non-owner, four teaser rows disabled with "Coming soon" chips, toggle → dirty → save payload contains flags; partial-save failure keeps dirty + names the failed half | A |
| `access-page.test.ts` — People & access: owner row first with "Owner — full access" badge and no switches; admin rows expand to exactly the 8 §7.9 switches with correct defaults; flipping writes `saveOverride` for every mapped key; flipping back to default deletes override rows (`granted: null`); staff rows not expandable | A |
| `studio-publish-gating.test.ts` — Publish button absent without `gym_page:publish`, caption shown instead | A |
| `engagement-hooks-features.test.ts` — `handleScan` with `member_feed` off checks in successfully, posts no feed items; check-in also survives an RLS-rejected feed insert (flag-flip race) | B |
| `kiosk-disabled-state.test.ts` — kiosk page renders the "Check-ins are turned off" state when `kiosk_checkin` is off | B |
| `dashboard-finance-gating.test.ts` — dashboard/report clients tolerate missing finance keys | B |
| `feature-settings-authz.test.ts` — owner writes flags OK; admin/staff/member writes rejected (RLS contract) | B |
| `get-my-access.test.ts` — RPC shape matches `MyAccess`; fallback path in `fetchMyAccess` | B |

### E2E (Playwright, `tests/e2e/`)

| Test | Owner |
|---|---|
| Extend `admin-gym-preview.spec.ts` — studio two-pane loads; typing tagline updates preview live; tabs switch; Save vs Publish distinct; publish gated on tagline; mobile viewport drawer flow; public page pixel-parity after the `GymLandingPreview` extraction | A |
| `feature-toggles.spec.ts` — owner turns "Show leaderboard to members" off → member loses nav + direct route bounces; re-enable → restored; pricing off → public 404 + nav link gone | B |
| `permissions.spec.ts` — admin: no Gym Page nav, `/admin/gym-profile` redirected, dashboard **shows** finance by default; owner revokes the money switch → admin's dashboard payload loses the §5 finance fields; owner grants the Studio switch → admin edits but sees no Publish button; staff: kiosk works, `/admin/reports` blocked | B |
| RPC probes — member session calling `admin_dashboard_stats`, `create_member_notification`, `kiosk_update_streak` gets errors (regressions for 014/015) | B |

E2E account strategy: extend the seeding pattern used by `admin-gym-preview.spec.ts` to four fixture accounts (owner/admin/staff/member) in one fixture gym. If inspection shows the current e2e has no seeding infra, scope the E2E to owner+member and cover admin/staff at the integration layer — Agent B decides on inspection and notes the choice in the PR.

---

## 10. Handoff prompts

Hand each block below verbatim to its agent (paste-ready packaged versions live in `AgentsContextKnowledgeBase/prompts/`; on divergence, this section wins). Both work on branch `CustomizationPermissionsToggles` (Slice 0 goes straight to `qa` in its own PR). Merge order: Slice 0 → (A and B in parallel) → joint green `npm run test:ci` → PR to `qa`.

**Shared-file rule (the only overlap): `app/admin/gym-profile/page.tsx`.** Agent A re-skins it first, keeping it a client page. Agent B's conversion of that file to a server wrapper is sequenced **strictly after Agent A's Studio merge**. A is UI only; B is backend/logic only — neither crosses the boundary anywhere else.

**Production rollout (per slice): migrations first, app deploy immediately after, one release window.** No dual-write/compat shims; the only visible gap is minutes long. Slice 0 deploys independently and immediately.

---

### 10.A — Prompt for Claude Opus 4.8 (UI)

> You are implementing the **UI half** of the "Gym Page Studio + Permissions & Feature Toggles" plan for Stren. Read, in order: `CLAUDE.md`, `AgentsContextKnowledgeBase/ImplementationPlan.md` (the contract — §7 and §8 are your spec), and the design bundle `stren-gym-page-studio/project/Stren Gym Page Studio.dc.html` in full. All design decisions are already made in guide §7 — including the Features panel and People & access page, which are NOT in the design bundle. Follow the spec; do not redesign, do not add features.
>
> **You own (create/edit):** `lib/permissions.ts`, `lib/features.ts`, `lib/access.ts`, `lib/access-data.ts`, `lib/access-context.tsx` (exactly per guide §8 — these are frozen contracts the logic agent builds against); `tests/fixtures/role-permission-defaults.json`; `components/gym/GymLandingPreview.tsx` (extraction per §7.1 — public pages must render pixel-identically, prove it with the existing e2e); `components/admin/gym-studio/*` (§7.2–§7.8); `components/admin/AccessClient.tsx` + the client part of `app/admin/access/page.tsx` (§7.9); the client-side JSX of `app/admin/gym-profile/page.tsx` (keep every state/upload/compress/hash/cleanup/save/revalidate handler **verbatim** — you are re-skinning around them; the server-page conversion is the logic agent's); nav filtering in `app/admin/layout.tsx`, `components/member/MemberShell.tsx`, `components/member/MemberHomeClient.tsx`, `components/gym/GymTopNav.tsx` (consume the §8.5 props/hook; provide safe defaults so nothing breaks before the backend lands); `contrastRatio` + `generatePalette` in `lib/brand-color.ts`; public gym pages only as far as swapping their bodies to `GymLandingPreview`.
>
> **You must NOT touch:** anything in `supabase/migrations/`, `middleware.ts`, anything in `app/api/`, `lib/permissions-server.ts`, `lib/engagement-hooks.ts`, `lib/gym-public.ts`, `lib/database.types.ts`, server-side gates in page files. If a task seems to need them, it belongs to the logic agent — leave a `TODO(logic)` comment and move on.
>
> **Order of work (test-first — write each slice's tests failing before implementing):**
> 1. Contract modules + fixture + unit tests (guide §8, §9 unit rows marked A).
> 2. `GymLandingPreview` extraction + focal/section-visibility props + pixel-parity e2e proof.
> 3. Studio shell: header, rail groups, preview pane, checklist banner, brand group (desktop 1a).
> 4. Mobile drawer + focal editor + states/a11y (1b).
> 5. FeaturesGroup (incl. the four Coming-soon teaser rows) + People & access UI (owner row + the 8 Access switches, §7.9 exactly) + nav filtering (§7.8, §7.9) with the §9 integration tests marked A.
>
> Rules: production colors/fonts use the app's CSS tokens per §7.0 (mockup palette is placeholder); owners never see technical keys; Publish renders only with `gym_page:publish` (§7.3.1); no website-builder features (no drag-reorder, no font/spacing controls); `role="switch"`/`aria-expanded`/keyboard focal per §7.10; dirty-state navigation guard per §7.10. `app/admin/gym-profile/page.tsx` stays a **client** page in your hands — the server conversion happens after your merge. Where backend pieces don't exist yet (`get_my_access`, `gym_feature_settings`, `cover_focal`), code against the §8 contracts — `fetchMyAccess` falls back to role defaults, and your tests mock the supabase client (see `tests/setup/vitest.setup.tsx`). Run `npm run lint && npm run typecheck && npm run test:unit` green before handing off; note remaining `TODO(logic)` items in your final summary.

---

### 10.B — Prompt for GPT 5.5 / Codex (logic & enforcement)

> You are implementing the **logic half** of the "Gym Page Studio + Permissions & Feature Toggles" plan for Stren. Read, in order: `CLAUDE.md`, `AgentsContextKnowledgeBase/ImplementationPlan.md` (the contract — §0, §2–§6, §8, §9 are your spec), and `PHASE_3_TO_7_DIAGNOSTIC_AND_PLAN.md`. The UI agent builds against the frozen contracts in guide §8 — you implement the SQL/server surface to match them exactly; never change the contract shapes.
>
> **You own (create/edit):** `supabase/migrations/014_fix_notification_rpc_scope.sql`, `015_permission_model.sql`, `016_feature_toggles.sql`, `017_gym_cover_focal_and_sections.sql` (guide §5, in that order; regenerate `lib/database.types.ts` after each); `lib/permissions-server.ts` (§8.5); `middleware.ts` permission map (§6); all `app/api/admin/*` + `app/api/member/avatar` hardening (§6); server conversion of `app/admin/gym-profile/page.tsx` into guard+fetch+`<GymPageStudio/>` wrapper; server gates in `app/admin/page.tsx`, `app/admin/reports/page.tsx`, `app/admin/access/page.tsx`, `app/member/layout.tsx`, `app/member/feed/page.tsx`, `app/member/leaderboard/page.tsx`, the public subpage `notFound()` gates, `app/gym/[code]/layout.tsx` feature prop wiring; `app/member/page.tsx` (remove the manager-only `kiosk_get_checked_in` call; use the new `people_in_gym` field from `member_home_stats`); `lib/engagement-hooks.ts` feature check; finance-key-optional typing in `AdminDashboardClient.tsx`/`AdminReportsClient.tsx` (types + minimal render fallback only — no visual redesign).
>
> **You must NOT touch:** `components/admin/gym-studio/*`, `components/gym/GymLandingPreview.tsx`, `components/admin/AccessClient.tsx`, the visual JSX of any nav/shell component, `lib/permissions.ts` / `lib/features.ts` / `lib/access.ts` / `lib/access-data.ts` / `lib/access-context.tsx` (consume only), `lib/brand-color.ts`, the media-pipeline handlers in the gym-profile client code.
>
> **Order of work (test-first; money-path characterization BEFORE 015):**
> 1. **Slice 0 immediately, own PR to `qa`**: migration 014 + revalidate-gym gym-scope + avatar URL validation + RPC probe regression tests. Update the Phase 2.6 row in `CLAUDE.md` to ✅ on merge.
> 2. Migration 017 (focal + section visibility) — early, so the Studio has real columns.
> 3. `payments-access.characterization.test.ts` green → migration 015 (tables, seed from `tests/fixtures/role-permission-defaults.json`, `has_gym_permission`, `get_my_access`, policy swaps incl. replacing `dev_all_payments`, publish trigger, dashboard/reports RPC gating).
> 4. Migration 016 (feature settings, `gym_feature_enabled`, `get_gym_by_code` rework — **the `is_published` bugfix needs explicit user sign-off before shipping**, leaderboard/kiosk feature checks, feed/announcements/promos policies, final `get_my_access`).
> 5. Server enforcement wiring (§6 middleware/server/API tables, incl. the kiosk "turned off" screen and the announcements page smoke-test — **fix that page if it's broken**, user-confirmed in scope) + prop plumbing (§8.5) + engagement hooks + the §9 integration/E2E tests marked B.
> 6. Last: convert `app/admin/gym-profile/page.tsx` to the server wrapper — **only after Agent A's Studio has merged** (shared-file rule above).
>
> Rules: migrations are idempotent, no destructive SQL, never the dashboard; new SQL helpers follow the `get_gym_id()` conventions (`SECURITY DEFINER`, `SET search_path = ''`, explicit GRANT/REVOKE); `has_gym_permission` RAISEs on unknown keys for non-owners (§5); the finance field lists in §5 are exhaustive — do not re-derive what counts as finance; UI hiding is never the only enforcement — every gate exists at RLS/RPC level first, then API (403), then middleware (redirect); `maybeSingle()` for maybe-empty reads; correct status codes on API routes. Production rollout per slice: migrations first, deploy immediately after. Bump `package.json` + `CHANGELOG.md` per shipped slice group. Run `npm run test:ci` green before handing off.

---

### Definition of done (whole workstream)

- §6 checklist fully checked; §9 tests green in `test:ci`.
- An admin cannot reach the Studio, feature toggles, publish, or role management by URL, RPC, or REST; an admin **does** see finance numbers by default; after the owner flips a switch off, the corresponding data/action disappears at every layer (nav, route, RPC payload) — and reappears when flipped back on.
- People & access shows the owner row ("Owner — full access", no switches), the 8 switches per admin exactly, and nothing for staff.
- A member at a gym with leaderboards + feed disabled sees neither nav nor data; direct routes bounce; RPCs return empty/deny.
- The public page of a gym with pricing/location disabled 404s those subpages and the cached payload omits the data.
- A kiosk left open when `kiosk_checkin` is turned off shows the friendly "turned off" screen, not errors.
- The owner: completes the checklist to 5/5, adjusts the focal point, toggles a section and a feature and sees the preview react instantly, sees the four Coming-soon teasers, publishes from the Studio — on both desktop and mobile layouts; leaving with unsaved changes prompts a warning.
- `CLAUDE.md` phase table and `CHANGELOG.md` updated.

_End of guide._
