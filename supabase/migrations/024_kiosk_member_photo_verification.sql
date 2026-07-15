-- Give front-desk staff the member's own profile photo with every successful
-- QR toggle so the person presenting the code can be visually verified.

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
   AND gu.status = 'active'
  WHERE p.qr_code = p_qr_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unknown_qr', 'message', 'QR code not recognised');
  END IF;

  IF NOT public.has_member_portal_entitlement(v_member.id, p_gym_id) THEN
    RETURN jsonb_build_object('error', 'membership_inactive', 'message', 'Membership renewal required');
  END IF;

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
      'avatar_url', v_member.avatar_url, 'duration_min', v_duration
    );
  END IF;

  INSERT INTO public.attendance(member_id, gym_id, check_in)
  VALUES (v_member.id, p_gym_id, now())
  RETURNING id INTO v_att_id;
  PERFORM public.kiosk_update_streak(v_member.id, p_gym_id);
  RETURN jsonb_build_object(
    'action', 'checked_in', 'attendance_id', v_att_id,
    'member_id', v_member.id, 'member_name', v_member.name,
    'avatar_url', v_member.avatar_url,
    'member_status', v_member.status, 'duration_min', NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kiosk_checkin(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_checkin(TEXT, UUID) TO authenticated, service_role;
