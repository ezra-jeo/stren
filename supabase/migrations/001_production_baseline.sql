-- =============================================================================
-- 001_production_baseline.sql
-- Full production schema baseline (captured 2026-06-08)
--
-- This is the SINGLE source of truth for the Stren database schema.
-- Applied to a clean DB it reproduces the production schema exactly.
-- Applied to the live production DB it is a safe no-op (all statements
-- use IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
--
-- Old draft migrations 001-004 are archived in supabase/migrations/_archive/.
-- =============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('member', 'admin', 'staff', 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.membership_status AS ENUM ('active', 'expired', 'frozen');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'gcash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.feed_item_type AS ENUM (
    'check_in', 'check_out', 'badge', 'challenge', 'announcement', 'streak_milestone'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.profile_status AS ENUM ('pending', 'active', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'membership_expiry_7d', 'membership_expiry_0d',
    'streak_milestone', 'inactivity_nudge', 'announcement'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.promo_type AS ENUM (
    'student_pass', 'new_member', 'birthday', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Auth helper functions (needed by RLS policies below) ──────────────────────
CREATE OR REPLACE FUNCTION public.get_gym_id()
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

-- Remove old gym_id() alias from draft migration 003 if it exists
DROP FUNCTION IF EXISTS public.gym_id();

GRANT EXECUTE ON FUNCTION public.get_gym_id()    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_manager()    TO authenticated, anon;

-- ── Core tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gyms (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  code             TEXT UNIQUE NOT NULL,
  address          TEXT,
  phone            TEXT,
  tagline          TEXT,
  description      TEXT,
  logo_url         TEXT,
  cover_url        TEXT,
  brand_color      TEXT DEFAULT '#D4956A',
  secondary_color  TEXT,
  operating_hours  JSONB,
  amenities        TEXT[],
  social_links     JSONB,
  logo_path        TEXT,
  cover_path       TEXT,
  team_members     JSONB,
  pricing_packages JSONB,
  map_embed_url    TEXT,
  directions       TEXT,
  is_published     BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                     TEXT UNIQUE NOT NULL,
  name                      TEXT NOT NULL,
  contact_number            TEXT,
  role                      public.user_role DEFAULT 'member',
  status                    public.profile_status DEFAULT 'active',
  gym_id                    UUID REFERENCES public.gyms(id),
  avatar_url                TEXT,
  qr_code                   TEXT,
  avatar_updated_at         TIMESTAMPTZ,
  avatar_change_locked_until TIMESTAMPTZ,
  avatar_change_count       INTEGER NOT NULL DEFAULT 0,
  avatar_required           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.membership_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  duration_days INTEGER NOT NULL,
  gym_id        UUID REFERENCES public.gyms(id),
  description   TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.memberships (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id      UUID REFERENCES public.profiles(id),
  plan_id        UUID REFERENCES public.membership_plans(id),
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  status         public.membership_status DEFAULT 'active',
  payment_method public.payment_method NOT NULL,
  amount_paid    NUMERIC(10,2) NOT NULL,
  gym_id         UUID REFERENCES public.gyms(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id    UUID REFERENCES public.profiles(id),
  check_in     TIMESTAMPTZ DEFAULT NOW(),
  check_out    TIMESTAMPTZ,
  duration_min INTEGER,
  gym_id       UUID REFERENCES public.gyms(id)
);

-- If duration_min was created as a GENERATED column by old draft migrations,
-- convert it to a plain nullable INTEGER column to match production.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname  = 'attendance'
      AND a.attname  = 'duration_min'
      AND a.attgenerated = 's'
  ) THEN
    ALTER TABLE public.attendance DROP COLUMN duration_min;
    ALTER TABLE public.attendance ADD COLUMN duration_min INTEGER;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.streaks (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id              UUID UNIQUE REFERENCES public.profiles(id),
  current_streak         INTEGER DEFAULT 0,
  best_streak            INTEGER DEFAULT 0,
  last_visit_date        DATE,
  gym_id                 UUID REFERENCES public.gyms(id),
  avg_visit_interval_days NUMERIC,
  total_visits           INTEGER DEFAULT 0,
  first_visit_date       DATE
);

CREATE TABLE IF NOT EXISTS public.feed_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id   UUID REFERENCES public.profiles(id),
  type        public.feed_item_type NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  metadata    JSONB,
  kudos_count INTEGER DEFAULT 0,
  gym_id      UUID REFERENCES public.gyms(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  gym_id     UUID REFERENCES public.gyms(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.promos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id         UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  type           public.promo_type NOT NULL DEFAULT 'custom',
  description    TEXT,
  discount_type  TEXT NOT NULL,
  discount_value NUMERIC NOT NULL,
  plan_id        UUID REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  valid_from     DATE,
  valid_until    DATE,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id            UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  title             TEXT NOT NULL,
  body              TEXT,
  member_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_read           BOOLEAN DEFAULT FALSE,
  notification_type public.notification_type,
  for_member        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.member_notification_preferences (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                    UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id                       UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  inactivity_nudges_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  streak_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_cooldowns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id                UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  notification_type     public.notification_type NOT NULL,
  last_sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inactivity_nudge_count INTEGER NOT NULL DEFAULT 0,
  daily_count           INTEGER NOT NULL DEFAULT 1,
  daily_count_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (member_id, notification_type)
);

CREATE TABLE IF NOT EXISTS public.payments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id       UUID REFERENCES public.gyms(id),
  member_id    UUID REFERENCES public.profiles(id),
  amount       NUMERIC NOT NULL,
  method       TEXT,
  description  TEXT,
  payment_date DATE DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.member_onboarding_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id          UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  email           TEXT NOT NULL,
  magic_link_url  TEXT,
  qr_code         TEXT NOT NULL,
  sent_via        TEXT NOT NULL DEFAULT 'preview',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.classes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id        UUID REFERENCES public.gyms(id),
  name          TEXT NOT NULL,
  instructor_id UUID REFERENCES public.profiles(id),
  capacity      INTEGER,
  start_time    TIMESTAMPTZ,
  end_time      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.class_enrollments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id     UUID REFERENCES public.gyms(id),
  class_id   UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  member_id  UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.checkins (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id     UUID REFERENCES public.gyms(id),
  member_id  UUID REFERENCES public.profiles(id),
  check_in   TIMESTAMPTZ DEFAULT NOW(),
  check_out  TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop old draft-migration tables that do not exist in production
DROP TABLE IF EXISTS public.kudos               CASCADE;
DROP TABLE IF EXISTS public.challenge_participants CASCADE;
DROP TABLE IF EXISTS public.challenges          CASCADE;
DROP TABLE IF EXISTS public.member_badges       CASCADE;
DROP TABLE IF EXISTS public.badges              CASCADE;

-- Relax NOT NULL constraints altered from draft migrations
-- (ALTER COLUMN ... DROP NOT NULL is a no-op if already nullable)
ALTER TABLE public.attendance    ALTER COLUMN member_id   DROP NOT NULL;
ALTER TABLE public.attendance    ALTER COLUMN check_in    DROP NOT NULL;
ALTER TABLE public.memberships   ALTER COLUMN member_id   DROP NOT NULL;
ALTER TABLE public.memberships   ALTER COLUMN plan_id     DROP NOT NULL;
ALTER TABLE public.announcements ALTER COLUMN created_by  DROP NOT NULL;
ALTER TABLE public.feed_items    ALTER COLUMN member_id   DROP NOT NULL;
ALTER TABLE public.streaks       ALTER COLUMN member_id   DROP NOT NULL;

-- profiles.qr_code: was NOT NULL in drafts, nullable in production
ALTER TABLE public.profiles ALTER COLUMN qr_code DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN qr_code DROP DEFAULT;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- gyms
CREATE INDEX IF NOT EXISTS idx_gyms_code       ON public.gyms(code);
CREATE INDEX IF NOT EXISTS idx_gyms_name_trgm  ON public.gyms USING gin(name gin_trgm_ops);

-- profiles
CREATE UNIQUE INDEX IF NOT EXISTS profiles_qr_code_key         ON public.profiles(qr_code);
CREATE INDEX        IF NOT EXISTS idx_profiles_gym             ON public.profiles(gym_id);
CREATE INDEX        IF NOT EXISTS idx_profiles_gym_role_status ON public.profiles(gym_id, role, status);

-- membership_plans
CREATE INDEX IF NOT EXISTS idx_membership_plans_gym ON public.membership_plans(gym_id);

-- memberships
CREATE INDEX IF NOT EXISTS idx_memberships_gym          ON public.memberships(gym_id);
CREATE INDEX IF NOT EXISTS idx_memberships_gym_created  ON public.memberships(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memberships_member_created ON public.memberships(member_id, created_at DESC);

-- Drop stale draft indexes if they exist
DROP INDEX IF EXISTS public.idx_attendance_member;
DROP INDEX IF EXISTS public.idx_attendance_checkin;
DROP INDEX IF EXISTS public.idx_attendance_open;
DROP INDEX IF EXISTS public.idx_memberships_member;
DROP INDEX IF EXISTS public.idx_memberships_status;
DROP INDEX IF EXISTS public.idx_feed_items_created;
DROP INDEX IF EXISTS public.idx_feed_items_member;
DROP INDEX IF EXISTS public.idx_challenge_participants_member;

-- attendance
CREATE INDEX        IF NOT EXISTS idx_attendance_gym         ON public.attendance(gym_id);
CREATE INDEX        IF NOT EXISTS idx_attendance_gym_checkin ON public.attendance(gym_id, check_in DESC);
CREATE INDEX        IF NOT EXISTS idx_attendance_member_open ON public.attendance(member_id) WHERE check_out IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_checkin         ON public.attendance(member_id) WHERE check_out IS NULL;

-- streaks
CREATE UNIQUE INDEX IF NOT EXISTS streaks_member_id_key ON public.streaks(member_id);
CREATE INDEX        IF NOT EXISTS idx_streaks_member    ON public.streaks(member_id);

-- feed_items
CREATE INDEX IF NOT EXISTS idx_feed_items_gym         ON public.feed_items(gym_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_gym_created ON public.feed_items(gym_id, created_at DESC);

-- announcements
CREATE INDEX IF NOT EXISTS idx_announcements_gym ON public.announcements(gym_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_gym_unread   ON public.notifications(gym_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_for_member   ON public.notifications(member_id) WHERE for_member = TRUE;
CREATE INDEX IF NOT EXISTS idx_notifications_member_type  ON public.notifications(member_id, notification_type) WHERE for_member = TRUE;

-- promos
CREATE INDEX IF NOT EXISTS idx_promos_gym ON public.promos(gym_id);

-- notification_cooldowns
CREATE INDEX IF NOT EXISTS idx_cooldowns_member ON public.notification_cooldowns(member_id);
CREATE INDEX IF NOT EXISTS idx_cooldowns_type   ON public.notification_cooldowns(notification_type);

-- member_notification_preferences
CREATE UNIQUE INDEX IF NOT EXISTS member_notification_preferences_member_id_key ON public.member_notification_preferences(member_id);
CREATE INDEX        IF NOT EXISTS idx_notif_prefs_member ON public.member_notification_preferences(member_id);
CREATE INDEX        IF NOT EXISTS idx_notif_prefs_gym    ON public.member_notification_preferences(gym_id);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_gym    ON public.payments(gym_id);
CREATE INDEX IF NOT EXISTS idx_payments_member ON public.payments(member_id);

-- member_onboarding_events
CREATE INDEX IF NOT EXISTS idx_member_onboarding_events_member ON public.member_onboarding_events(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_onboarding_events_gym    ON public.member_onboarding_events(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_onboarding_events_email  ON public.member_onboarding_events(lower(email), created_at DESC);

-- classes / class_enrollments / checkins
CREATE INDEX        IF NOT EXISTS idx_classes_gym               ON public.classes(gym_id);
CREATE INDEX        IF NOT EXISTS idx_class_enrollments_gym     ON public.class_enrollments(gym_id);
CREATE INDEX        IF NOT EXISTS idx_class_enrollments_member  ON public.class_enrollments(member_id);
CREATE INDEX        IF NOT EXISTS idx_checkins_gym              ON public.checkins(gym_id);
CREATE INDEX        IF NOT EXISTS idx_checkins_member           ON public.checkins(member_id);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_checkin_per_member   ON public.checkins(member_id) WHERE check_out IS NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.gyms                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_items                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promos                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_cooldowns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_onboarding_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins                      ENABLE ROW LEVEL SECURITY;

-- Drop all old policies before recreating (idempotent)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- gyms
CREATE POLICY gyms_public_select  ON public.gyms FOR SELECT USING (true);
CREATE POLICY gyms_update         ON public.gyms FOR UPDATE
  USING (id = public.get_gym_id() AND public.get_user_role() IN ('owner','admin'));

-- profiles
CREATE POLICY profiles_select     ON public.profiles FOR SELECT
  USING (auth.uid() = id OR gym_id = public.get_gym_id());
CREATE POLICY profiles_insert     ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update     ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR (gym_id = public.get_gym_id() AND public.is_manager()));
CREATE POLICY profiles_admin_all  ON public.profiles FOR ALL
  USING (public.is_manager() AND gym_id = public.get_gym_id());

-- membership_plans
CREATE POLICY plans_select        ON public.membership_plans FOR SELECT
  USING (gym_id = public.get_gym_id() OR gym_id IS NULL);
CREATE POLICY plans_manage        ON public.membership_plans FOR ALL
  USING (gym_id = public.get_gym_id() AND public.get_user_role() IN ('owner','admin'));
CREATE POLICY plans_admin_all     ON public.membership_plans FOR ALL
  USING (public.is_manager() AND gym_id = public.get_gym_id());

-- memberships
CREATE POLICY memberships_select  ON public.memberships FOR SELECT
  USING (gym_id = public.get_gym_id() AND (auth.uid() = member_id OR public.is_manager()));
CREATE POLICY memberships_manage  ON public.memberships FOR ALL
  USING (gym_id = public.get_gym_id() AND public.is_manager());
CREATE POLICY memberships_admin_all ON public.memberships FOR ALL
  USING (public.is_manager() AND gym_id = public.get_gym_id());

-- attendance
CREATE POLICY attendance_select   ON public.attendance FOR SELECT
  USING (gym_id = public.get_gym_id() AND (auth.uid() = member_id OR public.is_manager()));
CREATE POLICY attendance_insert   ON public.attendance FOR INSERT
  WITH CHECK (auth.uid() = member_id OR public.is_manager());
CREATE POLICY attendance_update   ON public.attendance FOR UPDATE
  USING (auth.uid() = member_id OR public.is_manager());
CREATE POLICY attendance_admin_all ON public.attendance FOR ALL
  USING (public.is_manager() AND gym_id = public.get_gym_id());

-- streaks
CREATE POLICY streaks_select      ON public.streaks FOR SELECT
  USING (auth.uid() = member_id OR public.is_manager());
CREATE POLICY streaks_manage      ON public.streaks FOR ALL
  USING (auth.uid() = member_id OR public.is_manager());
CREATE POLICY streaks_admin_all   ON public.streaks FOR ALL
  USING (public.is_manager() AND gym_id = public.get_gym_id());

-- feed_items
CREATE POLICY feed_select         ON public.feed_items FOR SELECT USING (gym_id = public.get_gym_id());
CREATE POLICY feed_insert         ON public.feed_items FOR INSERT
  WITH CHECK (auth.uid() = member_id OR public.is_manager());

-- announcements
CREATE POLICY announcements_select ON public.announcements FOR SELECT USING (gym_id = public.get_gym_id());
CREATE POLICY announcements_manage ON public.announcements FOR ALL
  USING (gym_id = public.get_gym_id() AND public.get_user_role() IN ('owner','admin'));
CREATE POLICY announcements_admin_all ON public.announcements FOR ALL
  USING (public.is_manager() AND gym_id = public.get_gym_id());

-- promos
CREATE POLICY promos_select       ON public.promos FOR SELECT USING (gym_id = public.get_gym_id());
CREATE POLICY promos_manage       ON public.promos FOR ALL
  USING (gym_id = public.get_gym_id() AND public.get_user_role() IN ('owner','admin'));
CREATE POLICY promos_admin_all    ON public.promos FOR ALL
  USING (public.is_manager() AND gym_id = public.get_gym_id());

-- notifications
CREATE POLICY notifications_select     ON public.notifications FOR SELECT USING (gym_id = public.get_gym_id());
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING (auth.uid() = member_id);
CREATE POLICY notifications_insert     ON public.notifications FOR INSERT WITH CHECK (gym_id = public.get_gym_id());
CREATE POLICY notifications_update     ON public.notifications FOR UPDATE USING (gym_id = public.get_gym_id());
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING (auth.uid() = member_id);
CREATE POLICY notifications_admin_all  ON public.notifications FOR ALL
  USING (public.is_manager() AND gym_id = public.get_gym_id());

-- member_notification_preferences
CREATE POLICY prefs_select  ON public.member_notification_preferences FOR SELECT
  USING (auth.uid() = member_id OR public.is_manager());
CREATE POLICY prefs_insert  ON public.member_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = member_id);
CREATE POLICY prefs_update  ON public.member_notification_preferences FOR UPDATE
  USING (auth.uid() = member_id);

-- notification_cooldowns
CREATE POLICY cooldowns_select  ON public.notification_cooldowns FOR SELECT
  USING (public.is_manager() OR auth.uid() = member_id);
CREATE POLICY cooldowns_manage  ON public.notification_cooldowns FOR ALL USING (public.is_manager());

-- payments (dev-permissive — tighten in a later migration)
CREATE POLICY dev_all_payments ON public.payments FOR ALL USING (true);

-- member_onboarding_events
CREATE POLICY member_onboarding_events_select ON public.member_onboarding_events FOR SELECT
  USING (gym_id = public.get_gym_id() AND public.is_manager());
CREATE POLICY member_onboarding_events_insert ON public.member_onboarding_events FOR INSERT
  WITH CHECK (gym_id = public.get_gym_id() AND public.is_manager());

-- classes / class_enrollments / checkins (dev-permissive)
CREATE POLICY dev_all_classes     ON public.classes          FOR ALL USING (true);
CREATE POLICY dev_all_enrollments ON public.class_enrollments FOR ALL USING (true);
CREATE POLICY dev_all_checkins    ON public.checkins          FOR ALL USING (true);

-- ── Functions ─────────────────────────────────────────────────────────────────

-- Atomic gym + owner creation (called from signup flow)
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
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must match p_user_id';
  END IF;

  INSERT INTO public.gyms (name, code, address, phone)
  VALUES (p_gym_name, p_gym_code, p_gym_address, p_gym_phone)
  RETURNING id INTO v_gym_id;

  INSERT INTO public.profiles (id, email, name, role, status, gym_id, qr_code)
  VALUES (
    p_user_id, p_email, p_name, 'owner', 'active', v_gym_id,
    'stren://checkin/' || v_gym_id::TEXT || '/' || p_user_id::TEXT
  )
  ON CONFLICT (id) DO UPDATE SET
    name    = EXCLUDED.name,
    role    = 'owner',
    status  = 'active',
    gym_id  = v_gym_id,
    qr_code = 'stren://checkin/' || v_gym_id::TEXT || '/' || p_user_id::TEXT;

  INSERT INTO public.streaks (member_id, current_streak, best_streak)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (member_id) DO NOTHING;

  RETURN jsonb_build_object('gym_id', v_gym_id, 'gym_code', p_gym_code);
END;
$$;

-- Secure random gym code suffix
CREATE OR REPLACE FUNCTION public.generate_secure_gym_suffix(p_length INTEGER DEFAULT 4)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  chars      TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result     TEXT := '';
  rand_bytes BYTEA;
  byte_val   INT;
  i          INT := 0;
BEGIN
  rand_bytes := gen_random_bytes(p_length * 3);
  WHILE length(result) < p_length LOOP
    byte_val := get_byte(rand_bytes, i % (p_length * 3));
    IF byte_val < 256 - (256 % length(chars)) THEN
      result := result || substr(chars, (byte_val % length(chars)) + 1, 1);
    END IF;
    i := i + 1;
    IF i >= p_length * 3 AND length(result) < p_length THEN
      rand_bytes := gen_random_bytes(p_length * 3);
      i := 0;
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- Auto-create profile on auth signup (trigger function)
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

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Kiosk: check in or out by QR code
CREATE OR REPLACE FUNCTION public.kiosk_checkin(p_qr_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member   public.profiles%ROWTYPE;
  v_open     public.attendance%ROWTYPE;
  v_att_id   UUID;
  v_duration INT;
BEGIN
  SELECT * INTO v_member FROM public.profiles WHERE qr_code = p_qr_code;

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
  WHERE member_id = v_member.id AND check_out IS NULL
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
    VALUES (v_member.id, v_member.gym_id, NOW())
    RETURNING id INTO v_att_id;
    PERFORM public.kiosk_update_streak(v_member.id, v_member.gym_id);
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

-- Kiosk: check in or out by member UUID
CREATE OR REPLACE FUNCTION public.kiosk_checkin_by_member(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member   public.profiles%ROWTYPE;
  v_open     public.attendance%ROWTYPE;
  v_att_id   UUID;
  v_duration INT;
BEGIN
  SELECT * INTO v_member FROM public.profiles WHERE id = p_member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Member not found');
  END IF;

  SELECT * INTO v_open
  FROM public.attendance
  WHERE member_id = p_member_id AND check_out IS NULL
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
    VALUES (p_member_id, v_member.gym_id, NOW())
    RETURNING id INTO v_att_id;
    PERFORM public.kiosk_update_streak(p_member_id, v_member.gym_id);
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

-- Kiosk: explicit checkout by attendance ID
CREATE OR REPLACE FUNCTION public.kiosk_checkout(p_attendance_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_duration INT;
BEGIN
  UPDATE public.attendance
  SET check_out = NOW()
  WHERE id = p_attendance_id AND check_out IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT duration_min INTO v_duration FROM public.attendance WHERE id = p_attendance_id;
  RETURN jsonb_build_object('duration_min', v_duration);
END;
$$;

-- Kiosk: list currently checked-in members for the caller's gym
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
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.member_id,
    p.name,
    a.check_in
  FROM public.attendance a
  JOIN public.profiles p ON p.id = a.member_id
  WHERE a.check_out IS NULL
  ORDER BY a.check_in ASC;
END;
$$;

-- Kiosk: search members
CREATE OR REPLACE FUNCTION public.kiosk_search_members(p_query TEXT)
RETURNS TABLE(
  id               UUID,
  name             TEXT,
  email            TEXT,
  contact_number   TEXT,
  membership_status TEXT,
  plan_name        TEXT,
  end_date         DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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
    WHERE m.member_id = p.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) ms ON TRUE
  LEFT JOIN public.membership_plans mp ON mp.id = ms.plan_id
  WHERE
    p.role = 'member'
    AND (
      p.name           ILIKE '%' || p_query || '%'
      OR p.contact_number ILIKE '%' || p_query || '%'
    )
  ORDER BY p.name
  LIMIT 20;
END;
$$;

-- Kiosk: update member streak on check-in
CREATE OR REPLACE FUNCTION public.kiosk_update_streak(p_member_id UUID, p_gym_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today      DATE := CURRENT_DATE;
  v_last_visit DATE;
  v_current    INT;
  v_best       INT;
BEGIN
  SELECT last_visit_date, current_streak, best_streak
  INTO v_last_visit, v_current, v_best
  FROM public.streaks
  WHERE member_id = p_member_id;

  IF NOT FOUND THEN
    INSERT INTO public.streaks (member_id, current_streak, best_streak, last_visit_date)
    VALUES (p_member_id, 1, 1, v_today);
    RETURN;
  END IF;

  IF v_last_visit = v_today THEN
    RETURN;
  ELSIF v_last_visit = v_today - INTERVAL '1 day' THEN
    v_current := v_current + 1;
  ELSE
    v_current := 1;
  END IF;

  v_best := GREATEST(v_best, v_current);

  UPDATE public.streaks
  SET current_streak  = v_current,
      best_streak     = v_best,
      last_visit_date = v_today
  WHERE member_id = p_member_id;
END;
$$;

-- Public gym lookup by code
CREATE OR REPLACE FUNCTION public.get_gym_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym          public.gyms;
  v_member_count INTEGER;
BEGIN
  SELECT * INTO v_gym
  FROM public.gyms
  WHERE LOWER(code) = LOWER(p_code);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.profiles
  WHERE gym_id = v_gym.id
    AND status  = 'active'
    AND role    = 'member';

  RETURN jsonb_build_object(
    'id',               v_gym.id,
    'name',             v_gym.name,
    'code',             v_gym.code,
    'address',          v_gym.address,
    'phone',            v_gym.phone,
    'tagline',          v_gym.tagline,
    'description',      v_gym.description,
    'logo_url',         v_gym.logo_url,
    'cover_url',        v_gym.cover_url,
    'brand_color',      COALESCE(v_gym.brand_color, '#D4956A'),
    'secondary_color',  v_gym.secondary_color,
    'operating_hours',  v_gym.operating_hours,
    'amenities',        v_gym.amenities,
    'social_links',     v_gym.social_links,
    'team_members',     v_gym.team_members,
    'pricing_packages', v_gym.pricing_packages,
    'map_embed_url',    v_gym.map_embed_url,
    'directions',       v_gym.directions,
    'member_count',     v_member_count,
    'is_published',     (v_gym.tagline IS NOT NULL AND TRIM(v_gym.tagline) <> '')
  );
END;
$$;

-- Gym search (public, uses pg_trgm)
CREATE OR REPLACE FUNCTION public.search_gyms(p_query TEXT)
RETURNS TABLE(id UUID, name TEXT, code TEXT, address TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT g.id, g.name, g.code, g.address
  FROM public.gyms g
  WHERE g.is_published
    AND (
      g.name    ILIKE '%' || p_query || '%' OR
      g.address ILIKE '%' || p_query || '%' OR
      g.code    ILIKE '%' || p_query || '%'
    )
  ORDER BY g.name
  LIMIT 10;
END;
$$;

-- Admin dashboard stats
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_today  DATE := CURRENT_DATE;
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'currently_in', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',        a.id,
        'member_id', a.member_id,
        'check_in',  a.check_in,
        'name',      p.name
      )), '[]'::jsonb)
      FROM public.attendance a
      JOIN public.profiles p ON p.id = a.member_id
      WHERE a.gym_id = v_gym_id AND a.check_out IS NULL
    ),
    'today_visits', (
      SELECT COUNT(*) FROM public.attendance
      WHERE gym_id = v_gym_id AND check_in::DATE = v_today
    ),
    'total_members', (
      SELECT COUNT(*) FROM public.profiles
      WHERE gym_id = v_gym_id AND role = 'member' AND status = 'active'
    ),
    'pending_count', (
      SELECT COUNT(*) FROM public.profiles
      WHERE gym_id = v_gym_id AND role = 'member' AND status = 'pending'
    ),
    'active_plans', (
      SELECT COUNT(*) FROM public.memberships
      WHERE gym_id = v_gym_id AND status = 'active'
    ),
    'expired_plans', (
      SELECT COUNT(*) FROM public.memberships
      WHERE gym_id = v_gym_id AND status = 'expired'
    ),
    'frozen_plans', (
      SELECT COUNT(*) FROM public.memberships
      WHERE gym_id = v_gym_id AND status = 'frozen'
    ),
    'today_revenue', (
      SELECT COALESCE(SUM(amount_paid), 0) FROM public.memberships
      WHERE gym_id = v_gym_id AND created_at::DATE = v_today
    ),
    'month_revenue', (
      SELECT COALESCE(SUM(amount_paid), 0) FROM public.memberships
      WHERE gym_id = v_gym_id
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
    ),
    'attendance_7d', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day',    TO_CHAR(d.day, 'Dy'),
        'date',   TO_CHAR(d.day, 'MM/DD'),
        'visits', COALESCE(v.visits, 0)
      ) ORDER BY d.day), '[]'::jsonb)
      FROM (
        SELECT generate_series(v_today - 6, v_today, '1 day'::interval)::DATE AS day
      ) d
      LEFT JOIN (
        SELECT check_in::DATE AS day, COUNT(*) AS visits
        FROM public.attendance
        WHERE gym_id = v_gym_id AND check_in::DATE >= v_today - 6
        GROUP BY 1
      ) v ON v.day = d.day
    ),
    'revenue_7d', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day',     TO_CHAR(d.day, 'Dy'),
        'date',    TO_CHAR(d.day, 'MM/DD'),
        'revenue', COALESCE(r.revenue, 0)
      ) ORDER BY d.day), '[]'::jsonb)
      FROM (
        SELECT generate_series(v_today - 6, v_today, '1 day'::interval)::DATE AS day
      ) d
      LEFT JOIN (
        SELECT created_at::DATE AS day, SUM(amount_paid) AS revenue
        FROM public.memberships
        WHERE gym_id = v_gym_id AND created_at::DATE >= v_today - 6
        GROUP BY 1
      ) r ON r.day = d.day
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Admin reports
CREATE OR REPLACE FUNCTION public.admin_reports_data(p_days INTEGER DEFAULT 14)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id      UUID := public.get_gym_id();
  v_today       DATE := CURRENT_DATE;
  v_month_start DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_result      JSONB;
BEGIN
  SELECT jsonb_build_object(
    'active_count', (
      SELECT COUNT(*) FROM public.memberships WHERE gym_id = v_gym_id AND status = 'active'
    ),
    'expired_count', (
      SELECT COUNT(*) FROM public.memberships WHERE gym_id = v_gym_id AND status = 'expired'
    ),
    'month_revenue', (
      SELECT COALESCE(SUM(amount_paid), 0) FROM public.memberships
      WHERE gym_id = v_gym_id AND created_at::DATE >= v_month_start
    ),
    'attendance_by_day', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date',   TO_CHAR(d.day, 'MM/DD'),
        'visits', COALESCE(v.visits, 0)
      ) ORDER BY d.day), '[]'::jsonb)
      FROM (
        SELECT generate_series(v_today - (p_days - 1), v_today, '1 day'::interval)::DATE AS day
      ) d
      LEFT JOIN (
        SELECT check_in::DATE AS day, COUNT(*) AS visits
        FROM public.attendance
        WHERE gym_id = v_gym_id AND check_in::DATE >= v_today - (p_days - 1)
        GROUP BY 1
      ) v ON v.day = d.day
    ),
    'revenue_by_day', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date',    TO_CHAR(d.day, 'MM/DD'),
        'revenue', COALESCE(r.revenue, 0)
      ) ORDER BY d.day), '[]'::jsonb)
      FROM (
        SELECT generate_series(v_today - (p_days - 1), v_today, '1 day'::interval)::DATE AS day
      ) d
      LEFT JOIN (
        SELECT created_at::DATE AS day, SUM(amount_paid) AS revenue
        FROM public.memberships
        WHERE gym_id = v_gym_id AND created_at::DATE >= v_today - (p_days - 1)
        GROUP BY 1
      ) r ON r.day = d.day
    ),
    'peak_hours', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'hour',  h,
        'label', TO_CHAR((h || ':00')::time, 'HH12 AM'),
        'count', cnt
      ) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT EXTRACT(HOUR FROM check_in)::int AS h, COUNT(*) AS cnt
        FROM public.attendance
        WHERE gym_id = v_gym_id AND check_in IS NOT NULL
        GROUP BY 1 ORDER BY cnt DESC LIMIT 5
      ) t
    ),
    'revenue_by_dom', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day',    dom,
        'amount', total
      ) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT EXTRACT(DAY FROM created_at)::int AS dom, SUM(amount_paid) AS total
        FROM public.memberships
        WHERE gym_id = v_gym_id
        GROUP BY 1 ORDER BY total DESC LIMIT 5
      ) t
    ),
    'method_breakdown', (
      SELECT jsonb_build_object(
        'cash_total',  COALESCE(SUM(amount_paid) FILTER (WHERE payment_method = 'cash'),  0),
        'cash_count',  COUNT(*)               FILTER (WHERE payment_method = 'cash'),
        'gcash_total', COALESCE(SUM(amount_paid) FILTER (WHERE payment_method = 'gcash'), 0),
        'gcash_count', COUNT(*)               FILTER (WHERE payment_method = 'gcash')
      )
      FROM public.memberships WHERE gym_id = v_gym_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Member home stats
CREATE OR REPLACE FUNCTION public.member_home_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_tz          TEXT := 'Asia/Manila';
  v_month_start DATE := DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'Asia/Manila')::DATE;
  v_result      JSONB;
BEGIN
  SELECT jsonb_build_object(
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
        'current_streak',  COALESCE(current_streak, 0),
        'best_streak',     COALESCE(best_streak, 0),
        'last_visit_date', last_visit_date
      )
      FROM public.streaks WHERE member_id = v_uid
    ),
    'recent_visits', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('date', (check_in AT TIME ZONE v_tz)::DATE, 'duration_min', duration_min)
        ORDER BY check_in DESC
      ), '[]'::jsonb)
      FROM (
        SELECT check_in, duration_min FROM public.attendance
        WHERE member_id = v_uid ORDER BY check_in DESC LIMIT 10
      ) t
    ),
    'calendar_dates', (
      SELECT COALESCE(
        jsonb_agg(DISTINCT (check_in AT TIME ZONE v_tz)::DATE ORDER BY (check_in AT TIME ZONE v_tz)::DATE),
        '[]'::jsonb
      )
      FROM public.attendance
      WHERE member_id = v_uid
        AND (check_in AT TIME ZONE v_tz)::DATE >= CURRENT_DATE - INTERVAL '60 days'
    ),
    'membership', (
      SELECT jsonb_build_object(
        'plan_name',  COALESCE(mp.name, 'Unknown'),
        'status',     m.status,
        'start_date', m.start_date,
        'end_date',   m.end_date,
        'days_left',  GREATEST(0, (m.end_date::DATE - CURRENT_DATE))
      )
      FROM public.memberships m
      LEFT JOIN public.membership_plans mp ON mp.id = m.plan_id
      WHERE m.member_id = v_uid ORDER BY m.created_at DESC LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Leaderboard: all-time workout count
CREATE OR REPLACE FUNCTION public.leaderboard_workouts(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value BIGINT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id         AS member_id,
    p.name       AS member_name,
    p.avatar_url AS avatar_url,
    COUNT(a.id)  AS value
  FROM public.profiles p
  JOIN public.attendance a ON a.member_id = p.id
  WHERE p.gym_id = public.get_gym_id()
    AND p.role = 'member'
    AND a.gym_id = public.get_gym_id()
  GROUP BY p.id, p.name, p.avatar_url
  ORDER BY value DESC
  LIMIT p_limit;
$$;

-- Leaderboard: consecutive week streaks
CREATE OR REPLACE FUNCTION public.leaderboard_week_streak(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value INTEGER)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH weekly_visits AS (
    SELECT
      member_id,
      DATE_TRUNC('week', check_in)::DATE AS week_start
    FROM public.attendance
    WHERE gym_id = public.get_gym_id()
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
    p.id            AS member_id,
    p.name          AS member_name,
    p.avatar_url    AS avatar_url,
    COALESCE(s.week_streak, 0) AS value
  FROM public.profiles p
  LEFT JOIN streaks s ON s.member_id = p.id
  WHERE p.gym_id = public.get_gym_id()
    AND p.role = 'member'
    AND COALESCE(s.week_streak, 0) > 0
  ORDER BY value DESC
  LIMIT p_limit;
$$;

-- Leaderboard: longest-tenured members
CREATE OR REPLACE FUNCTION public.leaderboard_longest_member(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value INTEGER)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id            AS member_id,
    p.name          AS member_name,
    p.avatar_url    AS avatar_url,
    (
      EXTRACT(YEAR  FROM AGE(CURRENT_DATE, p.created_at::DATE)) * 12
    + EXTRACT(MONTH FROM AGE(CURRENT_DATE, p.created_at::DATE))
    )::INTEGER      AS value
  FROM public.profiles p
  WHERE p.gym_id = public.get_gym_id()
    AND p.role = 'member'
    AND p.status = 'active'
  ORDER BY value DESC
  LIMIT p_limit;
$$;

-- Avatar update with change-cooldown enforcement
CREATE OR REPLACE FUNCTION public.set_member_avatar_with_cooldown(
  p_member_id UUID,
  p_avatar_url TEXT,
  p_lock_days INTEGER DEFAULT 14
)
RETURNS TABLE(updated BOOLEAN, next_allowed_at TIMESTAMPTZ, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now         TIMESTAMPTZ := NOW();
  v_role        TEXT;
  v_caller_gym  UUID;
  v_member_gym  UUID;
  v_locked_until TIMESTAMPTZ;
  v_lock_days   INTEGER := GREATEST(1, LEAST(30, p_lock_days));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Unauthorized.'::TEXT; RETURN;
  END IF;

  SELECT role::TEXT, gym_id INTO v_role, v_caller_gym
  FROM public.profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Unauthorized.'::TEXT; RETURN;
  END IF;

  SELECT gym_id, avatar_change_locked_until INTO v_member_gym, v_locked_until
  FROM public.profiles WHERE id = p_member_id;

  IF v_member_gym IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Member not found.'::TEXT; RETURN;
  END IF;

  IF auth.uid() <> p_member_id THEN
    IF v_role NOT IN ('owner', 'admin', 'staff') OR v_caller_gym IS DISTINCT FROM v_member_gym THEN
      RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Forbidden.'::TEXT; RETURN;
    END IF;
  END IF;

  IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
    RETURN QUERY SELECT FALSE, v_locked_until, 'Avatar can only be changed after cooldown.'::TEXT; RETURN;
  END IF;

  UPDATE public.profiles
  SET
    avatar_url                 = p_avatar_url,
    avatar_updated_at          = v_now,
    avatar_change_locked_until = v_now + make_interval(days => v_lock_days),
    avatar_change_count        = COALESCE(avatar_change_count, 0) + 1
  WHERE id = p_member_id;

  RETURN QUERY SELECT
    TRUE,
    (v_now + make_interval(days => v_lock_days))::TIMESTAMPTZ,
    'Avatar updated.'::TEXT;
END;
$$;

-- Notification helpers
CREATE OR REPLACE FUNCTION public.calculate_avg_visit_interval(p_member_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_visits INTEGER;
  v_first_visit  DATE;
  v_last_visit   DATE;
  v_days_span    INTEGER;
  v_avg_interval NUMERIC(5,2);
BEGIN
  SELECT COUNT(*)::INTEGER, MIN(check_in::DATE), MAX(check_in::DATE)
  INTO v_total_visits, v_first_visit, v_last_visit
  FROM public.attendance WHERE member_id = p_member_id;

  IF v_total_visits < 3 THEN RETURN NULL; END IF;
  v_days_span := v_last_visit - v_first_visit;
  IF v_days_span = 0 THEN RETURN 1.0; END IF;
  v_avg_interval := v_days_span::NUMERIC / (v_total_visits - 1);

  UPDATE public.streaks
  SET avg_visit_interval_days = v_avg_interval,
      total_visits = v_total_visits,
      first_visit_date = v_first_visit
  WHERE member_id = p_member_id;

  RETURN v_avg_interval;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_send_member_notification(
  p_member_id UUID,
  p_notification_type public.notification_type
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_prefs           RECORD;
  v_cooldown        RECORD;
  v_daily_count     INTEGER;
  v_weekly_count    INTEGER;
  v_has_active_membership BOOLEAN;
BEGIN
  SELECT
    COALESCE(inactivity_nudges_enabled, true)  AS inactivity_enabled,
    COALESCE(streak_notifications_enabled, true) AS streak_enabled
  INTO v_prefs
  FROM public.member_notification_preferences WHERE member_id = p_member_id;

  IF NOT FOUND THEN
    v_prefs.inactivity_enabled := true;
    v_prefs.streak_enabled     := true;
  END IF;

  IF p_notification_type = 'inactivity_nudge'  AND NOT v_prefs.inactivity_enabled THEN RETURN false; END IF;
  IF p_notification_type = 'streak_milestone'  AND NOT v_prefs.streak_enabled     THEN RETURN false; END IF;

  IF p_notification_type = 'inactivity_nudge' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.memberships
      WHERE member_id = p_member_id AND status = 'active' AND end_date >= CURRENT_DATE
    ) INTO v_has_active_membership;
    IF NOT v_has_active_membership THEN RETURN false; END IF;
  END IF;

  SELECT COUNT(*) INTO v_daily_count
  FROM public.notifications
  WHERE member_id = p_member_id AND for_member = true AND created_at::DATE = CURRENT_DATE;
  IF v_daily_count >= 2 THEN RETURN false; END IF;

  SELECT COUNT(*) INTO v_weekly_count
  FROM public.notifications
  WHERE member_id = p_member_id AND for_member = true AND created_at >= NOW() - INTERVAL '7 days';
  IF v_weekly_count >= 5 THEN RETURN false; END IF;

  SELECT * INTO v_cooldown
  FROM public.notification_cooldowns
  WHERE member_id = p_member_id AND notification_type = p_notification_type;

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

CREATE OR REPLACE FUNCTION public.create_member_notification(
  p_member_id UUID,
  p_gym_id    UUID,
  p_type      public.notification_type,
  p_title     TEXT,
  p_body      TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  IF NOT public.can_send_member_notification(p_member_id, p_type) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (gym_id, member_id, type, title, body, is_read, for_member, notification_type)
  VALUES (p_gym_id, p_member_id, p_type::TEXT, p_title, p_body, false, true, p_type)
  RETURNING id INTO v_notification_id;

  PERFORM public.record_notification_sent(p_member_id, p_gym_id, p_type);
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_notification_sent(
  p_member_id         UUID,
  p_gym_id            UUID,
  p_notification_type public.notification_type
)
RETURNS VOID
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

CREATE OR REPLACE FUNCTION public.process_expiry_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count     INTEGER := 0;
  v_member    RECORD;
  v_title     TEXT;
  v_body      TEXT;
  v_type      notification_type;
  v_days_left INTEGER;
BEGIN
  FOR v_member IN
    SELECT m.member_id, m.gym_id, m.end_date, p.name,
           (m.end_date - CURRENT_DATE) AS days_until_expiry
    FROM public.memberships m
    JOIN public.profiles p ON p.id = m.member_id
    WHERE m.status = 'active'
      AND m.end_date >= CURRENT_DATE
      AND m.end_date <= CURRENT_DATE + INTERVAL '7 days'
  LOOP
    v_days_left := v_member.days_until_expiry;
    IF v_days_left = 7 THEN
      v_type  := 'membership_expiry_7d';
      v_title := 'Membership ending soon';
      v_body  := 'Your membership ends on ' || to_char(v_member.end_date, 'Mon DD') || '. Keep the momentum going — renew anytime! 💪';
    ELSIF v_days_left = 0 THEN
      v_type  := 'membership_expiry_0d';
      v_title := 'Last day of membership';
      v_body  := 'Today''s the last day of your membership. We''d love to keep you! 🏋️';
    ELSE
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.notification_cooldowns
      WHERE member_id = v_member.member_id AND notification_type = v_type
    ) THEN
      IF public.create_member_notification(v_member.member_id, v_member.gym_id, v_type, v_title, v_body) IS NOT NULL THEN
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_inactivity_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count            INTEGER := 0;
  v_member           RECORD;
  v_avg_interval     NUMERIC;
  v_threshold_days   NUMERIC;
  v_days_since_visit INTEGER;
  v_nudge_count      INTEGER;
  v_title            TEXT;
  v_body             TEXT;
BEGIN
  FOR v_member IN
    SELECT s.member_id, s.last_visit_date, s.avg_visit_interval_days, s.total_visits,
           p.gym_id, p.name, (CURRENT_DATE - s.last_visit_date) AS days_since_visit
    FROM public.streaks s
    JOIN public.profiles p ON p.id = s.member_id
    WHERE s.last_visit_date IS NOT NULL
      AND s.last_visit_date < CURRENT_DATE
      AND p.status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.member_id = s.member_id AND m.status = 'active' AND m.end_date >= CURRENT_DATE
      )
  LOOP
    v_days_since_visit := v_member.days_since_visit;
    v_avg_interval     := v_member.avg_visit_interval_days;

    IF v_avg_interval IS NULL AND v_member.total_visits >= 3 THEN
      v_avg_interval := public.calculate_avg_visit_interval(v_member.member_id);
    END IF;

    IF v_avg_interval IS NOT NULL THEN
      v_threshold_days := GREATEST(5, LEAST(21, v_avg_interval * 1.5));
    ELSE
      v_threshold_days := 7;
    END IF;

    IF v_days_since_visit < v_threshold_days THEN CONTINUE; END IF;

    SELECT COALESCE(inactivity_nudge_count, 0) INTO v_nudge_count
    FROM public.notification_cooldowns
    WHERE member_id = v_member.member_id AND notification_type = 'inactivity_nudge';
    IF NOT FOUND THEN v_nudge_count := 0; END IF;
    IF v_nudge_count >= 2 THEN CONTINUE; END IF;

    IF v_nudge_count = 0 THEN
      v_title := 'We miss you! 🏃';
      v_body  := 'Hey ' || split_part(v_member.name, ' ', 1) || ', it''s been a bit! Your next workout is waiting.';
    ELSE
      v_title := 'Still here when you''re ready 💪';
      v_body  := 'No pressure, just potential. Your gym is ready when you are.';
    END IF;

    IF public.create_member_notification(v_member.member_id, v_member.gym_id, 'inactivity_nudge', v_title, v_body) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_daily_notifications()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_expiry_count     INTEGER;
  v_inactivity_count INTEGER;
BEGIN
  v_expiry_count     := public.process_expiry_notifications();
  v_inactivity_count := public.process_inactivity_notifications();
  RETURN jsonb_build_object(
    'expiry_notifications',     v_expiry_count,
    'inactivity_notifications', v_inactivity_count,
    'processed_at',             NOW()
  );
END;
$$;

-- Trigger functions
CREATE OR REPLACE FUNCTION public.handle_checkin_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NEW.check_out IS NULL AND NEW.gym_id IS NOT NULL THEN
    SELECT name INTO v_name FROM public.profiles WHERE id = NEW.member_id;
    INSERT INTO public.notifications(gym_id, type, title, body, member_id)
    VALUES (NEW.gym_id, 'member_checkin', 'Member checked in', v_name || ' just arrived at the gym', NEW.member_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_pending_member_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.gym_id IS NOT NULL THEN
    INSERT INTO public.notifications(gym_id, type, title, body, member_id)
    VALUES (NEW.gym_id, 'member_pending', 'New member request', NEW.name || ' is waiting for approval', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_inactivity_nudge_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.notification_cooldowns
  SET inactivity_nudge_count = 0
  WHERE member_id = NEW.member_id AND notification_type = 'inactivity_nudge';
  PERFORM public.calculate_avg_visit_interval(NEW.member_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_streak_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_gym_id    UUID;
  v_milestone INTEGER;
  v_title     TEXT;
  v_body      TEXT;
  v_milestones INTEGER[] := ARRAY[7, 14, 30, 50, 100];
BEGIN
  IF NEW.current_streak <= OLD.current_streak THEN RETURN NEW; END IF;
  IF NEW.current_streak = ANY(v_milestones) THEN
    v_milestone := NEW.current_streak;
    SELECT gym_id INTO v_gym_id FROM public.profiles WHERE id = NEW.member_id;
    CASE v_milestone
      WHEN 7   THEN v_title := 'One week strong! 🔥';           v_body := 'You''re building a habit. Keep it up!';
      WHEN 14  THEN v_title := 'Two weeks in a row! 💪';        v_body := 'You''re in the top 15% of members. Impressive!';
      WHEN 30  THEN v_title := '30-day streak! 🏆';             v_body := 'Your dedication is inspiring. A full month of consistency!';
      WHEN 50  THEN v_title := '50 days strong! 🌟';            v_body := 'Half a century of showing up. You''re unstoppable!';
      WHEN 100 THEN v_title := 'CENTURY CLUB! 💯';              v_body := '100 days of showing up. You are legendary!';
    END CASE;
    PERFORM public.create_member_notification(NEW.member_id, v_gym_id, 'streak_milestone', v_title, v_body);
  END IF;
  RETURN NEW;
END;
$$;

-- ── Triggers ──────────────────────────────────────────────────────────────────

-- attendance
DROP TRIGGER IF EXISTS on_checkin_notification   ON public.attendance;
DROP TRIGGER IF EXISTS on_checkin_reset_nudges   ON public.attendance;
DROP TRIGGER IF EXISTS on_kudos_given            ON public.kudos;       -- from old draft

CREATE TRIGGER on_checkin_notification
  AFTER INSERT ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.handle_checkin_notification();

CREATE TRIGGER on_checkin_reset_nudges
  AFTER INSERT ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.reset_inactivity_nudge_count();

-- profiles
DROP TRIGGER IF EXISTS on_pending_member ON public.profiles;
CREATE TRIGGER on_pending_member
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_pending_member_notification();

-- streaks
DROP TRIGGER IF EXISTS on_streak_milestone ON public.streaks;
CREATE TRIGGER on_streak_milestone
  AFTER UPDATE ON public.streaks
  FOR EACH ROW EXECUTE FUNCTION public.check_streak_milestone();
