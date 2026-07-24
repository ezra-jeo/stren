-- RFID Phase 1: additive, default-off, tenant-scoped kiosk foundation.

CREATE TABLE public.rfid_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  card_digest TEXT NOT NULL CHECK (card_digest ~ '^[0-9a-f]{64}$'),
  masked_id TEXT NOT NULL CHECK (masked_id ~ '^•••• [0-9A-F]{4}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated', 'lost', 'replaced')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gym_id, id),
  CONSTRAINT rfid_cards_gym_member_fkey FOREIGN KEY (gym_id, member_id)
    REFERENCES public.gym_users(gym_id, user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX rfid_cards_digest_unique ON public.rfid_cards(card_digest);
CREATE UNIQUE INDEX rfid_cards_one_active_member ON public.rfid_cards(gym_id, member_id) WHERE status = 'active';
CREATE INDEX rfid_cards_member_lookup ON public.rfid_cards(gym_id, member_id, assigned_at DESC);
ALTER TABLE public.rfid_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY rfid_cards_select ON public.rfid_cards FOR SELECT TO authenticated
  USING (gym_id = public.get_gym_id() AND public.has_gym_permission('members:manage', gym_id));
REVOKE ALL ON public.rfid_cards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rfid_cards TO authenticated;
GRANT ALL ON public.rfid_cards TO service_role;

CREATE TABLE public.access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE RESTRICT,
  member_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  card_id UUID REFERENCES public.rfid_cards(id) ON DELETE RESTRICT,
  attendance_id UUID REFERENCES public.attendance(id) ON DELETE RESTRICT,
  access_method TEXT NOT NULL CHECK (access_method IN ('rfid', 'qr', 'manual', 'search', 'legacy')),
  outcome TEXT NOT NULL CHECK (outcome IN ('granted', 'denied', 'unknown', 'duplicate')),
  direction TEXT CHECK (direction IN ('check_in', 'check_out')),
  reason TEXT NOT NULL DEFAULT 'ok',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT access_events_card_gym_fkey FOREIGN KEY (gym_id, card_id)
    REFERENCES public.rfid_cards(gym_id, id) ON DELETE RESTRICT
);
CREATE INDEX access_events_gym_occurred_idx ON public.access_events(gym_id, occurred_at DESC, id DESC);
ALTER TABLE public.access_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.access_events TO service_role;
CREATE OR REPLACE FUNCTION public.reject_access_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'access events are immutable'; END; $$;
CREATE TRIGGER access_events_immutable BEFORE UPDATE OR DELETE ON public.access_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_access_event_mutation();

-- Feature uses explicit false rather than catalog fallback: production kiosks stay QR/Search-only.
CREATE OR REPLACE FUNCTION public.gym_feature_enabled(
  p_feature TEXT,
  p_gym_id UUID DEFAULT public.get_gym_id()
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN p_feature = 'rfid_kiosk' THEN COALESCE(
    (SELECT (flags ->> 'rfid_kiosk')::BOOLEAN FROM public.gym_feature_settings WHERE gym_id = p_gym_id), false
  ) ELSE COALESCE(
    (SELECT (flags ->> p_feature)::BOOLEAN FROM public.gym_feature_settings WHERE gym_id = p_gym_id),
    CASE p_feature
      WHEN 'trainer_bookings' THEN false WHEN 'friends_chat' THEN false
      WHEN 'workout_log' THEN false WHEN 'session_posts' THEN false ELSE true END
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.transition_member_attendance(p_member_id UUID, p_gym_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_member RECORD; v_open public.attendance%ROWTYPE; v_attendance_id UUID; v_duration INTEGER; v_now TIMESTAMPTZ := now();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_gym_id::TEXT || ':' || p_member_id::TEXT, 0));
  SELECT * INTO v_open FROM public.attendance WHERE gym_id = p_gym_id AND member_id = p_member_id AND check_out IS NULL
    ORDER BY check_in, id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    UPDATE public.attendance SET check_out = greatest(v_now, check_in), closed_by = auth.uid(),
      duration_min = greatest(0, floor(extract(epoch FROM (greatest(v_now, check_in) - check_in)) / 60)::INTEGER)
    WHERE id = v_open.id RETURNING id, duration_min INTO v_attendance_id, v_duration;
    RETURN jsonb_build_object('action', 'checked_out', 'attendance_id', v_attendance_id, 'duration_min', v_duration);
  END IF;
  SELECT p.id, p.name, p.avatar_url, gu.status INTO v_member FROM public.profiles p JOIN public.gym_users gu
    ON gu.user_id = p.id AND gu.gym_id = p_gym_id AND gu.role = 'member' AND gu.status = 'active' WHERE p.id = p_member_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found', 'message', 'Member not found'); END IF;
  IF NOT public.has_member_portal_entitlement(p_member_id, p_gym_id) THEN
    RETURN jsonb_build_object('error', 'membership_inactive', 'message', 'Membership renewal required');
  END IF;
  INSERT INTO public.attendance(member_id, gym_id, check_in, source, recorded_by)
  VALUES (p_member_id, p_gym_id, v_now, 'kiosk', auth.uid()) RETURNING id INTO v_attendance_id;
  PERFORM public.kiosk_update_streak(p_member_id, p_gym_id);
  RETURN jsonb_build_object('action', 'checked_in', 'attendance_id', v_attendance_id, 'duration_min', NULL);
END; $$;
REVOKE ALL ON FUNCTION public.transition_member_attendance(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kiosk_checkin(p_qr_code TEXT, p_gym_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_member RECORD; v_transition JSONB;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) THEN RETURN jsonb_build_object('error', 'forbidden', 'message', 'Kiosk check-ins are unavailable'); END IF;
  SELECT p.id, p.name, p.avatar_url, gu.status INTO v_member FROM public.profiles p JOIN public.gym_users gu
    ON gu.user_id=p.id AND gu.gym_id=p_gym_id AND gu.role='member' AND gu.status='active' WHERE p.qr_code=p_qr_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','unknown_qr','message','QR code not recognised'); END IF;
  v_transition := public.transition_member_attendance(v_member.id, p_gym_id);
  RETURN v_transition || jsonb_build_object('member_id',v_member.id,'member_name',v_member.name,'avatar_url',v_member.avatar_url,'member_status',v_member.status);
END; $$;

CREATE OR REPLACE FUNCTION public.kiosk_checkin_by_member(p_member_id UUID, p_gym_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_member RECORD; v_transition JSONB;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) OR NOT public.has_gym_permission('members:manage', p_gym_id) THEN RETURN jsonb_build_object('error','forbidden','message','Manager verification is required'); END IF;
  SELECT p.id,p.name,p.avatar_url,gu.status INTO v_member FROM public.profiles p JOIN public.gym_users gu ON gu.user_id=p.id AND gu.gym_id=p_gym_id AND gu.role='member' AND gu.status='active' WHERE p.id=p_member_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found','message','Member not found'); END IF;
  v_transition := public.transition_member_attendance(p_member_id,p_gym_id);
  RETURN v_transition || jsonb_build_object('member_id',v_member.id,'member_name',v_member.name,'avatar_url',v_member.avatar_url,'member_status',v_member.status);
END; $$;

CREATE OR REPLACE FUNCTION public.kiosk_checkout(p_attendance_id UUID, p_gym_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_member UUID; BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) THEN RETURN jsonb_build_object('error','forbidden','message','Kiosk checkout is unavailable'); END IF;
  SELECT member_id INTO v_member FROM public.attendance WHERE id=p_attendance_id AND gym_id=p_gym_id AND check_out IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found','message','Open attendance session not found'); END IF;
  RETURN public.transition_member_attendance(v_member,p_gym_id);
END; $$;

CREATE OR REPLACE FUNCTION public.get_member_rfid_card(p_member_id UUID, p_gym_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_card public.rfid_cards%ROWTYPE; BEGIN
  IF p_gym_id <> public.get_gym_id() OR NOT public.has_gym_permission('members:manage',p_gym_id) THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT * INTO v_card FROM public.rfid_cards WHERE gym_id=p_gym_id AND member_id=p_member_id ORDER BY assigned_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',v_card.id,'masked_id',v_card.masked_id,'status',v_card.status,'assigned_at',v_card.assigned_at);
END; $$;

CREATE OR REPLACE FUNCTION public.assign_member_rfid_card(p_member_id UUID, p_card_digest TEXT, p_masked_id TEXT, p_gym_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor UUID:=auth.uid(); v_card_id UUID; v_role public.user_role; BEGIN
  SELECT role INTO v_role FROM public.gym_users WHERE user_id=v_actor AND gym_id=p_gym_id AND status='active';
  IF v_actor IS NULL OR p_gym_id<>public.get_gym_id() OR v_role NOT IN ('owner','admin') OR NOT public.has_gym_permission('members:manage',p_gym_id) THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gym_users WHERE gym_id=p_gym_id AND user_id=p_member_id AND role='member') THEN RAISE EXCEPTION 'member not found in current gym'; END IF;
  INSERT INTO public.rfid_cards(gym_id,member_id,card_digest,masked_id,assigned_by) VALUES(p_gym_id,p_member_id,p_card_digest,p_masked_id,v_actor) RETURNING id INTO v_card_id;
  PERFORM public.write_privileged_audit_event(p_gym_id,'rfid.card_assigned','rfid_card',v_card_id,NULL,jsonb_build_object('member_id',p_member_id,'masked_id',p_masked_id),'RFID card assigned',v_actor);
  RETURN jsonb_build_object('id',v_card_id,'masked_id',p_masked_id,'status','active','assigned_at',now());
END; $$;

CREATE OR REPLACE FUNCTION public.process_rfid_tap(p_card_digest TEXT, p_gym_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_card public.rfid_cards%ROWTYPE; v_member RECORD; v_transition JSONB; v_event UUID; v_role public.user_role; BEGIN
  SELECT role INTO v_role FROM public.gym_users WHERE user_id=auth.uid() AND gym_id=p_gym_id AND status='active';
  IF NOT public.kiosk_access_allowed(p_gym_id) OR NOT public.gym_feature_enabled('rfid_kiosk',p_gym_id) OR v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'RFID kiosk unavailable'; END IF;
  SELECT * INTO v_card FROM public.rfid_cards WHERE card_digest=p_card_digest AND gym_id=p_gym_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'card not recognised'; END IF;
  SELECT p.name,p.avatar_url,gu.status INTO v_member FROM public.profiles p JOIN public.gym_users gu ON gu.user_id=p.id AND gu.gym_id=p_gym_id WHERE p.id=v_card.member_id;
  v_transition:=public.transition_member_attendance(v_card.member_id,p_gym_id);
  INSERT INTO public.access_events(gym_id,member_id,card_id,attendance_id,access_method,outcome,direction,actor_id)
  VALUES(p_gym_id,v_card.member_id,v_card.id,(v_transition->>'attendance_id')::UUID,'rfid','granted',CASE WHEN v_transition->>'action'='checked_in' THEN 'check_in' ELSE 'check_out' END,auth.uid()) RETURNING id INTO v_event;
  RETURN v_transition || jsonb_build_object('event_id',v_event,'member_name',v_member.name,'avatar_url',v_member.avatar_url,'member_status',v_member.status);
END; $$;

REVOKE ALL ON FUNCTION public.get_member_rfid_card(UUID,UUID), public.assign_member_rfid_card(UUID,TEXT,TEXT,UUID), public.process_rfid_tap(TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_rfid_card(UUID,UUID), public.assign_member_rfid_card(UUID,TEXT,TEXT,UUID), public.process_rfid_tap(TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_access() RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role public.user_role; v_gym_id UUID:=public.get_gym_id(); v_permissions JSONB; BEGIN
  SELECT gu.role INTO v_role FROM public.gym_users gu WHERE gu.user_id=auth.uid() AND gu.gym_id=v_gym_id AND gu.status='active';
  IF NOT FOUND OR v_gym_id IS NULL THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT COALESCE(jsonb_agg(keys.permission ORDER BY keys.permission),'[]'::jsonb) INTO v_permissions FROM (SELECT permission FROM public.gym_role_permission_defaults WHERE role='owner') keys WHERE public.has_gym_permission(keys.permission,v_gym_id);
  RETURN jsonb_build_object('role',v_role::TEXT,'gym_id',v_gym_id,'permissions',v_permissions,'features',jsonb_build_object(
    'member_feed',public.gym_feature_enabled('member_feed',v_gym_id),'leaderboards',public.gym_feature_enabled('leaderboards',v_gym_id),'public_team',public.gym_feature_enabled('public_team',v_gym_id),'public_pricing',public.gym_feature_enabled('public_pricing',v_gym_id),'public_location',public.gym_feature_enabled('public_location',v_gym_id),'announcements',public.gym_feature_enabled('announcements',v_gym_id),'promos',public.gym_feature_enabled('promos',v_gym_id),'kiosk_checkin',public.gym_feature_enabled('kiosk_checkin',v_gym_id),'rfid_kiosk',public.gym_feature_enabled('rfid_kiosk',v_gym_id),'staff_manual_checkin',public.gym_feature_enabled('staff_manual_checkin',v_gym_id),'occupancy_count',public.gym_feature_enabled('occupancy_count',v_gym_id),'trainer_bookings',false,'friends_chat',false,'workout_log',false,'session_posts',false));
END; $$;

-- RFID changes protected helpers and adds durable security boundaries. Keep the
-- deployment drift contract additive, exactly as migrations 029/030 did.
DO $$
BEGIN
  IF to_regprocedure('public.deployment_protected_definition_hashes_030()') IS NULL
     AND to_regprocedure('public.deployment_protected_definition_hashes()') IS NOT NULL THEN
    ALTER FUNCTION public.deployment_protected_definition_hashes()
      RENAME TO deployment_protected_definition_hashes_030;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.deployment_protected_definition_hashes()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.deployment_protected_definition_hashes_030()
    || COALESCE((
      SELECT jsonb_object_agg(
        target.key,
        encode(extensions.digest(convert_to(regexp_replace(trim(target.definition), '\s+', ' ', 'g'), 'UTF8'), 'sha256'), 'hex')
      )
      FROM (
        SELECT key, pg_get_functiondef(to_regprocedure(identity)) AS definition
        FROM (VALUES
          ('function:gym_feature_enabled', 'public.gym_feature_enabled(text,uuid)'),
          ('function:get_my_access', 'public.get_my_access()'),
          ('function:transition_member_attendance', 'public.transition_member_attendance(uuid,uuid)'),
          ('function:process_rfid_tap', 'public.process_rfid_tap(text,uuid)'),
          ('function:assign_member_rfid_card', 'public.assign_member_rfid_card(uuid,text,text,uuid)'),
          ('trigger:public.access_events.access_events_immutable', 'public.reject_access_event_mutation()')
        ) AS target(key, identity)
      ) AS target
    ), '{}'::JSONB);
$$;
REVOKE ALL ON FUNCTION public.deployment_protected_definition_hashes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deployment_protected_definition_hashes() TO service_role;
