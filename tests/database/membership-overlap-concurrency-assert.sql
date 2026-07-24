\set ON_ERROR_STOP on

DO $$
DECLARE
  v_user_id UUID;
  v_memberships INTEGER;
  v_overlaps INTEGER;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.financial_overlap_test_context;

  SELECT count(*) INTO v_memberships
  FROM public.memberships
  WHERE member_id = v_user_id;

  SELECT count(*) INTO v_overlaps
  FROM public.memberships a
  JOIN public.memberships b
    ON b.gym_id = a.gym_id
   AND b.member_id = a.member_id
   AND b.id > a.id
   AND daterange(a.start_date, a.end_date, '[]')
       && daterange(b.start_date, b.end_date, '[]')
  WHERE a.member_id = v_user_id
    AND a.status IN ('active', 'frozen')
    AND b.status IN ('active', 'frozen')
    AND a.cancelled_at IS NULL
    AND b.cancelled_at IS NULL;

  IF v_memberships <> 1 OR v_overlaps <> 0 THEN
    RAISE EXCEPTION
      'overlap concurrency assertion failed (memberships=%, overlaps=%)',
      v_memberships, v_overlaps;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS zz_test_delay_direct_membership_overlap ON public.memberships;
DROP FUNCTION IF EXISTS public.test_delay_direct_membership_overlap();
DELETE FROM public.memberships
WHERE member_id = (SELECT user_id FROM public.financial_overlap_test_context);
DELETE FROM public.gym_users
WHERE user_id = (SELECT user_id FROM public.financial_overlap_test_context);
DELETE FROM auth.users
WHERE id = (SELECT user_id FROM public.financial_overlap_test_context);
DROP TABLE public.financial_overlap_test_context;

\echo 'membership-overlap-concurrency: all assertions passed'

