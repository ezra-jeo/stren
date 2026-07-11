import { describe, expect, it, vi } from 'vitest';
import { fetchMyAccess } from '@/lib/access-data';
import { getMyAccess } from '@/lib/permissions-server';

function fallbackProfileQuery(profile: { role: string; gym_id: string } | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: profile }),
  };
}

describe('get_my_access client contract', () => {
  it('coerces the exact RPC shape and falls back to role defaults on RPC error', async () => {
    const rpcClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          role: 'admin',
          gym_id: 'gym-1',
          permissions: ['dashboard:view', 'payments:view', 'not-a-key'],
          features: { member_feed: false, leaderboards: true, unknown: true },
        },
        error: null,
      }),
    };

    const access = await fetchMyAccess(rpcClient as never);
    expect(access.role).toBe('admin');
    expect(access.gymId).toBe('gym-1');
    expect([...access.permissions]).toEqual(['dashboard:view', 'payments:view']);
    expect(access.features).toEqual({ member_feed: false, leaderboards: true });

    const query = fallbackProfileQuery({ role: 'staff', gym_id: 'gym-2' });
    const fallbackClient = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'missing function' } }),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn().mockReturnValue(query),
    };
    const fallback = await fetchMyAccess(fallbackClient as never);
    expect(fallback.role).toBe('staff');
    expect(fallback.gymId).toBe('gym-2');
    expect(fallback.permissions.has('members:view')).toBe(true);
    expect(fallback.features.kiosk_checkin).toBe(true);
  });
});

describe('get_my_access server enforcement', () => {
  it('fails closed when the access RPC is unavailable', async () => {
    const access = await getMyAccess({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'unavailable' } }),
    } as never);

    expect(access.permissions.size).toBe(0);
    expect(access.features.kiosk_checkin).toBe(false);
    expect(access.features.member_feed).toBe(false);
  });
});
