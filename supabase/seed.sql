-- Seed data for local development
-- Run automatically via: npm run db:reset
--
-- Schema notes:
-- • handle_new_user() trigger fires on auth.users INSERT, creating a profiles row
--   with status='pending' and role='member' (hardened in migration 011).
-- • We then UPDATE profiles to set the correct gym_id, status, and role.
-- • Migrations 011 + 012 must run before this seed (they do — db reset applies
--   migrations in order, then seed.sql).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Gyms
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.gyms (
  code,
  name,
  tagline,
  description,
  primary_color,
  secondary_color,
  is_published
) VALUES
  (
    'IRONWORKS',
    'Iron Works Gym',
    'Forge your strength',
    'A no-nonsense strength training facility.',
    '#1a1a2e',
    '#e94560',
    TRUE
  ),
  (
    'PULSEFIT',
    'Pulse Fitness Studio',
    'Find your rhythm',
    'High-energy cardio and functional training.',
    '#0f3460',
    '#533483',
    TRUE
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Test users
-- All passwords: password123
-- handle_new_user() trigger creates a profiles row automatically on INSERT.
-- We update profiles below after the trigger fires.
-- ─────────────────────────────────────────────────────────────────────────────

-- Iron Works — owner
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'authenticated',
  'authenticated',
  'owner@ironworks.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Alex Owner"}',
  now(),
  now(),
  '', '', '', ''
);

-- Iron Works — member 1
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0001-0001-0001-000000000002',
  'authenticated', 'authenticated',
  'member1@ironworks.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Sam Member"}',
  now(), now(), '', '', '', ''
);

-- Iron Works — member 2
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0001-0001-0001-000000000003',
  'authenticated', 'authenticated',
  'member2@ironworks.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Jordan Member"}',
  now(), now(), '', '', '', ''
);

-- Pulse Fitness — owner
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-0002-0002-0002-000000000001',
  'authenticated', 'authenticated',
  'owner@pulsefit.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Riley Owner"}',
  now(), now(), '', '', '', ''
);

-- Pulse Fitness — member
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-0002-0002-0002-000000000002',
  'authenticated', 'authenticated',
  'member@pulsefit.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Taylor Member"}',
  now(), now(), '', '', '', ''
);

-- Orphan — no gym (exercises wrong-gym + reset-gate paths)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'cccccccc-0003-0003-0003-000000000001',
  'authenticated', 'authenticated',
  'orphan@nogym.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"No Gym User"}',
  now(), now(), '', '', '', ''
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update profiles (trigger created rows; set correct gym/role/status)
-- ─────────────────────────────────────────────────────────────────────────────

-- Iron Works owner
UPDATE public.profiles
SET
  gym_id  = (SELECT id FROM public.gyms WHERE code = 'IRONWORKS'),
  role    = 'owner',
  status  = 'active',
  full_name = 'Alex Owner'
WHERE id = 'aaaaaaaa-0001-0001-0001-000000000001';

-- Iron Works member 1
UPDATE public.profiles
SET
  gym_id  = (SELECT id FROM public.gyms WHERE code = 'IRONWORKS'),
  role    = 'member',
  status  = 'active',
  full_name = 'Sam Member'
WHERE id = 'aaaaaaaa-0001-0001-0001-000000000002';

-- Iron Works member 2
UPDATE public.profiles
SET
  gym_id  = (SELECT id FROM public.gyms WHERE code = 'IRONWORKS'),
  role    = 'member',
  status  = 'active',
  full_name = 'Jordan Member'
WHERE id = 'aaaaaaaa-0001-0001-0001-000000000003';

-- Pulse Fitness owner
UPDATE public.profiles
SET
  gym_id  = (SELECT id FROM public.gyms WHERE code = 'PULSEFIT'),
  role    = 'owner',
  status  = 'active',
  full_name = 'Riley Owner'
WHERE id = 'bbbbbbbb-0002-0002-0002-000000000001';

-- Pulse Fitness member
UPDATE public.profiles
SET
  gym_id  = (SELECT id FROM public.gyms WHERE code = 'PULSEFIT'),
  role    = 'member',
  status  = 'active',
  full_name = 'Taylor Member'
WHERE id = 'bbbbbbbb-0002-0002-0002-000000000002';

-- Orphan — leave gym_id NULL, status active so they can log in but have no gym
UPDATE public.profiles
SET
  gym_id  = NULL,
  role    = 'member',
  status  = 'active',
  full_name = 'No Gym User'
WHERE id = 'cccccccc-0003-0003-0003-000000000001';
