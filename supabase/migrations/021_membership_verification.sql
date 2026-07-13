-- Calm gym discovery and membership verification.
-- Saving a public gym is deliberately separate from gym access. Verification
-- may activate only an email-confirmed account that already owns a billing
-- membership row for the same gym; every other self-service attempt is pending.

-- ---------------------------------------------------------------------------
-- 1. Saved public gyms (never an access grant)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.saved_gyms (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gym_id)
);

CREATE INDEX IF NOT EXISTS saved_gyms_gym_idx ON public.saved_gyms(gym_id);

ALTER TABLE public.saved_gyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_gyms_select ON public.saved_gyms;
CREATE POLICY saved_gyms_select ON public.saved_gyms
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.saved_gyms TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.saved_gyms FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_gym(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.gyms g
    WHERE g.id = p_gym_id AND g.is_published
  ) THEN
    RAISE EXCEPTION 'Gym is not available to save';
  END IF;

  INSERT INTO public.saved_gyms(user_id, gym_id)
  VALUES (auth.uid(), p_gym_id)
  ON CONFLICT (user_id, gym_id) DO NOTHING;

  RETURN jsonb_build_object('saved', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unsave_gym(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  DELETE FROM public.saved_gyms
  WHERE user_id = auth.uid() AND gym_id = p_gym_id;
  RETURN jsonb_build_object('saved', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_gym_saved(p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.saved_gyms sg
    JOIN public.gyms g ON g.id = sg.gym_id AND g.is_published
    WHERE sg.user_id = auth.uid() AND sg.gym_id = p_gym_id
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_saved_gyms()
RETURNS TABLE(
  gym_id UUID,
  code TEXT,
  name TEXT,
  address TEXT,
  logo_url TEXT,
  saved_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id, g.code, g.name, g.address, g.logo_url, sg.created_at
  FROM public.saved_gyms sg
  JOIN public.gyms g ON g.id = sg.gym_id
  WHERE sg.user_id = auth.uid()
    AND g.is_published
  ORDER BY sg.created_at DESC, g.name;
$$;

REVOKE EXECUTE ON FUNCTION public.save_gym(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unsave_gym(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_gym_saved(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_saved_gyms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_gym(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unsave_gym(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_gym_saved(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_saved_gyms() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Membership verification: deterministic match or calm pending state
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_gym_membership(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email_verified BOOLEAN := false;
  v_matched BOOLEAN := false;
  v_previous_status public.profile_status;
  v_target_status public.profile_status;
  v_status public.profile_status;
  v_role public.user_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gyms g WHERE g.id = p_gym_id) THEN
    RAISE EXCEPTION 'Gym not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE email_confirmed_at IS NOT NULL
      AND id = auth.uid()
  ) INTO v_email_verified;

  SELECT v_email_verified AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.member_id = auth.uid()
      AND m.gym_id = p_gym_id
  ) INTO v_matched;

  SELECT gu.status INTO v_previous_status
  FROM public.gym_users gu
  WHERE gu.gym_id = p_gym_id AND gu.user_id = auth.uid();

  v_target_status := CASE
    WHEN v_matched THEN 'active'::public.profile_status
    ELSE 'pending'::public.profile_status
  END;

  INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
  VALUES (
    p_gym_id,
    auth.uid(),
    'member',
    v_target_status,
    CASE WHEN v_matched THEN auth.uid() ELSE NULL END
  )
  ON CONFLICT (gym_id, user_id) DO UPDATE SET
    role = CASE
      WHEN public.gym_users.status = 'active' THEN public.gym_users.role
      ELSE 'member'::public.user_role
    END,
    status = CASE
      WHEN public.gym_users.status = 'active' THEN public.gym_users.status
      WHEN v_matched THEN 'active'::public.profile_status
      ELSE 'pending'::public.profile_status
    END,
    added_by = CASE
      WHEN public.gym_users.status = 'active' THEN public.gym_users.added_by
      WHEN v_matched THEN auth.uid()
      ELSE NULL
    END,
    updated_at = now()
  RETURNING status, role INTO v_status, v_role;

  IF v_status = 'active' THEN
    UPDATE public.profiles
    SET active_gym_id = p_gym_id
    WHERE id = auth.uid() AND active_gym_id IS NULL;

    IF v_previous_status IS NULL THEN
      INSERT INTO public.notifications(gym_id, type, title, body, member_id, is_read, for_member)
      SELECT p_gym_id, 'membership_verified', 'Gym connected',
        'Your membership at ' || g.name || ' was verified.', auth.uid(), false, true
      FROM public.gyms g WHERE g.id = p_gym_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status::TEXT,
    'role', v_role::TEXT,
    'matched', v_matched
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_gym_membership(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_gym_membership(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Pending verification state, reminder cooldown, and withdrawal
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gym_verification_reminders (
  user_id UUID NOT NULL,
  gym_id UUID NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gym_id),
  CONSTRAINT gym_verification_reminders_gym_user_fkey
    FOREIGN KEY (gym_id, user_id)
    REFERENCES public.gym_users(gym_id, user_id)
    ON DELETE CASCADE
);

ALTER TABLE public.gym_verification_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gym_verification_reminders_select ON public.gym_verification_reminders;
CREATE POLICY gym_verification_reminders_select ON public.gym_verification_reminders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.gym_verification_reminders TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.gym_verification_reminders FROM authenticated;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY[
  'member_pending', 'member_checkin', 'membership_expiring',
  'membership_expiry_7d', 'membership_expiry_0d', 'streak_milestone',
  'inactivity_nudge', 'announcement', 'payment_recorded',
  'membership_verified', 'membership_verification_reminder'
]::TEXT[]));

CREATE OR REPLACE FUNCTION public.get_my_membership_verifications()
RETURNS TABLE(
  gym_id UUID,
  code TEXT,
  name TEXT,
  address TEXT,
  logo_url TEXT,
  status public.profile_status,
  submitted_at TIMESTAMPTZ,
  last_reminded_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id, g.code, g.name, g.address, g.logo_url, gu.status,
    gu.created_at, r.last_sent_at
  FROM public.gym_users gu
  JOIN public.gyms g ON g.id = gu.gym_id
  LEFT JOIN public.gym_verification_reminders r
    ON r.gym_id = gu.gym_id AND r.user_id = gu.user_id
  WHERE gu.user_id = auth.uid()
    AND gu.status IN ('pending', 'rejected')
  ORDER BY gu.created_at DESC, g.name;
$$;

CREATE OR REPLACE FUNCTION public.send_membership_verification_reminder(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sent_at TIMESTAMPTZ;
  v_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT g.name INTO v_name
  FROM public.gym_users gu
  JOIN public.gyms g ON g.id = gu.gym_id
  WHERE gu.gym_id = p_gym_id
    AND gu.user_id = auth.uid()
    AND gu.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending membership verification not found';
  END IF;

  INSERT INTO public.gym_verification_reminders(user_id, gym_id, last_sent_at)
  VALUES (auth.uid(), p_gym_id, now())
  ON CONFLICT (user_id, gym_id) DO UPDATE
    SET last_sent_at = now()
    WHERE public.gym_verification_reminders.last_sent_at <= now() - INTERVAL '7 days'
  RETURNING last_sent_at INTO v_sent_at;

  IF v_sent_at IS NULL THEN
    RAISE EXCEPTION 'Reminder cooldown active';
  END IF;

  INSERT INTO public.notifications(gym_id, type, title, body, member_id, is_read, for_member)
  VALUES (
    p_gym_id,
    'membership_verification_reminder',
    'Membership verification reminder',
    'A member is still waiting for gym confirmation at ' || v_name || '.',
    auth.uid(),
    false,
    false
  );

  RETURN jsonb_build_object(
    'last_reminded_at', v_sent_at,
    'next_reminder_at', v_sent_at + INTERVAL '7 days'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_membership_verification(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.gym_users
  WHERE gym_id = p_gym_id
    AND user_id = auth.uid()
    AND status = 'pending'
  RETURNING gym_id INTO v_deleted;

  IF v_deleted IS NULL THEN
    RAISE EXCEPTION 'Pending membership verification not found';
  END IF;

  DELETE FROM public.notifications
  WHERE gym_id = p_gym_id
    AND member_id = auth.uid()
    AND type IN ('member_pending', 'membership_verification_reminder');

  RETURN jsonb_build_object('withdrawn', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_membership_verification(
  p_gym_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_confirmed UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot confirm your own membership';
  END IF;
  IF NOT public.has_gym_permission('members:manage', p_gym_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.gym_users
  SET status = 'active',
      role = 'member',
      added_by = auth.uid(),
      updated_at = now()
  WHERE gym_id = p_gym_id
    AND user_id = p_user_id
    AND status = 'pending'
  RETURNING user_id INTO v_confirmed;

  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'Pending membership verification not found';
  END IF;

  UPDATE public.profiles
  SET active_gym_id = p_gym_id
  WHERE id = p_user_id AND active_gym_id IS NULL;

  RETURN jsonb_build_object('confirmed', true, 'user_id', v_confirmed);
END;
$$;

-- Reword the existing pending alert and emit an in-app confirmation whenever
-- staff (or a deterministic membership match) activates a pending gym user.
CREATE OR REPLACE FUNCTION public.handle_membership_verification_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT;
  v_gym_name TEXT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'pending')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'pending' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT name INTO v_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.notifications(gym_id, type, title, body, member_id, is_read, for_member)
    VALUES (
      NEW.gym_id,
      'member_pending',
      'Membership verification',
      COALESCE(v_name, 'A member') || ' is waiting for gym confirmation',
      NEW.user_id,
      false,
      false
    );
  ELSIF TG_OP = 'UPDATE'
        AND (OLD.status = 'pending' OR OLD.status = 'rejected')
        AND NEW.status = 'active' THEN
    SELECT name INTO v_gym_name FROM public.gyms WHERE id = NEW.gym_id;
    INSERT INTO public.notifications(gym_id, type, title, body, member_id, is_read, for_member)
    VALUES (
      NEW.gym_id,
      'membership_verified',
      'Gym connected',
      'Your membership at ' || COALESCE(v_gym_name, 'your gym') || ' was verified.',
      NEW.user_id,
      false,
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_pending_gym_user ON public.gym_users;
DROP TRIGGER IF EXISTS on_membership_verification_change ON public.gym_users;
CREATE TRIGGER on_membership_verification_change
  AFTER INSERT OR UPDATE OF status ON public.gym_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_membership_verification_notification();

REVOKE EXECUTE ON FUNCTION public.get_my_membership_verifications() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_membership_verification_reminder(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_membership_verification(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_membership_verification(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_membership_verifications() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_membership_verification_reminder(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_membership_verification(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_membership_verification(UUID, UUID) TO authenticated, service_role;
