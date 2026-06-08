-- 010_staff_email_qr_onboarding.sql
-- SQL Editor-safe setup for staff-assisted onboarding + avatar cooldown foundation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_change_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_change_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avatar_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_change_count_non_negative;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_change_count_non_negative
  CHECK (avatar_change_count >= 0);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_lock_consistent;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_lock_consistent
  CHECK (
    avatar_change_locked_until IS NULL
    OR avatar_updated_at IS NOT NULL
  );

CREATE TABLE IF NOT EXISTS public.member_onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  magic_link_url TEXT,
  qr_code TEXT NOT NULL,
  sent_via TEXT NOT NULL DEFAULT 'preview',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_onboarding_events_member
  ON public.member_onboarding_events(member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_onboarding_events_gym
  ON public.member_onboarding_events(gym_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_onboarding_events_email
  ON public.member_onboarding_events(lower(email), created_at DESC);

ALTER TABLE public.member_onboarding_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_onboarding_events_select ON public.member_onboarding_events;
DROP POLICY IF EXISTS member_onboarding_events_insert ON public.member_onboarding_events;

CREATE POLICY member_onboarding_events_select
  ON public.member_onboarding_events
  FOR SELECT
  USING (gym_id = public.get_gym_id() AND public.is_manager());

CREATE POLICY member_onboarding_events_insert
  ON public.member_onboarding_events
  FOR INSERT
  WITH CHECK (gym_id = public.get_gym_id() AND public.is_manager());

CREATE OR REPLACE FUNCTION public.set_member_avatar_with_cooldown(
  p_member_id UUID,
  p_avatar_url TEXT,
  p_lock_days INTEGER DEFAULT 14
)
RETURNS TABLE (
  updated BOOLEAN,
  next_allowed_at TIMESTAMPTZ,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_role TEXT;
  v_caller_gym UUID;
  v_member_gym UUID;
  v_locked_until TIMESTAMPTZ;
  v_lock_days INTEGER := GREATEST(1, LEAST(30, p_lock_days));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Unauthorized.'::TEXT;
    RETURN;
  END IF;

  SELECT role::TEXT, gym_id INTO v_role, v_caller_gym
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Unauthorized.'::TEXT;
    RETURN;
  END IF;

  SELECT gym_id, avatar_change_locked_until INTO v_member_gym, v_locked_until
  FROM public.profiles
  WHERE id = p_member_id;

  IF v_member_gym IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Member not found.'::TEXT;
    RETURN;
  END IF;

  -- Member can update own avatar; manager can update avatars within same gym.
  IF auth.uid() <> p_member_id THEN
    IF v_role NOT IN ('owner', 'admin', 'staff') OR v_caller_gym IS DISTINCT FROM v_member_gym THEN
      RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Forbidden.'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
    RETURN QUERY SELECT FALSE, v_locked_until, 'Avatar can only be changed after cooldown.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    avatar_url = p_avatar_url,
    avatar_updated_at = v_now,
    avatar_change_locked_until = v_now + make_interval(days => v_lock_days),
    avatar_change_count = COALESCE(avatar_change_count, 0) + 1
  WHERE id = p_member_id;

  RETURN QUERY
  SELECT
    TRUE,
    (v_now + make_interval(days => v_lock_days))::TIMESTAMPTZ,
    'Avatar updated.'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_member_avatar_with_cooldown(UUID, TEXT, INTEGER) TO authenticated;
