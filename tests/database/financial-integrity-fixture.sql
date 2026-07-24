\set ON_ERROR_STOP on

-- This fixture uses an isolated f-prefixed UUID namespace so it can run after
-- the production-shaped recovery seed without sharing tenant or identity keys.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'f1111111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner1@financial.test.invalid', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Owner One"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f1111111-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin1@financial.test.invalid', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Admin One"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f1111111-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'staff1@financial.test.invalid', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Staff One"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f1111111-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'member1@financial.test.invalid', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Member One"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f1111111-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'member2@financial.test.invalid', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Member Two"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f1111111-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'concurrent@financial.test.invalid', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Concurrent Member"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f2222222-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner2@financial.test.invalid', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Owner Two"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f2222222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member3@financial.test.invalid', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Member Three"}', now(), now(), '', '', '', '');

INSERT INTO public.gyms(id, name, code, is_published) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'Ledger Test Gym', 'LEDGERTEST', true),
  ('f2000000-0000-0000-0000-000000000001', 'Other Test Gym', 'OTHERTEST', true);

UPDATE public.profiles p
SET qr_code = fixture.qr_code
FROM (VALUES
  ('f1111111-0000-0000-0000-000000000001'::UUID, 'qr-owner-1'),
  ('f1111111-0000-0000-0000-000000000002'::UUID, 'qr-admin-1'),
  ('f1111111-0000-0000-0000-000000000003'::UUID, 'qr-staff-1'),
  ('f1111111-0000-0000-0000-000000000004'::UUID, 'qr-member-1'),
  ('f1111111-0000-0000-0000-000000000005'::UUID, 'qr-member-2'),
  ('f1111111-0000-0000-0000-000000000006'::UUID, 'qr-concurrent'),
  ('f2222222-0000-0000-0000-000000000001'::UUID, 'qr-owner-2'),
  ('f2222222-0000-0000-0000-000000000002'::UUID, 'qr-member-3')
) fixture(id, qr_code)
WHERE p.id = fixture.id;

INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000001', 'owner', 'active', NULL),
  ('f1000000-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000002', 'admin', 'active', 'f1111111-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000003', 'staff', 'active', 'f1111111-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000004', 'member', 'active', 'f1111111-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000005', 'member', 'active', 'f1111111-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000006', 'member', 'active', 'f1111111-0000-0000-0000-000000000001'),
  ('f2000000-0000-0000-0000-000000000001', 'f2222222-0000-0000-0000-000000000001', 'owner', 'active', NULL),
  ('f2000000-0000-0000-0000-000000000001', 'f2222222-0000-0000-0000-000000000002', 'member', 'active', 'f2222222-0000-0000-0000-000000000001');

UPDATE public.profiles p
SET active_gym_id = gu.gym_id
FROM public.gym_users gu
WHERE gu.user_id = p.id;

INSERT INTO public.gym_role_permission_defaults(role, permission) VALUES
  ('owner', 'payments:view'),
  ('owner', 'payments:create'),
  ('owner', 'members:manage'),
  ('owner', 'members:payment_history:view'),
  ('admin', 'payments:view'),
  ('admin', 'payments:create'),
  ('admin', 'members:manage'),
  ('admin', 'members:payment_history:view')
ON CONFLICT DO NOTHING;

INSERT INTO public.membership_plans(
  id, name, price, duration_days, gym_id, description, is_active
) VALUES
  ('f3000000-0000-0000-0000-000000000001', 'Precision Plan', 100.05, 30, 'f1000000-0000-0000-0000-000000000001', 'Exact-cent test plan', true),
  ('f4000000-0000-0000-0000-000000000001', 'Other Gym Plan', 250.00, 30, 'f2000000-0000-0000-0000-000000000001', 'Cross-gym test plan', true);

INSERT INTO public.promos(
  id, gym_id, name, type, discount_type, discount_value,
  plan_id, valid_from, valid_until, is_active
) VALUES
  ('f6000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Five Cent', 'custom', 'fixed', 0.05, 'f3000000-0000-0000-0000-000000000001', current_date - 1, current_date + 1, true),
  ('f6000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'Third Off', 'custom', 'percent', 33.33, 'f3000000-0000-0000-0000-000000000001', current_date - 1, current_date + 1, true),
  ('f6000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'Expired', 'custom', 'fixed', 5.00, 'f3000000-0000-0000-0000-000000000001', current_date - 10, current_date - 5, true);

INSERT INTO public.memberships(
  id, member_id, plan_id, start_date, end_date, status,
  payment_method, amount_paid, gym_id, created_at, created_by
) VALUES (
  'f5000000-0000-0000-0000-000000000001',
  'f1111111-0000-0000-0000-000000000004',
  'f3000000-0000-0000-0000-000000000001',
  current_date - 10,
  current_date + 10,
  'active',
  'cash',
  80.00,
  'f1000000-0000-0000-0000-000000000001',
  now() - interval '1 day',
  'f1111111-0000-0000-0000-000000000001'
);

-- The fixture is loaded after all forward migrations in CI, so explicitly
-- exercise the production backfill boundary for its one historical row.
SELECT public.backfill_legacy_membership_financial_transactions();
