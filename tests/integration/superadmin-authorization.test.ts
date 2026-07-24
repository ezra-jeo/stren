import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

let mockUser: { id: string; app_metadata: Record<string, unknown> } | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
    rpc: async () => ({ data: null, error: { message: 'not used in these cases' } }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}));

describe('superadmin route authorization', () => {
  beforeEach(() => {
    mockUser = null;
  });

  it('unauthenticated: redirects manual URL entry to sign-in', async () => {
    const response = await middleware(new NextRequest('https://stren.app/superadmin/onboarding/new'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://stren.app/auth?mode=signin');
  });

  it('authenticated non-operator: manual URL entry does not reach the page — redirected to /gyms', async () => {
    mockUser = { id: 'user-1', app_metadata: {} };
    const response = await middleware(new NextRequest('https://stren.app/superadmin/onboarding/new'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://stren.app/gyms');
  });

  it('authenticated owner/admin/staff (no platform_role): also redirected to /gyms, not the gym-access RPC path', async () => {
    mockUser = { id: 'user-2', app_metadata: { platform_role: 'owner' } };
    const response = await middleware(new NextRequest('https://stren.app/superadmin/onboarding/new'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://stren.app/gyms');
  });

  it('approved operator (server-controlled app_metadata claim): passes through', async () => {
    mockUser = { id: 'operator-1', app_metadata: { platform_role: 'platform_admin' } };
    const response = await middleware(new NextRequest('https://stren.app/superadmin/onboarding/new'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('operator identity is never resolved via the gym-access RPC (no gym required)', async () => {
    mockUser = { id: 'operator-1', app_metadata: { platform_role: 'platform_admin' } };
    // The mocked rpc() above always errors; if middleware called get_my_access for
    // /superadmin it would redirect to /gyms?account_error=access instead of passing.
    const response = await middleware(new NextRequest('https://stren.app/superadmin/onboarding/new'));
    expect(response.status).toBe(200);
  });
});

describe('public claim route', () => {
  it('is reachable without authentication', async () => {
    const response = await middleware(new NextRequest('https://stren.app/claim/some-token'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('bare /claim is also public', async () => {
    const response = await middleware(new NextRequest('https://stren.app/claim'));
    expect(response.status).toBe(200);
  });
});

