\set ON_ERROR_STOP on

DROP TABLE IF EXISTS public.financial_overlap_test_context;
CREATE TABLE public.financial_overlap_test_context(
  user_id UUID PRIMARY KEY
);
REVOKE ALL ON public.financial_overlap_test_context FROM PUBLIC, anon, authenticated;
INSERT INTO public.financial_overlap_test_context(user_id) VALUES (gen_random_uuid());

INSERT INTO auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated', 'authenticated',
  'overlap-' || user_id::TEXT || '@test.invalid',
  crypt('fixture-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::JSONB,
  '{"name":"Overlap Fixture"}'::JSONB,
  now(), now(), '', '', '', ''
FROM public.financial_overlap_test_context;

INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
SELECT
  '10000000-0000-0000-0000-000000000001',
  user_id, 'member', 'active',
  'aaaaaaaa-0001-0001-0001-000000000001'
FROM public.financial_overlap_test_context;

CREATE OR REPLACE FUNCTION public.test_delay_direct_membership_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.member_id = (
    SELECT user_id FROM public.financial_overlap_test_context LIMIT 1
  ) THEN
    PERFORM pg_sleep(1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_test_delay_direct_membership_overlap ON public.memberships;
CREATE TRIGGER zz_test_delay_direct_membership_overlap
  BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.test_delay_direct_membership_overlap();

