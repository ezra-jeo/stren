import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { roleHasPermission } from '@/lib/permissions';

describe('feature settings authorization', () => {
  it('allows only the owner role to satisfy the features:manage write policy', () => {
    expect(roleHasPermission('owner', 'features:manage')).toBe(true);
    expect(roleHasPermission('admin', 'features:manage')).toBe(false);
    expect(roleHasPermission('staff', 'features:manage')).toBe(false);
    expect(roleHasPermission('member', 'features:manage')).toBe(false);

    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/016_feature_toggles.sql'),
      'utf8',
    );
    for (const operation of ['insert', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(
        `CREATE POLICY feature_settings_${operation}[\\s\\S]*?has_gym_permission\\('features:manage'`,
        'i',
      ));
    }
  });
});
