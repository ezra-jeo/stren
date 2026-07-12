import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/019_unified_accounts.sql');

describe('pinned-gym kiosk SQL', () => {
  it('takes an explicit gym for every kiosk RPC and validates caller and scanned account at that gym', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/FUNCTION public\.kiosk_access_allowed\(p_gym_id UUID\)[\s\S]*?is_manager_of\(p_gym_id\)/i);
    const guard = sql.slice(sql.indexOf('FUNCTION public.kiosk_access_allowed'), sql.indexOf('FUNCTION public.kiosk_checkin'));
    expect(guard).not.toMatch(/p_gym_id\s*=\s*public\.get_gym_id/i);

    for (const signature of [
      'kiosk_checkin(p_qr_code TEXT, p_gym_id UUID)',
      'kiosk_checkin_by_member(p_member_id UUID, p_gym_id UUID)',
      'kiosk_checkout(p_attendance_id UUID, p_gym_id UUID)',
      'kiosk_get_checked_in(p_gym_id UUID)',
      'kiosk_search_members(p_query TEXT, p_gym_id UUID)',
      'kiosk_update_streak(p_member_id UUID, p_gym_id UUID)',
    ]) {
      expect(sql).toContain(`FUNCTION public.${signature}`);
    }

    const checkin = sql.slice(sql.indexOf('FUNCTION public.kiosk_checkin('), sql.indexOf('FUNCTION public.kiosk_checkin_by_member'));
    expect(checkin).toMatch(/JOIN public\.gym_users gu[\s\S]*gu\.gym_id = p_gym_id[\s\S]*gu\.status = 'active'/i);
  });
});
