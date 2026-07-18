import { describe, expect, it, vi, beforeEach } from 'vitest';

let mockUser: { id: string; email?: string } | null = { id: 'user-1', email: 'jane@example.com' };
let mockRpcResult: unknown = { gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness' };
let mockRpcError: { code: string; message: string } | null = null;

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    rpc: vi.fn(async () => ({ data: mockRpcResult, error: mockRpcError })),
  }),
}));

import { POST } from '@/app/api/claim/accept/route';

function request(body: unknown) {
  return new Request('https://stren.app/api/claim/accept', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUser = { id: 'user-1', email: 'jane@example.com' };
  mockRpcResult = { gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness' };
  mockRpcError = null;
});

describe('POST /api/claim/accept', () => {
  it('requires authentication', async () => {
    mockUser = null;
    const response = await POST(request({ token: 'abc' }));
    expect(response.status).toBe(401);
  });

  it('rejects a missing token', async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
  });

  it('succeeds for a valid claim and returns the gym', async () => {
    const response = await POST(request({ token: 'valid-raw-token' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.gymName).toBe('Iron Fitness');
  });

  it.each([
    ['P0002', /invalid/i],
    ['P0003', /replaced/i],
    ['P0004', /already been used/i],
    ['P0005', /expired/i],
    ['P0006', /different email/i],
  ])('maps error code %s to a precise, plain-language message', async (code, expectedMessage) => {
    mockRpcError = { code, message: 'db error' };
    const response = await POST(request({ token: 'x' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe(code);
    expect(body.error).toMatch(expectedMessage);
  });
});
