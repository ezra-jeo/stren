import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('owner team-management endpoint', () => {
  it('attaches or creates only admin/staff accounts and never lets the endpoint remove an owner', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/admin/access/people/route.ts'), 'utf8');
    expect(route).toMatch(/apiRequirePermission\('roles:manage'/);
    expect(route).toMatch(/access\.role !== 'owner'/);
    expect(route).toMatch(/role:\s*z\.enum\(\['admin', 'staff'\]\)/);
    expect(route).toMatch(/from\('profiles'\)[\s\S]*\.eq\('email', email\)[\s\S]*maybeSingle/);
    expect(route).toMatch(/from\('gym_users'\)[\s\S]*upsert/);
    expect(route).toMatch(/\['admin', 'staff'\]\.includes\(target\.role\)/);
    expect(route).toMatch(/from\('gym_user_permission_overrides'\)[\s\S]*delete/);
    expect(route).toMatch(/from\('gym_users'\)[\s\S]*delete/);
  });
});
