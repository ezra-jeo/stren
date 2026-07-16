\set ON_ERROR_STOP on

DO $$
DECLARE
  v_transactions INTEGER;
  v_memberships INTEGER;
  v_overlaps INTEGER;
BEGIN
  SELECT count(*) INTO v_transactions
  FROM public.financial_transactions
  WHERE idempotency_key IN (
    'test-concurrent-payment-a', 'test-concurrent-payment-b'
  );

  SELECT count(*) INTO v_memberships
  FROM public.memberships m
  JOIN public.financial_transactions ft ON ft.membership_id = m.id
  WHERE ft.idempotency_key IN (
    'test-concurrent-payment-a', 'test-concurrent-payment-b'
  );

  SELECT count(*) INTO v_overlaps
  FROM public.memberships a
  JOIN public.memberships b
    ON b.gym_id = a.gym_id
   AND b.member_id = a.member_id
   AND b.id > a.id
   AND daterange(a.start_date, a.end_date, '[]')
       && daterange(b.start_date, b.end_date, '[]')
  WHERE a.member_id = '11111111-0000-0000-0000-000000000006'
    AND a.cancelled_at IS NULL
    AND b.cancelled_at IS NULL;

  IF v_transactions <> 2 OR v_memberships <> 2 OR v_overlaps <> 0 THEN
    RAISE EXCEPTION
      'concurrency assertion failed (transactions=%, memberships=%, overlaps=%)',
      v_transactions, v_memberships, v_overlaps;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS zz_test_delay_concurrent_membership_insert ON public.memberships;
DROP FUNCTION IF EXISTS public.test_delay_concurrent_membership_insert();

SELECT
  count(*) AS transactions,
  count(DISTINCT membership_id) AS memberships,
  min(membership_start_date) AS first_start,
  max(membership_end_date) AS last_end
FROM public.financial_transactions
WHERE idempotency_key IN (
  'test-concurrent-payment-a', 'test-concurrent-payment-b'
);
