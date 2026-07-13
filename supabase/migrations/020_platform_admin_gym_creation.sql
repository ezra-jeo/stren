-- Gym organizations are provisioned by Stren staff, never by ordinary users.
-- `app_metadata` is server-controlled in Supabase Auth; users cannot edit it
-- through account metadata APIs.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'platform_role' = 'platform_admin',
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_gym(p_name TEXT, p_code TEXT)
RETURNS public.gyms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code TEXT := lower(trim(p_code));
  v_name TEXT := trim(p_name);
  v_gym public.gyms%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin access required';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Gym name must be between 2 and 120 characters';
  END IF;
  IF v_code !~ '^[a-z0-9][a-z0-9-]{2,31}$' OR v_code ~ '--' OR right(v_code, 1) = '-' THEN
    RAISE EXCEPTION 'Gym code must be 3-32 lowercase letters, numbers, or single hyphens';
  END IF;
  IF v_code = ANY (ARRAY[
    'admin','api','auth','gym','gyms','kiosk','login','member','reset-password',
    'signup','stren','www','support','help','privacy','terms'
  ]) THEN
    RAISE EXCEPTION 'That gym code is reserved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gyms WHERE lower(code) = v_code) THEN
    RAISE EXCEPTION 'That gym code is already taken';
  END IF;

  INSERT INTO public.gyms(name, code, is_published)
  VALUES (v_name, v_code, false)
  RETURNING * INTO v_gym;

  INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
  VALUES (v_gym.id, auth.uid(), 'owner', 'active', auth.uid())
  ON CONFLICT (gym_id, user_id) DO UPDATE
    SET role = 'owner', status = 'active', added_by = auth.uid(), updated_at = now();

  UPDATE public.profiles SET active_gym_id = v_gym.id WHERE id = auth.uid();
  RETURN v_gym;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_gym(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_gym(TEXT, TEXT) TO authenticated, service_role;
