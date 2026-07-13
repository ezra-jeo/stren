import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/019_unified_accounts.sql');

describe('unified-account storage policies', () => {
  it('replaces every gym-assets owner policy before dropping legacy profile identity columns', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const policyStart = sql.indexOf('-- Gym asset ownership follows the active gym affiliation.');
    const roleDrop = sql.indexOf('DROP COLUMN IF EXISTS role', policyStart);
    const columnDrop = sql.lastIndexOf('ALTER TABLE public.profiles', roleDrop);
    const policies = sql.slice(policyStart, columnDrop);
    const executablePolicies = policies.replace(/--[^\r\n]*/g, '');

    expect(policyStart).toBeGreaterThan(-1);
    expect(columnDrop).toBeGreaterThan(policyStart);

    for (const policy of [
      'gym_assets_owner_upload',
      'gym_assets_owner_update',
      'gym_assets_owner_delete',
    ]) {
      expect(policies).toContain(`DROP POLICY IF EXISTS ${policy} ON storage.objects`);
      expect(policies).toContain(`CREATE POLICY ${policy} ON storage.objects`);
    }

    expect(policies).toMatch(/public\.is_gym_owner\(auth\.uid\(\), public\.get_gym_id\(\)\)/i);
    expect(policies).toMatch(/\(storage\.foldername\(name\)\)\[1\]\s*=\s*public\.get_gym_id\(\)::TEXT/i);
    expect(executablePolicies).not.toMatch(/profiles\.(?:role|gym_id)/i);
  });
});
