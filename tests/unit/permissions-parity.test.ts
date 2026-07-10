import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/role-permission-defaults.json';
import { ROLE_DEFAULT_PERMISSIONS, type Role } from '@/lib/permissions';

// The checked-in fixture is the bridge to the SQL seed (migration 015). It must
// match the TS source of truth exactly, in order — Agent B generates the seed
// from this file, so drift here would drift the database defaults.
describe('permission defaults parity: TS constant === fixture', () => {
  const roles: Role[] = ['owner', 'admin', 'staff', 'member'];

  it('has the same roles', () => {
    expect(Object.keys(fixture).sort()).toEqual([...roles].sort());
  });

  for (const role of ['owner', 'admin', 'staff', 'member'] as Role[]) {
    it(`${role} defaults match the fixture exactly and in order`, () => {
      expect([...ROLE_DEFAULT_PERMISSIONS[role]]).toEqual((fixture as Record<Role, string[]>)[role]);
    });
  }
});
