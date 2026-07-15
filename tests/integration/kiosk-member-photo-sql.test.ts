import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/024_kiosk_member_photo_verification.sql');

describe('kiosk member photo verification SQL', () => {
  it('returns the member avatar for both check-in and check-out confirmations', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/SELECT p\.id, p\.name, p\.avatar_url, gu\.status/i);
    expect(sql.match(/'avatar_url', v_member\.avatar_url/g)).toHaveLength(2);
    expect(sql).toMatch(/has_member_portal_entitlement\(v_member\.id, p_gym_id\)/i);
    expect(sql).toMatch(/kiosk_access_allowed\(p_gym_id\)/i);
  });
});
