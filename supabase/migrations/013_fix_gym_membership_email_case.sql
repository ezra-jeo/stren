-- 013 — Fix check_gym_membership case-sensitivity bug
--
-- Migration 012's check_gym_membership compared u.email = lower(trim(p_email)),
-- lowercasing only the input, not the stored auth.users.email. Any account whose
-- email contains uppercase characters (common for manually created / invited
-- accounts) would never match, causing forgot-password to wrongly report
-- "This email is not registered as a member of this gym." for real members.
-- Fix: lowercase both sides.

CREATE OR REPLACE FUNCTION public.check_gym_membership(
  p_email  text,
  p_gym_code text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id  uuid;
  v_count   int;
BEGIN
  SELECT id INTO v_gym_id
  FROM public.gyms
  WHERE code = p_gym_code
  LIMIT 1;

  IF v_gym_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(trim(p_email))
    AND p.gym_id = v_gym_id
    AND (p.status IS NULL OR p.status <> 'rejected');

  RETURN v_count > 0;
END;
$$;
