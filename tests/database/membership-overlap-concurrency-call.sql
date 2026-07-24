\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.memberships(
  member_id, plan_id, start_date, end_date, status,
  payment_method, amount_paid, gym_id, created_by
)
SELECT
  user_id,
  '30000000-0000-0000-0000-000000000001',
  current_date + 500,
  current_date + 529,
  'active', 'cash', 1,
  '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000001'
FROM public.financial_overlap_test_context;
COMMIT;

