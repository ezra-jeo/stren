import { describe, expect, it } from 'vitest';
import { accessFromRoleDefaults, buildAccess, canUse, type MyAccess } from '@/lib/access';

describe('buildAccess', () => {
  it('resolves permissions from role + overrides and carries features through', () => {
    const access = buildAccess(
      'admin',
      'gym-1',
      [{ permission: 'gym_page:view', granted: true }, { permission: 'gym_page:edit', granted: true }],
      { leaderboards: false },
    );
    expect(access.role).toBe('admin');
    expect(access.gymId).toBe('gym-1');
    expect(access.permissions.has('gym_page:edit')).toBe(true);
    expect(access.features.leaderboards).toBe(false);
  });
});

describe('canUse — combined gate (feature first, then permission)', () => {
  const owner: MyAccess = accessFromRoleDefaults('owner', 'gym-1');

  it('passes when both gates pass', () => {
    expect(canUse(owner, 'kiosk_checkin', 'kiosk:use')).toBe(true);
  });

  it('feature-only gate: passes on default-on, fails when off', () => {
    expect(canUse(owner, 'member_feed', null)).toBe(true);
    const off = buildAccess('owner', 'gym-1', [], { member_feed: false });
    expect(canUse(off, 'member_feed', null)).toBe(false);
  });

  it('permission-only gate: fails when the permission is missing', () => {
    const staff = accessFromRoleDefaults('staff', 'gym-1');
    expect(canUse(staff, null, 'payments:view')).toBe(false);
    expect(canUse(staff, null, 'members:view')).toBe(true);
  });

  it('§2 case: staff with kiosk:use at a gym with kiosk_checkin off → blocked', () => {
    const staff = buildAccess('staff', 'gym-1', [], { kiosk_checkin: false });
    expect(staff.permissions.has('kiosk:use')).toBe(true);
    expect(canUse(staff, 'kiosk_checkin', 'kiosk:use')).toBe(false);
  });

  it('§2 case: member at a gym with leaderboards off → blocked', () => {
    const member = buildAccess('member', 'gym-1', [], { leaderboards: false });
    expect(canUse(member, 'leaderboards', null)).toBe(false);
  });

  it('null/null gate is always allowed', () => {
    expect(canUse(owner, null, null)).toBe(true);
  });
});

describe('accessFromRoleDefaults — safe fallback', () => {
  it('gives an owner every permission and catalog feature defaults', () => {
    const owner = accessFromRoleDefaults('owner', 'gym-1');
    expect(owner.permissions.has('features:manage')).toBe(true);
    expect(owner.features.member_feed).toBe(true);
    expect(owner.features.trainer_bookings).toBe(false);
  });

  it('gives a member no permissions', () => {
    expect(accessFromRoleDefaults('member', null).permissions.size).toBe(0);
  });
});
