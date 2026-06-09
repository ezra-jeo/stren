-- ============================================
-- 003 — Hardened RLS + create_gym_and_owner RPC
-- ============================================
-- Replaces all previous RLS policies with gym-scoped,
-- helper-function-backed policies. No "gym_id IS NULL" escape hatches.
-- ============================================

-- ────────────────────────────────────────────
-- 1. STABLE SECURITY DEFINER helpers
--    Cached per-statement. Every policy references these
--    instead of doing a per-row subquery into profiles.
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gym_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT gym_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid();
$$;

-- Small convenience: is caller a gym manager (admin / owner / staff)?
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin','owner','staff') FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- ────────────────────────────────────────────
-- 2. ATOMIC create_gym_and_owner RPC
--    Called from the client after supabase.auth.signUp().
--    Bypasses per-table RLS because it's SECURITY DEFINER.
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_gym_and_owner(
  p_user_id     UUID,
  p_email       TEXT,
  p_name        TEXT,
  p_gym_name    TEXT,
  p_gym_code    TEXT,
  p_gym_address TEXT DEFAULT NULL,
  p_gym_phone   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  -- Guard: caller must be the user being set up
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: auth.uid() must match p_user_id';
  END IF;

  -- 1. Create the gym
  INSERT INTO public.gyms (name, code, address, phone)
  VALUES (p_gym_name, p_gym_code, p_gym_address, p_gym_phone)
  RETURNING id INTO v_gym_id;

  -- 2. Upsert the owner profile (trigger may have already created a row)
  INSERT INTO public.profiles (id, email, name, role, status, gym_id, qr_code)
  VALUES (
    p_user_id,
    p_email,
    p_name,
    'owner',
    'active',
    v_gym_id,
    'stren://checkin/' || v_gym_id::TEXT || '/' || p_user_id::TEXT
  )
  ON CONFLICT (id) DO UPDATE SET
    name     = EXCLUDED.name,
    role     = 'owner',
    status   = 'active',
    gym_id   = v_gym_id,
    qr_code  = 'stren://checkin/' || v_gym_id::TEXT || '/' || p_user_id::TEXT;

  -- 3. Ensure streak row exists
  INSERT INTO public.streaks (member_id, current_streak, best_streak)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (member_id) DO NOTHING;

  -- Return useful info to the client
  RETURN jsonb_build_object(
    'gym_id', v_gym_id,
    'gym_code', p_gym_code
  );
END;
$$;

-- ────────────────────────────────────────────
-- 3. UPDATED handle_new_user trigger
--    Idempotent (ON CONFLICT DO NOTHING).
--    Defaults status to 'pending' so member signups
--    await approval. Owners override via RPC.
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, status, qr_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'member'),
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

-- ────────────────────────────────────────────
-- 4. DROP every old policy, then re-create
-- ────────────────────────────────────────────

-- === GYMS ===
DROP POLICY IF EXISTS "Anyone can view gyms"          ON gyms;
DROP POLICY IF EXISTS "Owners can manage own gym"     ON gyms;
DROP POLICY IF EXISTS "Auth users can create gyms"    ON gyms;

-- SELECT: any authenticated user can browse gyms (needed for member signup search)
CREATE POLICY "gyms_select"
  ON gyms FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- UPDATE: only the gym's owner/admin
CREATE POLICY "gyms_update"
  ON gyms FOR UPDATE
  USING (id = public.gym_id() AND public.get_user_role() IN ('owner','admin'));

-- INSERT is handled exclusively by the create_gym_and_owner RPC (SECURITY DEFINER).
-- No direct insert policy needed; this blocks rogue client-side INSERTs.

-- === PROFILES ===
DROP POLICY IF EXISTS "Users can view gym profiles"   ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles"   ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles"    ON profiles;

-- SELECT: see profiles in your gym
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (gym_id = public.gym_id());

-- INSERT: user can create their own row (signup flow)
CREATE POLICY "profiles_insert"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- UPDATE: user can edit own row; managers can edit gym members
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR (gym_id = public.gym_id() AND public.is_manager())
  );

-- === MEMBERSHIP_PLANS ===
DROP POLICY IF EXISTS "Anyone can view plans"         ON membership_plans;
DROP POLICY IF EXISTS "Admins can manage plans"       ON membership_plans;

CREATE POLICY "plans_select"
  ON membership_plans FOR SELECT
  USING (gym_id = public.gym_id());

CREATE POLICY "plans_manage"
  ON membership_plans FOR ALL
  USING (gym_id = public.gym_id() AND public.get_user_role() IN ('owner','admin'));

-- === MEMBERSHIPS ===
DROP POLICY IF EXISTS "Members can view own memberships"  ON memberships;
DROP POLICY IF EXISTS "Staff/admin can manage memberships" ON memberships;

CREATE POLICY "memberships_select"
  ON memberships FOR SELECT
  USING (
    gym_id = public.gym_id()
    AND (auth.uid() = member_id OR public.is_manager())
  );

CREATE POLICY "memberships_manage"
  ON memberships FOR ALL
  USING (gym_id = public.gym_id() AND public.is_manager());

-- === ATTENDANCE ===
DROP POLICY IF EXISTS "View gym attendance"            ON attendance;
DROP POLICY IF EXISTS "Anyone can view attendance"     ON attendance;
DROP POLICY IF EXISTS "Members can insert own attendance" ON attendance;
DROP POLICY IF EXISTS "Staff/admin can update attendance" ON attendance;

-- SELECT: gym members see their own; managers see all gym attendance
CREATE POLICY "attendance_select"
  ON attendance FOR SELECT
  USING (
    gym_id = public.gym_id()
    AND (auth.uid() = member_id OR public.is_manager())
  );

-- INSERT: member checks themselves in, OR a manager (kiosk operator) does it for them.
-- The kiosk is always operated by a logged-in admin/owner/staff.
CREATE POLICY "attendance_insert"
  ON attendance FOR INSERT
  WITH CHECK (
    (auth.uid() = member_id)
    OR public.is_manager()
  );

-- UPDATE (check-out): same rule as insert
CREATE POLICY "attendance_update"
  ON attendance FOR UPDATE
  USING (
    (auth.uid() = member_id)
    OR public.is_manager()
  );

-- === STREAKS ===
DROP POLICY IF EXISTS "Anyone can view streaks"       ON streaks;
DROP POLICY IF EXISTS "System can manage streaks"     ON streaks;

CREATE POLICY "streaks_select"
  ON streaks FOR SELECT
  USING (auth.uid() = member_id OR public.is_manager());

CREATE POLICY "streaks_manage"
  ON streaks FOR ALL
  USING (auth.uid() = member_id OR public.is_manager());

-- === BADGES ===
DROP POLICY IF EXISTS "Anyone can view badges"        ON badges;
DROP POLICY IF EXISTS "Admins can manage badges"      ON badges;

-- Gym-scoped badges: visible to gym members; manageable by gym managers.
-- Global (seed) badges have gym_id IS NULL — visible to all authenticated users.
CREATE POLICY "badges_select"
  ON badges FOR SELECT
  USING (gym_id IS NULL OR gym_id = public.gym_id());

CREATE POLICY "badges_manage"
  ON badges FOR ALL
  USING (gym_id = public.gym_id() AND public.get_user_role() IN ('owner','admin'));

-- === MEMBER_BADGES ===
DROP POLICY IF EXISTS "Anyone can view earned badges"  ON member_badges;
DROP POLICY IF EXISTS "System can award badges"        ON member_badges;

CREATE POLICY "member_badges_select"
  ON member_badges FOR SELECT
  USING (auth.uid() = member_id OR public.is_manager());

CREATE POLICY "member_badges_insert"
  ON member_badges FOR INSERT
  WITH CHECK (auth.uid() = member_id OR public.is_manager());

-- === CHALLENGES ===
DROP POLICY IF EXISTS "View gym challenges"           ON challenges;
DROP POLICY IF EXISTS "Anyone can view challenges"    ON challenges;
DROP POLICY IF EXISTS "Admins can manage challenges"  ON challenges;

CREATE POLICY "challenges_select"
  ON challenges FOR SELECT
  USING (gym_id = public.gym_id());

CREATE POLICY "challenges_manage"
  ON challenges FOR ALL
  USING (gym_id = public.gym_id() AND public.get_user_role() IN ('owner','admin'));

-- === CHALLENGE_PARTICIPANTS ===
DROP POLICY IF EXISTS "Anyone can view challenge participants"  ON challenge_participants;
DROP POLICY IF EXISTS "Members can join challenges"             ON challenge_participants;
DROP POLICY IF EXISTS "System can update challenge progress"    ON challenge_participants;

CREATE POLICY "cp_select"
  ON challenge_participants FOR SELECT
  USING (auth.uid() = member_id OR public.is_manager());

CREATE POLICY "cp_insert"
  ON challenge_participants FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "cp_update"
  ON challenge_participants FOR UPDATE
  USING (auth.uid() = member_id OR public.is_manager());

-- === FEED_ITEMS ===
DROP POLICY IF EXISTS "View gym feed"                 ON feed_items;
DROP POLICY IF EXISTS "Anyone can view feed"          ON feed_items;
DROP POLICY IF EXISTS "Members can insert own feed items" ON feed_items;

CREATE POLICY "feed_select"
  ON feed_items FOR SELECT
  USING (gym_id = public.gym_id());

CREATE POLICY "feed_insert"
  ON feed_items FOR INSERT
  WITH CHECK (auth.uid() = member_id OR public.is_manager());

-- === KUDOS ===
DROP POLICY IF EXISTS "Anyone can view kudos"         ON kudos;
DROP POLICY IF EXISTS "Members can give kudos"        ON kudos;

CREATE POLICY "kudos_select"
  ON kudos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "kudos_insert"
  ON kudos FOR INSERT
  WITH CHECK (auth.uid() = from_member);

-- === ANNOUNCEMENTS ===
DROP POLICY IF EXISTS "View gym announcements"        ON announcements;
DROP POLICY IF EXISTS "Anyone can view announcements" ON announcements;
DROP POLICY IF EXISTS "Admins can manage announcements" ON announcements;

CREATE POLICY "announcements_select"
  ON announcements FOR SELECT
  USING (gym_id = public.gym_id());

CREATE POLICY "announcements_manage"
  ON announcements FOR ALL
  USING (gym_id = public.gym_id() AND public.get_user_role() IN ('owner','admin'));
