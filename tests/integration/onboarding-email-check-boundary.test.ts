import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

const userClient = {
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ name, args });
    return {
      data: {
        exists: true,
        ownsOrManagesGymCount: 2,
        pendingInvite: { gymName: 'Iron Fitness', expiresAt: '2030-01-01T00:00:00.000Z' },
      },
      error: null,
    };
  }),
};

vi.mock('@/lib/platform-admin', () => ({
  requirePlatformAdminApi: vi.fn(async () => ({ context: { supabase: userClient }, response: null })),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })) } },
  }),
}));

import { GET } from '@/app/api/superadmin/onboarding/email-check/route';

beforeEach(() => {
  state.rpcCalls.length = 0;
});

describe('email-check route boundary', () => {
  it('uses Auth only for identity lookup and a user-bound RPC for Postgres account metadata', async () => {
    const response = await GET(new Request('https://stren.app/api/superadmin/onboarding/email-check?email=Owner%40Example.com'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      exists: true,
      ownsOrManagesGymCount: 2,
      pendingInvite: { gymName: 'Iron Fitness', expiresAt: '2030-01-01T00:00:00.000Z' },
    });
    expect(state.rpcCalls).toEqual([{ name: 'get_platform_account_resolution', args: { p_email: 'owner@example.com' } }]);
  });

  it('rejects malformed email input before either client is used', async () => {
    const response = await GET(new Request('https://stren.app/api/superadmin/onboarding/email-check?email=not-an-email'));
    expect(response.status).toBe(400);
    expect(state.rpcCalls).toHaveLength(0);
  });
});
