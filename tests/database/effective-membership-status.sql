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
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(BOOLEAN, TEXT) TO authenticated;

CREATE TEMP TABLE status_fixture(key TEXT PRIMARY KEY, user_id UUID NOT NULL);
GRANT SELECT ON status_fixture TO authenticated;
INSERT INTO status_fixture(key, user_id)
SELECT key, gen_random_uuid()
FROM unnest(ARRAY[
  'rejected', 'disabled', 'banned', 'frozen',
  'cancelled', 'expired', 'historical_cancel'
]) AS key;

INSERT INTO auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated', 'authenticated',
  key || '-' || user_id::TEXT || '@status.test.invalid',
  crypt('fixture-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::JSONB,
  jsonb_build_object('name', initcap(replace(key, '_', ' '))),
  now(), now(), '', '', '', ''
FROM status_fixture;

INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
SELECT
  '10000000-0000-0000-0000-000000000001',
  user_id,
  'member',
  CASE key
    WHEN 'rejected' THEN 'rejected'::public.profile_status
    WHEN 'disabled' THEN 'disabled'::public.profile_status
    WHEN 'banned' THEN 'banned'::public.profile_status
    ELSE 'active'::public.profile_status
  END,
  'aaaaaaaa-0001-0001-0001-000000000001'
FROM status_fixture;

INSERT INTO public.memberships(
  member_id, plan_id, start_date, end_date, status,
  payment_method, amount_paid, gym_id, created_by,
  cancelled_at, cancelled_reason
)
SELECT
  user_id,
  '30000000-0000-0000-0000-000000000001',
  current_date - 5,
  current_date + 5,
  CASE WHEN key = 'frozen'
    THEN 'frozen'::public.membership_status
    ELSE 'active'::public.membership_status
  END,
  'cash', 1,
  '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000001',
  CASE WHEN key = 'cancelled' THEN now() ELSE NULL END,
  CASE WHEN key = 'cancelled' THEN 'Status fixture cancellation' ELSE NULL END
FROM status_fixture
WHERE key IN ('rejected', 'disabled', 'banned', 'frozen', 'cancelled');

INSERT INTO public.memberships(
  member_id, plan_id, start_date, end_date, status,
  payment_method, amount_paid, gym_id, created_by
)
SELECT
  user_id,
  '30000000-0000-0000-0000-000000000001',
  current_date - 30,
  current_date - 1,
  'expired', 'cash', 1,
  '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000001'
FROM status_fixture
WHERE key = 'expired';

INSERT INTO public.memberships(
  member_id, plan_id, start_date, end_date, status,
  payment_method, amount_paid, gym_id, created_by,
  cancelled_at, cancelled_reason
)
SELECT
  user_id,
  '30000000-0000-0000-0000-000000000001',
  current_date - 90,
  current_date - 61,
  'expired', 'cash', 1,
  '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000001',
  now(), 'Historical cancellation fixture'
FROM status_fixture
WHERE key = 'historical_cancel';

INSERT INTO public.memberships(
  member_id, plan_id, start_date, end_date, status,
  payment_method, amount_paid, gym_id, created_by
)
SELECT
  user_id,
  '30000000-0000-0000-0000-000000000001',
  current_date - 30,
  current_date - 1,
  'expired', 'cash', 1,
  '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000001'
FROM status_fixture
WHERE key = 'historical_cancel';

SELECT pg_temp.assert_true(
  public.effective_membership_status(
    (SELECT user_id FROM status_fixture WHERE key = 'historical_cancel'),
    '10000000-0000-0000-0000-000000000001'
  ) = 'expired',
  'a historical cancellation does not suppress a later expired paid period'
);

SELECT pg_temp.assert_true(
  public.effective_membership_status(
    (SELECT user_id FROM status_fixture WHERE key = 'cancelled'),
    '10000000-0000-0000-0000-000000000001'
  ) = 'cancelled',
  'a current cancelled period is classified as cancelled'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);

SELECT pg_temp.assert_true(
  (public.admin_dashboard_stats() ->> 'rejected_plans')::INTEGER = 1
  AND (public.admin_dashboard_stats() ->> 'disabled_plans')::INTEGER = 1
  AND (public.admin_dashboard_stats() ->> 'banned_plans')::INTEGER = 1
  AND (public.admin_dashboard_stats() ->> 'frozen_plans')::INTEGER = 1
  AND (public.admin_dashboard_stats() ->> 'cancelled_plans')::INTEGER = 1
  AND (public.admin_dashboard_stats() ->> 'expired_plans')::INTEGER = 2,
  'dashboard uses the canonical effective membership status buckets'
);

SELECT pg_temp.assert_true(
  (public.admin_reports_data(14) ->> 'rejected_count')::INTEGER = 1
  AND (public.admin_reports_data(14) ->> 'disabled_count')::INTEGER = 1
  AND (public.admin_reports_data(14) ->> 'banned_count')::INTEGER = 1
  AND (public.admin_reports_data(14) ->> 'frozen_count')::INTEGER = 1
  AND (public.admin_reports_data(14) ->> 'cancelled_count')::INTEGER = 1
  AND (public.admin_reports_data(14) ->> 'expired_count')::INTEGER = 2,
  'reports use the same canonical effective membership status buckets'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM status_fixture fixture
    WHERE public.has_member_portal_entitlement(
      fixture.user_id,
      '10000000-0000-0000-0000-000000000001'
    )
  ),
  'rejected, disabled, banned, frozen, cancelled, and expired fixtures have no access'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.admin_membership_status_export() exported
    JOIN status_fixture fixture ON fixture.user_id = exported.member_id
    WHERE exported.effective_status IS DISTINCT FROM CASE fixture.key
      WHEN 'historical_cancel' THEN 'expired'
      ELSE fixture.key
    END
  ),
  'member export uses the same PostgreSQL-owned effective status contract'
);

ROLLBACK;
\echo 'effective-membership-status.sql: all assertions passed'
