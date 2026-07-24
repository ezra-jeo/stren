import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const authState = vi.hoisted(() => ({
  response: null as Response | null,
  user: { id: 'operator-1', app_metadata: { platform_role: 'platform_admin' } } as { id: string; app_metadata: Record<string, unknown> } | null,
  rpcError: null as { code: string; message: string } | null,
}));

vi.mock('@/lib/platform-admin', () => ({
  requirePlatformAdminApi: vi.fn(async () => authState.response
    ? { context: null, response: authState.response }
    : { context: { supabase: {}, user: authState.user }, response: null }),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authState.user } }) },
    rpc: async () => ({ data: null, error: authState.rpcError }),
  }),
}));

import { POST as provision } from '@/app/api/superadmin/onboarding/provision/route';
import { POST as accept } from '@/app/api/claim/accept/route';

const request = (url: string, body: unknown) => new Request(url, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  authState.response = null;
  authState.user = { id: 'operator-1', app_metadata: { platform_role: 'platform_admin' } };
  authState.rpcError = null;
});

describe('onboarding API boundary statuses', () => {
  it.each([
    [401, 'unauthenticated', NextResponse.json({ error: 'Authentication required.' }, { status: 401 })],
    [403, 'non-operator', NextResponse.json({ error: 'Platform administrator access required.' }, { status: 403 })],
  ])('%s for %s operator provision attempts', async (status, _label, response) => {
    authState.response = response;
    const result = await provision(request('https://stren.app/api/superadmin/onboarding/provision', {}));
    expect(result.status).toBe(status);
  });

  it('400s malformed provision input before account resolution', async () => {
    const result = await provision(request('https://stren.app/api/superadmin/onboarding/provision', { idempotencyKey: 'not-a-request' }));
    expect(result.status).toBe(400);
  });
});

describe('claim acceptance statuses', () => {
  it('401s a claim attempt without a signed-in user', async () => {
    authState.user = null;
    const result = await accept(request('https://stren.app/api/claim/accept', { token: 'raw-token' }));
    expect(result.status).toBe(401);
  });

  it('maps invalid, superseded, used, and unprepared invitations to safe statuses', async () => {
    for (const [code, status] of [['P1002', 404], ['P1003', 409], ['P1004', 409], ['P1007', 409]] as const) {
      authState.rpcError = { code, message: code };
      const result = await accept(request('https://stren.app/api/claim/accept', { token: 'raw-token' }));
      expect(result.status, code).toBe(status);
    }
  });
});
