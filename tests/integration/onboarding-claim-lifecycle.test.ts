import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  invite: { gymName: 'Iron Fitness', ownerEmail: 'jane@example.com', ownerName: 'Jane Owner' } as Record<string, unknown> | null,
  deliveryOk: true,
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  deliveredLink: null as string | null,
}));

const userClient = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'operator-1', email: 'jane@example.com' } }, error: null })) },
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    state.calls.push({ name, args });
    if (name === 'get_platform_claim_invite') return { data: state.invite, error: null };
    if (name === 'supersede_claim_invite') return { data: { deliveryStatus: 'pending' }, error: null };
    return { data: { deliveryStatus: args.p_status }, error: null };
  }),
};

vi.mock('@/lib/platform-admin', () => ({
  requirePlatformAdminApi: vi.fn(async () => ({ context: { supabase: userClient, user: { id: 'operator-1' } }, response: null })),
}));

vi.mock('@/lib/claim-invites', async () => {
  const actual = await vi.importActual<typeof import('@/lib/claim-invites')>('@/lib/claim-invites');
  return {
    ...actual,
    deliverClaimInvite: vi.fn(async (input: { claimLink: string }) => {
      state.deliveredLink = input.claimLink;
      return state.deliveryOk ? { ok: true, messageId: 'mail-1' } : { ok: false, error: 'delivery failed' };
    }),
  };
});

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'owner-1', email: 'jane@example.com' } }, error: null }) },
    rpc: vi.fn(async () => ({ data: { gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness' }, error: null })),
  }),
}));

import { POST as resend } from '@/app/api/superadmin/onboarding/resend-invite/route';
import { POST as accept } from '@/app/api/claim/accept/route';

function request(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(() => {
  state.invite = { gymName: 'Iron Fitness', ownerEmail: 'jane@example.com', ownerName: 'Jane Owner' };
  state.deliveryOk = true;
  state.calls.length = 0;
  state.deliveredLink = null;
});

describe('resend invitation', () => {
  it('supersedes through the user-bound RPC and does not return a claim link', async () => {
    const response = await resend(request('https://stren.app/api/superadmin/onboarding/resend-invite', { gymId: '11111111-1111-1111-1111-111111111111' }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty('claimLink');
    expect(body.deliveryStatus).toBe('sent');
    expect(state.calls.map((call) => call.name)).toEqual([
      'get_platform_claim_invite', 'supersede_claim_invite', 'mark_claim_invite_delivery',
    ]);
    expect(state.deliveredLink).toMatch(/^https:\/\/stren\.app\/claim\//);
  });

  it('returns 404 when no active invite exists and 207 when delivery fails', async () => {
    state.invite = null;
    const notFound = await resend(request('https://stren.app/api/superadmin/onboarding/resend-invite', { gymId: '11111111-1111-1111-1111-111111111111' }));
    expect(notFound.status).toBe(404);

    state.invite = { gymName: 'Iron Fitness', ownerEmail: 'jane@example.com', ownerName: 'Jane Owner' };
    state.deliveryOk = false;
    const failed = await resend(request('https://stren.app/api/superadmin/onboarding/resend-invite', { gymId: '11111111-1111-1111-1111-111111111111' }));
    expect(failed.status).toBe(207);
    expect((await failed.json()).deliveryStatus).toBe('failed');
  });
});

describe('claim acceptance', () => {
  it('requires a signed-in user and does not return token material', async () => {
    const response = await accept(request('https://stren.app/api/claim/accept', { token: 'raw-claim-token' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness' });
    expect(body).not.toHaveProperty('token');
  });
});
