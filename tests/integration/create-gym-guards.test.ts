import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/019_unified_accounts.sql');

describe('create_gym guards', () => {
  it('enforces slug, reserved-code, case-insensitive uniqueness, and the unpublished-gym cap', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const createGym = sql.slice(sql.indexOf('FUNCTION public.create_gym'), sql.indexOf('-- 5. Legacy RPC drops'));

    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS gyms_code_lower_key[\s\S]*lower\(code\)/i);
    expect(createGym).toMatch(/\^\[a-z0-9\]\[a-z0-9-\]\{2,31\}\$/i);
    for (const code of ['admin', 'login', 'signup', 'api', 'kiosk', 'member', 'gyms', 'stren']) {
      expect(createGym).toContain(`'${code}'`);
    }
    expect(createGym).toMatch(/NOT COALESCE\(g\.is_published, false\)/i);
    expect(createGym).toMatch(/v_unpublished_count >= 3/i);
    expect(createGym).toMatch(/VALUES \(v_gym\.id, auth\.uid\(\), 'owner', 'active', auth\.uid\(\)\)/i);
  });
});
