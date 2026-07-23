\set ON_ERROR_STOP on

DO $$
DECLARE
  v_original_id UUID;
  v_reversal_count INTEGER;
  v_reversed NUMERIC;
BEGIN
  SELECT id INTO STRICT v_original_id
  FROM public.financial_transactions
  WHERE gym_id = 'f2000000-0000-0000-0000-000000000001'
    AND idempotency_key = 'test-other-gym-payment-0001'
    AND ledger_amount = 250;

  SELECT count(*), COALESCE(sum(-ledger_amount), 0)
  INTO v_reversal_count, v_reversed
  FROM public.financial_transactions
  WHERE reverses_transaction_id = v_original_id
    AND idempotency_key IN (
      'test-concurrent-reversal-a', 'test-concurrent-reversal-b'
    );

  IF v_reversal_count <> 1 OR v_reversed <> 150 THEN
    RAISE EXCEPTION
      'concurrent reversal assertion failed (count=%, reversed=%)',
      v_reversal_count, v_reversed;
  END IF;
END;
$$;

\echo 'financial-reversal-concurrency-assert.sql: all assertions passed'
