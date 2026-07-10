import { describe, expect, it } from 'vitest';
import {
  ACCESS_SWITCHES,
  PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  ROUTE_PERMISSIONS,
  permissionForPath,
  resolvePermissions,
  roleHasPermission,
  type PermissionKey,
  type Role,
} from '@/lib/permissions';

// ImplementationPlan.md §3 — the full default matrix, every cell.
const MATRIX: Record<PermissionKey, Record<Role, boolean>> = {
  'dashboard:view':               { owner: true, admin: true,  staff: false, member: false },
  'dashboard:finance:view':       { owner: true, admin: true,  staff: false, member: false },
  'reports:attendance:view':      { owner: true, admin: true,  staff: false, member: false },
  'reports:finance:view':         { owner: true, admin: true,  staff: false, member: false },
  'members:view':                 { owner: true, admin: true,  staff: true,  member: false },
  'members:manage':               { owner: true, admin: true,  staff: false, member: false },
  'members:payment_history:view': { owner: true, admin: true,  staff: false, member: false },
  'payments:view':                { owner: true, admin: true,  staff: false, member: false },
  'payments:create':              { owner: true, admin: true,  staff: false, member: false },
  'plans:manage':                 { owner: true, admin: true,  staff: false, member: false },
  'promos:manage':                { owner: true, admin: true,  staff: false, member: false },
  'announcements:manage':         { owner: true, admin: true,  staff: false, member: false },
  'gym_page:view':                { owner: true, admin: false, staff: false, member: false },
  'gym_page:edit':                { owner: true, admin: false, staff: false, member: false },
  'gym_page:publish':             { owner: true, admin: false, staff: false, member: false },
  'features:manage':              { owner: true, admin: false, staff: false, member: false },
  'roles:manage':                 { owner: true, admin: false, staff: false, member: false },
  'kiosk:use':                    { owner: true, admin: true,  staff: true,  member: false },
  'cache:revalidate':             { owner: true, admin: true,  staff: false, member: false },
};

const ROLES: Role[] = ['owner', 'admin', 'staff', 'member'];

describe('roleHasPermission — §3 matrix, every cell × 4 roles', () => {
  for (const key of PERMISSION_KEYS) {
    for (const role of ROLES) {
      it(`${role} · ${key} = ${MATRIX[key][role]}`, () => {
        expect(roleHasPermission(role, key)).toBe(MATRIX[key][role]);
      });
    }
  }

  it('owner holds unknown / future keys', () => {
    expect(roleHasPermission('owner', 'some:future:key' as PermissionKey)).toBe(true);
    expect(roleHasPermission('admin', 'some:future:key' as PermissionKey)).toBe(false);
  });

  it('gym_page:edit implies gym_page:view for a role granted edit by default', () => {
    // No role has edit by default except owner; assert the rule directly via override resolution below.
    expect(roleHasPermission('owner', 'gym_page:view')).toBe(true);
  });
});

describe('resolvePermissions — overrides beat defaults, edit ⊇ view', () => {
  it('admin defaults resolve to exactly the §3 admin set', () => {
    const set = resolvePermissions('admin', []);
    for (const key of PERMISSION_KEYS) {
      expect(set.has(key)).toBe(MATRIX[key].admin);
    }
  });

  it('grant override reveals an off-by-default permission', () => {
    const set = resolvePermissions('admin', [
      { permission: 'gym_page:view', granted: true },
      { permission: 'gym_page:edit', granted: true },
    ]);
    expect(set.has('gym_page:view')).toBe(true);
    expect(set.has('gym_page:edit')).toBe(true);
  });

  it('revoke override removes an on-by-default permission', () => {
    const set = resolvePermissions('admin', [{ permission: 'payments:view', granted: false }]);
    expect(set.has('payments:view')).toBe(false);
  });

  it('granting edit implies view even without an explicit view grant', () => {
    const set = resolvePermissions('admin', [{ permission: 'gym_page:edit', granted: true }]);
    expect(set.has('gym_page:edit')).toBe(true);
    expect(set.has('gym_page:view')).toBe(true);
  });

  it('owner resolves to every key and ignores overrides', () => {
    const set = resolvePermissions('owner', [{ permission: 'dashboard:view', granted: false }]);
    expect(set.size).toBe(PERMISSION_KEYS.length);
    expect(set.has('dashboard:view')).toBe(true);
  });

  it('member resolves to an empty set by default', () => {
    expect(resolvePermissions('member', []).size).toBe(0);
  });
});

describe('ROUTE_PERMISSIONS — covers every admin nav href, longest prefix wins', () => {
  const NAV_HREFS: Array<{ href: string; permission: PermissionKey }> = [
    { href: '/admin', permission: 'dashboard:view' },
    { href: '/admin/members', permission: 'members:view' },
    { href: '/admin/payments', permission: 'payments:view' },
    { href: '/admin/plans', permission: 'plans:manage' },
    { href: '/admin/promos', permission: 'promos:manage' },
    { href: '/admin/announcements', permission: 'announcements:manage' },
    { href: '/admin/gym-profile', permission: 'gym_page:view' },
    { href: '/admin/reports', permission: 'reports:attendance:view' },
    { href: '/admin/access', permission: 'roles:manage' },
    { href: '/kiosk', permission: 'kiosk:use' },
  ];

  for (const { href, permission } of NAV_HREFS) {
    it(`${href} → ${permission}`, () => {
      expect(permissionForPath(href)).toBe(permission);
    });
  }

  it('resolves a nested path by longest prefix, not /admin', () => {
    expect(permissionForPath('/admin/members/123')).toBe('members:view');
    expect(permissionForPath('/admin/gym-profile/anything')).toBe('gym_page:view');
  });

  it('every ROUTE_PERMISSIONS entry references a known key', () => {
    for (const { permission } of ROUTE_PERMISSIONS) {
      expect(PERMISSION_KEYS).toContain(permission);
    }
  });
});

describe('ACCESS_SWITCHES — §7.9 frozen list', () => {
  it('has exactly 8 switches in order with valid permission keys', () => {
    expect(ACCESS_SWITCHES).toHaveLength(8);
    expect(ACCESS_SWITCHES.map((s) => s.id)).toEqual([
      'money-numbers', 'manage-members', 'record-payments', 'manage-plans',
      'manage-promos', 'post-announcements', 'use-kiosk', 'gym-studio',
    ]);
    for (const sw of ACCESS_SWITCHES) {
      expect(sw.permissions.length).toBeGreaterThan(0);
      for (const key of sw.permissions) expect(PERMISSION_KEYS).toContain(key);
    }
  });

  it('maps the multi-key switches exactly', () => {
    const money = ACCESS_SWITCHES.find((s) => s.id === 'money-numbers');
    expect(money?.permissions).toEqual(['dashboard:finance:view', 'reports:finance:view']);
    const studio = ACCESS_SWITCHES.find((s) => s.id === 'gym-studio');
    expect(studio?.permissions).toEqual(['gym_page:view', 'gym_page:edit']);
  });

  it('never exposes owner-only, never-delegable keys as switches', () => {
    const exposed = new Set(ACCESS_SWITCHES.flatMap((s) => s.permissions));
    for (const key of ['gym_page:publish', 'features:manage', 'roles:manage', 'cache:revalidate'] as PermissionKey[]) {
      expect(exposed.has(key)).toBe(false);
    }
  });
});

describe('ROLE_DEFAULT_PERMISSIONS shape', () => {
  it('owner holds every key', () => {
    expect([...ROLE_DEFAULT_PERMISSIONS.owner].sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});
