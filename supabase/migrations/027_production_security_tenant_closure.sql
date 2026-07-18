-- Shot A: production security, tenant isolation, and privileged-write closure.
-- This migration deliberately replaces broad base-table access with narrow,
-- active-gym-pinned contracts. It contains no Shot B financial/reporting fixes.

-- ---------------------------------------------------------------------------
-- 1. Private profiles and deliberately narrow directory contracts
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.get_gym_directory()
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  avatar_url TEXT,
  role public.user_role
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
BEGIN
  IF auth.uid() IS NULL OR v_gym_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.avatar_url, gu.role
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  WHERE gu.gym_id = v_gym_id
    AND gu.status = 'active'
  ORDER BY p.name, p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_gym_member_directory()
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  email TEXT,
  contact_number TEXT,
  avatar_url TEXT,
  status public.profile_status,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
BEGIN
  IF auth.uid() IS NULL
     OR v_gym_id IS NULL
     OR NOT public.has_gym_permission('members:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.email, p.contact_number, p.avatar_url,
         gu.status, p.created_at
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  WHERE gu.gym_id = v_gym_id
    AND gu.role = 'member'
  ORDER BY p.name, p.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gym_directory() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_gym_member_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gym_directory() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gym_member_directory() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Append-only privileged audit contract
-- ---------------------------------------------------------------------------

CREATE TABLE public.privileged_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_snapshot JSONB NOT NULL,
  action TEXT NOT NULL CHECK (length(trim(action)) >= 3),
  target_type TEXT NOT NULL CHECK (length(trim(target_type)) >= 2),
  target_id UUID,
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX privileged_audit_events_gym_created_idx
  ON public.privileged_audit_events(gym_id, created_at DESC, id);
CREATE INDEX privileged_audit_events_target_idx
  ON public.privileged_audit_events(gym_id, target_type, target_id, created_at DESC);

ALTER TABLE public.privileged_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY privileged_audit_events_select ON public.privileged_audit_events
  FOR SELECT TO authenticated
  USING (gym_id = public.get_gym_id() AND public.is_manager());

REVOKE ALL ON public.privileged_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.privileged_audit_events TO authenticated;
GRANT ALL ON public.privileged_audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.reject_privileged_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'privileged audit events are immutable';
END;
$$;

CREATE TRIGGER privileged_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.privileged_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_privileged_audit_mutation();

REVOKE EXECUTE ON FUNCTION public.reject_privileged_audit_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.write_privileged_audit_event(
  p_gym_id UUID,
  p_action TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_before_state JSONB,
  p_after_state JSONB,
  p_reason TEXT,
  p_actor_id UUID DEFAULT auth.uid()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id UUID;
  v_actor_snapshot JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'role', gu.role::TEXT,
    'status', gu.status::TEXT
  )
  INTO v_actor_snapshot
  FROM public.profiles p
  LEFT JOIN public.gym_users gu
    ON gu.user_id = p.id AND gu.gym_id = p_gym_id
  WHERE p.id = p_actor_id;

  v_actor_snapshot := COALESCE(
    v_actor_snapshot,
    jsonb_build_object('id', p_actor_id, 'name', 'System', 'role', 'system')
  );

  INSERT INTO public.privileged_audit_events(
    gym_id, actor_id, actor_snapshot, action, target_type, target_id,
    before_state, after_state, reason
  ) VALUES (
    p_gym_id, p_actor_id, v_actor_snapshot, trim(p_action), trim(p_target_type),
    p_target_id, p_before_state, p_after_state, NULLIF(trim(p_reason), '')
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.write_privileged_audit_event(
  UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT, UUID
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Non-delegable role hierarchy and immediate status invalidation
-- ---------------------------------------------------------------------------

ALTER TYPE public.profile_status ADD VALUE IF NOT EXISTS 'disabled';
ALTER TYPE public.profile_status ADD VALUE IF NOT EXISTS 'withdrawn';
ALTER TYPE public.profile_status ADD VALUE IF NOT EXISTS 'expired';

CREATE OR REPLACE FUNCTION public.gym_role_rank(p_role public.user_role)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE p_role
    WHEN 'member' THEN 0
    WHEN 'staff' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'owner' THEN 3
  END;
$$;

CREATE OR REPLACE FUNCTION public.guard_gym_user_privileged_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status)
     AND current_setting('stren.allow_gym_user_privileged_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'role and status changes require a trusted RPC';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gym_user_privileged_change ON public.gym_users;
CREATE TRIGGER guard_gym_user_privileged_change
  BEFORE UPDATE OF role, status ON public.gym_users
  FOR EACH ROW EXECUTE FUNCTION public.guard_gym_user_privileged_change();

DROP POLICY IF EXISTS gym_users_update ON public.gym_users;
DROP POLICY IF EXISTS gym_users_insert ON public.gym_users;
DROP POLICY IF EXISTS gym_users_delete ON public.gym_users;
REVOKE ALL ON public.gym_users FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.gym_users TO authenticated;
GRANT ALL ON public.gym_users TO service_role;

CREATE OR REPLACE FUNCTION public.assign_gym_user_role(
  p_user_id UUID,
  p_role public.user_role,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_actor_role public.user_role;
  v_target public.gym_users%ROWTYPE;
BEGIN
  p_reason := trim(p_reason);
  IF v_actor_id IS NULL OR v_gym_id IS NULL OR length(p_reason) < 3 THEN
    RAISE EXCEPTION 'invalid role assignment';
  END IF;
  SELECT gu.role INTO v_actor_role
  FROM public.gym_users gu
  WHERE gu.gym_id = v_gym_id
    AND gu.user_id = v_actor_id
    AND gu.status = 'active';

  IF v_actor_role IS DISTINCT FROM 'owner'::public.user_role
     OR NOT public.has_gym_permission('roles:manage', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF p_user_id = v_actor_id THEN
    RAISE EXCEPTION 'you cannot change your own role';
  END IF;
  IF public.gym_role_rank(p_role) >= public.gym_role_rank(v_actor_role) THEN
    RAISE EXCEPTION 'cannot grant equal or higher authority';
  END IF;

  SELECT * INTO v_target
  FROM public.gym_users
  WHERE gym_id = v_gym_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gym user not found';
  END IF;
  IF public.gym_role_rank(v_target.role) >= public.gym_role_rank(v_actor_role) THEN
    RAISE EXCEPTION 'cannot administer equal or higher authority';
  END IF;
  IF v_target.role = p_role THEN
    RETURN jsonb_build_object('changed', false, 'role', p_role::TEXT);
  END IF;

  PERFORM set_config('stren.allow_gym_user_privileged_write', 'on', true);
  UPDATE public.gym_users
  SET role = p_role, updated_at = now()
  WHERE gym_id = v_gym_id AND user_id = p_user_id;
  PERFORM set_config('stren.allow_gym_user_privileged_write', 'off', true);

  PERFORM public.write_privileged_audit_event(
    v_gym_id, 'gym_user.role_changed', 'gym_user', p_user_id,
    jsonb_build_object('role', v_target.role::TEXT, 'status', v_target.status::TEXT),
    jsonb_build_object('role', p_role::TEXT, 'status', v_target.status::TEXT),
    p_reason, v_actor_id
  );
  RETURN jsonb_build_object('changed', true, 'role', p_role::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_gym_user_status(
  p_user_id UUID,
  p_status TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_actor_role public.user_role;
  v_target public.gym_users%ROWTYPE;
  v_status public.profile_status;
BEGIN
  p_status := lower(trim(p_status));
  p_reason := trim(p_reason);
  IF p_status NOT IN ('active', 'disabled') OR length(p_reason) < 3 THEN
    RAISE EXCEPTION 'invalid status change';
  END IF;
  v_status := p_status::public.profile_status;

  SELECT gu.role INTO v_actor_role
  FROM public.gym_users gu
  WHERE gu.gym_id = v_gym_id
    AND gu.user_id = v_actor_id
    AND gu.status = 'active';
  IF v_actor_id IS NULL OR v_gym_id IS NULL OR v_actor_role IS NULL
     OR NOT public.has_gym_permission('members:manage', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF p_user_id = v_actor_id THEN
    RAISE EXCEPTION 'you cannot change your own status';
  END IF;

  SELECT * INTO v_target
  FROM public.gym_users
  WHERE gym_id = v_gym_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gym user not found';
  END IF;
  IF public.gym_role_rank(v_target.role) >= public.gym_role_rank(v_actor_role) THEN
    RAISE EXCEPTION 'cannot administer equal or higher authority';
  END IF;
  IF v_status = 'active' AND EXISTS (
    SELECT 1 FROM public.gym_membership_verifications
    WHERE gym_id = v_gym_id AND user_id = p_user_id
      AND status <> 'approved'
  ) THEN
    RAISE EXCEPTION 'member access requires an explicit verification decision';
  END IF;
  IF v_target.status = v_status THEN
    RETURN jsonb_build_object('changed', false, 'status', v_status::TEXT);
  END IF;

  PERFORM set_config('stren.allow_gym_user_privileged_write', 'on', true);
  UPDATE public.gym_users
  SET status = v_status, updated_at = now(),
      added_by = CASE WHEN v_status = 'active' THEN v_actor_id ELSE added_by END
  WHERE gym_id = v_gym_id AND user_id = p_user_id;
  PERFORM set_config('stren.allow_gym_user_privileged_write', 'off', true);

  IF v_status = 'active' THEN
    UPDATE public.profiles
    SET active_gym_id = v_gym_id
    WHERE id = p_user_id AND active_gym_id IS NULL;
  ELSE
    DELETE FROM public.gym_user_permission_overrides
    WHERE gym_id = v_gym_id AND user_id = p_user_id;
    UPDATE public.profiles
    SET active_gym_id = NULL
    WHERE id = p_user_id AND active_gym_id = v_gym_id;
  END IF;

  PERFORM public.write_privileged_audit_event(
    v_gym_id, 'gym_user.status_changed', 'gym_user', p_user_id,
    jsonb_build_object('role', v_target.role::TEXT, 'status', v_target.status::TEXT),
    jsonb_build_object('role', v_target.role::TEXT, 'status', v_status::TEXT),
    p_reason, v_actor_id
  );
  RETURN jsonb_build_object('changed', true, 'status', v_status::TEXT);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gym_role_rank(public.user_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_gym_user_role(UUID, public.user_role, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_gym_user_status(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_gym_user_role(UUID, public.user_role, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_gym_user_status(UUID, TEXT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tenant-consistent attendance and attributable trusted writes
-- ---------------------------------------------------------------------------

CREATE TABLE public.attendance_security_quarantine (
  attendance_id UUID PRIMARY KEY,
  original_row JSONB NOT NULL,
  quarantine_reason TEXT NOT NULL,
  quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON public.attendance_security_quarantine FROM PUBLIC, anon, authenticated;

-- Preserve, but remove from live operational queries, any historical row that
-- cannot satisfy the new tenant/time invariant.
WITH invalid AS (
  SELECT a.id, to_jsonb(a) AS original_row,
    CASE
      WHEN a.gym_id IS NULL OR a.member_id IS NULL THEN 'missing tenant key'
      WHEN a.check_in IS NULL THEN 'missing check-in time'
      WHEN a.check_out IS NOT NULL AND a.check_out < a.check_in THEN 'checkout precedes check-in'
      ELSE 'member is not a gym user of attendance gym'
    END AS reason
  FROM public.attendance a
  LEFT JOIN public.gym_users gu
    ON gu.gym_id = a.gym_id AND gu.user_id = a.member_id
  WHERE a.gym_id IS NULL
     OR a.member_id IS NULL
     OR a.check_in IS NULL
     OR (a.check_out IS NOT NULL AND a.check_out < a.check_in)
     OR gu.user_id IS NULL
), preserved AS (
  INSERT INTO public.attendance_security_quarantine(
    attendance_id, original_row, quarantine_reason
  )
  SELECT id, original_row, reason FROM invalid
  ON CONFLICT (attendance_id) DO NOTHING
  RETURNING attendance_id
)
DELETE FROM public.attendance a
WHERE a.id IN (SELECT id FROM invalid);

-- Preserve all but the earliest live row when historical data contains more
-- than one open session for the same gym/member pair.
WITH duplicate_open AS (
  SELECT id, to_jsonb(a) AS original_row
  FROM (
    SELECT a.*, row_number() OVER (
      PARTITION BY a.gym_id, a.member_id ORDER BY a.check_in, a.id
    ) AS open_ordinal
    FROM public.attendance a
    WHERE a.check_out IS NULL
  ) a
  WHERE open_ordinal > 1
), preserved AS (
  INSERT INTO public.attendance_security_quarantine(
    attendance_id, original_row, quarantine_reason
  )
  SELECT id, original_row, 'duplicate open session' FROM duplicate_open
  ON CONFLICT (attendance_id) DO NOTHING
  RETURNING attendance_id
)
DELETE FROM public.attendance a
WHERE a.id IN (SELECT id FROM duplicate_open);

ALTER TABLE public.attendance
  ALTER COLUMN gym_id SET NOT NULL,
  ALTER COLUMN member_id SET NOT NULL,
  ALTER COLUMN check_in SET NOT NULL,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN corrected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN correction_reason TEXT;

ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_gym_member_fkey;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_gym_member_fkey
  FOREIGN KEY (gym_id, member_id)
  REFERENCES public.gym_users(gym_id, user_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_time_order_check
  CHECK (check_out IS NULL OR check_out >= check_in);
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_source_check
  CHECK (source IN ('legacy', 'kiosk', 'manual_override', 'manual_correction'));

DROP INDEX IF EXISTS public.one_active_checkin;
DROP INDEX IF EXISTS public.idx_attendance_member_open;
CREATE INDEX idx_attendance_member_open
  ON public.attendance(gym_id, member_id, check_in DESC)
  WHERE check_out IS NULL;
CREATE UNIQUE INDEX attendance_one_open_session_key
  ON public.attendance(gym_id, member_id)
  WHERE check_out IS NULL;

DROP POLICY IF EXISTS attendance_admin_all ON public.attendance;
DROP POLICY IF EXISTS attendance_select ON public.attendance;
DROP POLICY IF EXISTS attendance_insert ON public.attendance;
DROP POLICY IF EXISTS attendance_update ON public.attendance;
DROP POLICY IF EXISTS attendance_delete ON public.attendance;
CREATE POLICY attendance_select ON public.attendance
  FOR SELECT TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND (
      member_id = auth.uid()
      OR public.has_gym_permission('members:manage', gym_id)
      OR public.has_gym_permission('reports:attendance:view', gym_id)
    )
  );

REVOKE ALL ON public.attendance FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;

CREATE OR REPLACE FUNCTION public.kiosk_access_allowed(p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_gym_id = public.get_gym_id()
    AND public.is_manager_of(p_gym_id)
    AND public.has_gym_permission('kiosk:use', p_gym_id)
    AND public.gym_feature_enabled('kiosk_checkin', p_gym_id);
$$;

CREATE OR REPLACE FUNCTION public.record_attendance_override(
  p_member_id UUID,
  p_check_in TIMESTAMPTZ,
  p_check_out TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_attendance_id UUID;
BEGIN
  p_reason := trim(p_reason);
  IF v_actor_id IS NULL OR v_gym_id IS NULL
     OR NOT public.has_gym_permission('members:manage', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF p_check_in IS NULL OR (p_check_out IS NOT NULL AND p_check_out < p_check_in)
     OR length(p_reason) < 3 THEN
    RAISE EXCEPTION 'invalid attendance override';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.gym_users gu
    WHERE gu.gym_id = v_gym_id AND gu.user_id = p_member_id
      AND gu.role = 'member' AND gu.status = 'active'
  ) THEN
    RAISE EXCEPTION 'member not found in current gym';
  END IF;

  INSERT INTO public.attendance(
    gym_id, member_id, check_in, check_out, source,
    recorded_by, closed_by, corrected_by, correction_reason
  ) VALUES (
    v_gym_id, p_member_id, p_check_in, p_check_out, 'manual_override',
    v_actor_id, CASE WHEN p_check_out IS NULL THEN NULL ELSE v_actor_id END,
    v_actor_id, p_reason
  ) RETURNING id INTO v_attendance_id;

  PERFORM public.write_privileged_audit_event(
    v_gym_id, 'attendance.override_recorded', 'attendance', v_attendance_id,
    NULL,
    jsonb_build_object(
      'member_id', p_member_id, 'check_in', p_check_in,
      'check_out', p_check_out, 'source', 'manual_override'
    ),
    p_reason, v_actor_id
  );
  RETURN jsonb_build_object('attendance_id', v_attendance_id, 'recorded', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_attendance_session(
  p_attendance_id UUID,
  p_check_in TIMESTAMPTZ,
  p_check_out TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_before public.attendance%ROWTYPE;
BEGIN
  p_reason := trim(p_reason);
  IF v_actor_id IS NULL OR v_gym_id IS NULL
     OR NOT public.has_gym_permission('members:manage', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF p_check_in IS NULL OR (p_check_out IS NOT NULL AND p_check_out < p_check_in)
     OR length(p_reason) < 3 THEN
    RAISE EXCEPTION 'invalid attendance correction';
  END IF;

  SELECT * INTO v_before
  FROM public.attendance
  WHERE id = p_attendance_id AND gym_id = v_gym_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance session not found in current gym';
  END IF;

  UPDATE public.attendance
  SET check_in = p_check_in,
      check_out = p_check_out,
      source = 'manual_correction',
      corrected_by = v_actor_id,
      closed_by = CASE WHEN p_check_out IS NULL THEN NULL ELSE COALESCE(closed_by, v_actor_id) END,
      correction_reason = p_reason
  WHERE id = p_attendance_id;

  PERFORM public.write_privileged_audit_event(
    v_gym_id, 'attendance.session_corrected', 'attendance', p_attendance_id,
    jsonb_build_object(
      'member_id', v_before.member_id, 'check_in', v_before.check_in,
      'check_out', v_before.check_out, 'source', v_before.source
    ),
    jsonb_build_object(
      'member_id', v_before.member_id, 'check_in', p_check_in,
      'check_out', p_check_out, 'source', 'manual_correction'
    ),
    p_reason, v_actor_id
  );
  RETURN jsonb_build_object('attendance_id', p_attendance_id, 'corrected', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_attendance_session(
  p_attendance_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_before public.attendance%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  p_reason := trim(p_reason);
  IF v_actor_id IS NULL OR v_gym_id IS NULL
     OR NOT public.has_gym_permission('members:manage', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF length(p_reason) < 3 THEN
    RAISE EXCEPTION 'attendance correction reason is required';
  END IF;

  SELECT * INTO v_before
  FROM public.attendance
  WHERE id = p_attendance_id AND gym_id = v_gym_id AND check_out IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open attendance session not found in current gym';
  END IF;

  UPDATE public.attendance
  SET check_out = greatest(v_now, check_in),
      source = 'manual_correction',
      closed_by = v_actor_id,
      corrected_by = v_actor_id,
      correction_reason = p_reason
  WHERE id = p_attendance_id;

  PERFORM public.write_privileged_audit_event(
    v_gym_id, 'attendance.session_closed', 'attendance', p_attendance_id,
    jsonb_build_object('member_id', v_before.member_id, 'check_in', v_before.check_in, 'check_out', NULL),
    jsonb_build_object('member_id', v_before.member_id, 'check_in', v_before.check_in, 'check_out', greatest(v_now, v_before.check_in)),
    p_reason, v_actor_id
  );
  RETURN jsonb_build_object('attendance_id', p_attendance_id, 'closed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_checkin(p_qr_code TEXT, p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member RECORD;
  v_open public.attendance%ROWTYPE;
  v_att_id UUID;
  v_duration INTEGER;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Kiosk check-ins are unavailable');
  END IF;

  SELECT p.id, p.name, p.avatar_url, gu.status
  INTO v_member
  FROM public.profiles p
  JOIN public.gym_users gu
    ON gu.user_id = p.id
   AND gu.gym_id = p_gym_id
   AND gu.role = 'member'
   AND gu.status = 'active'
  WHERE p.qr_code = p_qr_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unknown_qr', 'message', 'QR code not recognised');
  END IF;
  IF NOT public.has_member_portal_entitlement(v_member.id, p_gym_id) THEN
    RETURN jsonb_build_object('error', 'membership_inactive', 'message', 'Membership renewal required');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_gym_id::TEXT || ':' || v_member.id::TEXT, 0));
  SELECT * INTO v_open
  FROM public.attendance
  WHERE member_id = v_member.id AND gym_id = p_gym_id AND check_out IS NULL
  ORDER BY check_in, id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.attendance
    SET check_out = greatest(now(), check_in), closed_by = auth.uid()
    WHERE id = v_open.id
    RETURNING id, duration_min INTO v_att_id, v_duration;
    RETURN jsonb_build_object(
      'action', 'checked_out', 'attendance_id', v_att_id,
      'member_id', v_member.id, 'member_name', v_member.name,
      'avatar_url', v_member.avatar_url, 'duration_min', v_duration
    );
  END IF;

  INSERT INTO public.attendance(
    member_id, gym_id, check_in, source, recorded_by
  ) VALUES (
    v_member.id, p_gym_id, now(), 'kiosk', auth.uid()
  ) RETURNING id INTO v_att_id;
  PERFORM public.kiosk_update_streak(v_member.id, p_gym_id);
  RETURN jsonb_build_object(
    'action', 'checked_in', 'attendance_id', v_att_id,
    'member_id', v_member.id, 'member_name', v_member.name,
    'avatar_url', v_member.avatar_url,
    'member_status', v_member.status, 'duration_min', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_checkin_by_member(p_member_id UUID, p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_qr TEXT;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id)
     OR NOT public.has_gym_permission('members:manage', p_gym_id) THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Manager verification is required');
  END IF;
  SELECT p.qr_code INTO v_qr
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  WHERE gu.gym_id = p_gym_id AND gu.user_id = p_member_id
    AND gu.role = 'member' AND gu.status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Member not found');
  END IF;
  RETURN public.kiosk_checkin(v_qr, p_gym_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_checkout(p_attendance_id UUID, p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attendance public.attendance%ROWTYPE;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Kiosk checkout is unavailable');
  END IF;
  SELECT * INTO v_attendance
  FROM public.attendance
  WHERE id = p_attendance_id AND gym_id = p_gym_id AND check_out IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Open attendance session not found');
  END IF;
  UPDATE public.attendance
  SET check_out = greatest(now(), check_in), closed_by = auth.uid()
  WHERE id = p_attendance_id;
  RETURN jsonb_build_object('action', 'checked_out', 'attendance_id', p_attendance_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_attendance_override(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.correct_attendance_session(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_attendance_session(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_attendance_override(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_attendance_session(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_attendance_session(UUID, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Explicit membership-verification state machine
-- ---------------------------------------------------------------------------

CREATE TYPE public.verification_status AS ENUM (
  'pending', 'approved', 'rejected', 'withdrawn', 'expired'
);

CREATE TABLE public.gym_membership_verifications (
  gym_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status public.verification_status NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, user_id),
  CONSTRAINT gym_membership_verifications_gym_user_fkey
    FOREIGN KEY (gym_id, user_id)
    REFERENCES public.gym_users(gym_id, user_id)
    ON DELETE RESTRICT
);

INSERT INTO public.gym_membership_verifications(
  gym_id, user_id, status, requested_at, decided_at, decided_by,
  last_reason, updated_at
)
SELECT gu.gym_id, gu.user_id,
       CASE gu.status
         WHEN 'pending' THEN 'pending'::public.verification_status
         ELSE 'rejected'::public.verification_status
       END,
       gu.created_at,
       CASE WHEN gu.status = 'rejected' THEN gu.updated_at ELSE NULL END,
       CASE WHEN gu.status = 'rejected' THEN gu.added_by ELSE NULL END,
       CASE WHEN gu.status = 'rejected' THEN 'Migrated historical rejection' ELSE NULL END,
       gu.updated_at
FROM public.gym_users gu
WHERE gu.role = 'member' AND gu.status IN ('pending', 'rejected');

ALTER TABLE public.gym_membership_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY gym_membership_verifications_select
  ON public.gym_membership_verifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      gym_id = public.get_gym_id()
      AND public.has_gym_permission('members:manage', gym_id)
    )
  );
REVOKE ALL ON public.gym_membership_verifications
  FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.gym_membership_verifications TO authenticated;
GRANT ALL ON public.gym_membership_verifications TO service_role;

CREATE OR REPLACE FUNCTION public.check_membership_verification_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := COALESCE(NEW.gym_id, OLD.gym_id);
  v_user_id UUID := COALESCE(NEW.user_id, OLD.user_id);
  v_verification public.verification_status;
  v_gym_user_status public.profile_status;
BEGIN
  SELECT status INTO v_verification
  FROM public.gym_membership_verifications
  WHERE gym_id = v_gym_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_gym_user_status
  FROM public.gym_users
  WHERE gym_id = v_gym_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verification requires a gym user';
  END IF;

  IF v_gym_user_status <> 'disabled' AND (
       (v_verification = 'approved' AND v_gym_user_status <> 'active')
       OR (v_verification = 'pending' AND v_gym_user_status <> 'pending')
       OR (v_verification = 'rejected' AND v_gym_user_status <> 'rejected')
       OR (v_verification = 'withdrawn' AND v_gym_user_status <> 'withdrawn')
       OR (v_verification = 'expired' AND v_gym_user_status <> 'expired')
     ) THEN
    RAISE EXCEPTION 'membership verification and gym user states contradict';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER gym_membership_verifications_consistent
  AFTER INSERT OR UPDATE ON public.gym_membership_verifications
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_membership_verification_consistency();
CREATE CONSTRAINT TRIGGER gym_users_verification_consistent
  AFTER UPDATE OF status ON public.gym_users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_membership_verification_consistency();

REVOKE EXECUTE ON FUNCTION public.check_membership_verification_consistency()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_gym_membership(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email_verified BOOLEAN;
  v_matched BOOLEAN;
  v_verification public.gym_membership_verifications%ROWTYPE;
  v_gym_user public.gym_users%ROWTYPE;
  v_target public.verification_status;
  v_target_gym_user public.profile_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gyms WHERE id = p_gym_id) THEN
    RAISE EXCEPTION 'gym not found';
  END IF;

  SELECT * INTO v_verification
  FROM public.gym_membership_verifications
  WHERE gym_id = p_gym_id AND user_id = v_user_id
  FOR UPDATE;
  IF FOUND AND v_verification.status IN ('rejected', 'withdrawn', 'expired') THEN
    RETURN jsonb_build_object(
      'status', v_verification.status::TEXT,
      'role', 'member',
      'matched', EXISTS (
        SELECT 1 FROM public.memberships
        WHERE gym_id = p_gym_id AND member_id = v_user_id
      ),
      'terminal', true
    );
  END IF;
  IF FOUND AND v_verification.status = 'approved' THEN
    RETURN jsonb_build_object(
      'status', 'approved', 'role', 'member', 'matched', true, 'terminal', false
    );
  END IF;

  SELECT * INTO v_gym_user
  FROM public.gym_users
  WHERE gym_id = p_gym_id AND user_id = v_user_id
  FOR UPDATE;
  IF FOUND AND v_gym_user.role <> 'member' THEN
    RAISE EXCEPTION 'staff-side gym access cannot use member verification';
  END IF;
  IF FOUND AND v_gym_user.status IN ('rejected', 'withdrawn', 'expired', 'disabled') THEN
    RAISE EXCEPTION 'terminal gym access requires an authorized decision';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_user_id AND email_confirmed_at IS NOT NULL
  ) INTO v_email_verified;
  SELECT v_email_verified AND EXISTS (
    SELECT 1 FROM public.memberships
    WHERE gym_id = p_gym_id AND member_id = v_user_id
  ) INTO v_matched;
  v_target := CASE WHEN v_matched THEN 'approved' ELSE 'pending' END;
  v_target_gym_user := CASE WHEN v_matched THEN 'active' ELSE 'pending' END;

  IF v_gym_user.user_id IS NULL THEN
    INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
    VALUES (
      p_gym_id, v_user_id, 'member', v_target_gym_user,
      CASE WHEN v_matched THEN v_user_id ELSE NULL END
    );
  ELSE
    PERFORM set_config('stren.allow_gym_user_privileged_write', 'on', true);
    UPDATE public.gym_users
    SET status = v_target_gym_user,
        added_by = CASE WHEN v_matched THEN v_user_id ELSE added_by END,
        updated_at = now()
    WHERE gym_id = p_gym_id AND user_id = v_user_id;
    PERFORM set_config('stren.allow_gym_user_privileged_write', 'off', true);
  END IF;

  INSERT INTO public.gym_membership_verifications(
    gym_id, user_id, status, requested_at, decided_at, decided_by,
    last_reason, updated_at
  ) VALUES (
    p_gym_id, v_user_id, v_target, now(),
    CASE WHEN v_target = 'approved' THEN now() ELSE NULL END,
    CASE WHEN v_target = 'approved' THEN v_user_id ELSE NULL END,
    CASE WHEN v_target = 'approved' THEN 'Deterministic membership evidence match' ELSE NULL END,
    now()
  )
  ON CONFLICT (gym_id, user_id) DO UPDATE SET
    status = EXCLUDED.status,
    decided_at = EXCLUDED.decided_at,
    decided_by = EXCLUDED.decided_by,
    last_reason = EXCLUDED.last_reason,
    updated_at = now();

  IF v_target = 'approved' THEN
    UPDATE public.profiles
    SET active_gym_id = p_gym_id
    WHERE id = v_user_id AND active_gym_id IS NULL;
  END IF;

  PERFORM public.write_privileged_audit_event(
    p_gym_id,
    CASE WHEN v_target = 'approved'
      THEN 'membership_verification.approved'
      ELSE 'membership_verification.requested'
    END,
    'membership_verification', v_user_id,
    CASE WHEN v_verification.user_id IS NULL THEN NULL
      ELSE jsonb_build_object('status', v_verification.status::TEXT)
    END,
    jsonb_build_object('status', v_target::TEXT, 'matched', v_matched),
    CASE WHEN v_target = 'approved'
      THEN 'Deterministic membership evidence match'
      ELSE 'Member requested verification'
    END,
    v_user_id
  );

  RETURN jsonb_build_object(
    'status', v_target::TEXT, 'role', 'member',
    'matched', v_matched, 'terminal', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_membership_verification(
  p_user_id UUID,
  p_decision TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_before public.gym_membership_verifications%ROWTYPE;
  v_decision public.verification_status;
  v_gym_user_status public.profile_status;
BEGIN
  p_decision := lower(trim(p_decision));
  p_reason := trim(p_reason);
  IF p_decision NOT IN ('pending', 'approved', 'rejected', 'expired')
     OR length(p_reason) < 3 THEN
    RAISE EXCEPTION 'invalid verification decision';
  END IF;
  IF v_actor_id IS NULL OR v_gym_id IS NULL OR p_user_id = v_actor_id
     OR NOT public.has_gym_permission('members:manage', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  v_decision := p_decision::public.verification_status;
  v_gym_user_status := CASE p_decision
    WHEN 'approved' THEN 'active'::public.profile_status
    WHEN 'pending' THEN 'pending'::public.profile_status
    WHEN 'rejected' THEN 'rejected'::public.profile_status
    ELSE 'expired'::public.profile_status
  END;

  SELECT * INTO v_before
  FROM public.gym_membership_verifications
  WHERE gym_id = v_gym_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership verification not found';
  END IF;

  PERFORM set_config('stren.allow_gym_user_privileged_write', 'on', true);
  UPDATE public.gym_users
  SET status = v_gym_user_status,
      role = 'member',
      added_by = CASE WHEN v_decision = 'approved' THEN v_actor_id ELSE added_by END,
      updated_at = now()
  WHERE gym_id = v_gym_id AND user_id = p_user_id AND role = 'member';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member gym user not found';
  END IF;
  PERFORM set_config('stren.allow_gym_user_privileged_write', 'off', true);

  UPDATE public.gym_membership_verifications
  SET status = v_decision,
      decided_at = CASE WHEN v_decision = 'pending' THEN NULL ELSE now() END,
      decided_by = CASE WHEN v_decision = 'pending' THEN NULL ELSE v_actor_id END,
      last_reason = p_reason,
      updated_at = now()
  WHERE gym_id = v_gym_id AND user_id = p_user_id;

  IF v_decision = 'approved' THEN
    UPDATE public.profiles
    SET active_gym_id = v_gym_id
    WHERE id = p_user_id AND active_gym_id IS NULL;
  ELSE
    UPDATE public.profiles
    SET active_gym_id = NULL
    WHERE id = p_user_id AND active_gym_id = v_gym_id;
  END IF;

  PERFORM public.write_privileged_audit_event(
    v_gym_id, 'membership_verification.decided',
    'membership_verification', p_user_id,
    jsonb_build_object('status', v_before.status::TEXT),
    jsonb_build_object('status', v_decision::TEXT),
    p_reason, v_actor_id
  );
  RETURN jsonb_build_object('status', v_decision::TEXT, 'decided', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_membership_verification(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  PERFORM 1
  FROM public.gym_membership_verifications
  WHERE gym_id = p_gym_id AND user_id = v_user_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending membership verification not found';
  END IF;

  PERFORM set_config('stren.allow_gym_user_privileged_write', 'on', true);
  UPDATE public.gym_users
  SET status = 'withdrawn', updated_at = now()
  WHERE gym_id = p_gym_id AND user_id = v_user_id AND role = 'member';
  PERFORM set_config('stren.allow_gym_user_privileged_write', 'off', true);
  UPDATE public.gym_membership_verifications
  SET status = 'withdrawn', decided_at = now(), decided_by = v_user_id,
      last_reason = 'Withdrawn by member', updated_at = now()
  WHERE gym_id = p_gym_id AND user_id = v_user_id;
  UPDATE public.profiles
  SET active_gym_id = NULL
  WHERE id = v_user_id AND active_gym_id = p_gym_id;

  PERFORM public.write_privileged_audit_event(
    p_gym_id, 'membership_verification.withdrawn',
    'membership_verification', v_user_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'withdrawn'),
    'Withdrawn by member', v_user_id
  );
  RETURN jsonb_build_object('withdrawn', true, 'status', 'withdrawn');
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
BEGIN
  IF p_gym_id IS DISTINCT FROM public.get_gym_id() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  RETURN public.decide_membership_verification(
    p_user_id, 'approved', 'Confirmed by gym staff'
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_membership_verifications();
CREATE FUNCTION public.get_my_membership_verifications()
RETURNS TABLE(
  gym_id UUID,
  code TEXT,
  name TEXT,
  address TEXT,
  logo_url TEXT,
  status public.verification_status,
  submitted_at TIMESTAMPTZ,
  last_reminded_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id, g.code, g.name, g.address, g.logo_url, v.status,
         v.requested_at, r.last_sent_at
  FROM public.gym_membership_verifications v
  JOIN public.gyms g ON g.id = v.gym_id
  LEFT JOIN public.gym_verification_reminders r
    ON r.gym_id = v.gym_id AND r.user_id = v.user_id
  WHERE v.user_id = auth.uid()
    AND v.status IN ('pending', 'rejected', 'withdrawn', 'expired')
  ORDER BY v.requested_at DESC, g.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_membership_verifications()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_membership_verifications()
  TO authenticated, service_role;

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
  SELECT g.name INTO v_name
  FROM public.gym_membership_verifications v
  JOIN public.gyms g ON g.id = v.gym_id
  WHERE v.gym_id = p_gym_id AND v.user_id = auth.uid()
    AND v.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending membership verification not found';
  END IF;

  INSERT INTO public.gym_verification_reminders(user_id, gym_id, last_sent_at)
  VALUES (auth.uid(), p_gym_id, now())
  ON CONFLICT (user_id, gym_id) DO UPDATE
    SET last_sent_at = now()
    WHERE public.gym_verification_reminders.last_sent_at <= now() - interval '7 days'
  RETURNING last_sent_at INTO v_sent_at;
  IF v_sent_at IS NULL THEN
    RAISE EXCEPTION 'reminder cooldown active';
  END IF;
  INSERT INTO public.notifications(
    gym_id, type, title, body, member_id, is_read, for_member
  ) VALUES (
    p_gym_id, 'membership_verification_reminder',
    'Membership verification reminder',
    'A member is still waiting for gym confirmation at ' || v_name || '.',
    auth.uid(), false, false
  );
  RETURN jsonb_build_object(
    'last_reminded_at', v_sent_at,
    'next_reminder_at', v_sent_at + interval '7 days'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.join_gym(p_gym_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.verify_gym_membership(p_gym_id);
$$;

REVOKE EXECUTE ON FUNCTION public.decide_membership_verification(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_membership_verification(UUID, TEXT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Preflighted, resumable onboarding with non-secret delivery evidence
-- ---------------------------------------------------------------------------

CREATE TABLE public.member_onboarding_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.membership_plans(id) ON DELETE RESTRICT,
  payment_method public.payment_method NOT NULL,
  requested_start_date DATE,
  member_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  membership_id UUID REFERENCES public.memberships(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'preflighted'
    CHECK (status IN (
      'preflighted', 'failed', 'completed', 'delivery_failed', 'delivered'
    )),
  failure_stage TEXT,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (gym_id, idempotency_key)
);

CREATE INDEX member_onboarding_workflows_gym_status_idx
  ON public.member_onboarding_workflows(gym_id, status, updated_at DESC);
ALTER TABLE public.member_onboarding_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_onboarding_workflows_select
  ON public.member_onboarding_workflows
  FOR SELECT TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('members:manage', gym_id)
  );
REVOKE ALL ON public.member_onboarding_workflows
  FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.member_onboarding_workflows TO authenticated;
GRANT ALL ON public.member_onboarding_workflows TO service_role;

DROP POLICY IF EXISTS member_onboarding_events_insert ON public.member_onboarding_events;
DROP POLICY IF EXISTS member_onboarding_events_select ON public.member_onboarding_events;
ALTER TABLE public.member_onboarding_events
  DROP COLUMN magic_link_url,
  DROP COLUMN qr_code,
  ADD COLUMN workflow_id UUID REFERENCES public.member_onboarding_workflows(id) ON DELETE RESTRICT,
  ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'not_attempted'
    CHECK (delivery_status IN ('not_attempted', 'sent', 'failed')),
  ADD COLUMN failure_code TEXT;
CREATE POLICY member_onboarding_events_select
  ON public.member_onboarding_events
  FOR SELECT TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('members:manage', gym_id)
  );
REVOKE ALL ON public.member_onboarding_events
  FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.member_onboarding_events TO authenticated;
GRANT ALL ON public.member_onboarding_events TO service_role;

CREATE TRIGGER member_onboarding_events_immutable
  BEFORE UPDATE OR DELETE ON public.member_onboarding_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_privileged_audit_mutation();

CREATE OR REPLACE FUNCTION public.preflight_member_onboarding(
  p_email TEXT,
  p_plan_id UUID,
  p_payment_method public.payment_method,
  p_idempotency_key TEXT,
  p_requested_start_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_email TEXT := lower(trim(p_email));
  v_fingerprint TEXT;
  v_existing public.member_onboarding_workflows%ROWTYPE;
  v_profile_id UUID;
  v_gym_user public.gym_users%ROWTYPE;
  v_workflow_id UUID;
BEGIN
  p_idempotency_key := trim(p_idempotency_key);
  IF v_actor_id IS NULL OR v_gym_id IS NULL
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR NOT public.has_gym_permission('members:manage', v_gym_id)
     OR NOT public.has_gym_permission('payments:create', v_gym_id) THEN
    RAISE EXCEPTION 'invalid or unauthorized onboarding preflight';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.membership_plans
    WHERE id = p_plan_id AND gym_id = v_gym_id AND is_active
  ) THEN
    RAISE EXCEPTION 'membership plan is invalid or inactive';
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE lower(email) = v_email;
  IF v_profile_id IS NOT NULL THEN
    SELECT * INTO v_gym_user
    FROM public.gym_users
    WHERE gym_id = v_gym_id AND user_id = v_profile_id;
    IF FOUND AND (
      v_gym_user.role <> 'member'
      OR v_gym_user.status IN ('rejected', 'withdrawn', 'expired', 'disabled')
    ) THEN
      RAISE EXCEPTION 'existing gym access requires an explicit authorized decision';
    END IF;
  END IF;

  v_fingerprint := encode(extensions.digest(
    convert_to(concat_ws('|', v_email, p_plan_id::TEXT, p_payment_method::TEXT,
      COALESCE(p_requested_start_date::TEXT, '')), 'UTF8'),
    'sha256'
  ), 'hex');
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_gym_id::TEXT || ':member-onboarding:' || p_idempotency_key, 0)
  );
  SELECT * INTO v_existing
  FROM public.member_onboarding_workflows
  WHERE gym_id = v_gym_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'idempotency key was already used for a different onboarding request';
    END IF;
    RETURN jsonb_build_object(
      'workflow_id', v_existing.id,
      'status', v_existing.status,
      'existing_member_id', v_profile_id,
      'idempotent_replay', true
    );
  END IF;

  INSERT INTO public.member_onboarding_workflows(
    gym_id, idempotency_key, request_fingerprint, created_by,
    email, plan_id, payment_method, requested_start_date
  ) VALUES (
    v_gym_id, p_idempotency_key, v_fingerprint, v_actor_id,
    v_email, p_plan_id, p_payment_method, p_requested_start_date
  ) RETURNING id INTO v_workflow_id;
  RETURN jsonb_build_object(
    'workflow_id', v_workflow_id,
    'status', 'preflighted',
    'existing_member_id', v_profile_id,
    'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_member_onboarding(
  p_workflow_id UUID,
  p_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_workflow public.member_onboarding_workflows%ROWTYPE;
  v_gym_user public.gym_users%ROWTYPE;
  v_payment JSONB;
  v_membership_id UUID;
BEGIN
  IF v_actor_id IS NULL OR v_gym_id IS NULL
     OR NOT public.has_gym_permission('members:manage', v_gym_id)
     OR NOT public.has_gym_permission('payments:create', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  SELECT * INTO v_workflow
  FROM public.member_onboarding_workflows
  WHERE id = p_workflow_id AND gym_id = v_gym_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'onboarding workflow not found';
  END IF;
  IF v_workflow.status IN ('completed', 'delivery_failed', 'delivered') THEN
    IF v_workflow.member_id IS DISTINCT FROM p_member_id THEN
      RAISE EXCEPTION 'onboarding workflow belongs to a different account';
    END IF;
    RETURN jsonb_build_object(
      'workflow_id', v_workflow.id,
      'member_id', v_workflow.member_id,
      'membership_id', v_workflow.membership_id,
      'status', v_workflow.status,
      'idempotent_replay', true
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_member_id AND lower(email) = v_workflow.email
  ) THEN
    RAISE EXCEPTION 'resolved account does not match onboarding email';
  END IF;

  SELECT * INTO v_gym_user
  FROM public.gym_users
  WHERE gym_id = v_gym_id AND user_id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
    VALUES (v_gym_id, p_member_id, 'member', 'active', v_actor_id);
  ELSIF v_gym_user.role <> 'member'
        OR v_gym_user.status IN ('rejected', 'withdrawn', 'expired', 'disabled') THEN
    RAISE EXCEPTION 'existing gym access requires an explicit authorized decision';
  ELSIF v_gym_user.status = 'pending' THEN
    IF EXISTS (
      SELECT 1 FROM public.gym_membership_verifications
      WHERE gym_id = v_gym_id AND user_id = p_member_id
    ) THEN
      PERFORM public.decide_membership_verification(
        p_member_id, 'approved', 'Approved during paid member onboarding'
      );
    ELSE
      PERFORM set_config('stren.allow_gym_user_privileged_write', 'on', true);
      UPDATE public.gym_users
      SET status = 'active', added_by = v_actor_id, updated_at = now()
      WHERE gym_id = v_gym_id AND user_id = p_member_id;
      PERFORM set_config('stren.allow_gym_user_privileged_write', 'off', true);
    END IF;
  END IF;

  v_payment := public.record_membership_payment(
    p_member_id, v_workflow.plan_id, v_workflow.payment_method,
    v_workflow.idempotency_key, NULL, v_workflow.requested_start_date
  );
  v_membership_id := (v_payment ->> 'membership_id')::UUID;
  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'membership payment did not return a membership';
  END IF;

  UPDATE public.member_onboarding_workflows
  SET member_id = p_member_id,
      membership_id = v_membership_id,
      status = 'completed',
      failure_stage = NULL,
      failure_code = NULL,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_workflow_id;

  PERFORM public.write_privileged_audit_event(
    v_gym_id, 'member_onboarding.completed', 'gym_user', p_member_id,
    NULL,
    jsonb_build_object(
      'workflow_id', p_workflow_id,
      'membership_id', v_membership_id,
      'status', 'active'
    ),
    'Paid member onboarding completed', v_actor_id
  );
  RETURN jsonb_build_object(
    'workflow_id', p_workflow_id,
    'member_id', p_member_id,
    'membership_id', v_membership_id,
    'status', 'completed',
    'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_member_onboarding_failure(
  p_workflow_id UUID,
  p_stage TEXT,
  p_failure_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
BEGIN
  p_stage := lower(trim(p_stage));
  p_failure_code := lower(trim(p_failure_code));
  IF p_stage NOT IN ('account', 'profile', 'payment')
     OR p_failure_code NOT IN (
       'account_resolution_failed', 'profile_creation_failed', 'payment_failed'
     )
     OR v_gym_id IS NULL
     OR NOT public.has_gym_permission('members:manage', v_gym_id) THEN
    RAISE EXCEPTION 'invalid onboarding failure state';
  END IF;
  UPDATE public.member_onboarding_workflows
  SET status = 'failed', failure_stage = p_stage,
      failure_code = p_failure_code, updated_at = now()
  WHERE id = p_workflow_id AND gym_id = v_gym_id
    AND status IN ('preflighted', 'failed');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'retryable onboarding workflow not found';
  END IF;
  RETURN jsonb_build_object('workflow_id', p_workflow_id, 'status', 'failed');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_member_onboarding_delivery(
  p_workflow_id UUID,
  p_delivery_status TEXT,
  p_failure_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_workflow public.member_onboarding_workflows%ROWTYPE;
  v_next_status TEXT;
BEGIN
  p_delivery_status := lower(trim(p_delivery_status));
  p_failure_code := NULLIF(lower(trim(p_failure_code)), '');
  IF p_delivery_status NOT IN ('sent', 'failed')
     OR (p_delivery_status = 'failed' AND p_failure_code NOT IN (
       'setup_link_failed', 'email_delivery_failed'
     ))
     OR (p_delivery_status = 'sent' AND p_failure_code IS NOT NULL)
     OR v_actor_id IS NULL OR v_gym_id IS NULL
     OR NOT public.has_gym_permission('members:manage', v_gym_id) THEN
    RAISE EXCEPTION 'invalid onboarding delivery state';
  END IF;
  SELECT * INTO v_workflow
  FROM public.member_onboarding_workflows
  WHERE id = p_workflow_id AND gym_id = v_gym_id
    AND status IN ('completed', 'delivery_failed', 'delivered')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'completed onboarding workflow not found';
  END IF;
  v_next_status := CASE WHEN p_delivery_status = 'sent'
    THEN 'delivered' ELSE 'delivery_failed' END;
  UPDATE public.member_onboarding_workflows
  SET status = v_next_status,
      failure_stage = CASE WHEN p_delivery_status = 'failed' THEN 'delivery' ELSE NULL END,
      failure_code = p_failure_code,
      updated_at = now()
  WHERE id = p_workflow_id;

  INSERT INTO public.member_onboarding_events(
    member_id, gym_id, created_by, email, sent_via,
    workflow_id, delivery_status, failure_code
  ) VALUES (
    v_workflow.member_id, v_gym_id, v_actor_id, v_workflow.email,
    CASE WHEN p_delivery_status = 'sent' THEN 'email' ELSE 'failed' END,
    p_workflow_id, p_delivery_status, p_failure_code
  );
  PERFORM public.write_privileged_audit_event(
    v_gym_id, 'member_onboarding.delivery_changed',
    'gym_user', v_workflow.member_id,
    jsonb_build_object('status', v_workflow.status),
    jsonb_build_object('status', v_next_status, 'delivery', p_delivery_status),
    COALESCE(p_failure_code, 'Onboarding email delivered'), v_actor_id
  );
  RETURN jsonb_build_object(
    'workflow_id', p_workflow_id,
    'status', v_next_status,
    'delivery', p_delivery_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_gym_staff(
  p_user_id UUID,
  p_role public.user_role,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_target public.gym_users%ROWTYPE;
BEGIN
  p_reason := trim(p_reason);
  IF v_actor_id IS NULL OR v_gym_id IS NULL
     OR p_role NOT IN ('admin', 'staff') OR length(p_reason) < 3
     OR NOT public.is_gym_owner(v_actor_id, v_gym_id)
     OR NOT public.has_gym_permission('roles:manage', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF p_user_id = v_actor_id OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id
  ) THEN
    RAISE EXCEPTION 'invalid staff account';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.gym_membership_verifications
    WHERE gym_id = v_gym_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'resolve member verification before assigning staff access';
  END IF;

  SELECT * INTO v_target FROM public.gym_users
  WHERE gym_id = v_gym_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
    VALUES (v_gym_id, p_user_id, p_role, 'active', v_actor_id);
  ELSE
    IF v_target.role = 'owner' THEN
      RAISE EXCEPTION 'cannot administer equal authority';
    END IF;
    PERFORM set_config('stren.allow_gym_user_privileged_write', 'on', true);
    UPDATE public.gym_users
    SET role = p_role, status = 'active', added_by = v_actor_id, updated_at = now()
    WHERE gym_id = v_gym_id AND user_id = p_user_id;
    PERFORM set_config('stren.allow_gym_user_privileged_write', 'off', true);
  END IF;
  PERFORM public.write_privileged_audit_event(
    v_gym_id, 'gym_user.staff_provisioned', 'gym_user', p_user_id,
    CASE WHEN v_target.user_id IS NULL THEN NULL
      ELSE jsonb_build_object('role', v_target.role::TEXT, 'status', v_target.status::TEXT)
    END,
    jsonb_build_object('role', p_role::TEXT, 'status', 'active'),
    p_reason, v_actor_id
  );
  RETURN jsonb_build_object('user_id', p_user_id, 'role', p_role::TEXT, 'status', 'active');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preflight_member_onboarding(
  TEXT, UUID, public.payment_method, TEXT, DATE
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_member_onboarding(UUID, UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_member_onboarding_failure(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_member_onboarding_delivery(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.provision_gym_staff(UUID, public.user_role, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preflight_member_onboarding(
  TEXT, UUID, public.payment_method, TEXT, DATE
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_member_onboarding(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_member_onboarding_failure(UUID, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_member_onboarding_delivery(UUID, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_gym_staff(UUID, public.user_role, TEXT)
  TO authenticated;

-- Plan and membership changes now share the same append-only audit contract.
CREATE OR REPLACE FUNCTION public.audit_privileged_table_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before JSONB := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_after JSONB := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_row JSONB := COALESCE(v_after, v_before);
  v_gym_id UUID := (v_row ->> 'gym_id')::UUID;
  v_target_id UUID := (v_row ->> 'id')::UUID;
  v_reason TEXT := NULLIF(current_setting('stren.audit_reason', true), '');
BEGIN
  PERFORM public.write_privileged_audit_event(
    v_gym_id,
    TG_ARGV[0] || '.' || lower(TG_OP),
    TG_ARGV[0],
    v_target_id,
    v_before,
    v_after,
    COALESCE(v_reason, 'Database ' || lower(TG_OP)),
    auth.uid()
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_privileged_table_change()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER membership_plans_privileged_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.membership_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_privileged_table_change('membership_plan');
CREATE TRIGGER memberships_privileged_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.audit_privileged_table_change('membership');
