import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/platform-admin', () => ({
  requirePlatformAdminApi: vi.fn(async () => ({ user: { id: 'operator-1' } })),
}));

let gymRow: { name: string } | null = { name: 'Iron Fitness' };
let activeInviteRow: { invited_email: string; invited_name: string | null } | null = { invited_email: 'jane@example.com', invited_name: 'Jane Owner' };
let mockRpcError: { message: string } | null = null;
let mockEmailOk = true;
const rpcCalls: Array<{ name: string; args: unknown }> = [];

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'gyms') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: gymRow, error: null }) }) }) };
      if (table === 'gym_claim_invites') {
        return {
          select: () => ({
            eq: () => ({ is: () => ({ is: () => ({ maybeSingle: async () => ({ data: activeInviteRow, error: null }) }) }) }),
          }),
        };
      }
      return {};
    },
    rpc: vi.fn(async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (name === 'supersede_claim_invite') return { data: mockRpcError ? null : { expiresAt: '2026-07-19T00:00:00.000Z' }, error: mockRpcError };
      return { data: null, error: null };
    }),
  }),
}));

vi.mock('@/lib/claim-invites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claim-invites')>();
  return { ...actual, deliverClaimInvite: vi.fn(async () => (mockEmailOk ? { ok: true, messageId: 'x' } : { ok: false, error: 'fail' })) };
});

import { POST } from '@/app/api/superadmin/onboarding/resend-invite/route';

function request(body: unknown) {
  return new Request('https://stren.app/api/superadmin/onboarding/resend-invite', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  gymRow = { name: 'Iron Fitness' };
  activeInviteRow = { invited_email: 'jane@example.com', invited_name: 'Jane Owner' };
  mockRpcError = null;
  mockEmailOk = true;
  rpcCalls.length = 0;
});

describe('POST /api/superadmin/onboarding/resend-invite', () => {
  it('rejects an invalid gymId', async () => {
    const response = await POST(request({ gymId: 'not-a-uuid' }));
    expect(response.status).toBe(400);
  });

  it('returns 404 when there is no active invite for the gym', async () => {
    activeInviteRow = null;
    const response = await POST(request({ gymId: '11111111-1111-1111-1111-111111111111' }));
    expect(response.status).toBe(404);
  });

  it('supersedes the old invite with a new token and expiry, then resends the email', async () => {
    const response = await POST(request({ gymId: '11111111-1111-1111-1111-111111111111' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.claimLink).toMatch(/^https:\/\/stren\.app\/claim\/.+/);
    expect(body.emailDelivered).toBe(true);

    const supersede = rpcCalls.find((c) => c.name === 'supersede_claim_invite')!;
    expect((supersede.args as { p_gym_id: string }).p_gym_id).toBe('11111111-1111-1111-1111-111111111111');
    const delivery = rpcCalls.find((c) => c.name === 'mark_claim_invite_delivery')!;
    expect((delivery.args as { p_status: string }).p_status).toBe('sent');
  });

  it('returns 400 when the supersede RPC fails and never attempts delivery', async () => {
    mockRpcError = { message: 'no active invite to supersede' };
    const response = await POST(request({ gymId: '11111111-1111-1111-1111-111111111111' }));
    expect(response.status).toBe(400);
    expect(rpcCalls.find((c) => c.name === 'mark_claim_invite_delivery')).toBeUndefined();
  });

  it('returns 207 with emailDelivered=false when resend email delivery fails', async () => {
    mockEmailOk = false;
    const response = await POST(request({ gymId: '11111111-1111-1111-1111-111111111111' }));
    expect(response.status).toBe(207);
    const body = await response.json();
    expect(body.emailDelivered).toBe(false);
  });
});
