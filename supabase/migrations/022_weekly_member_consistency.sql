-- Member consistency is measured in completed calendar weeks, not consecutive
-- days. Stren operates in the Philippines; the app's canonical timezone is
-- Asia/Manila until gyms gain a stored timezone of their own.

CREATE OR REPLACE FUNCTION public.member_weekly_streak(p_member_id UUID, p_gym_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE constants AS (
    SELECT date_trunc('week', now() AT TIME ZONE 'Asia/Manila')::DATE AS current_week
  ), completed_weeks AS (
    SELECT DISTINCT date_trunc('week', a.check_in AT TIME ZONE 'Asia/Manila')::DATE AS week_start
    FROM public.attendance a
    WHERE a.member_id = p_member_id AND a.gym_id = p_gym_id
  ), seed AS (
    SELECT CASE WHEN EXISTS (SELECT 1 FROM completed_weeks WHERE week_start = c.current_week)
      THEN c.current_week ELSE c.current_week - 7 END AS week_start
    FROM constants c
  ), runs AS (
    SELECT s.week_start, 1::INTEGER AS value
    FROM seed s JOIN completed_weeks w ON w.week_start = s.week_start
    UNION ALL
    SELECT r.week_start - 7, r.value + 1
    FROM runs r JOIN completed_weeks w ON w.week_start = r.week_start - 7
  )
  SELECT COALESCE(max(value), 0)::INTEGER FROM runs;
$$;

CREATE OR REPLACE FUNCTION public.member_best_weekly_streak(p_member_id UUID, p_gym_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH completed_weeks AS (
    SELECT DISTINCT date_trunc('week', a.check_in AT TIME ZONE 'Asia/Manila')::DATE AS week_start
    FROM public.attendance a
    WHERE a.member_id = p_member_id AND a.gym_id = p_gym_id
  ), grouped AS (
    SELECT week_start,
      week_start - (row_number() OVER (ORDER BY week_start)::INTEGER * 7) AS run_key
    FROM completed_weeks
  ), runs AS (
    SELECT count(*)::INTEGER AS run_length FROM grouped GROUP BY run_key
  )
  SELECT COALESCE(max(run_length), 0)::INTEGER FROM runs;
$$;

-- Convert any legacy daily counters as soon as the migration is applied.
UPDATE public.streaks s
SET current_streak = public.member_weekly_streak(s.member_id, s.gym_id),
    best_streak = public.member_best_weekly_streak(s.member_id, s.gym_id);

-- The member-facing RPC intentionally takes no account or gym argument. The
-- reusable helpers above are only called from SECURITY DEFINER functions, so a
-- member cannot probe another member's attendance through this calculation.
CREATE OR REPLACE FUNCTION public.my_weekly_streak()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
BEGIN
  IF v_uid IS NULL OR v_gym_id IS NULL
     OR NOT public.has_active_gym_affiliation(v_uid, v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  RETURN public.member_weekly_streak(v_uid, v_gym_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_update_streak(p_member_id UUID, p_gym_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT := 'Asia/Manila';
  v_today DATE := (now() AT TIME ZONE 'Asia/Manila')::DATE;
  v_current_week DATE := date_trunc('week', now() AT TIME ZONE 'Asia/Manila')::DATE;
  v_cursor DATE;
  v_current INTEGER := 0;
  v_best INTEGER := 0;
  v_has_current_week BOOLEAN;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id)
     OR NOT public.has_active_gym_affiliation(p_member_id, p_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  -- Multiple workouts in a week intentionally collapse to one completed week.
  SELECT EXISTS(
    SELECT 1 FROM public.attendance a
    WHERE a.member_id = p_member_id
      AND a.gym_id = p_gym_id
      AND date_trunc('week', a.check_in AT TIME ZONE v_tz)::DATE = v_current_week
  ) INTO v_has_current_week;

  -- The current week remains open until it ends. If it has no visit yet, the
  -- prior completed week still represents the active streak.
  v_cursor := CASE WHEN v_has_current_week THEN v_current_week ELSE v_current_week - 7 END;
  WHILE EXISTS (
    SELECT 1 FROM public.attendance a
    WHERE a.member_id = p_member_id
      AND a.gym_id = p_gym_id
      AND date_trunc('week', a.check_in AT TIME ZONE v_tz)::DATE = v_cursor
  ) LOOP
    v_current := v_current + 1;
    v_cursor := v_cursor - 7;
  END LOOP;

  -- Calculate the historical best sequence of consecutive completed weeks.
  WITH completed_weeks AS (
    SELECT DISTINCT date_trunc('week', a.check_in AT TIME ZONE v_tz)::DATE AS week_start
    FROM public.attendance a
    WHERE a.member_id = p_member_id AND a.gym_id = p_gym_id
  ), grouped AS (
    SELECT week_start,
      week_start - (row_number() OVER (ORDER BY week_start)::INTEGER * 7) AS run_key
    FROM completed_weeks
  ), runs AS (
    SELECT count(*)::INTEGER AS run_length FROM grouped GROUP BY run_key
  )
  SELECT COALESCE(max(run_length), 0) INTO v_best FROM runs;

  INSERT INTO public.streaks(member_id, gym_id, current_streak, best_streak, last_visit_date)
  VALUES (p_member_id, p_gym_id, v_current, v_best, v_today)
  ON CONFLICT (member_id, gym_id) DO UPDATE
  SET current_streak = EXCLUDED.current_streak,
      best_streak = EXCLUDED.best_streak,
      last_visit_date = EXCLUDED.last_visit_date;
END;
$$;

-- The leaderboard resolves weekly streaks from attendance rather than relying
-- on a potentially stale cached row. Its current-week grace matches the home.
CREATE OR REPLACE FUNCTION public.leaderboard_week_streak(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.name, p.avatar_url, streak.value
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  CROSS JOIN LATERAL (SELECT public.member_weekly_streak(gu.user_id, gu.gym_id) AS value) streak
  WHERE gu.gym_id = public.get_gym_id()
    AND gu.status = 'active'
    AND public.gym_feature_enabled('leaderboards', gu.gym_id)
    AND public.has_member_portal_entitlement(gu.user_id, gu.gym_id)
    AND streak.value > 0
  ORDER BY streak.value DESC, p.name ASC LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.kiosk_update_streak(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.member_weekly_streak(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.member_best_weekly_streak(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_weekly_streak() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_update_streak(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_weekly_streak() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leaderboard_week_streak(INTEGER) TO authenticated, service_role;
