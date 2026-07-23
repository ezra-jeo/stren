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

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 AND sum(ledger_amount) = 80
   FROM public.financial_transactions
   WHERE source = 'legacy_membership_backfill'),
  'legacy membership backfill count and total'
);
SELECT pg_temp.assert_true(
  ((public.backfill_legacy_membership_financial_transactions() ->> 'inserted_count')::INTEGER = 0),
  'legacy backfill is rerunnable'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-0000-0000-000000000001', true);

SELECT public.record_membership_payment(
  'f1111111-0000-0000-0000-000000000004',
  'f3000000-0000-0000-0000-000000000001',
  'cash', 'test-fixed-idempotency-0001',
  'f6000000-0000-0000-0000-000000000001', NULL
);
SELECT public.record_membership_payment(
  'f1111111-0000-0000-0000-000000000004',
  'f3000000-0000-0000-0000-000000000001',
  'cash', 'test-fixed-idempotency-0001',
  'f6000000-0000-0000-0000-000000000001', NULL
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 AND min(gross_amount) = 100.05
          AND min(discount_amount) = 0.05 AND min(ledger_amount) = 100.00
   FROM public.financial_transactions
   WHERE idempotency_key = 'test-fixed-idempotency-0001'),
  'fixed discount and idempotent retry produce one exact payment'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.memberships m
   JOIN public.financial_transactions ft ON ft.membership_id = m.id
   WHERE ft.idempotency_key = 'test-fixed-idempotency-0001'),
  'idempotent retry produces one membership'
);
SELECT pg_temp.assert_true(
  (SELECT membership_start_date = current_date + 11
   FROM public.financial_transactions
   WHERE idempotency_key = 'test-fixed-idempotency-0001'),
  'early renewal preserves all remaining paid time'
);

SELECT public.record_membership_payment(
  'f1111111-0000-0000-0000-000000000005',
  'f3000000-0000-0000-0000-000000000001',
  'gcash', 'test-percent-boundary-0001',
  'f6000000-0000-0000-0000-000000000002', current_date + 5
);
SELECT pg_temp.assert_true(
  (SELECT discount_amount = 33.35 AND ledger_amount = 66.70
   FROM public.financial_transactions
   WHERE idempotency_key = 'test-percent-boundary-0001'),
  'percentage discount rounds at the cent boundary'
);
SELECT pg_temp.assert_true(
  NOT public.has_member_portal_entitlement(
    'f1111111-0000-0000-0000-000000000005',
    'f1000000-0000-0000-0000-000000000001'
  ),
  'future paid access remains inactive until its start date'
);

SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'f1111111-0000-0000-0000-000000000005',
    'f3000000-0000-0000-0000-000000000001',
    'cash', 'test-expired-promo-0001',
    'f6000000-0000-0000-0000-000000000003', NULL
  )
$sql$, 'invalid|expired');
SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'f2222222-0000-0000-0000-000000000002',
    'f3000000-0000-0000-0000-000000000001',
    'cash', 'test-cross-gym-member-0001', NULL, NULL
  )
$sql$, 'current gym');
SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'f1111111-0000-0000-0000-000000000005',
    'f4000000-0000-0000-0000-000000000001',
    'cash', 'test-cross-gym-plan-0001', NULL, NULL
  )
$sql$, 'invalid|inactive');
SELECT pg_temp.assert_true(
  (SELECT pg_get_function_arguments('public.record_membership_payment'::REGPROC)
          !~ 'p_(amount|actor|gym)'),
  'payment RPC accepts no caller-supplied amount, actor, or gym'
);

RESET ROLE;
CREATE TEMP TABLE rollback_counts AS
SELECT (
         SELECT count(*) FROM public.memberships
         WHERE gym_id = 'f1000000-0000-0000-0000-000000000001'
       ) AS memberships,
       (
         SELECT count(*) FROM public.financial_transactions
         WHERE gym_id = 'f1000000-0000-0000-0000-000000000001'
       ) AS transactions;
GRANT SELECT ON rollback_counts TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.inject_financial_failure()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.idempotency_key = 'test-injected-rollback-0001' THEN
    RAISE EXCEPTION 'injected ledger failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_test_injected_financial_failure
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_financial_failure();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-0000-0000-000000000001', true);
SELECT pg_temp.expect_error($sql$
  SELECT public.record_membership_payment(
    'f1111111-0000-0000-0000-000000000006',
    'f3000000-0000-0000-0000-000000000001',
    'cash', 'test-injected-rollback-0001', NULL, NULL
  )
$sql$, 'injected ledger failure');
SELECT pg_temp.assert_true(
  (SELECT memberships = (
            SELECT count(*) FROM public.memberships
            WHERE gym_id = 'f1000000-0000-0000-0000-000000000001'
          )
          AND transactions = (
            SELECT count(*) FROM public.financial_transactions
            WHERE gym_id = 'f1000000-0000-0000-0000-000000000001'
          )
   FROM rollback_counts),
  'injected failure rolls membership and ledger back together'
);

SELECT public.reverse_financial_transaction(
  (SELECT id FROM public.financial_transactions WHERE idempotency_key = 'test-fixed-idempotency-0001'),
  'refund', 40, 'Partial refund test', false, 'test-partial-refund-0001'
);
SELECT public.reverse_financial_transaction(
  (SELECT id FROM public.financial_transactions WHERE idempotency_key = 'test-fixed-idempotency-0001'),
  'refund', 40, 'Partial refund test', false, 'test-partial-refund-0001'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 AND min(ledger_amount) = -40
   FROM public.financial_transactions
   WHERE idempotency_key = 'test-partial-refund-0001'),
  'partial refund retry is idempotent'
);
SELECT pg_temp.expect_error($sql$
  SELECT public.reverse_financial_transaction(
    (SELECT id FROM public.financial_transactions WHERE idempotency_key = 'test-fixed-idempotency-0001'),
    'refund', 61, 'Over refund test', false, 'test-over-refund-0001'
  )
$sql$, 'exceeds');
SELECT public.reverse_financial_transaction(
  (SELECT id FROM public.financial_transactions WHERE idempotency_key = 'test-fixed-idempotency-0001'),
  'void', 60, 'Void remaining test', false, 'test-full-void-0001'
);
SELECT pg_temp.expect_error($sql$
  SELECT public.reverse_financial_transaction(
    (SELECT id FROM public.financial_transactions WHERE idempotency_key = 'test-fixed-idempotency-0001'),
    'refund', 1, 'Repeated reversal test', false, 'test-repeated-reversal-0001'
  )
$sql$, 'fully reversed');
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.financial_transactions
   WHERE idempotency_key = 'test-fixed-idempotency-0001' AND ledger_amount = 100),
  'reversals never erase or rewrite the original payment'
);
SELECT pg_temp.expect_error($sql$
  UPDATE public.financial_transactions SET reason = 'rewrite' WHERE idempotency_key = 'test-fixed-idempotency-0001'
$sql$, 'permission denied|immutable');
SELECT pg_temp.expect_error($sql$
  DELETE FROM public.financial_transactions WHERE idempotency_key = 'test-fixed-idempotency-0001'
$sql$, 'permission denied|immutable');

RESET ROLE;
SELECT pg_temp.expect_error($sql$
  UPDATE public.financial_transactions SET reason = 'rewrite' WHERE idempotency_key = 'test-fixed-idempotency-0001'
$sql$, 'immutable');
SELECT pg_temp.expect_error($sql$
  DELETE FROM public.financial_transactions WHERE idempotency_key = 'test-fixed-idempotency-0001'
$sql$, 'immutable');
UPDATE public.membership_plans
SET name = 'Renamed Mutable Plan', benefits = '["Changed"]'::JSONB
WHERE id = 'f3000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET name = 'Renamed Mutable Actor'
WHERE id = 'f1111111-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-0000-0000-000000000001', true);
SELECT pg_temp.assert_true(
  (SELECT plan_snapshot ->> 'name' = 'Precision Plan'
          AND actor_snapshot ->> 'name' = 'Owner One'
   FROM public.financial_transactions
   WHERE idempotency_key = 'test-fixed-idempotency-0001'),
  'plan and actor edits cannot change exact historical snapshots'
);

SELECT public.record_financial_adjustment(
  'f1111111-0000-0000-0000-000000000004', 1.25,
  'Manila midnight adjustment', 'test-midnight-adjustment-0001',
  (public.manila_business_date()::TIMESTAMP AT TIME ZONE 'Asia/Manila') + interval '30 minutes'
);

RESET ROLE;
INSERT INTO public.financial_transactions(
  gym_id, member_id, kind, source, ledger_amount, gross_amount, discount_amount,
  currency, plan_snapshot, actor_id, actor_snapshot, snapshot_quality,
  reason, idempotency_key, occurred_at
)
SELECT
  'f1000000-0000-0000-0000-000000000001',
  'f1111111-0000-0000-0000-000000000004',
  'adjustment', 'adjustment_rpc', 0.01, 0, 0, 'PHP',
  '{"id":null,"name":"Pagination adjustment"}'::JSONB,
  'f1111111-0000-0000-0000-000000000001',
  '{"id":"f1111111-0000-0000-0000-000000000001","name":"Renamed Mutable Actor","role":"owner"}'::JSONB,
  'exact', 'Pagination coverage', 'test-pagination-' || lpad(n::TEXT, 5, '0'), now()
FROM generate_series(1, 1005) n;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-0000-0000-000000000001', true);
SELECT pg_temp.assert_true(
  jsonb_array_length(public.financial_transaction_history(NULL, 200, 0, NULL, NULL, NULL, NULL) -> 'rows') = 200
  AND jsonb_array_length(public.financial_transaction_history(NULL, 200, 1000, NULL, NULL, NULL, NULL) -> 'rows') > 0,
  'payment history paginates beyond the PostgREST 1000-row cap'
);
SELECT pg_temp.assert_true(
  ((public.financial_transaction_history(NULL, 50, 0, NULL, NULL, NULL, NULL) ->> 'net_total')::NUMERIC
    = (SELECT sum(ledger_amount) FROM public.financial_transactions WHERE gym_id = 'f1000000-0000-0000-0000-000000000001')),
  'paginated payment-history total equals the complete ledger total'
);
SELECT pg_temp.assert_true(
  ((public.admin_dashboard_stats() ->> 'today_revenue')::NUMERIC
    = (SELECT sum(ledger_amount) FROM public.financial_transactions
       WHERE gym_id = 'f1000000-0000-0000-0000-000000000001'
         AND public.manila_business_date(occurred_at) = public.manila_business_date())),
  'dashboard revenue equals the signed ledger at Manila boundaries'
);
SELECT pg_temp.assert_true(
  ((public.admin_reports_data(14) ->> 'month_revenue')::NUMERIC
    = (SELECT sum(ledger_amount) FROM public.financial_transactions
       WHERE gym_id = 'f1000000-0000-0000-0000-000000000001'
         AND date_trunc('month', public.manila_business_date(occurred_at))
             = date_trunc('month', public.manila_business_date()))),
  'report revenue equals the signed ledger'
);
SELECT pg_temp.assert_true(
  (public.admin_dashboard_stats() ->> 'total_members')::INTEGER = 3,
  'dashboard total members counts active member gym users only'
);
SELECT pg_temp.assert_true(
  (public.financial_reconciliation('2000-01-01', '2100-01-01') ->> 'net_total')::NUMERIC
    = (SELECT sum(ledger_amount) FROM public.financial_transactions WHERE gym_id = 'f1000000-0000-0000-0000-000000000001')
  AND (public.financial_reconciliation('2000-01-01', '2100-01-01') ->> 'memberships_missing_transaction')::INTEGER = 0
  AND (public.financial_reconciliation('2000-01-01', '2100-01-01') ->> 'duplicate_idempotency_keys')::INTEGER = 0
  AND (public.financial_reconciliation('2000-01-01', '2100-01-01') ->> 'impossible_reversal_balances')::INTEGER = 0,
  'owner reconciliation balances and reports no impossible state'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f2222222-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT public.record_membership_payment(
  'f2222222-0000-0000-0000-000000000002',
  'f4000000-0000-0000-0000-000000000001',
  'cash', 'test-other-gym-payment-0001', NULL, NULL
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  (SELECT count(*) > 1000 AND count(*) FILTER (
     WHERE gym_id = 'f2000000-0000-0000-0000-000000000001'
   ) = 0 FROM public.financial_transactions),
  'admin RLS exposes finance only from the active gym'
);
SELECT pg_temp.expect_error($sql$
  SELECT public.record_financial_adjustment(
    'f1111111-0000-0000-0000-000000000004', 1,
    'Admin adjustment denied', 'test-admin-adjustment-0001', now()
  )
$sql$, 'permission denied');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-0000-0000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.financial_transactions),
  'staff without finance permission sees no ledger rows'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-0000-0000-000000000004', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  (SELECT count(*) > 0 AND bool_and(member_id = 'f1111111-0000-0000-0000-000000000004')
   FROM public.financial_transactions),
  'member sees only their own financial rows'
);

RESET ROLE;
DROP TRIGGER zz_test_injected_financial_failure ON public.financial_transactions;
SELECT pg_temp.assert_true(
  ((public.backfill_legacy_membership_financial_transactions() ->> 'inserted_count')::INTEGER = 0),
  'legacy backfill remains rerunnable after post-cutover memberships exist'
);

COMMIT;
\echo 'financial-integrity.sql: all assertions passed'
