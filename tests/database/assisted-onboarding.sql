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

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(BOOLEAN, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(TEXT, TEXT) TO anon, authenticated, service_role;

-- Tracer bullet: the Phase 1 provisioning boundary must exist on the
-- migration-028 baseline before any application route can depend on it.
SELECT pg_temp.assert_true(
  to_regprocedure('public.provision_gym_workspace(jsonb,text,uuid,text)') IS NOT NULL,
  'migration 029 must install the platform provisioning RPC'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.expect_error($sql$
  SELECT public.record_platform_provisioning_auth_state(
    '90000000-0000-0000-0000-000000000000',
    encode(extensions.digest('anonymous-intent', 'sha256'), 'hex'),
    'auth_ready', '{}'::JSONB
  )
$sql$, 'permission denied|platform admin');

-- Every ordinary account and the service-role database context are denied;
-- only a user-bound JWT with the server-controlled platform claim may proceed.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'aaaaaaaa-0001-0001-0001-000000000004',
  'email', 'member@ironworks.test', 'role', 'authenticated'
)::TEXT, true);
SELECT pg_temp.expect_error($sql$
  SELECT public.record_platform_provisioning_auth_state(
    '90000000-0000-0000-0000-000000000001',
    encode(extensions.digest('same-intent', 'sha256'), 'hex'),
    'auth_ready', '{"ownerUserId":"aaaaaaaa-0001-0001-0001-000000000001"}'::JSONB
  )
$sql$, 'platform admin|permission denied');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0001-0001-0001-000000000003","email":"staff@ironworks.test","role":"authenticated"}', true);
SELECT pg_temp.expect_error($sql$
  SELECT public.record_platform_provisioning_auth_state(
    '90000000-0000-0000-0000-000000000003',
    encode(extensions.digest('staff-intent', 'sha256'), 'hex'),
    'auth_ready', '{}'::JSONB
  )
$sql$, 'platform admin|permission denied');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0001-0001-0001-000000000002","email":"admin@ironworks.test","role":"authenticated"}', true);
SELECT pg_temp.expect_error($sql$
  SELECT public.record_platform_provisioning_auth_state(
    '90000000-0000-0000-0000-000000000004',
    encode(extensions.digest('admin-intent', 'sha256'), 'hex'),
    'auth_ready', '{}'::JSONB
  )
$sql$, 'platform admin|permission denied');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0001-0001-0001-000000000001","email":"owner@ironworks.test","role":"authenticated"}', true);
SELECT pg_temp.expect_error($sql$
  SELECT public.record_platform_provisioning_auth_state(
    '90000000-0000-0000-0000-000000000005',
    encode(extensions.digest('owner-intent', 'sha256'), 'hex'),
    'auth_ready', '{}'::JSONB
  )
$sql$, 'platform admin|permission denied');

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'cccccccc-0003-0003-0003-000000000001',
  'email', 'orphan@nogym.test', 'role', 'service_role'
)::TEXT, true);
SELECT pg_temp.expect_error($sql$
  SELECT public.provision_gym_workspace(
    '{"gymName":"Denied Gym","slug":"denied-gym","owner":{"userId":"aaaaaaaa-0001-0001-0001-000000000001","email":"owner@ironworks.test","name":"Alex Owner","role":"owner","consentMethod":"email"},"plans":[{"name":"Monthly","price":"80.00","durationDays":30}]}'::JSONB,
    repeat('a', 64),
    '90000000-0000-0000-0000-000000000002',
    encode(extensions.digest('service-intent', 'sha256'), 'hex')
  )
$sql$, 'platform admin|permission denied');

-- A platform claim is carried by the user-bound request, not by the service
-- client. The operator has no gym affiliation and still provisions privately.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'cccccccc-0003-0003-0003-000000000001',
  'email', 'orphan@nogym.test', 'role', 'authenticated',
  'app_metadata', jsonb_build_object('platform_role', 'platform_admin')
)::TEXT, true);

SELECT public.record_platform_provisioning_auth_state(
  '90000000-0000-0000-0000-000000000001',
  encode(extensions.digest('same-intent', 'sha256'), 'hex'),
  'auth_ready',
  jsonb_build_object('ownerUserId', 'aaaaaaaa-0001-0001-0001-000000000001')
);

SELECT pg_temp.expect_error($sql$
  SELECT public.record_platform_provisioning_auth_state(
    '90000000-0000-0000-0000-000000000007',
    encode(extensions.digest('credential-intent', 'sha256'), 'hex'),
    'auth_ready',
    '{"ownerUserId":"aaaaaaaa-0001-0001-0001-000000000001","token":"raw"}'::JSONB
  )
$sql$, 'raw claim credentials');

SELECT pg_temp.expect_error($sql$
  SELECT public.provision_gym_workspace(
    '{"gymName":"Unsafe Switch Gym","slug":"unsafe-switch-gym","owner":{"userId":"aaaaaaaa-0001-0001-0001-000000000001","email":"owner@ironworks.test","name":"Alex Owner","role":"owner","consentMethod":"email"},"plans":[{"name":"Monthly","price":"80.00","durationDays":30}],"featureFlags":{"auto_approve_joins":true}}'::JSONB,
    repeat('c', 64),
    '90000000-0000-0000-0000-000000000006',
    encode(extensions.digest('unsafe-intent', 'sha256'), 'hex')
  )
$sql$, 'unsupported or invalid onboarding feature flag');

SELECT
  (public.provision_gym_workspace(
    jsonb_build_object(
      'gymName', 'Phase One Gym',
      'slug', 'phase-one-gym',
      'address', 'Manila',
      'branchName', 'Main Branch',
      'isPublished', false,
      'owner', jsonb_build_object(
        'userId', 'aaaaaaaa-0001-0001-0001-000000000001',
        'email', 'owner@ironworks.test',
        'name', 'Alex Owner',
        'role', 'owner',
        'consentMethod', 'email'
      ),
      'staff', jsonb_build_array(jsonb_build_object(
        'userId', 'aaaaaaaa-0001-0001-0001-000000000003', 'role', 'staff'
      )),
      'plans', jsonb_build_array(jsonb_build_object(
        'name', 'Monthly', 'price', '80.00', 'durationDays', 30
      )),
      'featureFlags', jsonb_build_object(
        'kiosk_checkin', true, 'staff_manual_checkin', true, 'occupancy_count', true
      ),
      'importedMembers', jsonb_build_array(jsonb_build_object(
        'userId', 'bbbbbbbb-0002-0002-0002-000000000002'
      ))
    ),
    repeat('a', 64),
    '90000000-0000-0000-0000-000000000001',
    encode(extensions.digest('same-intent', 'sha256'), 'hex')
  ) ? 'claimLink') IS FALSE
  AND (public.provision_gym_workspace(
    jsonb_build_object(
      'gymName', 'Phase One Gym', 'slug', 'phase-one-gym',
      'owner', jsonb_build_object(
        'userId', 'aaaaaaaa-0001-0001-0001-000000000001',
        'email', 'owner@ironworks.test', 'name', 'Alex Owner',
        'role', 'owner', 'consentMethod', 'email'
      ),
      'plans', jsonb_build_array(jsonb_build_object(
        'name', 'Monthly', 'price', '80.00', 'durationDays', 30
      ))
    ),
    repeat('a', 64),
    '90000000-0000-0000-0000-000000000001',
    encode(extensions.digest('same-intent', 'sha256'), 'hex')
  ) ->> 'gymCode') = 'phase-one-gym';

RESET ROLE;
SET LOCAL ROLE postgres;

SELECT pg_temp.expect_error($sql$
  SELECT public.provision_gym_workspace(
    '{"gymName":"Phase One Gym","slug":"phase-one-gym","owner":{"userId":"aaaaaaaa-0001-0001-0001-000000000001","email":"owner@ironworks.test","name":"Alex Owner","role":"owner","consentMethod":"email"},"plans":[{"name":"Different","price":"90.00","durationDays":30}]}'::JSONB,
    repeat('b', 64),
    '90000000-0000-0000-0000-000000000001',
    encode(extensions.digest('different-intent', 'sha256'), 'hex')
  )
$sql$, 'different request|idempotency');

SELECT pg_temp.assert_true(
  (SELECT is_published = false AND branch_name = 'Main Branch'
   FROM public.gyms WHERE code = 'phase-one-gym')
  AND (SELECT role = 'owner' AND status = 'pending'
       FROM public.gym_users gu JOIN public.gyms g ON g.id = gu.gym_id
       WHERE g.code = 'phase-one-gym'
         AND gu.user_id = 'aaaaaaaa-0001-0001-0001-000000000001')
  AND (SELECT status = 'approved'
       FROM public.gym_membership_verifications v JOIN public.gyms g ON g.id = v.gym_id
       WHERE g.code = 'phase-one-gym'
         AND v.user_id = 'bbbbbbbb-0002-0002-0002-000000000002')
  AND (SELECT count(*) = 0 FROM public.memberships m
       JOIN public.gyms g ON g.id = m.gym_id WHERE g.code = 'phase-one-gym')
  AND (SELECT count(*) = 0 FROM public.financial_transactions f
       JOIN public.gyms g ON g.id = f.gym_id WHERE g.code = 'phase-one-gym')
  AND (SELECT count(*) = 1 FROM public.privileged_audit_events a
       JOIN public.gyms g ON g.id = a.gym_id
       WHERE g.code = 'phase-one-gym' AND a.action = 'platform.gym_provisioned'),
  'provisioning is private, owner-safe, verification-consistent, money-free, and audited'
);

RESET ROLE;
SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'cccccccc-0003-0003-0003-000000000001',
  'email', 'orphan@nogym.test', 'role', 'authenticated',
  'app_metadata', jsonb_build_object('platform_role', 'platform_admin')
)::TEXT, true);
SELECT pg_temp.assert_true(
  (public.mark_claim_invite_delivery(
    (SELECT id FROM public.gyms WHERE code = 'phase-one-gym'), repeat('a', 64), 'sent'
  ) ->> 'deliveryStatus') = 'sent',
  'platform delivery update returns truthful state without returning token material'
);
SELECT pg_temp.assert_true(
  NOT (public.mark_claim_invite_delivery(
    (SELECT id FROM public.gyms WHERE code = 'phase-one-gym'), repeat('a', 64), 'sent'
  ) ? 'token'),
  'delivery response contains no token'
);

SELECT public.supersede_claim_invite(
  (SELECT id FROM public.gyms WHERE code = 'phase-one-gym'),
  repeat('b', 64),
  now() + interval '23 hours'
);
SELECT pg_temp.assert_true(
  (public.get_claim_invite_preview(repeat('a', 64)) ->> 'state') = 'superseded',
  'resend supersedes the previous claim invite'
);

-- Resend metadata is a user-bound, operator-only read. It returns delivery
-- state but never the token hash or any raw claim credential.
SELECT pg_temp.assert_true(
  (public.get_platform_claim_invite(
    (SELECT id FROM public.gyms WHERE code = 'phase-one-gym')
  ) ? 'deliveryStatus')
  AND NOT (public.get_platform_claim_invite(
    (SELECT id FROM public.gyms WHERE code = 'phase-one-gym')
  ) ? 'token_hash')
  AND NOT (public.get_platform_claim_invite(
    (SELECT id FROM public.gyms WHERE code = 'phase-one-gym')
  ) ? 'token'),
  'platform claim invite metadata is scoped and token-free'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0001-0001-0001-000000000001","email":"owner@ironworks.test","role":"authenticated"}', true);
SELECT pg_temp.expect_error($$
  SELECT public.get_platform_claim_invite(
    (SELECT id FROM public.gyms WHERE code = 'phase-one-gym')
  )
$$, 'platform admin|permission denied');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'cccccccc-0003-0003-0003-000000000001',
  'email', 'orphan@nogym.test', 'role', 'authenticated',
  'app_metadata', jsonb_build_object('platform_role', 'platform_admin')
)::TEXT, true);
SELECT pg_temp.assert_true(
  (public.get_platform_account_resolution('owner@ironworks.test') ->> 'exists')::BOOLEAN
  AND (public.get_platform_account_resolution('owner@ironworks.test') ->> 'ownsOrManagesGymCount')::INTEGER >= 1
  AND NOT (public.get_platform_account_resolution('owner@ironworks.test') ? 'token_hash'),
  'account resolution is resumable and token-free'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0002-0002-0002-000000000002","email":"member@pulsefit.test","role":"authenticated"}', true);
SELECT pg_temp.expect_error(
  $$SELECT public.claim_gym_ownership(repeat('b', 64))$$,
  'different email'
);
SELECT pg_temp.expect_error(
  $$SELECT public.claim_gym_ownership(repeat('c', 64))$$,
  'invite not found'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"sub":"cccccccc-0003-0003-0003-000000000001","email":"orphan@nogym.test","role":"service_role"}', true);
UPDATE public.gym_claim_invites
SET expires_at = now() - interval '1 minute'
WHERE token_hash = repeat('b', 64);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  (public.get_claim_invite_preview(repeat('b', 64)) ->> 'state') = 'expired',
  'stale claim invite is visibly expired'
);

RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.gym_claim_invites
SET expires_at = now() + interval '23 hours'
WHERE token_hash = repeat('b', 64);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0001-0001-0001-000000000001","email":"owner@ironworks.test","role":"authenticated"}', true);
SELECT pg_temp.assert_true(
  (public.claim_gym_ownership(repeat('b', 64)) ->> 'gymCode') = 'phase-one-gym',
  'the designated owner can claim with the correct signed-in email'
);
SELECT pg_temp.expect_error(
  $$SELECT public.claim_gym_ownership(repeat('b', 64))$$,
  'already used|invite'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"sub":"cccccccc-0003-0003-0003-000000000001","email":"orphan@nogym.test","role":"service_role"}', true);
SELECT pg_temp.expect_error($sql$
  UPDATE public.privileged_audit_events
  SET reason = 'tampered'
  WHERE action = 'platform.gym_provisioned'
$sql$, 'immutable');
SELECT pg_temp.expect_error($sql$
  DELETE FROM public.privileged_audit_events
  WHERE action = 'platform.gym_provisioned'
$sql$, 'immutable');

RESET ROLE;
SET LOCAL ROLE postgres;

SELECT pg_temp.assert_true(
  pg_get_functiondef(to_regprocedure('public.join_gym(uuid)'))
    ~* 'verify_gym_membership'
  AND pg_get_functiondef(to_regprocedure('public.kiosk_checkin(text,uuid)'))
    ~* 'has_member_portal_entitlement',
  'join remains the verification alias and kiosk keeps the effective-membership gate'
);

ROLLBACK;
