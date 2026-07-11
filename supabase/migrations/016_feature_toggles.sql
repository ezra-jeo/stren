-- Per-gym feature toggles. Missing rows/keys retain catalog defaults.

CREATE TABLE IF NOT EXISTS public.gym_feature_settings (
  gym_id UUID PRIMARY KEY REFERENCES public.gyms(id) ON DELETE CASCADE,
  flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.gym_feature_enabled(
  p_feature TEXT,
  p_gym_id UUID DEFAULT public.get_gym_id()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_default BOOLEAN;
  v_stored TEXT;
BEGIN
  v_default := CASE p_feature
    WHEN 'member_feed' THEN true
    WHEN 'leaderboards' THEN true
    WHEN 'public_team' THEN true
    WHEN 'public_pricing' THEN true
    WHEN 'public_location' THEN true
    WHEN 'announcements' THEN true
    WHEN 'promos' THEN true
    WHEN 'kiosk_checkin' THEN true
    WHEN 'trainer_bookings' THEN false
    WHEN 'friends_chat' THEN false
    WHEN 'workout_log' THEN false
    WHEN 'session_posts' THEN false
    ELSE false
  END;

  IF p_feature IN ('trainer_bookings', 'friends_chat', 'workout_log', 'session_posts')
     OR p_gym_id IS NULL THEN
    RETURN v_default;
  END IF;

  SELECT flags ->> p_feature INTO v_stored
  FROM public.gym_feature_settings
  WHERE gym_id = p_gym_id;

  IF v_stored IN ('true', 'false') THEN
    RETURN v_stored::BOOLEAN;
  END IF;

  RETURN v_default;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gym_feature_enabled(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gym_feature_enabled(TEXT, UUID) TO anon, authenticated, service_role;

ALTER TABLE public.gym_feature_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_settings_select ON public.gym_feature_settings;
CREATE POLICY feature_settings_select
  ON public.gym_feature_settings FOR SELECT TO authenticated
  USING (gym_id = public.get_gym_id());

DROP POLICY IF EXISTS feature_settings_insert ON public.gym_feature_settings;
CREATE POLICY feature_settings_insert
  ON public.gym_feature_settings FOR INSERT TO authenticated
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('features:manage', gym_id)
  );

DROP POLICY IF EXISTS feature_settings_update ON public.gym_feature_settings;
CREATE POLICY feature_settings_update
  ON public.gym_feature_settings FOR UPDATE TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('features:manage', gym_id)
  )
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('features:manage', gym_id)
  );

DROP POLICY IF EXISTS feature_settings_delete ON public.gym_feature_settings;
CREATE POLICY feature_settings_delete
  ON public.gym_feature_settings FOR DELETE TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('features:manage', gym_id)
  );

CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_gym_id UUID;
  v_permissions JSONB;
BEGIN
  SELECT role, gym_id INTO v_role, v_gym_id
  FROM public.profiles
  WHERE id = auth.uid() AND status <> 'rejected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT COALESCE(jsonb_agg(keys.permission ORDER BY keys.permission), '[]'::jsonb)
  INTO v_permissions
  FROM (
    SELECT permission
    FROM public.gym_role_permission_defaults
    WHERE role = 'owner'
  ) keys
  WHERE public.has_gym_permission(keys.permission, v_gym_id);

  RETURN jsonb_build_object(
    'role', v_role::TEXT,
    'gym_id', v_gym_id,
    'permissions', v_permissions,
    'features', jsonb_build_object(
      'member_feed', public.gym_feature_enabled('member_feed', v_gym_id),
      'leaderboards', public.gym_feature_enabled('leaderboards', v_gym_id),
      'public_team', public.gym_feature_enabled('public_team', v_gym_id),
      'public_pricing', public.gym_feature_enabled('public_pricing', v_gym_id),
      'public_location', public.gym_feature_enabled('public_location', v_gym_id),
      'announcements', public.gym_feature_enabled('announcements', v_gym_id),
      'promos', public.gym_feature_enabled('promos', v_gym_id),
      'kiosk_checkin', public.gym_feature_enabled('kiosk_checkin', v_gym_id),
      'trainer_bookings', false,
      'friends_chat', false,
      'workout_log', false,
      'session_posts', false
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_gym_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym public.gyms%ROWTYPE;
  v_member_count INTEGER;
  v_public_team BOOLEAN;
  v_public_pricing BOOLEAN;
  v_public_location BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT * INTO v_gym
  FROM public.gyms
  WHERE LOWER(code) = LOWER(p_code);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_public_team := public.gym_feature_enabled('public_team', v_gym.id);
  v_public_pricing := public.gym_feature_enabled('public_pricing', v_gym.id);
  v_public_location := public.gym_feature_enabled('public_location', v_gym.id);

  SELECT COUNT(*) INTO v_member_count
  FROM public.profiles
  WHERE gym_id = v_gym.id
    AND status = 'active'
    AND role = 'member';

  v_result := jsonb_build_object(
    'id', v_gym.id,
    'name', v_gym.name,
    'code', v_gym.code,
    'address', v_gym.address,
    'phone', v_gym.phone,
    'tagline', v_gym.tagline,
    'description', v_gym.description,
    'logo_url', v_gym.logo_url,
    'cover_url', v_gym.cover_url,
    'logo_path', v_gym.logo_path,
    'cover_path', v_gym.cover_path,
    -- to_jsonb keeps 016 valid in a clean numeric reset where 017 adds these
    -- columns later, while exposing their real values when 017 shipped early.
    'cover_focal', COALESCE(
      to_jsonb(v_gym) -> 'cover_focal',
      '{"x":50,"y":50}'::jsonb
    ),
    'section_visibility', COALESCE(
      to_jsonb(v_gym) -> 'section_visibility',
      '{"amenities":true,"hours":true,"contact":true}'::jsonb
    ),
    'brand_color', COALESCE(v_gym.brand_color, '#D4956A'),
    'secondary_color', v_gym.secondary_color,
    'operating_hours', v_gym.operating_hours,
    'amenities', v_gym.amenities,
    'social_links', v_gym.social_links,
    'member_count', v_member_count,
    -- The real-column visibility correction is intentionally pending explicit
    -- product-owner approval; preserve existing behavior until then.
    'is_published', (v_gym.tagline IS NOT NULL AND TRIM(v_gym.tagline) <> ''),
    'features', jsonb_build_object(
      'public_team', v_public_team,
      'public_pricing', v_public_pricing,
      'public_location', v_public_location
    )
  );

  IF v_public_team THEN
    v_result := v_result || jsonb_build_object('team_members', v_gym.team_members);
  END IF;
  IF v_public_pricing THEN
    v_result := v_result || jsonb_build_object('pricing_packages', v_gym.pricing_packages);
  END IF;
  IF v_public_location THEN
    v_result := v_result || jsonb_build_object(
      'map_embed_url', v_gym.map_embed_url,
      'directions', v_gym.directions
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gym_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gym_by_code(TEXT) TO anon, authenticated, service_role;

-- Feature-aware RLS policies.
DROP POLICY IF EXISTS feed_select ON public.feed_items;
CREATE POLICY feed_select
  ON public.feed_items FOR SELECT TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.gym_feature_enabled('member_feed', gym_id)
  );

DROP POLICY IF EXISTS feed_insert ON public.feed_items;
CREATE POLICY feed_insert
  ON public.feed_items FOR INSERT TO authenticated
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.gym_feature_enabled('member_feed', gym_id)
    AND (auth.uid() = member_id OR public.is_manager())
  );

DROP POLICY IF EXISTS announcements_manage ON public.announcements;
CREATE POLICY announcements_manage
  ON public.announcements FOR ALL TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.gym_feature_enabled('announcements', gym_id)
    AND public.has_gym_permission('announcements:manage', gym_id)
  )
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.gym_feature_enabled('announcements', gym_id)
    AND public.has_gym_permission('announcements:manage', gym_id)
  );

DROP POLICY IF EXISTS promos_manage ON public.promos;
DROP POLICY IF EXISTS promos_select ON public.promos;
CREATE POLICY promos_select
  ON public.promos FOR SELECT TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.gym_feature_enabled('promos', gym_id)
  );
CREATE POLICY promos_manage
  ON public.promos FOR ALL TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.gym_feature_enabled('promos', gym_id)
    AND public.has_gym_permission('promos:manage', gym_id)
  )
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.gym_feature_enabled('promos', gym_id)
    AND public.has_gym_permission('promos:manage', gym_id)
  );

CREATE OR REPLACE FUNCTION public.leaderboard_workouts(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id AS member_id,
    p.name AS member_name,
    p.avatar_url AS avatar_url,
    COUNT(a.id) AS value
  FROM public.profiles p
  JOIN public.attendance a ON a.member_id = p.id
  WHERE public.gym_feature_enabled('leaderboards', public.get_gym_id())
    AND p.gym_id = public.get_gym_id()
    AND p.role = 'member'
    AND a.gym_id = public.get_gym_id()
  GROUP BY p.id, p.name, p.avatar_url
  ORDER BY value DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_week_streak(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH weekly_visits AS (
    SELECT
      member_id,
      DATE_TRUNC('week', check_in)::DATE AS week_start
    FROM public.attendance
    WHERE gym_id = public.get_gym_id()
      AND public.gym_feature_enabled('leaderboards', public.get_gym_id())
    GROUP BY member_id, DATE_TRUNC('week', check_in)::DATE
  ),
  ranked AS (
    SELECT
      member_id,
      week_start,
      ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY week_start DESC) AS rn,
      (DATE_TRUNC('week', CURRENT_DATE)::DATE
        - ((ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY week_start DESC) - 1)
           * INTERVAL '7 days'))::DATE AS expected_week
    FROM weekly_visits
  ),
  streaks AS (
    SELECT member_id, COUNT(*)::INTEGER AS week_streak
    FROM ranked
    WHERE week_start = expected_week
    GROUP BY member_id
  )
  SELECT
    p.id AS member_id,
    p.name AS member_name,
    p.avatar_url AS avatar_url,
    COALESCE(s.week_streak, 0) AS value
  FROM public.profiles p
  LEFT JOIN streaks s ON s.member_id = p.id
  WHERE public.gym_feature_enabled('leaderboards', public.get_gym_id())
    AND p.gym_id = public.get_gym_id()
    AND p.role = 'member'
    AND COALESCE(s.week_streak, 0) > 0
  ORDER BY value DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_longest_member(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id AS member_id,
    p.name AS member_name,
    p.avatar_url AS avatar_url,
    (
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.created_at::DATE)) * 12
      + EXTRACT(MONTH FROM AGE(CURRENT_DATE, p.created_at::DATE))
    )::INTEGER AS value
  FROM public.profiles p
  WHERE public.gym_feature_enabled('leaderboards', public.get_gym_id())
    AND p.gym_id = public.get_gym_id()
    AND p.role = 'member'
    AND p.status = 'active'
  ORDER BY value DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.member_home_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_tz TEXT := 'Asia/Manila';
  v_month_start DATE := DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'Asia/Manila')::DATE;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL OR v_gym_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT jsonb_build_object(
    'people_in_gym', (
      SELECT COUNT(*) FROM public.attendance
      WHERE gym_id = v_gym_id AND check_out IS NULL
    ),
    'total_visits', (
      SELECT COUNT(*) FROM public.attendance WHERE member_id = v_uid
    ),
    'monthly_visits', (
      SELECT COUNT(*) FROM public.attendance
      WHERE member_id = v_uid
        AND (check_in AT TIME ZONE v_tz)::DATE >= v_month_start
    ),
    'avg_session_minutes', (
      SELECT COALESCE(ROUND(AVG(duration_min)), 0)
      FROM public.attendance
      WHERE member_id = v_uid AND duration_min IS NOT NULL
    ),
    'streak', (
      SELECT jsonb_build_object(
        'current_streak', COALESCE(current_streak, 0),
        'best_streak', COALESCE(best_streak, 0),
        'last_visit_date', last_visit_date
      )
      FROM public.streaks WHERE member_id = v_uid
    ),
    'recent_visits', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'date', (check_in AT TIME ZONE v_tz)::DATE,
          'duration_min', duration_min
        ) ORDER BY check_in DESC
      ), '[]'::jsonb)
      FROM (
        SELECT check_in, duration_min
        FROM public.attendance
        WHERE member_id = v_uid
        ORDER BY check_in DESC
        LIMIT 10
      ) t
    ),
    'calendar_dates', (
      SELECT COALESCE(
        jsonb_agg(
          DISTINCT (check_in AT TIME ZONE v_tz)::DATE
          ORDER BY (check_in AT TIME ZONE v_tz)::DATE
        ),
        '[]'::jsonb
      )
      FROM public.attendance
      WHERE member_id = v_uid
        AND (check_in AT TIME ZONE v_tz)::DATE >= CURRENT_DATE - INTERVAL '60 days'
    ),
    'membership', (
      SELECT jsonb_build_object(
        'plan_name', COALESCE(mp.name, 'Unknown'),
        'status', m.status,
        'start_date', m.start_date,
        'end_date', m.end_date,
        'days_left', GREATEST(0, (m.end_date::DATE - CURRENT_DATE))
      )
      FROM public.memberships m
      LEFT JOIN public.membership_plans mp ON mp.id = m.plan_id
      WHERE m.member_id = v_uid
      ORDER BY m.created_at DESC
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_access_allowed(p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_gym_id IS NOT NULL
    AND p_gym_id = public.get_gym_id()
    AND public.is_manager()
    AND public.has_gym_permission('kiosk:use', p_gym_id)
    AND public.gym_feature_enabled('kiosk_checkin', p_gym_id);
$$;

REVOKE EXECUTE ON FUNCTION public.kiosk_access_allowed(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_access_allowed(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kiosk_checkin(p_qr_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_member public.profiles%ROWTYPE;
  v_open public.attendance%ROWTYPE;
  v_att_id UUID;
  v_duration INT;
BEGIN
  IF NOT public.kiosk_access_allowed(v_gym_id) THEN
    RETURN jsonb_build_object(
      'error', 'forbidden',
      'message', 'Kiosk check-ins are unavailable'
    );
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
  WHERE member_id = v_member.id
    AND gym_id = v_gym_id
    AND check_out IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.attendance
    SET check_out = NOW()
    WHERE id = v_open.id
    RETURNING id INTO v_att_id;
    SELECT duration_min INTO v_duration
    FROM public.attendance WHERE id = v_att_id;
    RETURN jsonb_build_object(
      'action', 'checked_out',
      'attendance_id', v_att_id,
      'member_id', v_member.id,
      'member_name', v_member.name,
      'duration_min', v_duration
    );
  END IF;

  INSERT INTO public.attendance (member_id, gym_id, check_in)
  VALUES (v_member.id, v_gym_id, NOW())
  RETURNING id INTO v_att_id;
  PERFORM public.kiosk_update_streak(v_member.id, v_gym_id);
  RETURN jsonb_build_object(
    'action', 'checked_in',
    'attendance_id', v_att_id,
    'member_id', v_member.id,
    'member_name', v_member.name,
    'member_status', v_member.status,
    'duration_min', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_checkin_by_member(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_member public.profiles%ROWTYPE;
  v_open public.attendance%ROWTYPE;
  v_att_id UUID;
  v_duration INT;
BEGIN
  IF NOT public.kiosk_access_allowed(v_gym_id) THEN
    RETURN jsonb_build_object(
      'error', 'forbidden',
      'message', 'Kiosk check-ins are unavailable'
    );
  END IF;

  SELECT * INTO v_member
  FROM public.profiles
  WHERE id = p_member_id AND gym_id = v_gym_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Member not found');
  END IF;

  SELECT * INTO v_open
  FROM public.attendance
  WHERE member_id = p_member_id
    AND gym_id = v_gym_id
    AND check_out IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.attendance
    SET check_out = NOW()
    WHERE id = v_open.id
    RETURNING id INTO v_att_id;
    SELECT duration_min INTO v_duration
    FROM public.attendance WHERE id = v_att_id;
    RETURN jsonb_build_object(
      'action', 'checked_out',
      'attendance_id', v_att_id,
      'member_id', v_member.id,
      'member_name', v_member.name,
      'duration_min', v_duration
    );
  END IF;

  INSERT INTO public.attendance (member_id, gym_id, check_in)
  VALUES (p_member_id, v_gym_id, NOW())
  RETURNING id INTO v_att_id;
  PERFORM public.kiosk_update_streak(p_member_id, v_gym_id);
  RETURN jsonb_build_object(
    'action', 'checked_in',
    'attendance_id', v_att_id,
    'member_id', v_member.id,
    'member_name', v_member.name,
    'member_status', v_member.status,
    'duration_min', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_checkout(p_attendance_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_duration INT;
BEGIN
  IF NOT public.kiosk_access_allowed(v_gym_id) THEN
    RETURN jsonb_build_object(
      'error', 'forbidden',
      'message', 'Kiosk check-ins are unavailable'
    );
  END IF;

  UPDATE public.attendance
  SET check_out = NOW()
  WHERE id = p_attendance_id
    AND gym_id = v_gym_id
    AND check_out IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT duration_min INTO v_duration
  FROM public.attendance WHERE id = p_attendance_id;
  RETURN jsonb_build_object('duration_min', v_duration);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_get_checked_in()
RETURNS TABLE(
  attendance_id UUID,
  member_id UUID,
  member_name TEXT,
  check_in TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
BEGIN
  IF NOT public.kiosk_access_allowed(v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  SELECT a.id, a.member_id, p.name, a.check_in
  FROM public.attendance a
  JOIN public.profiles p ON p.id = a.member_id
  WHERE a.gym_id = v_gym_id AND a.check_out IS NULL
  ORDER BY a.check_in ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_search_members(p_query TEXT)
RETURNS TABLE(
  id UUID,
  name TEXT,
  email TEXT,
  contact_number TEXT,
  membership_status TEXT,
  plan_name TEXT,
  end_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_pattern TEXT;
BEGIN
  IF NOT public.kiosk_access_allowed(v_gym_id)
     OR NOT public.has_gym_permission('members:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

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
  WHERE p.gym_id = v_gym_id
    AND p.role = 'member'
    AND (
      p.name ILIKE v_pattern ESCAPE '\'
      OR p.contact_number ILIKE v_pattern ESCAPE '\'
    )
  ORDER BY p.name
  LIMIT 20;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_update_streak(p_member_id UUID, p_gym_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_last_visit DATE;
  v_current INT;
  v_best INT;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles
       WHERE id = p_member_id
         AND gym_id = p_gym_id
         AND role = 'member'
     ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT last_visit_date, current_streak, best_streak
  INTO v_last_visit, v_current, v_best
  FROM public.streaks
  WHERE member_id = p_member_id;

  IF NOT FOUND THEN
    INSERT INTO public.streaks (
      member_id, gym_id, current_streak, best_streak, last_visit_date
    ) VALUES (
      p_member_id, p_gym_id, 1, 1, v_today
    );
    RETURN;
  END IF;

  IF v_last_visit = v_today THEN
    RETURN;
  ELSIF v_last_visit = v_today - 1 THEN
    v_current := v_current + 1;
  ELSE
    v_current := 1;
  END IF;

  v_best := GREATEST(v_best, v_current);
  UPDATE public.streaks
  SET current_streak = v_current,
      best_streak = v_best,
      last_visit_date = v_today,
      gym_id = COALESCE(gym_id, p_gym_id)
  WHERE member_id = p_member_id;
END;
$$;
