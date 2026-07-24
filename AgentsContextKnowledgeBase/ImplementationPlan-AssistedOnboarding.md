# Assisted Onboarding — Integrated Release Record

Status: Phase 3 independently audited in the working tree on 2026-07-24. This is the integration record for the 59-file source change in `origin/super-admin` commit `3c6f047eedfab7bc76c7ecd48b31405bfc9b4e93`; it is not a second active implementation plan.

## Source and migration decisions

- Protected baseline: `7363c6312ae80c6418bb5984e889f6a968973535`.
- Integration base: `b6e8f2fad1e20ccfd440b84b02cc6e4b91a1bc97`.
- The source range `3c6f047^..3c6f047` contains 59 files. Every behavior is present at its source path or in an explicitly hardened replacement. The incoming `027_assisted_onboarding.sql` is intentionally omitted and replaced by `029_assisted_onboarding.sql`, with `030_assisted_onboarding_read_boundaries.sql` added for the narrow invite-metadata read boundary. The four incoming mocked SQL/provisioning/claim/resend integration files are replaced by executable database coverage and user-bound route/lifecycle/error-status suites.
- Protected migrations 000–028 were compared byte-for-byte: 26 protected migration files, zero mismatches. No protected migration was edited.
- `lib/database.types.ts` is generated from the clean local schema; `npm run db:types:check` passes. It is not hand-maintained.

## Hardened integration contract

- Platform provisioning and invite lifecycle RPCs use the authenticated user-bound operator client. Service-role access is limited to Auth/Storage account operations; the service-role platform RPC attempt is denied and the user-bound operator path succeeds.
- Provisioning is private-by-default and rejects a missing tagline/public state. Every provisioned gym has an owner claimant; owner-only claim rules prevent an ownerless finish or a non-owner claimant.
- Request fingerprints make same-key/different-payload retries reject. Resend supersedes prior invites and delivery state is truthful, including on idempotent replay.
- Operator/API/UI/React/audit/provisioning state/log boundaries contain no raw `claimLink`, token, token hash, or reusable credential. The token is constructed only at the outbound email boundary and is consumed only by the recipient claim route.
- QR join remains verification-gated; check-in requires effective membership; imported members carry consistent approved verification state. Feature parity excludes unsafe auto-approval and membership-bypass switches.
- Claim return destinations are bounded to the claim route and reject external, protocol-relative, query, and hash open redirects.

## Phase 3 evidence

Passed locally: clean schema reset through 030; separately guarded local seed; database types; platform/security/financial/invariant/deployment/drift suites; lint; typecheck; 562/562 unit tests; and production build. The focused regression for stale idempotent delivery replay passes.

The release gate is no-go. The clean-reset wrapper did not complete its seed phase without the separately guarded seed. `npm run test:e2e` is non-green with two unified-auth URL/state assertion failures; credential-gated Super Admin coverage was skipped and the local font-retry process did not emit a normal summary. `npm run recovery:drill:local` was not performed because the required escalation was rejected. Local proof does not close hosted retention, PITR/equivalent, hosted configuration, hosted migration, or hosted recovery gates.

The working tree is intentionally uncommitted and unpushed for developer review. No hosted mutation, real email, paid service, external deletion, merge, commit, push, rebase, cherry-pick, or tag was performed. Package version remains `2.6.0` pending a genuine release decision.
