\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', true);
SELECT public.kiosk_checkin_by_member(
  'aaaaaaaa-0001-0001-0001-000000000004',
  '10000000-0000-0000-0000-000000000001'
);
COMMIT;
