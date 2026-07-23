# Implementation State

_Live status of everything. **Update this file in the same PR that ships the work** (Catalog rule 3). One row per unit; keep rows one line. Statuses: `Queued` · `In progress (who)` · `Shipped (date, PR/commit)` · `Blocked (why)` · `Cut (why)`._

Last updated: 2026-07-23 (**Shot A is committed at `408fe3c`. Shot B is implemented and fully locally verified in the working tree through migration 028, including the evidence-v2 isolated database/Auth/Storage restore. It awaits developer review and commit. Stren remains suitable for synthetic internal testing only and is not approved for a real-gym pilot or real payments. No hosted migration or data mutation has occurred.**)

---

## Workstream (queued 2026-07-16): Production Security & Financial Closure

Spec: [ImplementationPlan-ProductionSecurityAndFinancialClosure.md](ImplementationPlan-ProductionSecurityAndFinancialClosure.md) · prompts: [Shot A](prompts/Codex-Production-Security-Tenant-Closure-OneShot.md), [Shot B](prompts/Codex-Financial-Reporting-Recovery-Closure-OneShot.md), [independent gate review](prompts/Codex-Production-Readiness-Oversight.md).

| Unit | Scope | Status |
|---|---|---|
| PS1 | Shot A — close broad profile reads, role escalation, cross-gym attendance, invalid verification reactivation, one-time credential disclosure, partial onboarding, and missing privileged audit boundaries | Committed (`408fe3c`, 2026-07-18) — migration 027, secured application contracts, clean reset/seed, two-gym owner/admin/staff/member PostgreSQL behavior tests, injected onboarding rollback/resumption, and real parallel attendance execution pass; no hosted apply |
| PS2 | Shot B — close legacy payment writes, idempotency mismatch, duration/report-status errors, hidden report failures, CI fixture gaps, database constraints, deployment drift, and recovery evidence | In progress (Codex, working tree, 2026-07-23) — implementation and local verification complete: migration 028, guarded clean reset, types, security/deployment checks, 11 mandatory financial PostgreSQL suites, 448 unit/integration tests, lint/typecheck/build, and evidence-v2 isolated restore pass; awaiting developer review/commit; no hosted apply |
| PS3 | Independent gate review — inspect both committed diffs, rerun adversarial database probes and isolated recovery, then issue the launch recommendation | Queued after PS1 and PS2 — GPT 5.6 Terra at `xhigh`; no implementation unless separately authorized |

Audit baseline: same-gym private-profile disclosure, member-to-admin promotion, and cross-gym attendance injection/disclosure were reproducible against the effective local database. A rejected gym user could self-reactivate through historical membership evidence; onboarding exposed a generated one-time sign-in URL; authenticated legacy payment insert/update/delete remained possible; reversal idempotency accepted same-key/different-intent reuse; 30-day periods were inclusive for 31 dates; and dashboard/report membership buckets disagreed with access state. The current full finding set, smallest-fix boundaries, and evidence gates are canonical in the active plan.

PS1 verification: a completely clean local database applies `027_production_security_tenant_closure.sql` and the updated seed. `npm run db:test:security` passes executable RLS/grant/constraint/RPC/rollback/audit assertions and two simultaneous PostgreSQL attendance sessions; the deployment contract through 027 and generated database types match. The complete unit/integration suite passes (**440/440**), as do lint, typecheck, and the production build. Three targeted Chromium landing checks reached passing assertions, but Playwright's local Next development server did not exit before the shell ceiling while repeatedly retrying unavailable Google Font downloads; the full run also exposed the pre-existing auth-mode URL assertion and remains non-gating for PS1's database-owned security proof.

PS2 verification: two clean local databases apply migration 028 and the guarded two-gym seed; generated types match. The security/RLS suite, recovery invariants, exact protected-definition contract plus intentional drift/rollback probe, and all 11 named financial behavior/rollback/date/monetary/concurrency suites pass. Lint, typecheck, 448/448 unit/integration tests, and the production build pass. Production-mode Playwright exits cleanly with **14 passed / 8 credential-gated skipped / 0 failed**. The 2026-07-23 evidence-v2 isolated restore matched **7 Auth users / 7 profiles / 6 gym-user rows / 2 memberships / 2 attendance rows / 1 onboarding audit event / 6 privileged-audit events / 2 ledger events / 2 financial idempotency records**, exact Auth/financial/membership/audit/definition digests, PHP **800 / 900** reconciliation totals with zero anomalies, and **1 Storage bucket / 1 object** by SHA-256. Actual RPO was **0.00 minutes** and RTO **1.27 minutes**; the target was stopped and retained.

Launch gate: do not onboard a real gym or accept real payments until PS3 independent review completes. Hosted retention, PITR/equivalent, monitoring/configuration recreation, and an isolated hosted restore remain external Critical evidence gates requiring separate approval.

---

## Workstream (initial shots committed 2026-07-16): Financial Integrity, Reporting & Recovery

Spec: [ImplementationPlan-FinancialIntegrityAndRecovery.md](ImplementationPlan-FinancialIntegrityAndRecovery.md) · decision: [ADR 0007](../docs/adr/0007-financial-ledger-separates-money-from-access.md) · prompts: [Shot 1](prompts/Codex-Financial-Integrity-Reports-OneShot.md), [Shot 2](prompts/Codex-Data-Recovery-Migrations-OneShot.md).

| Unit | Scope | Status |
|---|---|---|
| FI1 | Shot 1 — append-only financial ledger, atomic/idempotent payment-membership RPCs, server-enforced discounts, labeled legacy backfill, ledger-derived dashboard/reports, and reconciliation | Committed (`27a1113`, 2026-07-16) — architecture is retained, but closure defects in legacy grants, idempotency, date semantics, reporting status, onboarding and CI are queued under PS1/PS2 |
| FI2 | Shot 2 — clean database bootstrap/seed, complete deployment parity, database and Storage backup coverage, recovery runbook, and isolated restore with FI1 reconciliation | Committed (`b6e8f2f`, 2026-07-16), production gate blocked — local restore evidence exists; hosted deployment parity, approved off-site retention, PITR/equivalent, monitoring/configuration and isolated hosted restore remain unproven |

FI1 verification: synthetic pre-backfill inventory was **1 membership / PHP 80.00** and legacy `payments` **0 / PHP 0.00**; post-backfill was **1 reconstructed event / PHP 80.00**, with a zero-row rerun. Final synthetic reconciliation across 1,013 exercised events was payments **PHP 446.80**, refunds **PHP -40.00**, voids **PHP -60.00**, adjustments **PHP 11.30**, net **PHP 358.10**, and zero missing links, duplicate keys, or impossible reversals. Focused contracts (**115/115**), complete unit/integration suite (**419/419**), database behavior/concurrency/fail-closed suites, lint, typecheck, and production build pass.

FI2 local recovery verification: a fresh database applies `000`, `001`, and `005` through `026` and the development-only seed, matches generated types, and passes database/deployment invariants. The final isolated restore matched **7 Auth users / 7 profiles / 6 gym-user rows / 2 memberships / 2 attendance rows / 1 audit event / 2 ledger events**, live sign-in routing for all seven development fixtures, two-gym RLS, PHP **800 / 900** reconciliation totals with zero anomalies, and **1 Storage bucket / 1 object** by SHA-256. Actual RPO was **0.00 minutes** and RTO **1.95 minutes**; the target was stopped and retained. Full quality-gate results are recorded in the changelog.

Launch gate: Stren remains suitable for synthetic internal testing only until the scheduled encrypted off-site database/Storage backups demonstrate seven-day retention, PITR or an approved equivalent meets the fifteen-minute payment RPO, required hosted configuration is recreated, and a separately approved isolated hosted restore passes. The migration-001 clean-bootstrap defect is repaired locally without editing migration 001. Migrations 000/025/026 were not applied to the linked hosted project; no hosted data mutation, paid infrastructure change, production restore, commit, or push occurred.

---

## Workstream (implemented in working tree 2026-07-15): Password Recovery & Gym Page Theme Reliability

| Unit | Scope | Status |
|---|---|---|
| RT1 | Expired password-recovery link affordance | Implemented (Codex, working tree, 2026-07-15) - Request a new reset link now opens the email request form in place, so the visible action immediately leads to a usable recovery path rather than relying on navigation away from the invalid-link state |
| RT2 | Gym-owned public-page brand boundary | Implemented (Codex, working tree, 2026-07-15) - the public gym page and its Studio preview scope the gym primary/secondary palette to their own rendered subtree instead of relying on a global `:root` override that can lose to or leak into Stren branding |

Verification: focused password-reset, public-layout branding, Studio, and public-preview regressions (**39 tests**), `npm run lint`, `npm run typecheck`, and a production build pass. No database migration is required.

---

## Workstream (implemented in working tree 2026-07-15): Demo Experience, Staff Modal & Kiosk Identity Verification

| Unit | Scope | Status |
|---|---|---|
| DX1 | Route-isolated, read-only connected-member preview using the shared responsive member shell and Home presentation | Implemented (Codex, working tree, 2026-07-15) - `/member/demo/**` preserves the authenticated account, substitutes one centralized Stren Demo Gym fixture, keeps every navigation target inside Demo Mode, and returns to the no-gym Gym hub through an always-visible Exit demo action |
| DX2 | Complete demo-safe Profile with real account identity, sample membership, blocked edit/photo controls, and deliberately invalid QR treatment | Implemented (Codex, working tree, 2026-07-15) - the profile remains renderable with identity fallbacks; the QR is CSS noise rather than an encoded payload, is blurred, marked DEMO, and never reads the account QR |
| DX3 | Add-teammate overlay viewport repair and kiosk member-photo verification | Implemented (Codex, working tree, 2026-07-15) - the teammate dialog now uses the shared document-body portal; migration 024 adds the existing member avatar URL to successful kiosk toggles, and the three-second result card presents it prominently with an initials fallback |

Verification: focused staff/kiosk/demo/middleware regressions (**58 tests**), the complete bounded unit/integration inventory (**409/409 tests**), `npm run lint`, isolated source typecheck, and production build pass. The in-app browser plugin could not initialize in this desktop session because its runtime attempted to redefine a protected process binding. Migration 024 is prepared locally and has not been applied to the linked hosted project.

## Workstream (implemented in working tree 2026-07-15): Admin Team Visibility & Notification Overlay Reliability

| Unit | Scope | Status |
|---|---|---|
| TN1 | People & access team loading after a fresh sign-in or active-gym transition | Implemented (Codex, working tree, 2026-07-15) - the screen reads the resolved active gym rather than the legacy profile shim, tolerates either supported profile-embed shape, and offers a Retry state instead of presenting a failed read as an empty team |
| TN2 | Admin notification overlay stacking, viewport coverage, and dialog semantics | Implemented (Codex, working tree, 2026-07-15) - the panel now uses the shared document-body viewport portal, so the animated route container cannot clip or offset its backdrop |

Verification: focused People & access / overlay regressions (**13 tests**), `npm run lint`, isolated source typecheck (the user’s live Next development process has a malformed ignored `.next/dev` artifact), production build, and the complete **398/398** unit/integration suite with coverage pass. No database migration is required.

## Workstream (implemented in working tree 2026-07-15): Account Creation, Recovery & Member Setup Safety

| Unit | Scope | Status |
|---|---|---|
| AR1 | Existing-account signup detection and actionable sign-in/password-recovery guidance | Implemented (Codex, working tree, 2026-07-15) - Supabase's obfuscated duplicate response no longer becomes a false verification-email success state |
| AR2 | Scanner-safe first-party recovery links, secure confirmation, recovery proof completion, and truthful delivery failures | Implemented (Codex, working tree, 2026-07-15) - reset email delivery uses a server-verifiable token hash and requires an explicit human confirmation before consuming it |
| AR3 | Gym-created member account email, one-time setup link, session-bound member routing, and optional password setup | Implemented (Codex, working tree, 2026-07-15) - the callback resolves the exact verified account with the same Auth client, routes the `member` gym user to `/member`, and offers Set password or Skip for now before continuing |
| AR4 | Hosted recovery-link path compatibility | Implemented (Codex, working tree, 2026-07-15) - malformed legacy links that expose the Next.js source prefix as `/app/auth/confirm` now receive a temporary redirect to the real `/auth/confirm` route with the one-time recovery parameters preserved; first-party link generation remains pinned to the root route even if a configured site URL contains `/app` |

Verification: `npm run lint`, `npm run typecheck`, production build, focused account/recovery regressions (**43 tests**), and the complete **395/395** unit/integration suite with coverage pass. AR4 additionally passes **33** focused recovery/routing tests, lint, typecheck, and a production build that includes `/auth/confirm` plus middleware; the current complete-suite runs showed no failures but did not emit a summary before the 120/180-second local ceilings. No database migration is required.

## Workstream (implemented in working tree 2026-07-15): Member Experience Visual Reliability

| Unit | Scope | Status |
|---|---|---|
| V1 | Per-gym notification preference persistence and immediate shared-profile refresh after personal-info edits | Implemented (Codex, working tree, 2026-07-15) - notification writes match the `(member_id, gym_id)` database key and saved identity fields update every current consumer without a tab change |
| V2 | Shared full-viewport overlays for settings, member notifications, and a pre-generated home check-in QR | Implemented (Codex, working tree, 2026-07-15) - dialogs portal above transformed route content and the mobile navigation; Check in opens the ready QR in place rather than redirecting to Profile |
| V3 | Compact mobile home hero, reduced-size canonical logo/photo assets, and service-worker image-cache rollover | Implemented (Codex, working tree, 2026-07-15) - the narrow hero is 352 px high, logo/photo payloads are reduced from 536 KB/3.58 MB to 94 KB/607 KB, and cache v9 replaces stale or invalid image responses |

Verification: `npm run lint`, `npm run typecheck`, production build, and **382/382** unit/integration tests pass. A local Chromium probe at 390 x 844 confirmed the 352 px hero, overlay layer 100 above mobile navigation layer 40, and HTTP 200 `image/png` responses for both direct and optimized logo requests.

## Workstream (implemented in working tree 2026-07-14): Account & Team Access Recovery

| Unit | Scope | Status |
|---|---|---|
| AT1 | Browser-session fallback for saved-gym and membership-verification mutations on public gym pages and the Gym hub | Implemented (Codex, working tree, 2026-07-14) - database-enforced browser RPCs recover when a freshly confirmed browser session has not yet reached a server action cookie |
| AT2 | Existing-account member onboarding plus owner-managed staff/admin listing, attachment, new-account setup link, access switches, and removal | Implemented (Codex, working tree, 2026-07-14) - the team list now reads `gym_users`; exact profile email lookup and missing-profile Auth recovery prevent duplicate-account failure; only an owner may manage non-owner team access |

Verification: linked Supabase migrations 001–021 are confirmed applied; `npm run typecheck`, `npm run lint`, the production build, and focused account/access regressions pass (**14 tests**, including member verification, existing-account onboarding, team endpoint, team UI, and public profile actions). The complete coverage run did not finish before the local 60-second command ceiling; it showed no test failure before timeout.

## Workstream (in progress 2026-07-14): Google OAuth

Spec: [ImplementationPlan-GoogleOAuth.md](ImplementationPlan-GoogleOAuth.md) - branch `codex/auth-google-oauth`.

| Unit | Scope | Status |
|---|---|---|
| G1 | Working Google sign-in controls, PKCE callback, gym-context preservation, bounded launch/callback recovery | Implemented (Codex, working tree, 2026-07-14) - focused component/callback regressions green |
| G2 | Local Supabase provider configuration, hosted deployment contract, and environment handoff | Implemented (Codex, 2026-07-14) - hosted Google Auth is enabled, deployment preflight passes, and the authorization endpoint redirects to Google without exposing credentials |
| G3 | Hosted Google provider enablement and real-browser verification | In progress (Codex, 2026-07-14) - the feature branch must be deployed before a real browser exchange can reach the new `/auth` client handler; hosted app currently serves the prior preview UI |

## Workstream (implemented in working tree 2026-07-14): Kiosk Redesign & Scanner Safety

| Unit | Scope | Status |
|---|---|---|
| K1 | Bright, responsive Stren kiosk surface using the official mark, real camera feed, Scan/Search tabs, occupancy-only utility row, phone-safe account QR, distinct success/failure/camera/offline states, focus/live regions, and reduced-motion crossfades | Implemented (Codex, working tree, 2026-07-15) - desktop through mobile CSS adapts the single central panel without exposing the public checked-in roster; arrival and visit-complete results now use distinct iconography, color treatment, status labels, and guidance |
| K2 | Correct QR check-in/check-out state machine, scan lock/rearm contract, retained camera stream, membership/offline handling, bounded processing state, restrained audio/haptic feedback, and safe manual lookup | Implemented (Codex, working tree, 2026-07-15) - the stale pinned-gym callback and repeat-scan checkout path are corrected; a result is visible immediately after confirmation and returns to the warm scanner in 1,300 ms; the exact legacy camera contract (environment-first warm-up, literal facing mode, 250px decode box, square stream) is restored with default-camera fallback, remount-safe retry, and stable public diagnostic codes |
| K3 | Migration `023_kiosk_privacy_and_scan_integrity.sql`: count-only occupancy RPC, minimum-three-character name/email lookup with a reduced response, `members:manage` protection for manual toggle RPC use, and per-member/gym advisory-lock serialization | Shipped to linked Supabase project (2026-07-15) - migrations 022 and 023 are in local/remote parity; the count-only occupancy RPC is available without exposing the checked-in roster |

Verification: `npm run lint`, `npm run typecheck`, production build, and **388/388** unit/integration tests pass. Linked Supabase migration parity is verified through migration 023. The complete Playwright command reached its 120-second local shell ceiling after public checks began completing; the isolated Chromium auth check passes in 2.4 s but the local Playwright development-server process did not exit. There is no credentialed kiosk E2E fixture in this workspace; scanner/RPC/camera/offline/timing behavior is regression-covered in `kiosk-terminal.test.tsx`.

## Workstream (completed in working tree 2026-07-14): Perceived Performance & Navigation Continuity

Source brief: the user-provided end-to-end perceived-performance request and `docs/PERFORMANCE_PLAN.md`. The files in `ReferenceRedesign/` are behavioral references only; their deletions/additions predate this work and remain user-owned. The supplied `ReferenceRedesign/stren-logo.svg` and existing `public/stren-logo.svg` are identical PNG bytes despite the extension, so the current loader reveals clipped portions of the canonical asset rather than inventing SVG path geometry.

| Unit | Scope | Status |
|---|---|---|
| P1 | Audit App Router/auth/data/shell/profile-loading architecture; pin exact account/profile/gym/role/branch private-cache scope and intent-aware navigation policy | Implemented (Codex, working tree, 2026-07-14) - exact account/profile/gym/role scope, versioned private cache, scoped clearing, and constrained-network intent prefetch are regression-pinned |
| P2 | Calm Stren loading system: canonical-logo bootstrap/privacy curtain, contextual admin/member/auth skeletons, embedded route errors, reduced motion, persistent-shell content transition and focus transfer | Implemented (Codex, working tree, 2026-07-14) - no new runtime dependency; contextual loading/errors, inert privacy curtain, route focus transfer, and zero-duration reduced-motion behavior are verified |
| P3 | Auth/logout/gym-switch safety: immediate privacy boundary, late-response epochs, atomic scoped switching with rollback, scoped member/notification requests, non-sensitive short-lived auth draft | Implemented (Codex, working tree, 2026-07-14) - stale initial auth, account-to-account, logout timeout, gym rollback, member/payment, and notification scope regressions are green; profile/gym request-sequence guards enforce last-request-wins ordering |
| P4 | Landing/auth intent transitions, first-load and revisit behavior, full failure/offline matrix, performance profiling, responsive/reduced-motion browser QA, required screenshots/recording, final documentation/changelog | Implemented (Codex, working tree, 2026-07-14) - production desktop/mobile landing-to-auth, slow CPU/network, warm revisit, reduced motion, screenshots, browser timing observations, middleware telemetry bypass, and cache-v7 cleanup are complete |
| P5 | Follow-up navigation polish: animated privacy masking on sign-out and actual gym changes, direct same-gym Admin/Member view changes, member account-pill profile affordance, and one coherent auth landing control | Implemented (Codex, working tree, 2026-07-14) - focused loader, gym-switcher, member-shell, and auth-surface regressions are green; the current desktop session could not attach its in-app browser for a final visual capture |
| P6 | Device-safe canonical loader asset and deploy-safe public asset caching | Implemented (Codex, working tree, 2026-07-14) - replaced PNG bytes incorrectly served as `.svg`, removed the mismatched favicon declaration, and advanced the service worker so styles/scripts are network-only while cached media must match its expected MIME type |

Verification after the ENOSPC recovery: `npm run lint`, `npm run typecheck`, `git diff --check`, the production build, and the canonical coverage run pass (**71 files, 353 tests**; 60.18% statements / 52.31% branches / 57.69% functions / 63.77% lines). Production-backed Playwright passes **14 public desktop/mobile checks**; **8** credentialed checks are skipped because no `E2E_*` accounts are available. A 4x CPU / 150 ms / 1.6 Mbps desktop profile recorded cold FCP/LCP at 1.38 s and warm FCP/LCP at 0.38/0.50 s in the local harness; mobile and reduced-motion journeys are visually verified, with public transition durations at `0s` under reduced motion. Evidence is in `stren-performance-audit/` under the Codex visualization output for this task. Authenticated owner/member tab, rapid gym-switch, logout-with-live-private-request, and immediate second-account browser journeys remain staging preflight items; their race and leakage boundaries are covered locally by integration tests. This work remains unshipped until a developer commits and opens the PR.

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
