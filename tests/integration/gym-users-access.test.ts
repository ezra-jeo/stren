import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/019_unified_accounts.sql');

describe('unified-account gym access SQL', () => {
  it('moves per-gym role and status into gym_users and resolves access only through an active gym-user row', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.gym_users/i);
    expect(sql).toMatch(/PRIMARY KEY \(gym_id, user_id\)/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS active_gym_id UUID/i);

    const getGymId = sql.slice(
      sql.indexOf('FUNCTION public.get_gym_id'),
      sql.indexOf('FUNCTION public.get_user_role'),
    );
    expect(getGymId).toMatch(/p\.active_gym_id/i);
    expect(getGymId).toMatch(/JOIN public\.gym_users gu/i);
    expect(getGymId).toMatch(/gu\.status = 'active'/i);

    const getMyAccess = sql.slice(
      sql.indexOf('FUNCTION public.get_my_access'),
      sql.indexOf('FUNCTION public.validate_permission_override'),
    );
    expect(getMyAccess).toMatch(/FROM public\.gym_users/i);
    expect(getMyAccess).toMatch(/gu\.status = 'active'/i);
    expect(getMyAccess).toMatch(/RAISE EXCEPTION 'permission denied'/i);

    expect(sql).toMatch(/DROP COLUMN IF EXISTS role[\s\S]*DROP COLUMN IF EXISTS gym_id[\s\S]*DROP COLUMN IF EXISTS status/i);
  });
});
