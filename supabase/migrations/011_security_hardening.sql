-- ============================================================
-- Migration 011 — Security Hardening
-- Remediates findings from the 2026-06-17 security audit.
-- Targets actual production policy state (diverged from baseline).
-- All changes are idempotent (DROP ... IF EXISTS / CREATE OR REPLACE).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- H2  gyms: both gyms_public_select (USING true) and
--     gyms_select (USING auth.uid() IS NOT NULL) expose all gyms.
--     Replace with own-gym-only.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS gyms_public_select ON public.gyms;
DROP POLICY IF EXISTS gyms_select        ON public.gyms;
CREATE POLICY gyms_select ON public.gyms FOR SELECT
  USING (id = public.get_gym_id());

-- ────────────────────────────────────────────────────────────
-- C1  profiles_update + profiles_update_own both lack WITH CHECK
--     → privilege escalation (members could self-promote role)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_update     ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update ON public.profiles FOR UPDATE
  USING  (auth.uid() = id OR (gym_id = public.get_gym_id() AND public.is_manager()))
  WITH CHECK (auth.uid() = id OR (gym_id = public.get_gym_id() AND public.is_manager()));

-- BEFORE UPDATE trigger that hard-blocks non-managers from changing
-- sensitive columns even when the UPDATE policy would otherwise allow it.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_manager() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'permission denied: role cannot be changed by a non-manager';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'permission denied: status cannot be changed by a non-manager';
    END IF;
    IF NEW.gym_id IS DISTINCT FROM OLD.gym_id THEN
      RAISE EXCEPTION 'permission denied: gym_id cannot be changed by a non-manager';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- ────────────────────────────────────────────────────────────
-- H1  handle_new_user: hardcode role='member'
--     Previously trusted raw_user_meta_data->>'role' from the client.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, status, qr_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'member',  -- always member; owner promotion goes via create_gym_and_owner RPC
    'pending',
    gen_random_uuid()::TEXT
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.streaks (member_id, current_streak, best_streak)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (member_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- H3  notifications: require is_manager() on insert/update
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;

-- Only managers may create notifications for their gym.
CREATE POLICY notifications_insert ON public.notifications FOR INSERT
  WITH CHECK (gym_id = public.get_gym_id() AND public.is_manager());

-- Managers update gym notifications; members can update their own
-- (mark as read) via the existing notifications_update_own policy.
CREATE POLICY notifications_update ON public.notifications FOR UPDATE
  USING (gym_id = public.get_gym_id() AND public.is_manager());

-- ────────────────────────────────────────────────────────────
-- M4  attendance + streaks: add gym_id scope
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS attendance_insert     ON public.attendance;
DROP POLICY IF EXISTS attendance_insert_own ON public.attendance;
DROP POLICY IF EXISTS attendance_update     ON public.attendance;

CREATE POLICY attendance_insert ON public.attendance FOR INSERT
  WITH CHECK (gym_id = public.get_gym_id() AND (auth.uid() = member_id OR public.is_manager()));

CREATE POLICY attendance_update ON public.attendance FOR UPDATE
  USING (gym_id = public.get_gym_id() AND (auth.uid() = member_id OR public.is_manager()));

DROP POLICY IF EXISTS streaks_manage     ON public.streaks;
DROP POLICY IF EXISTS streaks_upsert_own ON public.streaks;

CREATE POLICY streaks_manage ON public.streaks FOR ALL
  USING (
    (auth.uid() = member_id OR public.is_manager())
    AND (gym_id = public.get_gym_id() OR gym_id IS NULL)
  );

-- ────────────────────────────────────────────────────────────
-- C2  dev_all_payments USING (true) → manager + gym scope
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS dev_all_payments ON public.payments;

CREATE POLICY payments_select ON public.payments FOR SELECT
  USING (gym_id = public.get_gym_id() AND (auth.uid() = member_id OR public.is_manager()));

CREATE POLICY payments_insert ON public.payments FOR INSERT
  WITH CHECK (gym_id = public.get_gym_id() AND public.is_manager());

CREATE POLICY payments_update ON public.payments FOR UPDATE
  USING (gym_id = public.get_gym_id() AND public.is_manager());

CREATE POLICY payments_delete ON public.payments FOR DELETE
  USING (gym_id = public.get_gym_id() AND public.get_user_role() IN ('owner', 'admin'));

-- ────────────────────────────────────────────────────────────
-- C3  dev_all_classes/enrollments/checkins USING (true)
--     These tables are unused by app code — lock to manager-only.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS dev_all_classes     ON public.classes;
DROP POLICY IF EXISTS dev_all_enrollments ON public.class_enrollments;
DROP POLICY IF EXISTS dev_all_checkins    ON public.checkins;

CREATE POLICY classes_manager_all ON public.classes FOR ALL
  USING (gym_id = public.get_gym_id() AND public.is_manager());

CREATE POLICY enrollments_manager_all ON public.class_enrollments FOR ALL
  USING (gym_id = public.get_gym_id() AND public.is_manager());

CREATE POLICY checkins_manager_all ON public.checkins FOR ALL
  USING (gym_id = public.get_gym_id() AND public.is_manager());

-- ────────────────────────────────────────────────────────────
-- C4  Kiosk RPCs: add auth.uid() + is_manager() + gym scope
--     kiosk_search_members: escape ILIKE metacharacters
--     REVOKE EXECUTE FROM PUBLIC/anon; GRANT TO authenticated only
-- ────────────────────────────────────────────────────────────

-- Helper: escape ILIKE pattern metacharacters
CREATE OR REPLACE FUNCTION public.escape_ilike(p_input TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT replace(replace(replace(p_input, '\', '\\'), '%', '\%'), '_', '\_');
$$;

CREATE OR REPLACE FUNCTION public.kiosk_checkin(p_qr_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id  UUID  := auth.uid();
  v_gym_id     UUID;
  v_member     public.profiles%ROWTYPE;
  v_open       public.attendance%ROWTYPE;
  v_att_id     UUID;
  v_duration   INT;
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_manager() THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Authentication required');
  END IF;

  v_gym_id := public.get_gym_id();
  IF v_gym_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_gym', 'message', 'No gym associated with your account');
  END IF;

  SELECT * INTO v_member
  FROM public.profiles
  WHERE qr_code = p_qr_code AND gym_id = v_gym_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unknown_qr', 'message', 'QR code not recognised');
  END IF;

  IF v_member.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'error', 'rejected',
      'message', 'Account has been rejected',
      'member_name', v_member.name
    );
  END IF;

  SELECT * INTO v_open
  FROM public.attendance
  WHERE member_id = v_member.id AND gym_id = v_gym_id AND check_out IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.attendance SET check_out = NOW()
    WHERE id = v_open.id RETURNING id INTO v_att_id;
    SELECT duration_min INTO v_duration FROM public.attendance WHERE id = v_att_id;
    RETURN jsonb_build_object(
      'action',        'checked_out',
      'attendance_id', v_att_id,
      'member_id',     v_member.id,
      'member_name',   v_member.name,
      'duration_min',  v_duration
    );
  ELSE
    INSERT INTO public.attendance (member_id, gym_id, check_in)
    VALUES (v_member.id, v_gym_id, NOW())
    RETURNING id INTO v_att_id;
    PERFORM public.kiosk_update_streak(v_member.id, v_gym_id);
    RETURN jsonb_build_object(
      'action',        'checked_in',
      'attendance_id', v_att_id,
      'member_id',     v_member.id,
      'member_name',   v_member.name,
      'member_status', v_member.status,
      'duration_min',  NULL
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_checkin_by_member(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id  UUID  := auth.uid();
  v_gym_id     UUID;
  v_member     public.profiles%ROWTYPE;
  v_open       public.attendance%ROWTYPE;
  v_att_id     UUID;
  v_duration   INT;
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_manager() THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Authentication required');
  END IF;

  v_gym_id := public.get_gym_id();
  IF v_gym_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_gym', 'message', 'No gym associated with your account');
  END IF;

  SELECT * INTO v_member
  FROM public.profiles
  WHERE id = p_member_id AND gym_id = v_gym_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Member not found');
  END IF;

  SELECT * INTO v_open
  FROM public.attendance
  WHERE member_id = p_member_id AND gym_id = v_gym_id AND check_out IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.attendance SET check_out = NOW()
    WHERE id = v_open.id RETURNING id INTO v_att_id;
    SELECT duration_min INTO v_duration FROM public.attendance WHERE id = v_att_id;
    RETURN jsonb_build_object(
      'action',        'checked_out',
      'attendance_id', v_att_id,
      'member_id',     v_member.id,
      'member_name',   v_member.name,
      'duration_min',  v_duration
    );
  ELSE
    INSERT INTO public.attendance (member_id, gym_id, check_in)
    VALUES (p_member_id, v_gym_id, NOW())
    RETURNING id INTO v_att_id;
    PERFORM public.kiosk_update_streak(p_member_id, v_gym_id);
    RETURN jsonb_build_object(
      'action',        'checked_in',
      'attendance_id', v_att_id,
      'member_id',     v_member.id,
      'member_name',   v_member.name,
      'member_status', v_member.status,
      'duration_min',  NULL
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_checkout(p_attendance_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_gym_id    UUID;
  v_duration  INT;
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_manager() THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Authentication required');
  END IF;

  v_gym_id := public.get_gym_id();
  IF v_gym_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_gym', 'message', 'No gym associated with your account');
  END IF;

  UPDATE public.attendance
  SET check_out = NOW()
  WHERE id = p_attendance_id AND gym_id = v_gym_id AND check_out IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT duration_min INTO v_duration FROM public.attendance WHERE id = p_attendance_id;
  RETURN jsonb_build_object('duration_min', v_duration);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_get_checked_in()
RETURNS TABLE(
  attendance_id UUID,
  member_id     UUID,
  member_name   TEXT,
  check_in      TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_gym_id    UUID;
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_manager() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_gym_id := public.get_gym_id();
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'no gym associated with account';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.member_id,
    p.name,
    a.check_in
  FROM public.attendance a
  JOIN public.profiles p ON p.id = a.member_id
  WHERE a.gym_id = v_gym_id AND a.check_out IS NULL
  ORDER BY a.check_in ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_search_members(p_query TEXT)
RETURNS TABLE(
  id                UUID,
  name              TEXT,
  email             TEXT,
  contact_number    TEXT,
  membership_status TEXT,
  plan_name         TEXT,
  end_date          DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id  UUID := auth.uid();
  v_gym_id     UUID;
  v_pattern    TEXT;
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_manager() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_gym_id := public.get_gym_id();
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'no gym associated with account';
  END IF;

  -- Escape ILIKE metacharacters to prevent pattern injection
  v_pattern := '%' || public.escape_ilike(p_query) || '%';

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.email,
    p.contact_number,
    ms.status::TEXT,
    mp.name,
    ms.end_date
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT m.status, m.end_date, m.plan_id
    FROM public.memberships m
    WHERE m.member_id = p.id AND m.gym_id = v_gym_id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) ms ON TRUE
  LEFT JOIN public.membership_plans mp ON mp.id = ms.plan_id
  WHERE
    p.gym_id = v_gym_id
    AND p.role = 'member'
    AND (
      p.name           ILIKE v_pattern ESCAPE '\'
      OR p.contact_number ILIKE v_pattern ESCAPE '\'
    )
  ORDER BY p.name
  LIMIT 20;
END;
$$;

-- Lock down kiosk RPC execute grants: authenticated managers only
REVOKE EXECUTE ON FUNCTION public.kiosk_checkin(TEXT)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_checkin_by_member(UUID)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_checkout(UUID)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_get_checked_in()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_search_members(TEXT)     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.kiosk_checkin(TEXT)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_checkin_by_member(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_checkout(UUID)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_get_checked_in()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_search_members(TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.escape_ilike(TEXT)             TO authenticated;
