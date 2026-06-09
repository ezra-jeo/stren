-- ============================================
-- Stren Engagement Platform — Initial Schema
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE user_role AS ENUM ('member', 'admin', 'staff');
CREATE TYPE membership_status AS ENUM ('active', 'expired', 'frozen');
CREATE TYPE payment_method AS ENUM ('cash', 'gcash');
CREATE TYPE feed_item_type AS ENUM ('check_in', 'check_out', 'badge', 'challenge', 'announcement', 'streak_milestone');

-- ============================================
-- PROFILES (linked to Supabase Auth)
-- ============================================
CREATE TABLE profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    contact_number TEXT,
    role          user_role DEFAULT 'member',
    avatar_url    TEXT,
    qr_code       TEXT UNIQUE NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MEMBERSHIP PLANS
-- ============================================
CREATE TABLE membership_plans (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           TEXT NOT NULL,
    price          NUMERIC(10,2) NOT NULL,
    duration_days  INTEGER NOT NULL
);

-- Seed default plans
INSERT INTO membership_plans (id, name, price, duration_days) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Monthly', 1500, 30),
    ('00000000-0000-0000-0000-000000000002', 'Weekly', 500, 7),
    ('00000000-0000-0000-0000-000000000003', 'Walk-in', 100, 1);

-- ============================================
-- MEMBERSHIPS (member subscriptions)
-- ============================================
CREATE TABLE memberships (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    plan_id         UUID NOT NULL REFERENCES membership_plans(id),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          membership_status DEFAULT 'active',
    payment_method  payment_method NOT NULL,
    amount_paid     NUMERIC(10,2) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ATTENDANCE (check-in / check-out)
-- ============================================
CREATE TABLE attendance (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    check_in      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out     TIMESTAMPTZ,
    duration_min  INTEGER GENERATED ALWAYS AS (
                    CASE WHEN check_out IS NOT NULL
                         THEN EXTRACT(EPOCH FROM (check_out - check_in))::INTEGER / 60
                         ELSE NULL
                    END
                  ) STORED
);

-- ============================================
-- STREAKS
-- ============================================
CREATE TABLE streaks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id       UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    current_streak  INTEGER DEFAULT 0,
    best_streak     INTEGER DEFAULT 0,
    last_visit_date DATE
);

-- ============================================
-- BADGES
-- ============================================
CREATE TABLE badges (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    description  TEXT NOT NULL,
    icon         TEXT NOT NULL, -- emoji or icon name
    criteria     JSONB NOT NULL -- e.g. {"type": "visit_count", "threshold": 100}
);

-- Seed default badges
INSERT INTO badges (name, description, icon, criteria) VALUES
    ('First Step',   'Complete your first check-in',            '👣', '{"type": "visit_count", "threshold": 1}'),
    ('Early Bird',   'Check in before 7 AM five times',         '🌅', '{"type": "early_bird", "threshold": 5}'),
    ('On Fire',      'Maintain a 7-day visit streak',           '🔥', '{"type": "streak", "threshold": 7}'),
    ('Consistent',   'Maintain a 4-week visit streak',          '💪', '{"type": "streak", "threshold": 28}'),
    ('Century Club', 'Reach 100 lifetime visits',               '💯', '{"type": "visit_count", "threshold": 100}');

-- ============================================
-- MEMBER BADGES (earned badges)
-- ============================================
CREATE TABLE member_badges (
    member_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    badge_id    UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (member_id, badge_id)
);

-- ============================================
-- CHALLENGES
-- ============================================
CREATE TABLE challenges (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title        TEXT NOT NULL,
    description  TEXT NOT NULL,
    goal_type    TEXT NOT NULL,  -- 'visit_count', 'total_duration', etc.
    goal_target  INTEGER NOT NULL,
    start_date   DATE NOT NULL,
    end_date     DATE NOT NULL,
    reward       TEXT,
    created_by   UUID NOT NULL REFERENCES profiles(id),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CHALLENGE PARTICIPANTS
-- ============================================
CREATE TABLE challenge_participants (
    challenge_id  UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    member_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    progress      INTEGER DEFAULT 0,
    completed     BOOLEAN DEFAULT FALSE,
    joined_at     TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (challenge_id, member_id)
);

-- ============================================
-- FEED ITEMS
-- ============================================
CREATE TABLE feed_items (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type         feed_item_type NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT,
    metadata     JSONB,
    kudos_count  INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- KUDOS
-- ============================================
CREATE TABLE kudos (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_member   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    feed_item_id  UUID NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (from_member, feed_item_id)  -- one kudos per person per feed item
);

-- ============================================
-- ANNOUNCEMENTS
-- ============================================
CREATE TABLE announcements (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_by  UUID NOT NULL REFERENCES profiles(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX idx_attendance_member ON attendance(member_id);
CREATE INDEX idx_attendance_checkin ON attendance(check_in);
CREATE INDEX idx_attendance_open ON attendance(member_id) WHERE check_out IS NULL;
CREATE INDEX idx_feed_items_created ON feed_items(created_at DESC);
CREATE INDEX idx_feed_items_member ON feed_items(member_id);
CREATE INDEX idx_memberships_member ON memberships(member_id);
CREATE INDEX idx_memberships_status ON memberships(status);
CREATE INDEX idx_challenge_participants_member ON challenge_participants(member_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
    ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can insert profiles"
    ON profiles FOR INSERT WITH CHECK (
        auth.uid() = id OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Attendance
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view attendance"
    ON attendance FOR SELECT USING (true);

CREATE POLICY "Members can insert own attendance"
    ON attendance FOR INSERT WITH CHECK (
        auth.uid() = member_id OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    );

CREATE POLICY "Staff/admin can update attendance"
    ON attendance FOR UPDATE USING (
        auth.uid() = member_id OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    );

-- Streaks
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view streaks"
    ON streaks FOR SELECT USING (true);

CREATE POLICY "System can manage streaks"
    ON streaks FOR ALL USING (
        auth.uid() = member_id OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    );

-- Badges (read-only for members)
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view badges"
    ON badges FOR SELECT USING (true);

CREATE POLICY "Admins can manage badges"
    ON badges FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Member Badges
ALTER TABLE member_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view earned badges"
    ON member_badges FOR SELECT USING (true);

CREATE POLICY "System can award badges"
    ON member_badges FOR INSERT WITH CHECK (
        auth.uid() = member_id OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    );

-- Challenges
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view challenges"
    ON challenges FOR SELECT USING (true);

CREATE POLICY "Admins can manage challenges"
    ON challenges FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Challenge Participants
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view challenge participants"
    ON challenge_participants FOR SELECT USING (true);

CREATE POLICY "Members can join challenges"
    ON challenge_participants FOR INSERT WITH CHECK (auth.uid() = member_id);

CREATE POLICY "System can update challenge progress"
    ON challenge_participants FOR UPDATE USING (
        auth.uid() = member_id OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    );

-- Feed Items
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feed"
    ON feed_items FOR SELECT USING (true);

CREATE POLICY "Members can insert own feed items"
    ON feed_items FOR INSERT WITH CHECK (
        auth.uid() = member_id OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    );

-- Kudos
ALTER TABLE kudos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view kudos"
    ON kudos FOR SELECT USING (true);

CREATE POLICY "Members can give kudos"
    ON kudos FOR INSERT WITH CHECK (auth.uid() = from_member);

-- Announcements
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view announcements"
    ON announcements FOR SELECT USING (true);

CREATE POLICY "Admins can manage announcements"
    ON announcements FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own memberships"
    ON memberships FOR SELECT USING (
        auth.uid() = member_id OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    );

CREATE POLICY "Staff/admin can manage memberships"
    ON memberships FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    );

-- Membership Plans
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view plans"
    ON membership_plans FOR SELECT USING (true);

CREATE POLICY "Admins can manage plans"
    ON membership_plans FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, role, qr_code)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'member'),
        uuid_generate_v4()::TEXT
    );

    -- Auto-create streak record
    INSERT INTO public.streaks (member_id, current_streak, best_streak)
    VALUES (NEW.id, 0, 0);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to increment kudos count on feed item
CREATE OR REPLACE FUNCTION handle_new_kudos()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE feed_items SET kudos_count = kudos_count + 1 WHERE id = NEW.feed_item_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_kudos_given
    AFTER INSERT ON kudos
    FOR EACH ROW EXECUTE FUNCTION handle_new_kudos();
