-- Kiosk redesign: preserve the existing QR toggle workflow while removing
-- public roster exposure, reducing manual-lookup data, and serialising the
-- check-in/check-out decision for one member at one gym.

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

  SELECT p.id, p.name, gu.status
  INTO v_member
  FROM public.profiles p
  JOIN public.gym_users gu
    ON gu.user_id = p.id
   AND gu.gym_id = p_gym_id
   AND gu.status = 'active'
  WHERE p.qr_code = p_qr_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unknown_qr', 'message', 'QR code not recognised');
  END IF;

  IF NOT public.has_member_portal_entitlement(v_member.id, p_gym_id) THEN
    RETURN jsonb_build_object('error', 'membership_inactive', 'message', 'Membership renewal required');
  END IF;

  -- Locks this member/gym pair for the whole toggle transaction. This closes
  -- the check-then-insert race without changing the kiosk RPC contract.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_gym_id::text || ':' || v_member.id::text, 0));

  SELECT * INTO v_open
  FROM public.attendance
  WHERE member_id = v_member.id AND gym_id = p_gym_id AND check_out IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.attendance SET check_out = now()
    WHERE id = v_open.id RETURNING id, duration_min INTO v_att_id, v_duration;
    RETURN jsonb_build_object(
      'action', 'checked_out', 'attendance_id', v_att_id,
      'member_id', v_member.id, 'member_name', v_member.name,
      'duration_min', v_duration
    );
  END IF;

  INSERT INTO public.attendance(member_id, gym_id, check_in)
  VALUES (v_member.id, p_gym_id, now())
  RETURNING id INTO v_att_id;
  PERFORM public.kiosk_update_streak(v_member.id, p_gym_id);
  RETURN jsonb_build_object(
    'action', 'checked_in', 'attendance_id', v_att_id,
    'member_id', v_member.id, 'member_name', v_member.name,
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

  IF NOT public.has_active_gym_affiliation(p_member_id, p_gym_id) THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Member not found');
  END IF;

  SELECT qr_code INTO v_qr FROM public.profiles WHERE id = p_member_id;
  RETURN public.kiosk_checkin(v_qr, p_gym_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_get_occupancy(p_gym_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.attendance
  WHERE gym_id = p_gym_id AND check_out IS NULL;

  RETURN v_count;
END;
$$;

DROP FUNCTION IF EXISTS public.kiosk_search_members(TEXT, UUID);

CREATE FUNCTION public.kiosk_search_members(p_query TEXT, p_gym_id UUID)
RETURNS TABLE(id UUID, name TEXT, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pattern TEXT;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id)
     OR NOT public.has_gym_permission('members:view', p_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF length(trim(p_query)) < 3 THEN
    RETURN;
  END IF;

  v_pattern := '%' || public.escape_ilike(trim(p_query)) || '%';
  RETURN QUERY
  SELECT p.id, p.name, p.email
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  WHERE gu.gym_id = p_gym_id
    AND gu.status = 'active'
    AND (
      p.name ILIKE v_pattern ESCAPE '\\'
      OR p.email ILIKE v_pattern ESCAPE '\\'
    )
  ORDER BY p.name
  LIMIT 8;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kiosk_get_occupancy(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_search_members(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_get_occupancy(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kiosk_search_members(TEXT, UUID) TO authenticated, service_role;
