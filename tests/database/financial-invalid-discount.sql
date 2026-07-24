\set ON_ERROR_STOP on
BEGIN;

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
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(TEXT, TEXT) TO authenticated;

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.promos(
    id, gym_id, name, type, discount_type, discount_value,
    plan_id, valid_from, valid_until, is_active
  ) VALUES (
    'f6100000-0000-0000-0000-000000000001',
    'f1000000-0000-0000-0000-000000000001',
    'Invalid percent', 'custom', 'percent', 100.01,
    'f3000000-0000-0000-0000-000000000001', current_date, current_date + 1, true
  )
$sql$, 'promos_discount_value_valid|check constraint');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.promos(
    id, gym_id, name, type, discount_type, discount_value,
    plan_id, valid_from, valid_until, is_active
  ) VALUES (
    'f6100000-0000-0000-0000-000000000002',
    'f1000000-0000-0000-0000-000000000001',
    'Invalid fixed', 'custom', 'fixed', -0.01,
    'f3000000-0000-0000-0000-000000000001', current_date, current_date + 1, true
  )
$sql$, 'promos_discount_value_valid|check constraint');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.promos(
    id, gym_id, name, type, discount_type, discount_value,
    plan_id, valid_from, valid_until, is_active
  ) VALUES (
    'f6100000-0000-0000-0000-000000000003',
    'f1000000-0000-0000-0000-000000000001',
    'Invalid dates', 'custom', 'fixed', 1,
    'f3000000-0000-0000-0000-000000000001', current_date + 1, current_date, true
  )
$sql$, 'promos_validity_ordered|check constraint');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.financial_transactions(
    gym_id, member_id, kind, source, ledger_amount, gross_amount,
    discount_amount, currency, plan_snapshot, actor_snapshot,
    snapshot_quality, reason, idempotency_key
  ) VALUES (
    'f1000000-0000-0000-0000-000000000001',
    'f2222222-0000-0000-0000-000000000002',
    'adjustment', 'adjustment_rpc', 1, 0, 0, 'PHP',
    '{"id":null,"name":"Cross-gym test"}'::JSONB,
    '{"id":null,"name":"Reconstructed test actor"}'::JSONB,
    'reconstructed', 'Cross-gym tenant test', 'test-cross-gym-ledger-member-0001'
  )
$sql$, 'member must belong to the transaction gym');

INSERT INTO public.gym_user_permission_overrides(
  gym_id, user_id, permission, granted, granted_by
) VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'f1111111-0000-0000-0000-000000000002',
  'payments:discount', false,
  'f1111111-0000-0000-0000-000000000001'
)
ON CONFLICT (gym_id, user_id, permission)
DO UPDATE SET granted = EXCLUDED.granted;

SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'f1111111-0000-0000-0000-000000000004',
    'f3000000-0000-0000-0000-000000000001',
    'cash', 'test-discount-permission-denied-0001',
    'f6000000-0000-0000-0000-000000000001', NULL
  )
$sql$, 'permission denied.*discount|discount.*permission denied');

ROLLBACK;
\echo 'financial-invalid-discount.sql: all assertions passed'
