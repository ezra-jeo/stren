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

GRANT EXECUTE ON FUNCTION pg_temp.expect_error(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(BOOLEAN, TEXT) TO authenticated;

INSERT INTO public.payments(
  gym_id, member_id, amount, method, description, recorded_by
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000004',
  1, 'cash', 'closure historical payment fixture',
  'aaaaaaaa-0001-0001-0001-000000000001'
);

CREATE OR REPLACE FUNCTION pg_temp.assert_authenticated_finance_read_only(p_actor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_actor_id::TEXT, true);
  PERFORM pg_temp.expect_error($sql$
    INSERT INTO public.payments(
      gym_id, member_id, amount, method, description, recorded_by
    ) VALUES (
      '10000000-0000-0000-0000-000000000001',
      'aaaaaaaa-0001-0001-0001-000000000004',
      1, 'cash', 'forbidden legacy write',
      'aaaaaaaa-0001-0001-0001-000000000001'
    )
  $sql$, 'permission denied');
  PERFORM pg_temp.expect_error($sql$
    UPDATE public.payments
    SET amount = 2
    WHERE description = 'closure historical payment fixture'
  $sql$, 'permission denied');
  PERFORM pg_temp.expect_error($sql$
    DELETE FROM public.payments
    WHERE description = 'closure historical payment fixture'
  $sql$, 'permission denied');
  PERFORM pg_temp.expect_error($sql$
    INSERT INTO public.financial_transactions(
      gym_id, member_id, kind, source, ledger_amount,
      gross_amount, discount_amount, currency, plan_snapshot,
      actor_snapshot, snapshot_quality, reason, idempotency_key
    ) VALUES (
      '10000000-0000-0000-0000-000000000001',
      'aaaaaaaa-0001-0001-0001-000000000004',
      'adjustment', 'adjustment_rpc', 1, 0, 0, 'PHP',
      '{"id":null,"name":"Forbidden"}'::JSONB,
      '{"id":null,"name":"Forbidden"}'::JSONB,
      'reconstructed', 'Forbidden direct ledger write',
      'closure-forbidden-ledger-0001'
    )
  $sql$, 'permission denied');
  PERFORM pg_temp.expect_error($sql$
    UPDATE public.financial_transactions SET reason = 'Forbidden update'
    WHERE idempotency_key = 'development-seed-payment-0001'
  $sql$, 'permission denied|immutable');
  PERFORM pg_temp.expect_error($sql$
    DELETE FROM public.financial_transactions
    WHERE idempotency_key = 'development-seed-payment-0001'
  $sql$, 'permission denied|immutable');
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_authenticated_finance_read_only(UUID)
  TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_authenticated_finance_read_only(actor_id)
FROM (VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001'::UUID),
  ('aaaaaaaa-0001-0001-0001-000000000002'::UUID),
  ('aaaaaaaa-0001-0001-0001-000000000003'::UUID),
  ('aaaaaaaa-0001-0001-0001-000000000004'::UUID)
) actors(actor_id);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);

SELECT public.reverse_financial_transaction(
  (
    SELECT id
    FROM public.financial_transactions
    WHERE idempotency_key = 'development-seed-payment-0001'
  ),
  'refund', 10, 'Original retry intent', false,
  'closure-reversal-retry-0001'
);

SELECT pg_temp.expect_error($sql$
  SELECT public.reverse_financial_transaction(
    (
      SELECT id
      FROM public.financial_transactions
      WHERE idempotency_key = 'development-seed-payment-0001'
    ),
    'refund', 11, 'Changed retry intent', true,
    'closure-reversal-retry-0001'
  )
$sql$, 'idempotency key.*different request');

SELECT pg_temp.expect_error($sql$
  SELECT public.reverse_financial_transaction(
    (
      SELECT id FROM public.financial_transactions
      WHERE idempotency_key = 'development-seed-payment-0001'
    ),
    'void', 10, 'Original retry intent', false,
    'closure-reversal-retry-0001'
  )
$sql$, 'idempotency key.*different request');

SELECT pg_temp.expect_error($sql$
  SELECT public.reverse_financial_transaction(
    (
      SELECT id FROM public.financial_transactions
      WHERE idempotency_key = 'development-seed-payment-0001'
    ),
    'refund', 10, 'Changed retry reason', false,
    'closure-reversal-retry-0001'
  )
$sql$, 'idempotency key.*different request');

SELECT pg_temp.expect_error($sql$
  SELECT public.reverse_financial_transaction(
    (
      SELECT id FROM public.financial_transactions
      WHERE idempotency_key = 'development-seed-payment-0001'
    ),
    'refund', 10, 'Original retry intent', true,
    'closure-reversal-retry-0001'
  )
$sql$, 'idempotency key.*different request');

SELECT public.record_membership_payment(
  'aaaaaaaa-0001-0001-0001-000000000004',
  '30000000-0000-0000-0000-000000000001',
  'cash', 'closure-payment-retry-0001', NULL,
  current_date + 100
);

SELECT public.record_membership_payment(
  'aaaaaaaa-0001-0001-0001-000000000004',
  '30000000-0000-0000-0000-000000000001',
  'cash', 'closure-payment-retry-0001', NULL,
  current_date + 100
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.financial_transactions
    WHERE idempotency_key = 'closure-payment-retry-0001'
  ),
  'same payment intent returns one original ledger event'
);

SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'aaaaaaaa-0001-0001-0001-000000000004',
    '30000000-0000-0000-0000-000000000001',
    'cash', 'closure-payment-retry-0001', NULL,
    current_date + 101
  )
$sql$, 'idempotency key.*different request');

SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'bbbbbbbb-0002-0002-0002-000000000002',
    '30000000-0000-0000-0000-000000000001',
    'cash', 'closure-payment-retry-0001', NULL,
    current_date + 100
  )
$sql$, 'idempotency key.*different request');

SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'aaaaaaaa-0001-0001-0001-000000000004',
    '30000000-0000-0000-0000-000000000001',
    'gcash', 'closure-payment-retry-0001', NULL,
    current_date + 100
  )
$sql$, 'idempotency key.*different request');

SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'aaaaaaaa-0001-0001-0001-000000000004',
    '30000000-0000-0000-0000-000000000002',
    'cash', 'closure-payment-retry-0001', NULL,
    current_date + 100
  )
$sql$, 'idempotency key.*different request');

SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'aaaaaaaa-0001-0001-0001-000000000004',
    '30000000-0000-0000-0000-000000000001',
    'cash', 'closure-payment-retry-0001',
    '60000000-0000-0000-0000-000000000001',
    current_date + 100
  )
$sql$, 'idempotency key.*different request');

SELECT pg_temp.assert_true(
  (
    SELECT membership_end_date - membership_start_date + 1 = 30
    FROM public.financial_transactions
    WHERE idempotency_key = 'closure-payment-retry-0001'
  ),
  'a 30-day plan grants exactly 30 Manila calendar dates'
);

SELECT public.record_financial_adjustment(
  'aaaaaaaa-0001-0001-0001-000000000004',
  1.25, 'Original adjustment intent',
  'closure-adjustment-retry-0001',
  '2026-07-18T00:00:00+08:00'
);

SELECT public.record_financial_adjustment(
  'aaaaaaaa-0001-0001-0001-000000000004',
  1.25, 'Original adjustment intent',
  'closure-adjustment-retry-0001',
  '2026-07-18T00:00:00+08:00'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.financial_transactions
    WHERE idempotency_key = 'closure-adjustment-retry-0001'
  ),
  'same adjustment intent returns one original ledger event'
);

SELECT pg_temp.expect_error($sql$
  SELECT public.record_financial_adjustment(
    'aaaaaaaa-0001-0001-0001-000000000004',
    1.25, 'Changed adjustment intent',
    'closure-adjustment-retry-0001',
    '2026-07-19T00:00:00+08:00'
  )
$sql$, 'idempotency key.*different request');

SELECT pg_temp.expect_error($sql$
  SELECT public.record_financial_adjustment(
    'aaaaaaaa-0001-0001-0001-000000000004',
    1.26, 'Original adjustment intent',
    'closure-adjustment-retry-0001',
    '2026-07-18T00:00:00+08:00'
  )
$sql$, 'idempotency key.*different request');

RESET ROLE;
SELECT set_config('stren.allow_gym_user_privileged_write', 'on', true);
UPDATE public.gym_users
SET status = 'rejected'
WHERE gym_id = '10000000-0000-0000-0000-000000000001'
  AND user_id = 'aaaaaaaa-0001-0001-0001-000000000004';
SELECT set_config('stren.allow_gym_user_privileged_write', 'off', true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  NOT public.has_member_portal_entitlement(
    'aaaaaaaa-0001-0001-0001-000000000004',
    '10000000-0000-0000-0000-000000000001'
  )
  AND (public.admin_dashboard_stats() ->> 'active_plans')::INTEGER = 0
  AND (public.admin_reports_data(14) ->> 'active_count')::INTEGER = 0,
  'rejected member has the same non-active status in access, dashboard, and reports'
);

ROLLBACK;
\echo 'financial-closure.sql: all assertions passed'
