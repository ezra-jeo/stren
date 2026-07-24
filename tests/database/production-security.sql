\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition BOOLEAN, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_condition, false) THEN
    RAISE EXCEPTION 'assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql TEXT, p_pattern TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* p_pattern THEN
      RAISE EXCEPTION 'expected error matching %, received %', p_pattern, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error matching %, but statement succeeded', p_pattern;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(TEXT, TEXT) TO authenticated;

-- Profile privacy tracer bullet. Base rows are self-only; the intentionally
-- narrow directory is pinned to the caller's active gym and contains no
-- contact or reusable-credential columns.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000004', true);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 0
   FROM public.profiles
   WHERE id IN (
     'aaaaaaaa-0001-0001-0001-000000000001',
     'aaaaaaaa-0001-0001-0001-000000000002',
     'aaaaaaaa-0001-0001-0001-000000000003'
   )),
  'a member cannot select another member or manager private profile row'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1
   FROM public.profiles
   WHERE id = 'aaaaaaaa-0001-0001-0001-000000000004'),
  'an account can still select its own private profile row'
);
SELECT pg_temp.expect_error($sql$
  DELETE FROM public.profiles
  WHERE id = 'aaaaaaaa-0001-0001-0001-000000000004'
$sql$, 'permission denied');
SELECT pg_temp.expect_error('TRUNCATE public.profiles', 'permission denied');
SELECT pg_temp.assert_true(
  (SELECT count(*) = 4 FROM public.get_gym_directory()),
  'the active gym directory remains available to an active member'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM (
      SELECT to_jsonb(d) AS row_json
      FROM public.get_gym_directory() d
      LIMIT 1
    ) sample
    CROSS JOIN LATERAL jsonb_object_keys(sample.row_json) AS key
    WHERE key IN ('email', 'contact_number', 'qr_code', 'active_gym_id')
  ),
  'the shared directory contains no email, contact, QR, or account-scope data'
);
SELECT pg_temp.expect_error(
  'SELECT * FROM public.get_gym_member_directory()',
  'permission denied'
);

-- Every active role receives the same public directory projection, while
-- only roles with the operational members:view permission receive member
-- contact details. The base profile table remains self-only for all roles.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 4 FROM public.get_gym_directory())
  AND (SELECT count(*) = 1 AND bool_and(email = 'member@ironworks.test')
       FROM public.get_gym_member_directory())
  AND NOT EXISTS (
    SELECT 1
    FROM (
      SELECT to_jsonb(d) AS row_json
      FROM public.get_gym_member_directory() d
      LIMIT 1
    ) sample
    CROSS JOIN LATERAL jsonb_object_keys(sample.row_json) AS key
    WHERE key IN ('qr_code', 'active_gym_id', 'role')
  ),
  'owner receives narrow public directory plus authorized member operations data'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000002', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 4 FROM public.get_gym_directory())
  AND (SELECT count(*) = 1 FROM public.get_gym_member_directory()),
  'admin receives the expected directory surfaces'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000003', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 4 FROM public.get_gym_directory())
  AND (SELECT count(*) = 1 FROM public.get_gym_member_directory()),
  'staff receives the expected directory surfaces'
);
SELECT pg_temp.expect_error($sql$
  SELECT public.assign_gym_user_role(
    'aaaaaaaa-0001-0001-0001-000000000003', 'admin', 'attempted self promotion'
  )
$sql$, 'permission denied|yourself|self|authority');

-- Add the member to the second tenant, switch the account scope with the
-- already-issued session, and prove directory data follows only the new
-- active gym. Switching back must not retain the second tenant either.
RESET ROLE;
INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  'aaaaaaaa-0001-0001-0001-000000000004',
  'member', 'active', 'bbbbbbbb-0002-0002-0002-000000000001'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000004', true);
UPDATE public.profiles
SET active_gym_id = '10000000-0000-0000-0000-000000000002'
WHERE id = 'aaaaaaaa-0001-0001-0001-000000000004';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 3 FROM public.get_gym_directory())
  AND NOT EXISTS (
    SELECT 1 FROM public.get_gym_directory()
    WHERE user_id IN (
      'aaaaaaaa-0001-0001-0001-000000000001',
      'aaaaaaaa-0001-0001-0001-000000000002',
      'aaaaaaaa-0001-0001-0001-000000000003'
    )
  ),
  'changing active gym removes stale directory access from the prior gym'
);
UPDATE public.profiles
SET active_gym_id = '10000000-0000-0000-0000-000000000001'
WHERE id = 'aaaaaaaa-0001-0001-0001-000000000004';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 4 FROM public.get_gym_directory())
  AND NOT EXISTS (
    SELECT 1 FROM public.get_gym_directory()
    WHERE user_id IN (
      'bbbbbbbb-0002-0002-0002-000000000001',
      'bbbbbbbb-0002-0002-0002-000000000002'
    )
  ),
  'switching back removes stale directory access from the second gym'
);

-- Role assignment and status administration are separate trusted boundaries.
SELECT pg_temp.expect_error($sql$
  UPDATE public.gym_users
  SET role = 'admin'
  WHERE gym_id = '10000000-0000-0000-0000-000000000001'
    AND user_id = 'aaaaaaaa-0001-0001-0001-000000000004'
$sql$, 'permission denied|trusted role');
SELECT pg_temp.expect_error($sql$
  INSERT INTO public.gym_users(gym_id, user_id, role, status)
  VALUES (
    '10000000-0000-0000-0000-000000000001',
    'bbbbbbbb-0002-0002-0002-000000000002',
    'member', 'active'
  )
$sql$, 'permission denied');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000002', true);
SELECT pg_temp.expect_error($sql$
  SELECT public.assign_gym_user_role(
    'aaaaaaaa-0001-0001-0001-000000000004', 'admin', 'attempted equal authority'
  )
$sql$, 'permission denied|authority');
SELECT pg_temp.expect_error($sql$
  SELECT public.assign_gym_user_role(
    'aaaaaaaa-0001-0001-0001-000000000002', 'owner', 'attempted self promotion'
  )
$sql$, 'permission denied|yourself|self|authority');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT public.assign_gym_user_role(
  'aaaaaaaa-0001-0001-0001-000000000004', 'staff', 'front desk assignment'
);
SELECT pg_temp.assert_true(
  (SELECT role = 'staff'
   FROM public.gym_users
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'
     AND user_id = 'aaaaaaaa-0001-0001-0001-000000000004'),
  'an owner can assign a lower-authority role'
);
SELECT public.assign_gym_user_role(
  'aaaaaaaa-0001-0001-0001-000000000004', 'member', 'restore member role'
);

RESET ROLE;
INSERT INTO public.gym_user_permission_overrides(
  gym_id, user_id, permission, granted, granted_by
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000002',
  'members:view', false,
  'aaaaaaaa-0001-0001-0001-000000000001'
);

-- An admin may administer a member's access status, but not another manager.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000002', true);
SELECT public.set_gym_user_status(
  'aaaaaaaa-0001-0001-0001-000000000004', 'disabled', 'membership access suspended'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT public.set_gym_user_status(
  'aaaaaaaa-0001-0001-0001-000000000004', 'active', 'membership access restored'
);
SELECT public.set_gym_user_status(
  'aaaaaaaa-0001-0001-0001-000000000002', 'disabled', 'administrator access removed'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.gym_user_permission_overrides
    WHERE gym_id = '10000000-0000-0000-0000-000000000001'
      AND user_id = 'aaaaaaaa-0001-0001-0001-000000000002'
  ),
  'status disablement atomically removes stale permission overrides'
);

-- The same JWT immediately loses access because every helper re-reads the
-- active gym-user row; no token refresh is required.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000002', true);
SELECT pg_temp.expect_error('SELECT public.get_my_access()', 'permission denied');
SELECT pg_temp.expect_error('SELECT * FROM public.get_gym_directory()', 'permission denied');

RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT count(*) >= 1
          AND bool_and(actor_snapshot ->> 'name' = 'Avery Admin')
          AND bool_and(NOT actor_snapshot ? 'email')
   FROM public.privileged_audit_events
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'
     AND actor_id = 'aaaaaaaa-0001-0001-0001-000000000002'
     AND action = 'gym_user.status_changed'),
  'audit attribution snapshots survive actor disablement'
);

-- Attendance tenant consistency is a physical key, not only an RLS
-- convention. Even a database-owner insert cannot pair Gym A with Gym B's
-- member, and the partial unique index permits at most one open session.
SELECT pg_temp.expect_error($sql$
  INSERT INTO public.attendance(id, gym_id, member_id, check_in, source)
  VALUES (
    '91000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'bbbbbbbb-0002-0002-0002-000000000002',
    now(), 'manual_override'
  )
$sql$, 'foreign key|attendance_gym_member');

INSERT INTO public.attendance(id, gym_id, member_id, check_in, source)
VALUES (
  '91000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000004',
  now(), 'manual_override'
);
SELECT pg_temp.expect_error($sql$
  INSERT INTO public.attendance(id, gym_id, member_id, check_in, source)
  VALUES (
    '91000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000004',
    now(), 'manual_override'
  )
$sql$, 'duplicate key|attendance_one_open');
DELETE FROM public.attendance WHERE id = '91000000-0000-0000-0000-000000000002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0
   FROM public.attendance
   WHERE gym_id = '10000000-0000-0000-0000-000000000002'),
  'a Gym A manager cannot read or count Gym B attendance'
);
SELECT pg_temp.expect_error($sql$
  INSERT INTO public.attendance(gym_id, member_id, check_in)
  VALUES (
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000004', now()
  )
$sql$, 'permission denied|trusted');
SELECT pg_temp.expect_error($sql$
  UPDATE public.attendance SET check_out = now()
  WHERE id = '40000000-0000-0000-0000-000000000002'
$sql$, 'permission denied|trusted');
SELECT pg_temp.expect_error($sql$
  DELETE FROM public.attendance
  WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, 'permission denied|trusted');
SELECT pg_temp.expect_error('TRUNCATE public.attendance', 'permission denied');
SELECT pg_temp.expect_error(
  $$SELECT public.kiosk_get_occupancy('10000000-0000-0000-0000-000000000002')$$,
  'permission denied'
);
SELECT pg_temp.expect_error($sql$
  SELECT public.record_attendance_override(
    'bbbbbbbb-0002-0002-0002-000000000002',
    now() - interval '2 hours', now() - interval '1 hour',
    'cross-gym override attempt'
  )
$sql$, 'member not found|current gym|permission denied');

SELECT public.record_attendance_override(
  'aaaaaaaa-0001-0001-0001-000000000004',
  now() - interval '4 hours', now() - interval '3 hours',
  'paper register correction'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1
          AND bool_and(recorded_by = 'aaaaaaaa-0001-0001-0001-000000000001')
          AND bool_and(source = 'manual_override')
   FROM public.attendance
   WHERE correction_reason = 'paper register correction'),
  'manual attendance overrides retain actor and reason attribution'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1
   FROM public.privileged_audit_events
   WHERE action = 'attendance.override_recorded'
     AND target_type = 'attendance'
     AND reason = 'paper register correction'),
  'manual attendance overrides append privileged audit evidence'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000004', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0
   FROM public.attendance
   WHERE member_id <> 'aaaaaaaa-0001-0001-0001-000000000004')
  AND (SELECT count(*) = 0
       FROM public.financial_transactions
       WHERE member_id <> 'aaaaaaaa-0001-0001-0001-000000000004'),
  'a member cannot read another member payment or attendance data'
);

-- Verification uses an explicit state machine. Give the no-gym fixture
-- historical billing evidence so the old function would have reactivated it.
RESET ROLE;
INSERT INTO public.memberships(
  id, member_id, plan_id, start_date, end_date, status,
  payment_method, amount_paid, gym_id, created_by
) VALUES (
  '92000000-0000-0000-0000-000000000001',
  'cccccccc-0003-0003-0003-000000000001',
  '30000000-0000-0000-0000-000000000001',
  current_date - 30, current_date - 1, 'expired',
  'cash', 800, '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0003-0003-0003-000000000001', true);
SELECT public.verify_gym_membership('10000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_true(
  (SELECT status = 'approved'
   FROM public.gym_membership_verifications
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'
     AND user_id = 'cccccccc-0003-0003-0003-000000000001'),
  'a first deterministic historical match records an approved verification'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT public.set_gym_user_status(
  'cccccccc-0003-0003-0003-000000000001', 'disabled',
  'temporary administrative suspension'
);
SELECT public.set_gym_user_status(
  'cccccccc-0003-0003-0003-000000000001', 'active',
  'approved member access restored'
);
RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT status = 'approved'
   FROM public.gym_membership_verifications
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'
     AND user_id = 'cccccccc-0003-0003-0003-000000000001')
  AND (SELECT active_gym_id = '10000000-0000-0000-0000-000000000001'
       FROM public.profiles
       WHERE id = 'cccccccc-0003-0003-0003-000000000001'),
  'administrative suspension preserves approved verification and restores scope explicitly'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT public.decide_membership_verification(
  'cccccccc-0003-0003-0003-000000000001', 'rejected',
  'member record belongs to another person'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0003-0003-0003-000000000001', true);
SELECT public.verify_gym_membership('10000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_true(
  (SELECT status = 'rejected'
   FROM public.gym_membership_verifications
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'
     AND user_id = 'cccccccc-0003-0003-0003-000000000001')
  AND (SELECT status = 'rejected'
       FROM public.gym_users
       WHERE gym_id = '10000000-0000-0000-0000-000000000001'
         AND user_id = 'cccccccc-0003-0003-0003-000000000001'),
  'a rejected verification cannot self-reactivate from historical evidence'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT pg_temp.expect_error($sql$
  SELECT public.set_gym_user_status(
    'cccccccc-0003-0003-0003-000000000001', 'active',
    'attempted generic terminal-state reopening'
  )
$sql$, 'explicit verification decision');
SELECT public.decide_membership_verification(
  'cccccccc-0003-0003-0003-000000000001', 'pending',
  'authorized re-review requested'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0003-0003-0003-000000000001', true);
SELECT public.withdraw_membership_verification('10000000-0000-0000-0000-000000000001');
SELECT public.verify_gym_membership('10000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_true(
  (SELECT status = 'withdrawn'
   FROM public.gym_membership_verifications
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'
     AND user_id = 'cccccccc-0003-0003-0003-000000000001'),
  'a withdrawn verification cannot self-reactivate'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT public.decide_membership_verification(
  'cccccccc-0003-0003-0003-000000000001', 'expired',
  'verification evidence is no longer current'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0003-0003-0003-000000000001', true);
SELECT public.verify_gym_membership('10000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_true(
  (SELECT status = 'expired'
   FROM public.gym_membership_verifications
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'
     AND user_id = 'cccccccc-0003-0003-0003-000000000001'),
  'an expired verification cannot self-reactivate'
);
SELECT pg_temp.expect_error($sql$
  UPDATE public.gym_membership_verifications SET status = 'approved'
  WHERE gym_id = '10000000-0000-0000-0000-000000000001'
$sql$, 'permission denied');

RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT count(*) >= 4
   FROM public.privileged_audit_events
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'
     AND target_id = 'cccccccc-0003-0003-0003-000000000001'
     AND action LIKE 'membership_verification.%'),
  'verification transitions append immutable decision evidence'
);

-- Terminal access is not implicitly reactivated by paid onboarding, and an
-- invalid preflight cannot leave even a workflow row behind.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT pg_temp.expect_error($sql$
  SELECT public.preflight_member_onboarding(
    'orphan@nogym.test',
    '30000000-0000-0000-0000-000000000001',
    'cash', '94000000-0000-0000-0000-000000000001', NULL
  )
$sql$, 'explicit authorized decision');
SELECT pg_temp.expect_error($sql$
  SELECT public.preflight_member_onboarding(
    'preflight-failure@test.invalid',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'cash', '94000000-0000-0000-0000-000000000002', NULL
  )
$sql$, 'plan is invalid');
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.member_onboarding_workflows
    WHERE idempotency_key IN (
      '94000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000002'
    )
  ),
  'terminal-affiliation and business-input preflight failures leave no workflow'
);

-- Account and profile are external stages. Their database-owned failure
-- records remain resumable and idempotent without granting gym access.
SELECT (public.preflight_member_onboarding(
  'account-failure@test.invalid',
  '30000000-0000-0000-0000-000000000001',
  'cash', '94000000-0000-0000-0000-000000000003', NULL
) ->> 'workflow_id') AS workflow_id \gset account_failure_
SELECT public.mark_member_onboarding_failure(
  :'account_failure_workflow_id'::UUID, 'account', 'account_resolution_failed'
);
SELECT (public.preflight_member_onboarding(
  'profile-failure@test.invalid',
  '30000000-0000-0000-0000-000000000001',
  'cash', '94000000-0000-0000-0000-000000000004', NULL
) ->> 'workflow_id') AS workflow_id \gset profile_failure_
SELECT public.mark_member_onboarding_failure(
  :'profile_failure_workflow_id'::UUID, 'profile', 'profile_creation_failed'
);
SELECT pg_temp.assert_true(
  (SELECT status = 'failed' AND failure_stage = 'account'
   FROM public.member_onboarding_workflows
   WHERE id = :'account_failure_workflow_id'::UUID)
  AND (SELECT status = 'failed' AND failure_stage = 'profile'
       FROM public.member_onboarding_workflows
       WHERE id = :'profile_failure_workflow_id'::UUID)
  AND NOT EXISTS (
    SELECT 1 FROM public.gym_users gu
    JOIN public.profiles p ON p.id = gu.user_id
    WHERE gu.gym_id = '10000000-0000-0000-0000-000000000001'
      AND p.email IN ('account-failure@test.invalid', 'profile-failure@test.invalid')
  ),
  'account and profile failures preserve resumable state without active access'
);
SELECT pg_temp.assert_true(
  (public.preflight_member_onboarding(
    'account-failure@test.invalid',
    '30000000-0000-0000-0000-000000000001',
    'cash', '94000000-0000-0000-0000-000000000003', NULL
  ) ->> 'workflow_id')::UUID = :'account_failure_workflow_id'::UUID,
  'an account-stage retry resumes the original workflow'
);

-- Resumable onboarding fixture: this account already has a global profile.
-- Gym-entered data must never overwrite that identity.
RESET ROLE;
INSERT INTO auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'dddddddd-0004-0004-0004-000000000001',
  'authenticated', 'authenticated', 'onboarding-existing@test.invalid',
  crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Existing Global Name"}', now(), now(), '', '', '', ''
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT (public.preflight_member_onboarding(
  'onboarding-existing@test.invalid',
  '30000000-0000-0000-0000-000000000001',
  'cash',
  '93000000-0000-0000-0000-000000000001',
  NULL
) ->> 'workflow_id') AS workflow_id \gset onboarding_

RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.inject_onboarding_payment_failure()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.idempotency_key = '93000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'injected onboarding payment failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_test_onboarding_payment_failure
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_onboarding_payment_failure();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT pg_temp.expect_error(format(
  'SELECT public.complete_member_onboarding(%L, %L)',
  :'onboarding_workflow_id', 'dddddddd-0004-0004-0004-000000000001'
), 'injected onboarding payment failure');
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.gym_users
    WHERE gym_id = '10000000-0000-0000-0000-000000000001'
      AND user_id = 'dddddddd-0004-0004-0004-000000000001'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_transactions
    WHERE idempotency_key = '93000000-0000-0000-0000-000000000001'
  ),
  'payment failure rolls back gym access and money together'
);
SELECT public.mark_member_onboarding_failure(
  :'onboarding_workflow_id'::UUID, 'payment', 'payment_failed'
);

RESET ROLE;
DROP TRIGGER zz_test_onboarding_payment_failure ON public.financial_transactions;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT public.complete_member_onboarding(
  :'onboarding_workflow_id'::UUID,
  'dddddddd-0004-0004-0004-000000000001'
);
SELECT public.complete_member_onboarding(
  :'onboarding_workflow_id'::UUID,
  'dddddddd-0004-0004-0004-000000000001'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.gym_users
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'
     AND user_id = 'dddddddd-0004-0004-0004-000000000001'
     AND role = 'member' AND status = 'active')
  AND (SELECT count(*) = 1 FROM public.financial_transactions
       WHERE idempotency_key = '93000000-0000-0000-0000-000000000001')
  AND (SELECT count(*) = 1 FROM public.memberships m
       JOIN public.financial_transactions ft ON ft.membership_id = m.id
       WHERE ft.idempotency_key = '93000000-0000-0000-0000-000000000001'),
  'onboarding retry creates one gym user, membership, and payment'
);
RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT name = 'Existing Global Name'
   FROM public.profiles
   WHERE id = 'dddddddd-0004-0004-0004-000000000001'),
  'gym onboarding never overwrites an existing global profile'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1 FROM public.privileged_audit_events
    WHERE action = 'membership.insert'
      AND target_type = 'membership'
      AND gym_id = '10000000-0000-0000-0000-000000000001'
  )
  AND EXISTS (
    SELECT 1 FROM public.privileged_audit_events
    WHERE action = 'membership_plan.insert'
      AND target_type = 'membership_plan'
      AND gym_id = '10000000-0000-0000-0000-000000000001'
  ),
  'plan and membership changes share the privileged audit contract'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT public.record_member_onboarding_delivery(
  :'onboarding_workflow_id'::UUID, 'failed', 'email_delivery_failed'
);
SELECT pg_temp.assert_true(
  (SELECT status = 'delivery_failed'
   FROM public.member_onboarding_workflows
   WHERE id = :'onboarding_workflow_id'::UUID),
  'external email failure is represented truthfully without undoing access'
);
SELECT public.record_member_onboarding_delivery(
  :'onboarding_workflow_id'::UUID, 'sent', NULL
);
SELECT pg_temp.assert_true(
  (SELECT status = 'delivered'
   FROM public.member_onboarding_workflows
   WHERE id = :'onboarding_workflow_id'::UUID)
  AND (SELECT count(*) = 1 FROM public.financial_transactions
       WHERE idempotency_key = '93000000-0000-0000-0000-000000000001'),
  'delivery retry does not duplicate membership or payment state'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('member_onboarding_events', 'member_onboarding_workflows')
      AND column_name ~* 'magic|token|otp|qr|credential|link'
  ),
  'onboarding persistence has no credential-bearing columns'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) >= 1
          AND bool_and(to_jsonb(e)::TEXT !~* 'https?://|token|otp|magic|qr_code')
   FROM public.member_onboarding_events e
   WHERE workflow_id = :'onboarding_workflow_id'::UUID),
  'onboarding events contain delivery truth but no reusable credential'
);
SELECT pg_temp.expect_error($sql$
  INSERT INTO public.member_onboarding_events(
    member_id, gym_id, created_by, email, sent_via
  ) VALUES (
    'dddddddd-0004-0004-0004-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'onboarding-existing@test.invalid', 'preview'
  )
$sql$, 'permission denied');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0002-0002-0002-000000000001', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0
   FROM public.privileged_audit_events
   WHERE gym_id = '10000000-0000-0000-0000-000000000001'),
  'privileged audit events are tenant isolated'
);
SELECT pg_temp.expect_error($sql$
  UPDATE public.privileged_audit_events SET reason = 'rewrite'
$sql$, 'permission denied|immutable');

RESET ROLE;
ROLLBACK;

\echo 'production-security.sql: all production security assertions passed'
