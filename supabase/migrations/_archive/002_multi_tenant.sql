-- ============================================
-- Stren Multi-Tenant Migration
-- ============================================

-- Add 'owner' to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner';

-- Profile status enum
CREATE TYPE profile_status AS ENUM ('pending', 'active', 'rejected');

-- ============================================
-- GYMS TABLE
-- ============================================
CREATE TABLE gyms (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    code        TEXT UNIQUE NOT NULL,
    address     TEXT,
    phone       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gyms_code ON gyms(code);

-- ============================================
-- ADD gym_id + status TO PROFILES
-- ============================================
ALTER TABLE profiles ADD COLUMN gym_id UUID REFERENCES gyms(id);
ALTER TABLE profiles ADD COLUMN status profile_status DEFAULT 'active';

CREATE INDEX idx_profiles_gym ON profiles(gym_id);
CREATE INDEX idx_profiles_status ON profiles(status);

-- ============================================
-- ADD gym_id TO ALL TENANT TABLES
-- ============================================
ALTER TABLE memberships ADD COLUMN gym_id UUID REFERENCES gyms(id);
ALTER TABLE membership_plans ADD COLUMN gym_id UUID REFERENCES gyms(id);
ALTER TABLE attendance ADD COLUMN gym_id UUID REFERENCES gyms(id);
ALTER TABLE challenges ADD COLUMN gym_id UUID REFERENCES gyms(id);
ALTER TABLE announcements ADD COLUMN gym_id UUID REFERENCES gyms(id);
ALTER TABLE feed_items ADD COLUMN gym_id UUID REFERENCES gyms(id);
ALTER TABLE streaks ADD COLUMN gym_id UUID REFERENCES gyms(id);
ALTER TABLE badges ADD COLUMN gym_id UUID REFERENCES gyms(id);

CREATE INDEX idx_memberships_gym ON memberships(gym_id);
CREATE INDEX idx_attendance_gym ON attendance(gym_id);
CREATE INDEX idx_challenges_gym ON challenges(gym_id);
CREATE INDEX idx_announcements_gym ON announcements(gym_id);
CREATE INDEX idx_feed_items_gym ON feed_items(gym_id);

-- ============================================
-- UPDATE RLS POLICIES FOR GYM ISOLATION
-- ============================================

-- Profiles: users can see profiles within their gym
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view gym profiles"
    ON profiles FOR SELECT USING (
        gym_id IS NULL OR
        gym_id IN (SELECT p.gym_id FROM profiles p WHERE p.id = auth.uid())
    );

-- Attendance: scoped to gym
DROP POLICY IF EXISTS "Anyone can view attendance" ON attendance;
CREATE POLICY "View gym attendance"
    ON attendance FOR SELECT USING (
        gym_id IS NULL OR
        gym_id IN (SELECT p.gym_id FROM profiles p WHERE p.id = auth.uid())
    );

-- Challenges: scoped to gym
DROP POLICY IF EXISTS "Anyone can view challenges" ON challenges;
CREATE POLICY "View gym challenges"
    ON challenges FOR SELECT USING (
        gym_id IS NULL OR
        gym_id IN (SELECT p.gym_id FROM profiles p WHERE p.id = auth.uid())
    );

-- Announcements: scoped to gym
DROP POLICY IF EXISTS "Anyone can view announcements" ON announcements;
CREATE POLICY "View gym announcements"
    ON announcements FOR SELECT USING (
        gym_id IS NULL OR
        gym_id IN (SELECT p.gym_id FROM profiles p WHERE p.id = auth.uid())
    );

-- Feed items: scoped to gym
DROP POLICY IF EXISTS "Anyone can view feed" ON feed_items;
CREATE POLICY "View gym feed"
    ON feed_items FOR SELECT USING (
        gym_id IS NULL OR
        gym_id IN (SELECT p.gym_id FROM profiles p WHERE p.id = auth.uid())
    );

-- Gyms table RLS
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view gyms"
    ON gyms FOR SELECT USING (true);

CREATE POLICY "Owners can manage own gym"
    ON gyms FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'owner'
            AND gym_id = gyms.id
        )
    );

CREATE POLICY "Auth users can create gyms"
    ON gyms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
