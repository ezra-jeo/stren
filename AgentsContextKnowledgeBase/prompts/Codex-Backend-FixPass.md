# Fix-pass prompt — Codex backend agent — unit B7 (BLOCKING for prod)

_Produced by Fable's 2026-07-11 review of the Agent B one-shot. One blocking defect + one conditional item. Recommended launch effort: **extra high** (same SQL surface). Paste everything below the line into the agent._

---

You previously implemented the backend half of the "Gym Page Studio + Permissions & Feature Toggles" workstream for Stren (units B0–B6; full local CI green). A review found **one blocking defect** that must ship before production, plus one conditional item. Boundaries unchanged: backend/logic only; do not touch the UI components or the frozen contract modules; **never run `git commit` or `git push` — leave changes in the working tree** (this is now a standing rule in `CLAUDE.md`/`AGENTS.md`).

Read first: `AgentsContextKnowledgeBase/Catalog.md`, then `ImplementationState.md` (unit B7), then this spec.

## B7 — BLOCKING: migration 014's guards break the daily notification cron

**The defect.** `app/api/cron-notifications` calls `process_daily_notifications()` with the **service-role** client. Under a service-role JWT, `auth.uid()` is NULL. The call chain is:

```
process_daily_notifications()            (service-role only — REVOKE is correct)
  → process_expiry_notifications()       (001_production_baseline.sql:1558)
  → process_inactivity_notifications()
      → create_member_notification(...)  (redefined in 014:109)
      → can_send_member_notification(...) (redefined in 014:8)
```

Both redefined helpers begin with `IF v_caller_id IS NULL … RAISE EXCEPTION 'permission denied'`. So the **first** member the daily processor tries to notify kills the entire run: expiry reminders and inactivity nudges stop working, and the cron endpoint returns 500s. It fails **closed** (no security hole), but it is a feature outage. Your isolated-schema validation ran as authenticated users, which is why it didn't surface.

**The fix — new migration `018_fix_service_context_notification_guards.sql`:**

1. `CREATE OR REPLACE` both `create_member_notification` and `can_send_member_notification` with bodies identical to 014's, except the guard gains a service-context allowance. Detect service context safely (empty/absent claims must not crash the cast):

   ```sql
   v_is_service BOOLEAN := COALESCE(
     NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''
   ) = 'service_role';
   ```

   - `create_member_notification`: allow when `v_is_service`; otherwise keep the existing checks verbatim (non-NULL uid + `is_manager()` + gym scope + target-is-member). Note the target-member existence check should still run in the service path (the cron must not notify cross-gym or non-member ids — keep `p_gym_id`-matches-target validation, just skip the *caller* checks).
   - `can_send_member_notification`: allow when `v_is_service`; otherwise keep self-or-manager-same-gym verbatim.
2. Keep all GRANT/REVOKEs exactly as they are after 014 (no widening).
3. **Validation, not just idempotency:** in your isolated-schema harness, exercise the actual cron path — `SET request.jwt.claims = '{"role":"service_role"}'` (and NULL uid) then call `process_daily_notifications()` against seeded members with an expiring membership and an inactive member; assert notifications rows are created and no exception raises. Also assert the negative cases still raise: anonymous caller, member calling `create_member_notification`, cross-gym manager. Add/extend `tests/integration/notification-rpc-hardening.test.ts` to pin the guard contract shape.
4. Sanity-sweep for the same pattern: confirm no other 014/015/016 guard sits on a service-role call path (check every function the `process_*` family and DB triggers invoke — `record_notification_sent`, `reset_inactivity_nudge_count`, `check_streak_milestone`).

## Conditional — `is_published` correction (ONLY if the product owner has approved)

You correctly withheld the `get_gym_by_code()` visibility fix pending sign-off (016:209, 017:77). **If and only if** the user running you confirms approval, fold into migration 018: `'is_published', v_gym.is_published` replacing the tagline-derived expression (single final CREATE OR REPLACE of `get_gym_by_code` with the 016/017-merged body), and note in the migration comment that unpublished-but-tagline'd gyms will stop being publicly visible. If approval is not explicitly given in your prompt context, do not touch it and say so in your summary.

## Definition of done

`npm run test:ci` green; the service-path validation from step 3 demonstrated in your summary; `AgentsContextKnowledgeBase/ImplementationState.md` row B7 updated and `CHANGELOG.md` extended (1.2.x) — all left uncommitted in the working tree for the developer.
