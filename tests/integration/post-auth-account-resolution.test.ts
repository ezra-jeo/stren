import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: maybeSingleMock }),
      }),
    }),
  }),
}));

import { resolvePostAuthDestination } from '@/lib/auth-actions';

beforeEach(() => {
  getUserMock.mockReset();
  rpcMock.mockReset();
  maybeSingleMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  maybeSingleMock.mockResolvedValue({ data: { active_gym_id: null }, error: null });
});

describe('post-auth account resolution', () => {
  it('fails closed when gym access cannot be loaded instead of inventing a zero-gym account', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'get_my_gyms is unavailable' } });

    await expect(resolvePostAuthDestination()).rejects.toThrow(/gym access/i);
  });

  it('opens the owner surface when the confirmed account has one active owner affiliation', async () => {
    rpcMock.mockImplementation((name: string) => Promise.resolve(name === 'get_my_gyms'
      ? {
          data: [{ gym_id: 'g1', code: 'iron-house', name: 'Iron House', logo_url: null, role: 'owner', status: 'active' }],
          error: null,
        }
      : { data: { role: 'owner' }, error: null }));

    await expect(resolvePostAuthDestination()).resolves.toBe('/admin');
    expect(rpcMock).toHaveBeenCalledWith('set_active_gym', { p_gym_id: 'g1' });
  });
});
