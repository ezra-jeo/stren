import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/023_kiosk_privacy_and_scan_integrity.sql');

describe('kiosk privacy and scan integrity SQL', () => {
  it('returns a count rather than the public checked-in roster', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('FUNCTION public.kiosk_get_occupancy(p_gym_id UUID)');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.kiosk_get_occupancy(UUID) FROM PUBLIC, anon;');
  });

  it('limits staff lookup to meaningful name or email searches with a minimal payload', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/FUNCTION public\.kiosk_search_members\(p_query TEXT, p_gym_id UUID\)[\s\S]*?id UUID, name TEXT, email TEXT/i);
    expect(sql).toMatch(/length\(trim\(p_query\)\) < 3/i);
    expect(sql).toMatch(/p\.name ILIKE/i);
    expect(sql).toMatch(/p\.email ILIKE/i);
    expect(sql).toMatch(/has_gym_permission\('members:view', p_gym_id\)/i);
    expect(sql).not.toMatch(/contact_number TEXT,\s*membership_status TEXT/i);
  });

  it('serializes QR toggles and reserves manual toggles for members-manage staff', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/FUNCTION public\.kiosk_checkin\([\s\S]*?pg_advisory_xact_lock/i);
    expect(sql).toMatch(/FUNCTION public\.kiosk_checkin_by_member[\s\S]*?has_gym_permission\('members:manage', p_gym_id\)/i);
  });
});
