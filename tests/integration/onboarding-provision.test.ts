import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/platform-admin', () => ({
  requirePlatformAdminApi: vi.fn(async () => ({ user: { id: 'operator-1' } })),
}));

let mockRpcResult: unknown = {
  gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness', ownerEmail: 'jane@example.com', expiresAt: '2026-07-18T00:00:00.000Z',
};
let mockRpcError: { message: string } | null = null;
let mockEmailOk = true;
const rpcCalls: Array<{ name: string; args: unknown }> = [];
const createUserEmails: string[] = [];
const existingProfileEmails = new Set<string>();

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: vi.fn(async ({ email }: { email: string }) => {
          createUserEmails.push(email);
          return { data: { user: { id: `new-${email}` } }, error: null };
        }),
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      },
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, email: string) => ({
              maybeSingle: async () => ({
                data: existingProfileEmails.has(email) ? { id: `existing-${email}` } : null,
                error: null,
              }),
            }),
          }),
          upsert: vi.fn(async () => ({ error: null })),
        };
      }
      if (table === 'gyms') {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      return {};
    },
    rpc: vi.fn(async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (name === 'provision_gym_workspace') return { data: mockRpcResult, error: mockRpcError };
      return { data: null, error: null };
    }),
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
  }),
}));

vi.mock('@/lib/claim-invites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claim-invites')>();
  return {
    ...actual,
    deliverClaimInvite: vi.fn(async () => (mockEmailOk ? { ok: true, messageId: 'x' } : { ok: false, error: 'delivery failed' })),
  };
});

import { POST } from '@/app/api/superadmin/onboarding/provision/route';
import { DEFAULT_OPERATING_HOURS, DEFAULT_ACCESS_SWITCHES } from '@/lib/onboarding/schemas';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: '11111111-1111-1111-1111-111111111111',
    gym: { gymName: 'Iron Fitness', branchName: '', address: 'Quezon City', slug: 'iron-fitness' },
    owner: { name: 'Jane Owner', email: 'jane@example.com', mobile: '+639171234567', role: 'owner', consentMethod: 'in_person' },
    staff: [],
    plans: [{ id: 'p1', name: 'Monthly', price: 500, durationValue: 3, durationUnit: 'months', description: '', isActive: true }],
    operatingHours: DEFAULT_OPERATING_HOURS,
    switches: DEFAULT_ACCESS_SWITCHES,
    importedMembers: [],
    logoDataUrl: null,
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request('https://stren.app/api/superadmin/onboarding/provision', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockRpcResult = { gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness', ownerEmail: 'jane@example.com', expiresAt: '2026-07-18T00:00:00.000Z' };
  mockRpcError = null;
  mockEmailOk = true;
  rpcCalls.length = 0;
  createUserEmails.length = 0;
  existingProfileEmails.clear();
});

describe('POST /api/superadmin/onboarding/provision', () => {
  it('rejects an invalid payload with 400 before touching the database', async () => {
    const response = await POST(request({ idempotencyKey: 'not-a-uuid' }));
    expect(response.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('rejects a plan list with zero plans', async () => {
    const response = await POST(request(validBody({ plans: [] })));
    expect(response.status).toBe(400);
  });

  it('reuses an existing account by email instead of creating a duplicate', async () => {
    existingProfileEmails.add('jane@example.com');
    await POST(request(validBody()));
    expect(createUserEmails).not.toContain('jane@example.com');
    const rpcCall = rpcCalls.find((c) => c.name === 'provision_gym_workspace');
    expect((rpcCall!.args as { p_payload: { owner: { userId: string } } }).p_payload.owner.userId).toBe('existing-jane@example.com');
  });

  it('creates a new account when no profile exists for the email', async () => {
    await POST(request(validBody()));
    expect(createUserEmails).toContain('jane@example.com');
  });

  it('converts plan duration in months to days and maps switches to feature flags before calling the RPC', async () => {
    await POST(request(validBody()));
    const rpcCall = rpcCalls.find((c) => c.name === 'provision_gym_workspace')!;
    const payload = (rpcCall.args as { p_payload: { plans: Array<{ durationDays: number }>; featureFlags: Record<string, boolean> } }).p_payload;
    expect(payload.plans[0].durationDays).toBe(90); // 3 months
    expect(payload.featureFlags).toEqual({
      kiosk_checkin: true, auto_approve_joins: false, staff_manual_checkin: true,
      checkin_requires_membership: true, occupancy_count: true,
    });
  });

  it('passes the exact idempotency key through to the RPC unchanged', async () => {
    await POST(request(validBody()));
    const rpcCall = rpcCalls.find((c) => c.name === 'provision_gym_workspace')!;
    expect((rpcCall.args as { p_idempotency_key: string }).p_idempotency_key).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('returns 400 and never attempts email delivery when the RPC fails', async () => {
    mockRpcError = { message: 'That gym code is already taken' };
    const response = await POST(request(validBody()));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/already taken/);
    expect(rpcCalls.find((c) => c.name === 'mark_claim_invite_delivery')).toBeUndefined();
  });

  it('returns 200 with a claim link and emailDelivered=true on full success', async () => {
    const response = await POST(request(validBody()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.gymId).toBe('gym-1');
    expect(body.claimLink).toMatch(/^https:\/\/stren\.app\/claim\/.+/);
    expect(body.emailDelivered).toBe(true);
  });

  it('returns 207 (not a failure) with emailDelivered=false when delivery fails after a successful provision', async () => {
    mockEmailOk = false;
    const response = await POST(request(validBody()));
    expect(response.status).toBe(207);
    const body = await response.json();
    expect(body.gymId).toBe('gym-1'); // gym was still created
    expect(body.emailDelivered).toBe(false);
    const deliveryCall = rpcCalls.find((c) => c.name === 'mark_claim_invite_delivery')!;
    expect((deliveryCall.args as { p_status: string }).p_status).toBe('failed');
  });
});
