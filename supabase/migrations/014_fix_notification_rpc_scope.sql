-- Phase 2.6: close direct-call gaps in notification and kiosk helper RPCs.
-- The daily processor is cron/service-role only. The remaining helpers retain
-- authenticated execution but validate the caller and gym inside the definer.

REVOKE EXECUTE ON FUNCTION public.process_daily_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_daily_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.can_send_member_notification(
  p_member_id UUID,
  p_notification_type public.notification_type
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id       UUID := auth.uid();
  v_caller_gym      UUID;
  v_member_gym      UUID;
  v_prefs           RECORD;
  v_cooldown        RECORD;
  v_daily_count     INTEGER;
  v_weekly_count    INTEGER;
  v_has_active_membership BOOLEAN;
BEGIN
  SELECT gym_id INTO v_member_gym
  FROM public.profiles
  WHERE id = p_member_id AND role = 'member';

  IF v_caller_id IS NULL OR v_member_gym IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF auth.uid() = p_member_id THEN
    NULL;
  ELSIF public.is_manager() THEN
    v_caller_gym := public.get_gym_id();
    IF v_caller_gym IS NULL OR v_caller_gym <> v_member_gym THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT
    COALESCE(inactivity_nudges_enabled, true) AS inactivity_enabled,
    COALESCE(streak_notifications_enabled, true) AS streak_enabled
  INTO v_prefs
  FROM public.member_notification_preferences
  WHERE member_id = p_member_id;

  IF NOT FOUND THEN
    v_prefs.inactivity_enabled := true;
    v_prefs.streak_enabled := true;
  END IF;

  IF p_notification_type = 'inactivity_nudge' AND NOT v_prefs.inactivity_enabled THEN RETURN false; END IF;
  IF p_notification_type = 'streak_milestone' AND NOT v_prefs.streak_enabled THEN RETURN false; END IF;

  IF p_notification_type = 'inactivity_nudge' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.memberships
      WHERE member_id = p_member_id
        AND status = 'active'
        AND end_date >= CURRENT_DATE
    ) INTO v_has_active_membership;
    IF NOT v_has_active_membership THEN RETURN false; END IF;
  END IF;

  SELECT COUNT(*) INTO v_daily_count
  FROM public.notifications
  WHERE member_id = p_member_id
    AND for_member = true
    AND created_at::DATE = CURRENT_DATE;
  IF v_daily_count >= 2 THEN RETURN false; END IF;

  SELECT COUNT(*) INTO v_weekly_count
  FROM public.notifications
  WHERE member_id = p_member_id
    AND for_member = true
    AND created_at >= NOW() - INTERVAL '7 days';
  IF v_weekly_count >= 5 THEN RETURN false; END IF;

  SELECT * INTO v_cooldown
  FROM public.notification_cooldowns
  WHERE member_id = p_member_id
    AND notification_type = p_notification_type;

  IF FOUND THEN
    CASE p_notification_type
      WHEN 'inactivity_nudge' THEN
        IF v_cooldown.inactivity_nudge_count >= 2 THEN RETURN false; END IF;
        IF v_cooldown.last_sent_at > NOW() - INTERVAL '7 days' THEN RETURN false; END IF;
      WHEN 'announcement' THEN
        IF v_cooldown.last_sent_at > NOW() - INTERVAL '24 hours' THEN RETURN false; END IF;
      ELSE NULL;
    END CASE;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_send_member_notification(UUID, public.notification_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_member_notification(UUID, public.notification_type) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_member_notification(
  p_member_id UUID,
  p_gym_id UUID,
  p_type public.notification_type,
  p_title TEXT,
  p_body TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_notification_id UUID;
BEGIN
  IF v_caller_id IS NULL
     OR NOT public.is_manager()
     OR p_gym_id <> public.get_gym_id()
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles
       WHERE id = p_member_id
         AND gym_id = p_gym_id
         AND role = 'member'
     ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF NOT public.can_send_member_notification(p_member_id, p_type) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    gym_id, member_id, type, title, body, is_read, for_member, notification_type
  ) VALUES (
    p_gym_id, p_member_id, p_type::TEXT, p_title, p_body, false, true, p_type
  )
  RETURNING id INTO v_notification_id;

  PERFORM public.record_notification_sent(p_member_id, p_gym_id, p_type);
  RETURN v_notification_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_member_notification(UUID, UUID, public.notification_type, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_notification(UUID, UUID, public.notification_type, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.kiosk_update_streak(p_member_id UUID, p_gym_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_last_visit DATE;
  v_current INT;
  v_best INT;
BEGIN
  IF v_caller_id IS NULL
     OR NOT public.is_manager()
     OR p_gym_id <> public.get_gym_id()
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

REVOKE EXECUTE ON FUNCTION public.kiosk_update_streak(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_update_streak(UUID, UUID) TO authenticated;
