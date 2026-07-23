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

SELECT pg_temp.assert_true(
  public.paid_membership_end_date('2026-01-31', 30) = '2026-03-01',
  'month-end period counts 30 inclusive dates'
);
SELECT pg_temp.assert_true(
  public.paid_membership_end_date('2028-02-01', 29) = '2028-02-29',
  'leap-year period includes February 29 exactly once'
);
SELECT pg_temp.assert_true(
  public.paid_membership_end_date('2030-12-15', 30) = '2031-01-13',
  'future-start period uses the same inclusive date rule'
);
SELECT pg_temp.assert_true(
  public.paid_membership_end_date('2020-02-01', 30) = '2020-03-01',
  'backdated period preserves the documented inclusive date rule'
);
SELECT pg_temp.assert_true(
  public.manila_business_date('2026-07-17T15:59:59Z') = '2026-07-17'
  AND public.manila_business_date('2026-07-17T16:00:00Z') = '2026-07-18',
  'Manila midnight is the only business-date boundary'
);

ROLLBACK;
\echo 'financial-date-semantics.sql: all assertions passed'
