import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/019_unified_accounts.sql');

describe('join request and approval SQL', () => {
  it('keeps self-joins pending, stamps the approver, and protects the last active owner', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    const joinGym = sql.slice(sql.indexOf('FUNCTION public.join_gym'), sql.indexOf('FUNCTION public.create_gym'));
    expect(joinGym).toMatch(/VALUES \(p_gym_id, auth\.uid\(\), 'member', 'pending', NULL\)/i);
    expect(joinGym).toMatch(/ON CONFLICT \(gym_id, user_id\) DO NOTHING/i);
    expect(joinGym).toMatch(/jsonb_build_object\('status', v_status::TEXT\)/i);

    expect(sql).toContain('FUNCTION public.stamp_gym_user_approval');
    expect(sql).toMatch(/OLD\.status = 'pending'[\s\S]*NEW\.status = 'active'[\s\S]*NEW\.added_by := COALESCE\(auth\.uid\(\), NEW\.added_by\)/i);
    expect(sql).toContain('TRIGGER stamp_gym_user_approval');

    const updatePolicy = sql.slice(
      sql.indexOf('CREATE POLICY gym_users_update'),
      sql.indexOf('DROP POLICY IF EXISTS profiles_select'),
    );
    expect(sql).toContain('FUNCTION public.is_gym_owner');
    expect(updatePolicy).toMatch(/NOT public\.is_gym_owner\(user_id, gym_id\)/i);

    const withCheck = updatePolicy.slice(updatePolicy.indexOf('WITH CHECK'));
    expect(withCheck).toMatch(/role <> 'owner' OR public\.get_user_role\(\) = 'owner'/i);

    expect(sql).toContain('FUNCTION public.protect_last_active_owner');
    expect(sql).toMatch(/RAISE EXCEPTION 'a gym must keep at least one active owner'/i);
  });
});
