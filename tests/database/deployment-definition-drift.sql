\set ON_ERROR_STOP on
\set QUIET on
BEGIN;

DROP POLICY financial_transactions_select
  ON public.financial_transactions;
CREATE POLICY financial_transactions_select
  ON public.financial_transactions
  FOR SELECT
  TO authenticated
  USING (false);

\set QUIET off
SELECT public.deployment_contract_snapshot()::TEXT;
\set QUIET on
ROLLBACK;
