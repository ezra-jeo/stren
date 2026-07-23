import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  adminCalls: [] as string[],
  delivery: null as { claimLink: string } | null,
  deliveryOk: true,
}));

const userClient = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'operator-1', app_metadata: { platform_role: 'platform_admin' } } }, error: null })) },
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ name, args });
    if (name === 'record_platform_provisioning_auth_state') return { data: { status: 'auth_ready' }, error: null };
    if (name === 'provision_gym_workspace') return {
      data: {
        gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness',
        ownerEmail: 'jane@example.com', expiresAt: '2026-07-25T00:00:00.000Z', deliveryStatus: 'pending',
      }, error: null,
    };
    return { data: { deliveryStatus: args.p_status }, error: null };
  }),
  from: vi.fn(() => ({ select: vi.fn(() => ({ ilike: vi.fn(async () => ({ data: null, error: null })) })) })),
};

vi.mock('@/lib/platform-admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/platform-admin')>('@/lib/platform-admin');
  return {
    ...actual,
    requirePlatformAdminApi: vi.fn(async () => ({ context: { supabase: userClient, user: { id: 'operator-1' } }, response: null })),
  };
});

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: vi.fn(async () => { state.adminCalls.push('auth.listUsers'); return { data: { users: [] }, error: null }; }),
        createUser: vi.fn(async ({ email }: { email: string }) => {
          state.adminCalls.push(`auth.createUser:${email}`);
          return { data: { user: { id: `auth-${email}` } }, error: null };
        }),
      },
    },
    storage: { from: vi.fn(() => ({ upload: vi.fn(async () => { state.adminCalls.push('storage.upload'); return { error: null }; }) })) },
  }),
}));

vi.mock('@/lib/claim-invites', async () => {
  const actual = await vi.importActual<typeof import('@/lib/claim-invites')>('@/lib/claim-invites');
  return {
    ...actual,
    deliverClaimInvite: vi.fn(async (input: { claimLink: string }) => {
      state.delivery = input;
      return state.deliveryOk ? { ok: true, messageId: 'mail-1' } : { ok: false, error: 'provider unavailable' };
    }),
  };
});

import { POST } from '@/app/api/superadmin/onboarding/provision/route';

const validBody = {
  idempotencyKey: '11111111-1111-1111-1111-111111111111',
  gym: { gymName: 'Iron Fitness', branchName: '', address: 'Quezon City', slug: 'iron-fitness' },
  owner: { name: 'Jane Owner', email: 'jane@example.com', mobile: '+639171234567', role: 'owner', consentMethod: 'in_person' },
  staff: [],
  plans: [{ id: 'p1', name: 'Monthly', price: 500, durationValue: 3, durationUnit: 'months', description: '', isActive: true }],
  operatingHours: {
    mon: { closed: false, open: '05:00', close: '22:00' }, tue: { closed: false, open: '05:00', close: '22:00' },
    wed: { closed: false, open: '05:00', close: '22:00' }, thu: { closed: false, open: '05:00', close: '22:00' },
    fri: { closed: false, open: '05:00', close: '22:00' }, sat: { closed: false, open: '05:00', close: '22:00' },
    sun: { closed: false, open: '05:00', close: '22:00' },
  },
  switches: { kioskCheckin: true, generateInviteQr: true, staffManualCheckin: true, occupancyCount: true },
  importedMembers: [],
  logoDataUrl: null,
};

function request(body: unknown) {
  return new Request('https://stren.app/api/superadmin/onboarding/provision', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.rpcCalls.length = 0;
  state.adminCalls.length = 0;
  state.delivery = null;
  state.deliveryOk = true;
});

describe('provision route boundary', () => {
  it('uses the user-bound client for platform RPCs and does not disclose a claim link', async () => {
    const response = await POST(request(validBody));
    const body = await response.json();
    const names = state.rpcCalls.map((call) => call.name);

    expect(response.status).toBe(200);
    expect(names).toEqual([
      'record_platform_provisioning_auth_state',
      'provision_gym_workspace',
      'mark_claim_invite_delivery',
    ]);
    expect(state.adminCalls).toEqual(['auth.listUsers', 'auth.createUser:jane@example.com']);
    expect(body).not.toHaveProperty('claimLink');
    expect(body).not.toHaveProperty('token');
    expect(body.deliveryStatus).toBe('sent');
    expect(state.delivery?.claimLink).toMatch(/^https:\/\/stren\.app\/claim\//);
    expect((names as string[]).join(' ')).not.toMatch(/admin\.rpc/);

    const provision = state.rpcCalls.find((call) => call.name === 'provision_gym_workspace')!;
    expect(provision.args.p_request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect((provision.args.p_payload as { isPublished: boolean }).isPublished).toBe(false);
    expect((provision.args.p_payload as { featureFlags: Record<string, boolean> }).featureFlags).toEqual({
      kiosk_checkin: true, staff_manual_checkin: true, occupancy_count: true,
    });
  });

  it('truthfully returns recoverable delivery failure without pretending the gym failed', async () => {
    state.deliveryOk = false;
    const response = await POST(request(validBody));
    const body = await response.json();
    expect(response.status).toBe(207);
    expect(body.gymId).toBe('gym-1');
    expect(body.deliveryStatus).toBe('failed');
    expect(state.rpcCalls.at(-1)?.args.p_status).toBe('failed');
  });
});
