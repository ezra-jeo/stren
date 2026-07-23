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

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.payments(gym_id, member_id, amount, method)
  VALUES (
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000004',
    'NaN'::NUMERIC, 'cash'
  )
$sql$, 'payments_amount_finite_nonnegative|check constraint');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.payments(gym_id, member_id, amount, method)
  VALUES (
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000004',
    'Infinity'::NUMERIC, 'cash'
  )
$sql$, 'payments_amount_finite_nonnegative|check constraint');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.membership_plans(
    gym_id, name, price, duration_days, benefits, is_active
  ) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'Invalid NaN price', 'NaN'::NUMERIC, 30, '[]'::JSONB, true
  )
$sql$, 'membership_plans_price_finite_nonnegative|check constraint|numeric field overflow');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.membership_plans(
    gym_id, name, price, duration_days, benefits, is_active
  ) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'Invalid infinite price', 'Infinity'::NUMERIC, 30, '[]'::JSONB, true
  )
$sql$, 'membership_plans_price_finite_nonnegative|check constraint|numeric field overflow');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.promos(
    gym_id, name, type, discount_type, discount_value,
    valid_from, valid_until, is_active
  ) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'Invalid NaN discount', 'custom', 'fixed', 'NaN'::NUMERIC,
    current_date, current_date + 1, true
  )
$sql$, 'promos_discount_value_finite|check constraint|numeric field overflow');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.promos(
    gym_id, name, type, discount_type, discount_value,
    valid_from, valid_until, is_active
  ) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'Invalid infinite discount', 'custom', 'fixed', 'Infinity'::NUMERIC,
    current_date, current_date + 1, true
  )
$sql$, 'promos_discount_value_finite|check constraint|numeric field overflow');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.memberships(
    member_id, plan_id, start_date, end_date, status,
    payment_method, amount_paid, gym_id, created_by
  ) VALUES (
    'aaaaaaaa-0001-0001-0001-000000000004',
    '30000000-0000-0000-0000-000000000001',
    current_date + 1000, current_date + 1029,
    'active', 'cash', -0.01,
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001'
  )
$sql$, 'memberships_amount_paid_finite_nonnegative|check constraint|numeric field overflow');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.memberships(
    member_id, plan_id, start_date, end_date, status,
    payment_method, amount_paid, gym_id, created_by
  ) VALUES (
    'aaaaaaaa-0001-0001-0001-000000000004',
    '30000000-0000-0000-0000-000000000001',
    current_date + 1100, current_date + 1129,
    'active', 'cash', 'Infinity'::NUMERIC,
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001'
  )
$sql$, 'memberships_amount_paid_finite_nonnegative|check constraint|numeric field overflow');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.financial_transactions(
    gym_id, member_id, kind, source, ledger_amount,
    gross_amount, discount_amount, currency, plan_snapshot,
    actor_id, actor_snapshot, snapshot_quality, reason, idempotency_key
  ) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000004',
    'adjustment', 'adjustment_rpc', 'NaN'::NUMERIC,
    0, 0, 'PHP', '{"id":null,"name":"Invalid"}'::JSONB,
    'aaaaaaaa-0001-0001-0001-000000000001',
    '{"id":"aaaaaaaa-0001-0001-0001-000000000001","name":"Owner","role":"owner"}'::JSONB,
    'exact', 'Invalid NaN ledger amount', 'closure-nan-ledger-0001'
  )
$sql$, 'financial_transactions_amounts_finite|check constraint|numeric field overflow');

SELECT pg_temp.expect_error($sql$
  INSERT INTO public.financial_transactions(
    gym_id, member_id, kind, source, ledger_amount,
    gross_amount, discount_amount, currency, plan_snapshot,
    actor_id, actor_snapshot, snapshot_quality, reason, idempotency_key
  ) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000004',
    'adjustment', 'adjustment_rpc', 'Infinity'::NUMERIC,
    0, 0, 'PHP', '{"id":null,"name":"Invalid"}'::JSONB,
    'aaaaaaaa-0001-0001-0001-000000000001',
    '{"id":"aaaaaaaa-0001-0001-0001-000000000001","name":"Owner","role":"owner"}'::JSONB,
    'exact', 'Invalid infinite ledger amount', 'closure-infinite-ledger-0001'
  )
$sql$, 'financial_transactions_amounts_finite|check constraint|numeric field overflow');

ROLLBACK;
\echo 'financial-monetary-constraints.sql: all assertions passed'
