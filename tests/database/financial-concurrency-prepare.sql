\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.test_delay_concurrent_membership_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.member_id = '11111111-0000-0000-0000-000000000006' THEN
    PERFORM pg_sleep(1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_test_delay_concurrent_membership_insert ON public.memberships;
CREATE TRIGGER zz_test_delay_concurrent_membership_insert
  BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.test_delay_concurrent_membership_insert();
