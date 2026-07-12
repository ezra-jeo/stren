import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/019_unified_accounts.sql');

describe('active gym SQL', () => {
  it('accepts active gym users only, rejects direct client writes, and clears a stale selection', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const setActive = sql.slice(sql.indexOf('FUNCTION public.set_active_gym'), sql.indexOf('FUNCTION public.join_gym'));

    // The RPC is the only write path: it validates an active affiliation before writing.
    expect(setActive).toMatch(/SECURITY DEFINER/i);
    expect(setActive).toMatch(/gu\.user_id = auth\.uid\(\)[\s\S]*gu\.gym_id = p_gym_id[\s\S]*gu\.status = 'active'/i);
    expect(setActive).toMatch(/RAISE EXCEPTION 'You do not have active access to that gym'/i);
    expect(setActive).toMatch(/UPDATE public\.profiles SET active_gym_id = p_gym_id/i);

    // Direct client writes are blocked at the grant layer, not via a session-config handshake.
    expect(sql).toMatch(/REVOKE UPDATE\(active_gym_id\) ON public\.profiles FROM authenticated/i);

    // Defense in depth: a BEFORE UPDATE trigger rejects any value without a
    // matching active gym_users row (covers service-role and definer writes).
    expect(sql).toContain('TRIGGER validate_active_gym');
    const validator = sql.slice(
      sql.indexOf('FUNCTION public.validate_active_gym'),
      sql.indexOf('DROP TRIGGER IF EXISTS validate_active_gym'),
    );
    expect(validator).toMatch(/NEW\.active_gym_id IS NOT NULL[\s\S]*NOT public\.has_active_gym_affiliation\(NEW\.id, NEW\.active_gym_id\)[\s\S]*RAISE EXCEPTION 'active gym requires an active gym user'/i);

    // A selection that loses its backing affiliation is cleared automatically.
    expect(sql).toContain('TRIGGER clear_invalid_active_gym');
    expect(sql).toMatch(/SET active_gym_id = NULL[\s\S]*OLD\.user_id[\s\S]*OLD\.gym_id/i);
  });
});
