\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition BOOLEAN, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_condition, FALSE) THEN
    RAISE EXCEPTION 'recovery invariant failed: %', p_message;
  END IF;
END;
$$;

SELECT pg_temp.assert_true(
  (SELECT array_agg(version ORDER BY version) = ARRAY[
    '000','001','005','006','007','008','009','010','011','012','013','014',
    '015','016','017','018','019','020','021','022','023','024','025','026','027','028','029','030'
  ] FROM supabase_migrations.schema_migrations),
  'canonical migration history through 030'
);

SELECT pg_temp.assert_true(
  to_regclass('public.gym_claim_invites') IS NOT NULL
  AND to_regclass('public.provisioning_runs') IS NOT NULL
  AND to_regprocedure('public.claim_gym_ownership(text)') IS NOT NULL,
  'assisted onboarding recovery objects are present'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 7 FROM auth.users)
  AND (SELECT count(*) = 7 FROM public.profiles)
  AND (SELECT count(*) = 6 FROM public.gym_users),
  'Auth/profile/gym-user seed counts'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name IN ('gym_id', 'role', 'status')
  ),
  'legacy profile identity columns are absent'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.active_gym_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.gym_users gu
        WHERE gu.user_id = p.id AND gu.gym_id = p.active_gym_id
          AND gu.status = 'active'
      )
  ),
  'every active gym has an active gym-user row'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 AND bool_and(public)
   FROM storage.buckets WHERE id = 'gym-assets'),
  'canonical public gym-assets bucket exists'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.financial_transactions)
  AND (SELECT count(*) = 2 FROM public.memberships)
  AND NOT EXISTS (
    SELECT 1 FROM public.memberships m
    LEFT JOIN public.financial_transactions ft
      ON ft.id = m.financial_transaction_id AND ft.membership_id = m.id
    WHERE ft.id IS NULL
  ),
  'seed payments and memberships are linked one-to-one'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.financial_transactions
    WHERE jsonb_typeof(plan_snapshot) <> 'object'
       OR jsonb_typeof(actor_snapshot) <> 'object'
       OR snapshot_quality <> 'exact'
  ),
  'restorable actor and plan snapshots are present'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.attendance)
  AND NOT EXISTS (
    SELECT 1 FROM public.attendance
    WHERE member_id IS NULL OR gym_id IS NULL OR check_in IS NULL
      OR (check_out IS NOT NULL AND check_out < check_in)
  )
  AND (SELECT count(*) = 1 FROM public.member_onboarding_events),
  'attendance and audit fixtures meet their constraints'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', TRUE);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 AND bool_and(gym_id = '10000000-0000-0000-0000-000000000001')
   FROM public.financial_transactions),
  'first-gym owner cannot read the second gym ledger'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.get_my_gyms())
  AND public.get_my_access() ->> 'role' = 'owner',
  'first-gym owner routing resolves from the restored identity model'
);
SELECT pg_temp.assert_true(
  (public.financial_reconciliation('2000-01-01', '2100-01-01') ->> 'net_total')::NUMERIC = 800
  AND (public.financial_reconciliation('2000-01-01', '2100-01-01') ->> 'memberships_missing_transaction')::INTEGER = 0
  AND (public.financial_reconciliation('2000-01-01', '2100-01-01') ->> 'impossible_reversal_balances')::INTEGER = 0,
  'first-gym financial reconciliation'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0002-0002-0002-000000000001', TRUE);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 AND bool_and(gym_id = '10000000-0000-0000-0000-000000000002')
   FROM public.financial_transactions),
  'second-gym owner cannot read the first gym ledger'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.get_my_gyms())
  AND public.get_my_access() ->> 'role' = 'owner',
  'second-gym owner routing resolves from the restored identity model'
);
SELECT pg_temp.assert_true(
  (public.financial_reconciliation('2000-01-01', '2100-01-01') ->> 'net_total')::NUMERIC = 900,
  'second-gym financial reconciliation'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0003-0003-0003-000000000001', TRUE);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.get_my_gyms()),
  'no-gym account remains a genuine no-gym route'
);

RESET ROLE;
COMMIT;
\echo 'recovery-invariants.sql: all assertions passed'
