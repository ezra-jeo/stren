import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;

test('member session cannot call manager-only dashboard, notification, or streak RPCs', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One live RPC probe is sufficient.');
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY || !MEMBER_EMAIL || !MEMBER_PASSWORD,
    'Set Supabase and member E2E credentials to run live RPC authorization probes.',
  );

  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email: MEMBER_EMAIL!,
    password: MEMBER_PASSWORD!,
  });
  expect(signInError).toBeNull();

  const { data: access, error: accessError } = await supabase.rpc('get_my_access');
  expect(accessError).toBeNull();
  const gymId = (access as { gym_id?: string } | null)?.gym_id;
  expect(gymId).toBeTruthy();

  const dashboard = await supabase.rpc('admin_dashboard_stats');
  expect(dashboard.error).toBeTruthy();

  const notification = await supabase.rpc('create_member_notification', {
    p_member_id: signIn.user!.id,
    p_gym_id: gymId!,
    p_type: 'announcement',
    p_title: 'Unauthorized E2E probe',
    p_body: 'This row must never be inserted.',
  });
  expect(notification.error).toBeTruthy();

  const streak = await supabase.rpc('kiosk_update_streak', {
    p_member_id: signIn.user!.id,
    p_gym_id: gymId!,
  });
  expect(streak.error).toBeTruthy();
});
