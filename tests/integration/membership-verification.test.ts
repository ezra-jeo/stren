import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/021_membership_verification.sql');

describe('saved gyms and membership verification SQL', () => {
  it('keeps saved public gyms separate from gym access', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.saved_gyms/i);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, gym_id\)/i);
    expect(sql).toMatch(/ALTER TABLE public\.saved_gyms ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY saved_gyms_select[\s\S]*auth\.uid\(\) = user_id/i);
    expect(sql).toMatch(/FUNCTION public\.save_gym\(p_gym_id UUID\)[\s\S]*g\.is_published/i);
    const saveGym = sql.slice(sql.indexOf('FUNCTION public.save_gym'), sql.indexOf('FUNCTION public.unsave_gym'));
    expect(saveGym).not.toMatch(/INSERT INTO public\.gym_users/i);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.saved_gyms FROM authenticated/i);
  });

  it('connects only an email-verified account that already owns a billing membership for that gym', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const verification = sql.slice(
      sql.indexOf('FUNCTION public.verify_gym_membership'),
      sql.indexOf('FUNCTION public.get_my_membership_verifications'),
    );

    expect(verification).toMatch(/FROM auth\.users[\s\S]*email_confirmed_at IS NOT NULL[\s\S]*id = auth\.uid\(\)/i);
    expect(verification).toMatch(/FROM public\.memberships m[\s\S]*m\.member_id = auth\.uid\(\)[\s\S]*m\.gym_id = p_gym_id/i);
    expect(verification).not.toMatch(/contact_number|phone/i);
    expect(verification).toMatch(/v_matched[\s\S]*'active'[\s\S]*'pending'/i);
    expect(verification).toMatch(/INSERT INTO public\.gym_users\(gym_id, user_id, role, status, added_by\)/i);
    expect(verification).toMatch(/jsonb_build_object\([\s\S]*'status'[\s\S]*'matched'/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.verify_gym_membership\(UUID\) FROM PUBLIC, anon/i);
  });

  it('supports multiple pending verifications, cooldown-protected reminders, withdrawal, and confirmation notifications', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.gym_verification_reminders/i);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, gym_id\)/i);

    const list = sql.slice(
      sql.indexOf('FUNCTION public.get_my_membership_verifications'),
      sql.indexOf('FUNCTION public.send_membership_verification_reminder'),
    );
    expect(list).toMatch(/gu\.user_id = auth\.uid\(\)/i);
    expect(list).toMatch(/gu\.status IN \('pending', 'rejected'\)/i);
    expect(list).not.toMatch(/LIMIT 1/i);

    const reminder = sql.slice(
      sql.indexOf('FUNCTION public.send_membership_verification_reminder'),
      sql.indexOf('FUNCTION public.withdraw_membership_verification'),
    );
    expect(reminder).toMatch(/gu\.status = 'pending'/i);
    expect(reminder).toMatch(/ON CONFLICT \(user_id, gym_id\) DO UPDATE/i);
    expect(reminder).toMatch(/INTERVAL '7 days'/i);
    expect(reminder).toMatch(/RAISE EXCEPTION 'Reminder cooldown active'/i);

    const withdrawal = sql.slice(
      sql.indexOf('FUNCTION public.withdraw_membership_verification'),
      sql.indexOf('FUNCTION public.handle_membership_verification_notification'),
    );
    expect(withdrawal).toMatch(/DELETE FROM public\.gym_users[\s\S]*user_id = auth\.uid\(\)[\s\S]*status = 'pending'/i);

    expect(sql).toMatch(/OLD\.status = 'pending'[\s\S]*NEW\.status = 'active'[\s\S]*'membership_verified'/i);
    expect(sql).toMatch(/'Membership verification'[\s\S]*waiting for gym confirmation/i);
    expect(sql).not.toContain('New member request');
  });

  it('allows only authorized staff at that gym to confirm another account', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const confirmation = sql.slice(
      sql.indexOf('FUNCTION public.confirm_membership_verification'),
      sql.indexOf('FUNCTION public.handle_membership_verification_notification'),
    );
    expect(confirmation).toMatch(/p_gym_id UUID,\s*p_user_id UUID/i);
    expect(confirmation).toMatch(/has_gym_permission\('members:manage', p_gym_id\)/i);
    expect(confirmation).toMatch(/p_user_id = auth\.uid\(\)[\s\S]*RAISE EXCEPTION/i);
    expect(confirmation).toMatch(/UPDATE public\.gym_users[\s\S]*status = 'active'[\s\S]*added_by = auth\.uid\(\)/i);
    expect(confirmation).toMatch(/gym_id = p_gym_id[\s\S]*user_id = p_user_id[\s\S]*status = 'pending'/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.confirm_membership_verification\(UUID, UUID\) FROM PUBLIC, anon/i);
  });
});
