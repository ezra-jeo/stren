import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPrivateCaches,
  derivePrivateDataScope,
  privateCacheKey,
  readPrivateCache,
  writePrivateCache,
  type PrivateDataScope,
} from '@/lib/private-cache';

const ownerScope: PrivateDataScope = {
  accountId: 'account-a',
  profileId: 'account-a',
  gymId: 'gym-a',
  role: 'owner',
  branchId: null,
};

beforeEach(() => {
  clearPrivateCaches();
  sessionStorage.clear();
});

describe('private scoped cache', () => {
  it('cannot reuse one account, role, or gym snapshot in another private scope', () => {
    const memberScope = { ...ownerScope, role: 'member' as const };
    const otherGymScope = { ...ownerScope, gymId: 'gym-b' };
    const otherAccountScope = { ...ownerScope, accountId: 'account-b', profileId: 'account-b' };

    writePrivateCache('members', ownerScope, ['Alex'], { staleTimeMs: 30_000, gcTimeMs: 60_000 }, 1_000);

    expect(readPrivateCache('members', ownerScope, 2_000)?.value).toEqual(['Alex']);
    expect(readPrivateCache('members', memberScope, 2_000)).toBeNull();
    expect(readPrivateCache('members', otherGymScope, 2_000)).toBeNull();
    expect(readPrivateCache('members', otherAccountScope, 2_000)).toBeNull();
    expect(privateCacheKey('members', ownerScope)).not.toBe(privateCacheKey('members', memberScope));
  });

  it('retains stale data for background refresh, then garbage-collects it', () => {
    writePrivateCache('members', ownerScope, ['Alex'], { staleTimeMs: 1_000, gcTimeMs: 5_000 }, 1_000);

    expect(readPrivateCache('members', ownerScope, 1_500)).toMatchObject({ isStale: false, value: ['Alex'] });
    expect(readPrivateCache('members', ownerScope, 2_500)).toMatchObject({ isStale: true, value: ['Alex'] });
    expect(readPrivateCache('members', ownerScope, 6_001)).toBeNull();
  });

  it('clears in-memory and legacy session snapshots during logout', () => {
    writePrivateCache('members', ownerScope, ['Alex'], { staleTimeMs: 1_000, gcTimeMs: 5_000 }, 1_000);
    sessionStorage.setItem('stren.auth.profileCache', 'private profile');
    sessionStorage.setItem('admin-members-cache:gym-a', 'legacy members');
    sessionStorage.setItem('public.preference', 'safe');

    clearPrivateCaches({ storage: sessionStorage });

    expect(readPrivateCache('members', ownerScope, 1_100)).toBeNull();
    expect(sessionStorage.getItem('stren.auth.profileCache')).toBeNull();
    expect(sessionStorage.getItem('admin-members-cache:gym-a')).toBeNull();
    expect(sessionStorage.getItem('public.preference')).toBe('safe');
  });

  it('derives a cache scope only from the exact active account and gym access', () => {
    expect(derivePrivateDataScope({
      accountId: 'account-a',
      profileId: 'account-a',
      activeGymId: 'gym-b',
      gyms: [
        { gymId: 'gym-a', code: 'a', name: 'A', logoUrl: null, role: 'owner', status: 'active' },
        { gymId: 'gym-b', code: 'b', name: 'B', logoUrl: null, role: 'member', status: 'active' },
      ],
    })).toEqual({
      accountId: 'account-a',
      profileId: 'account-a',
      gymId: 'gym-b',
      role: 'member',
      branchId: null,
    });

    expect(derivePrivateDataScope({
      accountId: 'account-a',
      profileId: 'account-a',
      activeGymId: 'missing',
      gyms: [],
    })).toBeNull();

    expect(derivePrivateDataScope({
      accountId: 'account-b',
      profileId: 'account-a',
      activeGymId: 'gym-a',
      gyms: [
        { gymId: 'gym-a', code: 'a', name: 'A', logoUrl: null, role: 'owner', status: 'active' },
      ],
    })).toBeNull();
  });

  it('normalizes invalid cache windows so entries still expire', () => {
    writePrivateCache('members', ownerScope, ['Alex'], {
      staleTimeMs: Number.NaN,
      gcTimeMs: Number.NaN,
    }, 1_000);

    expect(readPrivateCache('members', ownerScope, 1_000)).toMatchObject({ isStale: false });
    expect(readPrivateCache('members', ownerScope, 1_001)).toBeNull();
  });
});
