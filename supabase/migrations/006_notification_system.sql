-- ============================================
-- 005 — Notification System for Member Engagement
-- ============================================
-- Supports: membership expiry, streak milestones, 
-- inactivity nudges, announcements
-- ============================================

-- ────────────────────────────────────────────
-- 0. FIX EXISTING NOTIFICATIONS TABLE CONSTRAINT
--    The existing notifications.type CHECK constraint 
--    needs to include new notification types
-- ────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY[
  'member_pending'::text, 
  'member_checkin'::text, 
  'membership_expiring'::text,
  'membership_expiry_7d'::text,
  'membership_expiry_0d'::text,
  'streak_milestone'::text,
  'inactivity_nudge'::text,
  'announcement'::text
]));

-- ────────────────────────────────────────────
-- 1. NOTIFICATION TYPE ENUM
-- ────────────────────────────────────────────
CREATE TYPE notification_type AS ENUM (
  'membership_expiry_7d',
  'membership_expiry_0d', 
  'streak_milestone',
  'inactivity_nudge',
  'announcement'
);

-- ────────────────────────────────────────────
-- 2. MEMBER NOTIFICATION PREFERENCES
--    Allows members to opt-out of specific types
-- ────────────────────────────────────────────
CREATE TABLE member_notification_preferences (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gym_id                      UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  inactivity_nudges_enabled   BOOLEAN NOT NULL DEFAULT true,
  streak_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id)
);

CREATE INDEX idx_notif_prefs_member ON member_notification_preferences(member_id);
CREATE INDEX idx_notif_prefs_gym ON member_notification_preferences(gym_id);

-- ────────────────────────────────────────────
-- 3. NOTIFICATION COOLDOWNS
--    Tracks last sent time per member per type
--    Prevents spam and enables caps
-- ────────────────────────────────────────────
CREATE TABLE notification_cooldowns (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gym_id                  UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  notification_type       notification_type NOT NULL,
  last_sent_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- For inactivity: count nudges per absence period (resets on check-in)
  inactivity_nudge_count  INTEGER NOT NULL DEFAULT 0,
  -- For daily caps
  daily_count             INTEGER NOT NULL DEFAULT 1,
  daily_count_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(member_id, notification_type)
);

CREATE INDEX idx_cooldowns_member ON notification_cooldowns(member_id);
CREATE INDEX idx_cooldowns_type ON notification_cooldowns(notification_type);

-- ────────────────────────────────────────────
-- 4. ADD avg_visit_interval_days TO STREAKS
--    Caches the average days between visits
-- ────────────────────────────────────────────
ALTER TABLE streaks 
ADD COLUMN IF NOT EXISTS avg_visit_interval_days NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS total_visits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_visit_date DATE;

-- ────────────────────────────────────────────
-- 5. MEMBER NOTIFICATIONS TABLE
--    Extends existing notifications for member-facing use
-- ────────────────────────────────────────────
-- Check if notifications table exists and has required columns
-- If not, create it; otherwise add member-specific columns

DO $$
BEGIN
  -- Add notification_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'notification_type'
  ) THEN
    ALTER TABLE notifications ADD COLUMN notification_type notification_type;
  END IF;
  
  -- Add for_member column to distinguish member vs admin notifications
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'for_member'
  ) THEN
    ALTER TABLE notifications ADD COLUMN for_member BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_member_type 
ON notifications(member_id, notification_type) WHERE for_member = true;

CREATE INDEX IF NOT EXISTS idx_notifications_for_member 
ON notifications(member_id) WHERE for_member = true;

-- ────────────────────────────────────────────
-- 6. RLS POLICIES
-- ────────────────────────────────────────────

-- Member Notification Preferences
ALTER TABLE member_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prefs_select"
  ON member_notification_preferences FOR SELECT
  USING (auth.uid() = member_id OR public.is_manager());

CREATE POLICY "prefs_insert"
  ON member_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "prefs_update"
  ON member_notification_preferences FOR UPDATE
  USING (auth.uid() = member_id);

-- Notification Cooldowns (internal, manager access only)
ALTER TABLE notification_cooldowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cooldowns_select"
  ON notification_cooldowns FOR SELECT
  USING (public.is_manager() OR auth.uid() = member_id);

CREATE POLICY "cooldowns_manage"
  ON notification_cooldowns FOR ALL
  USING (public.is_manager());

-- ────────────────────────────────────────────
-- 7. HELPER FUNCTIONS
-- ────────────────────────────────────────────

-- Calculate average visit interval for a member
CREATE OR REPLACE FUNCTION calculate_avg_visit_interval(p_member_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_visits INTEGER;
  v_first_visit DATE;
  v_last_visit DATE;
  v_days_span INTEGER;
  v_avg_interval NUMERIC(5,2);
BEGIN
  -- Get visit stats
  SELECT 
    COUNT(*)::INTEGER,
    MIN(check_in::DATE),
    MAX(check_in::DATE)
  INTO v_total_visits, v_first_visit, v_last_visit
  FROM public.attendance
  WHERE member_id = p_member_id;
  
  -- Need at least 3 visits to calculate meaningful interval
  IF v_total_visits < 3 THEN
    RETURN NULL;
  END IF;
  
  v_days_span := v_last_visit - v_first_visit;
  
  -- Avoid division by zero
  IF v_days_span = 0 THEN
    RETURN 1.0;
  END IF;
  
  -- Average interval = total days / (visits - 1)
  v_avg_interval := v_days_span::NUMERIC / (v_total_visits - 1);
  
  -- Update the streaks table cache
  UPDATE public.streaks
  SET 
    avg_visit_interval_days = v_avg_interval,
    total_visits = v_total_visits,
    first_visit_date = v_first_visit
  WHERE member_id = p_member_id;
  
  RETURN v_avg_interval;
END;
$$;

-- Check if a notification can be sent (respects caps, cooldowns, preferences)
CREATE OR REPLACE FUNCTION can_send_member_notification(
  p_member_id UUID,
  p_notification_type notification_type
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_prefs RECORD;
  v_cooldown RECORD;
  v_daily_count INTEGER;
  v_weekly_count INTEGER;
  v_membership_expired BOOLEAN;
BEGIN
  -- Get member preferences (or defaults if not set)
  SELECT 
    COALESCE(inactivity_nudges_enabled, true) as inactivity_enabled,
    COALESCE(streak_notifications_enabled, true) as streak_enabled
  INTO v_prefs
  FROM public.member_notification_preferences
  WHERE member_id = p_member_id;
  
  -- If no prefs row, use defaults (all enabled)
  IF NOT FOUND THEN
    v_prefs.inactivity_enabled := true;
    v_prefs.streak_enabled := true;
  END IF;
  
  -- Check preference for this type
  IF p_notification_type = 'inactivity_nudge' AND NOT v_prefs.inactivity_enabled THEN
    RETURN false;
  END IF;
  
  IF p_notification_type = 'streak_milestone' AND NOT v_prefs.streak_enabled THEN
    RETURN false;
  END IF;
  
  -- Check if membership is expired (don't send inactivity nudges to expired members)
  IF p_notification_type = 'inactivity_nudge' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.memberships
      WHERE member_id = p_member_id
      AND status = 'active'
      AND end_date >= CURRENT_DATE
    ) INTO v_membership_expired;
    
    IF NOT v_membership_expired THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Check daily cap (max 2 per day)
  SELECT COUNT(*) INTO v_daily_count
  FROM public.notifications
  WHERE member_id = p_member_id
    AND for_member = true
    AND created_at::DATE = CURRENT_DATE;
  
  IF v_daily_count >= 2 THEN
    RETURN false;
  END IF;
  
  -- Check weekly cap (max 5 per week)
  SELECT COUNT(*) INTO v_weekly_count
  FROM public.notifications
  WHERE member_id = p_member_id
    AND for_member = true
    AND created_at >= NOW() - INTERVAL '7 days';
  
  IF v_weekly_count >= 5 THEN
    RETURN false;
  END IF;
  
  -- Check cooldown for this specific type
  SELECT * INTO v_cooldown
  FROM public.notification_cooldowns
  WHERE member_id = p_member_id
    AND notification_type = p_notification_type;
  
  IF FOUND THEN
    -- Type-specific cooldowns
    CASE p_notification_type
      WHEN 'inactivity_nudge' THEN
        -- Max 2 nudges per absence period, 7 days apart
        IF v_cooldown.inactivity_nudge_count >= 2 THEN
          RETURN false;
        END IF;
        IF v_cooldown.last_sent_at > NOW() - INTERVAL '7 days' THEN
          RETURN false;
        END IF;
      WHEN 'announcement' THEN
        -- 24 hours between announcements
        IF v_cooldown.last_sent_at > NOW() - INTERVAL '24 hours' THEN
          RETURN false;
        END IF;
      ELSE
        -- No additional cooldown for expiry/streak (they have natural spacing)
        NULL;
    END CASE;
  END IF;
  
  RETURN true;
END;
$$;

-- Record that a notification was sent (updates cooldown tracking)
CREATE OR REPLACE FUNCTION record_notification_sent(
  p_member_id UUID,
  p_gym_id UUID,
  p_notification_type notification_type
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.notification_cooldowns (
    member_id, gym_id, notification_type, last_sent_at, 
    inactivity_nudge_count, daily_count, daily_count_date
  )
  VALUES (
    p_member_id, p_gym_id, p_notification_type, NOW(),
    CASE WHEN p_notification_type = 'inactivity_nudge' THEN 1 ELSE 0 END,
    1, CURRENT_DATE
  )
  ON CONFLICT (member_id, notification_type) DO UPDATE SET
    last_sent_at = NOW(),
    inactivity_nudge_count = CASE 
      WHEN p_notification_type = 'inactivity_nudge' 
      THEN notification_cooldowns.inactivity_nudge_count + 1 
      ELSE notification_cooldowns.inactivity_nudge_count 
    END,
    daily_count = CASE 
      WHEN notification_cooldowns.daily_count_date = CURRENT_DATE 
      THEN notification_cooldowns.daily_count + 1 
      ELSE 1 
    END,
    daily_count_date = CURRENT_DATE;
END;
$$;

-- Reset inactivity nudge count when member checks in
CREATE OR REPLACE FUNCTION reset_inactivity_nudge_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Reset the inactivity nudge count when member checks in
  UPDATE public.notification_cooldowns
  SET inactivity_nudge_count = 0
  WHERE member_id = NEW.member_id
    AND notification_type = 'inactivity_nudge';
  
  -- Also update the visit stats in streaks
  PERFORM public.calculate_avg_visit_interval(NEW.member_id);
  
  RETURN NEW;
END;
$$;

-- Trigger to reset inactivity count on check-in
DROP TRIGGER IF EXISTS on_checkin_reset_nudges ON attendance;
CREATE TRIGGER on_checkin_reset_nudges
  AFTER INSERT ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION reset_inactivity_nudge_count();

-- ────────────────────────────────────────────
-- 8. CREATE MEMBER NOTIFICATION HELPER
--    Convenience function to create a notification
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_member_notification(
  p_member_id UUID,
  p_gym_id UUID,
  p_type notification_type,
  p_title TEXT,
  p_body TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Check if we can send
  IF NOT public.can_send_member_notification(p_member_id, p_type) THEN
    RETURN NULL;
  END IF;
  
  -- Create the notification
  INSERT INTO public.notifications (
    gym_id, member_id, type, title, body, is_read, for_member, notification_type
  )
  VALUES (
    p_gym_id, p_member_id, p_type::TEXT, p_title, p_body, false, true, p_type
  )
  RETURNING id INTO v_notification_id;
  
  -- Record that we sent it
  PERFORM public.record_notification_sent(p_member_id, p_gym_id, p_type);
  
  RETURN v_notification_id;
END;
$$;

-- ────────────────────────────────────────────
-- 9. STREAK MILESTONE NOTIFICATION TRIGGER
--    Creates notification when streak hits milestone
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_streak_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_gym_id UUID;
  v_milestone INTEGER;
  v_title TEXT;
  v_body TEXT;
  v_milestones INTEGER[] := ARRAY[7, 14, 30, 50, 100];
BEGIN
  -- Only trigger if streak increased
  IF NEW.current_streak <= OLD.current_streak THEN
    RETURN NEW;
  END IF;
  
  -- Check if new streak is a milestone
  IF NEW.current_streak = ANY(v_milestones) THEN
    v_milestone := NEW.current_streak;
    
    -- Get member's gym
    SELECT gym_id INTO v_gym_id 
    FROM public.profiles 
    WHERE id = NEW.member_id;
    
    -- Build motivational message
    CASE v_milestone
      WHEN 7 THEN
        v_title := 'One week strong! 🔥';
        v_body := 'You''re building a habit. Keep it up!';
      WHEN 14 THEN
        v_title := 'Two weeks in a row! 💪';
        v_body := 'You''re in the top 15% of members. Impressive!';
      WHEN 30 THEN
        v_title := '30-day streak! 🏆';
        v_body := 'Your dedication is inspiring. A full month of consistency!';
      WHEN 50 THEN
        v_title := '50 days strong! 🌟';
        v_body := 'Half a century of showing up. You''re unstoppable!';
      WHEN 100 THEN
        v_title := 'CENTURY CLUB! 💯';
        v_body := '100 days of showing up. You are legendary!';
    END CASE;
    
    -- Create the notification
    PERFORM public.create_member_notification(
      NEW.member_id,
      v_gym_id,
      'streak_milestone',
      v_title,
      v_body
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_streak_milestone ON streaks;
CREATE TRIGGER on_streak_milestone
  AFTER UPDATE ON streaks
  FOR EACH ROW
  EXECUTE FUNCTION check_streak_milestone();

-- ────────────────────────────────────────────
-- 10. DAILY NOTIFICATION JOB FUNCTIONS
--     To be called by pg_cron or Edge Function
-- ────────────────────────────────────────────

-- Process membership expiry notifications
CREATE OR REPLACE FUNCTION process_expiry_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
  v_member RECORD;
  v_title TEXT;
  v_body TEXT;
  v_type notification_type;
  v_days_left INTEGER;
BEGIN
  -- Find members with expiring memberships
  FOR v_member IN
    SELECT 
      m.member_id,
      m.gym_id,
      m.end_date,
      p.name,
      (m.end_date - CURRENT_DATE) as days_until_expiry
    FROM public.memberships m
    JOIN public.profiles p ON p.id = m.member_id
    WHERE m.status = 'active'
      AND m.end_date >= CURRENT_DATE
      AND m.end_date <= CURRENT_DATE + INTERVAL '7 days'
  LOOP
    v_days_left := v_member.days_until_expiry;
    
    -- Only notify at 7 days and 0 days
    IF v_days_left = 7 THEN
      v_type := 'membership_expiry_7d';
      v_title := 'Membership ending soon';
      v_body := 'Your membership ends on ' || to_char(v_member.end_date, 'Mon DD') || '. Keep the momentum going — renew anytime! 💪';
    ELSIF v_days_left = 0 THEN
      v_type := 'membership_expiry_0d';
      v_title := 'Last day of membership';
      v_body := 'Today''s the last day of your membership. We''d love to keep you! 🏋️';
    ELSE
      CONTINUE; -- Skip other days
    END IF;
    
    -- Check if already sent this type
    IF NOT EXISTS (
      SELECT 1 FROM public.notification_cooldowns
      WHERE member_id = v_member.member_id
        AND notification_type = v_type
    ) THEN
      -- Create notification
      IF public.create_member_notification(
        v_member.member_id,
        v_member.gym_id,
        v_type,
        v_title,
        v_body
      ) IS NOT NULL THEN
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- Process inactivity nudge notifications (pattern-based)
CREATE OR REPLACE FUNCTION process_inactivity_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
  v_member RECORD;
  v_avg_interval NUMERIC;
  v_threshold_days NUMERIC;
  v_days_since_visit INTEGER;
  v_nudge_count INTEGER;
  v_title TEXT;
  v_body TEXT;
BEGIN
  -- Find members who haven't visited recently
  FOR v_member IN
    SELECT 
      s.member_id,
      s.last_visit_date,
      s.avg_visit_interval_days,
      s.total_visits,
      p.gym_id,
      p.name,
      (CURRENT_DATE - s.last_visit_date) as days_since_visit
    FROM public.streaks s
    JOIN public.profiles p ON p.id = s.member_id
    WHERE s.last_visit_date IS NOT NULL
      AND s.last_visit_date < CURRENT_DATE
      AND p.status = 'active'
      -- Has active membership
      AND EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.member_id = s.member_id
          AND m.status = 'active'
          AND m.end_date >= CURRENT_DATE
      )
  LOOP
    v_days_since_visit := v_member.days_since_visit;
    v_avg_interval := v_member.avg_visit_interval_days;
    
    -- Calculate interval if not cached
    IF v_avg_interval IS NULL AND v_member.total_visits >= 3 THEN
      v_avg_interval := public.calculate_avg_visit_interval(v_member.member_id);
    END IF;
    
    -- Determine threshold (1.5x average, clamped to 5-21 days)
    IF v_avg_interval IS NOT NULL THEN
      v_threshold_days := GREATEST(5, LEAST(21, v_avg_interval * 1.5));
    ELSE
      -- Default for new members: 7 days
      v_threshold_days := 7;
    END IF;
    
    -- Check if over threshold
    IF v_days_since_visit < v_threshold_days THEN
      CONTINUE;
    END IF;
    
    -- Get current nudge count
    SELECT COALESCE(inactivity_nudge_count, 0) INTO v_nudge_count
    FROM public.notification_cooldowns
    WHERE member_id = v_member.member_id
      AND notification_type = 'inactivity_nudge';
    
    IF NOT FOUND THEN
      v_nudge_count := 0;
    END IF;
    
    -- Max 2 nudges per absence period
    IF v_nudge_count >= 2 THEN
      CONTINUE;
    END IF;
    
    -- Build message based on nudge count
    IF v_nudge_count = 0 THEN
      v_title := 'We miss you! 🏃';
      v_body := 'Hey ' || split_part(v_member.name, ' ', 1) || ', it''s been a bit! Your next workout is waiting.';
    ELSE
      v_title := 'Still here when you''re ready 💪';
      v_body := 'No pressure, just potential. Your gym is ready when you are.';
    END IF;
    
    -- Create notification
    IF public.create_member_notification(
      v_member.member_id,
      v_member.gym_id,
      'inactivity_nudge',
      v_title,
      v_body
    ) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- Master daily notification processor
CREATE OR REPLACE FUNCTION process_daily_notifications()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_expiry_count INTEGER;
  v_inactivity_count INTEGER;
BEGIN
  -- Process both types
  v_expiry_count := public.process_expiry_notifications();
  v_inactivity_count := public.process_inactivity_notifications();
  
  RETURN jsonb_build_object(
    'expiry_notifications', v_expiry_count,
    'inactivity_notifications', v_inactivity_count,
    'processed_at', NOW()
  );
END;
$$;

-- ────────────────────────────────────────────
-- 11. GRANT PERMISSIONS
-- ────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION calculate_avg_visit_interval(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_send_member_notification(UUID, notification_type) TO authenticated;
GRANT EXECUTE ON FUNCTION create_member_notification(UUID, UUID, notification_type, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION process_daily_notifications() TO authenticated;
