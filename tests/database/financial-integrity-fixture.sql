\set ON_ERROR_STOP on

INSERT INTO public.gyms(id, name, code, is_published) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Ledger Test Gym', 'LEDGERTEST', true),
  ('20000000-0000-0000-0000-000000000001', 'Other Test Gym', 'OTHERTEST', true);

INSERT INTO public.profiles(id, email, name, qr_code) VALUES
  ('11111111-0000-0000-0000-000000000001', 'owner1@test.invalid', 'Owner One', 'qr-owner-1'),
  ('11111111-0000-0000-0000-000000000002', 'admin1@test.invalid', 'Admin One', 'qr-admin-1'),
  ('11111111-0000-0000-0000-000000000003', 'staff1@test.invalid', 'Staff One', 'qr-staff-1'),
  ('11111111-0000-0000-0000-000000000004', 'member1@test.invalid', 'Member One', 'qr-member-1'),
  ('11111111-0000-0000-0000-000000000005', 'member2@test.invalid', 'Member Two', 'qr-member-2'),
  ('11111111-0000-0000-0000-000000000006', 'concurrent@test.invalid', 'Concurrent Member', 'qr-concurrent'),
  ('22222222-0000-0000-0000-000000000001', 'owner2@test.invalid', 'Owner Two', 'qr-owner-2'),
  ('22222222-0000-0000-0000-000000000002', 'member3@test.invalid', 'Member Three', 'qr-member-3');

INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by) VALUES
  ('10000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'owner', 'active', NULL),
  ('10000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'admin', 'active', '11111111-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', 'staff', 'active', '11111111-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', 'member', 'active', '11111111-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000005', 'member', 'active', '11111111-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000006', 'member', 'active', '11111111-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'owner', 'active', NULL),
  ('20000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'member', 'active', '22222222-0000-0000-0000-000000000001');

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
  ('30000000-0000-0000-0000-000000000001', 'Precision Plan', 100.05, 30, '10000000-0000-0000-0000-000000000001', 'Exact-cent test plan', true),
  ('40000000-0000-0000-0000-000000000001', 'Other Gym Plan', 250.00, 30, '20000000-0000-0000-0000-000000000001', 'Cross-gym test plan', true);

INSERT INTO public.promos(
  id, gym_id, name, type, discount_type, discount_value,
  plan_id, valid_from, valid_until, is_active
) VALUES
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Five Cent', 'custom', 'fixed', 0.05, '30000000-0000-0000-0000-000000000001', current_date - 1, current_date + 1, true),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Third Off', 'custom', 'percent', 33.33, '30000000-0000-0000-0000-000000000001', current_date - 1, current_date + 1, true),
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Expired', 'custom', 'fixed', 5.00, '30000000-0000-0000-0000-000000000001', current_date - 10, current_date - 5, true);

INSERT INTO public.memberships(
  id, member_id, plan_id, start_date, end_date, status,
  payment_method, amount_paid, gym_id, created_at, created_by
) VALUES (
  '50000000-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000001',
  current_date - 10,
  current_date + 10,
  'active',
  'cash',
  80.00,
  '10000000-0000-0000-0000-000000000001',
  now() - interval '1 day',
  '11111111-0000-0000-0000-000000000001'
);
