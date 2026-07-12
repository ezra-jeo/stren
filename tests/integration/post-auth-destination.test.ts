import { describe, expect, it } from 'vitest';
import { choosePostAuthDestination } from '@/lib/post-auth-destination';

const gyms = [
  { gymId: 'a', code: 'alpha', name: 'Alpha', logoUrl: null, role: 'owner' as const, status: 'active' as const },
  { gymId: 'b', code: 'beta', name: 'Beta', logoUrl: null, role: 'member' as const, status: 'active' as const },
];

describe('post-auth destination', () => {
  it('implements all five destination rules', () => {
    expect(choosePostAuthDestination(gyms, null, 'alpha')).toEqual({ path: '/admin', activateGymId: 'a' });
    expect(choosePostAuthDestination(gyms, null, 'missing')).toEqual({ path: '/gyms?join=missing', activateGymId: null });
    expect(choosePostAuthDestination(gyms, 'b')).toEqual({ path: '/member', activateGymId: null });
    expect(choosePostAuthDestination([gyms[0]], null)).toEqual({ path: '/admin', activateGymId: 'a' });
    expect(choosePostAuthDestination(gyms, null)).toEqual({ path: '/gyms', activateGymId: null });
    expect(choosePostAuthDestination([{ ...gyms[1], status: 'pending' }], null)).toEqual({ path: '/gyms', activateGymId: null });
  });
});
