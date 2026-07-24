\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-0000-0000-000000000001', true);
SELECT public.record_membership_payment(
  'f1111111-0000-0000-0000-000000000006',
  'f3000000-0000-0000-0000-000000000001',
  'cash', :'idempotency_key', NULL, NULL
);
COMMIT;
