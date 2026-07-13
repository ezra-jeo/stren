import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/020_platform_admin_gym_creation.sql');

describe('platform-only gym creation', () => {
  it('denies ordinary authenticated callers while retaining platform-admin creation', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('FUNCTION public.is_platform_admin()');
    expect(sql).toMatch(/auth\.jwt\(\)[\s\S]*app_metadata[\s\S]*platform_role[\s\S]*platform_admin/i);

    const createStart = sql.indexOf('FUNCTION public.create_gym');
    const createGym = sql.slice(createStart, sql.indexOf('REVOKE EXECUTE', createStart));
    expect(createGym).toMatch(/IF NOT public\.is_platform_admin\(\) THEN[\s\S]*RAISE EXCEPTION 'platform admin access required'/i);
    expect(createGym).toMatch(/INSERT INTO public\.gyms/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.create_gym\(TEXT, TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_gym\(TEXT, TEXT\) TO authenticated/i);
    expect(existsSync(resolve(process.cwd(), 'app/gyms/new/page.tsx'))).toBe(false);
    expect(readFileSync(resolve(process.cwd(), 'lib/auth-actions.ts'), 'utf8')).not.toContain('createGymAction');
  });
});
