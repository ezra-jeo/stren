\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  'f2222222-0000-0000-0000-000000000001',
  true
);
SELECT public.reverse_financial_transaction(
  (
    SELECT id
    FROM public.financial_transactions
    WHERE gym_id = 'f2000000-0000-0000-0000-000000000001'
      AND idempotency_key = 'test-other-gym-payment-0001'
  ),
  'refund', 150, 'Concurrent reversal limit proof', false,
  :'idempotency_key'
);
COMMIT;
