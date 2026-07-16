-- DEVELOPMENT-ONLY seed data for the isolated local Supabase stack.
-- This file is not production provisioning and deliberately aborts unless the
-- database advertises the local API URL configured in supabase/config.toml.

BEGIN;

DO $$
DECLARE
  v_api_url TEXT := COALESCE(current_setting('app.settings.api_url', TRUE), '');
  v_server_addr INET := inet_server_addr();
BEGIN
  IF v_api_url !~ '^https?://(127\.0\.0\.1|localhost|kong)(:[0-9]+)?'
     AND NOT COALESCE(v_server_addr << inet '172.16.0.0/12', FALSE) THEN
    RAISE EXCEPTION
      'DEVELOPMENT-ONLY seed refused: local markers absent (api_url=%, server_addr=%, server_port=%)',
      CASE WHEN v_api_url = '' THEN '<unset>' ELSE v_api_url END,
      COALESCE(v_server_addr::TEXT, '<unset>'),
      inet_server_port();
  END IF;
END;
$$;

INSERT INTO public.gyms (
  id, code, name, tagline, description, brand_color, secondary_color, is_published
) VALUES
  (
    '10000000-0000-0000-0000-000000000001', 'IRONWORKS', 'Iron Works Gym',
    'Forge your strength', 'A local development gym for recovery tests.',
    '#1a1a2e', '#e94560', TRUE
  ),
  (
    '10000000-0000-0000-0000-000000000002', 'PULSEFIT', 'Pulse Fitness Studio',
    'Find your rhythm', 'A second local gym for tenant-isolation tests.',
    '#0f3460', '#533483', TRUE
  )
ON CONFLICT (id) DO NOTHING;

-- All local fixture passwords are intentionally recognizable: password123.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0001-0001-0001-000000000001', 'authenticated', 'authenticated',
    'owner@ironworks.test', crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Alex Owner"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0001-0001-0001-000000000002', 'authenticated', 'authenticated',
    'admin@ironworks.test', crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Avery Admin"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0001-0001-0001-000000000003', 'authenticated', 'authenticated',
    'staff@ironworks.test', crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Stevie Staff"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0001-0001-0001-000000000004', 'authenticated', 'authenticated',
    'member@ironworks.test', crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Morgan Member"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-0002-0002-0002-000000000001', 'authenticated', 'authenticated',
    'owner@pulsefit.test', crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Riley Owner"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-0002-0002-0002-000000000002', 'authenticated', 'authenticated',
    'member@pulsefit.test', crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Taylor Member"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'cccccccc-0003-0003-0003-000000000001', 'authenticated', 'authenticated',
    'orphan@nogym.test', crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"No Gym User"}',
    now(), now(), '', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.gym_users (gym_id, user_id, role, status, added_by)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0001-0001-0001-000000000001', 'owner', 'active', NULL),
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0001-0001-0001-000000000002', 'admin', 'active', 'aaaaaaaa-0001-0001-0001-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', 'staff', 'active', 'aaaaaaaa-0001-0001-0001-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0001-0001-0001-000000000004', 'member', 'active', 'aaaaaaaa-0001-0001-0001-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'bbbbbbbb-0002-0002-0002-000000000001', 'owner', 'active', NULL),
  ('10000000-0000-0000-0000-000000000002', 'bbbbbbbb-0002-0002-0002-000000000002', 'member', 'active', 'bbbbbbbb-0002-0002-0002-000000000001')
ON CONFLICT (gym_id, user_id) DO NOTHING;

UPDATE public.profiles p
SET active_gym_id = gu.gym_id
FROM public.gym_users gu
WHERE gu.user_id = p.id
  AND gu.status = 'active'
  AND p.active_gym_id IS NULL;

INSERT INTO public.membership_plans (
  id, gym_id, name, price, duration_days, description, benefits, is_active
) VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Local Monthly', 800.00, 30, 'Development-only monthly access',
    '["Gym access"]'::JSONB, TRUE
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'Local Monthly', 900.00, 30, 'Development-only monthly access',
    '["Gym access"]'::JSONB, TRUE
  )
ON CONFLICT (id) DO NOTHING;

-- Exercise the real Shot 1 boundary so clean seeds contain reconcilable money.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0001-0001-0001-000000000001', TRUE);
SELECT public.record_membership_payment(
  'aaaaaaaa-0001-0001-0001-000000000004',
  '30000000-0000-0000-0000-000000000001',
  'cash',
  'development-seed-payment-0001',
  NULL,
  public.manila_business_date()
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0002-0002-0002-000000000001', TRUE);
SELECT public.record_membership_payment(
  'bbbbbbbb-0002-0002-0002-000000000002',
  '30000000-0000-0000-0000-000000000002',
  'gcash',
  'development-seed-payment-0002',
  NULL,
  public.manila_business_date()
);
RESET ROLE;

INSERT INTO public.attendance (id, gym_id, member_id, check_in, check_out)
VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000004',
    now() - INTERVAL '2 hours', now() - INTERVAL '1 hour'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'bbbbbbbb-0002-0002-0002-000000000002',
    now() - INTERVAL '90 minutes', now() - INTERVAL '30 minutes'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.member_onboarding_events (
  id, member_id, gym_id, created_by, email, qr_code, sent_via, magic_link_url
) VALUES (
  '50000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'member@ironworks.test',
  'development-only-qr',
  'preview',
  NULL
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
