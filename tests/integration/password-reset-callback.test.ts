import { beforeEach, describe, expect, it, vi } from 'vitest';

const exchangeCodeForSessionMock = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
      verifyOtp: verifyOtpMock,
    },
  }),
}));

vi.mock('@/lib/auth-actions', () => ({
  resolvePostAuthDestination: vi.fn(),
}));

import { GET } from '@/app/auth/callback/route';

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-secret');
  exchangeCodeForSessionMock.mockReset();
  verifyOtpMock.mockReset();
});

describe('password recovery callback', () => {
  it('sends an expired or already-used recovery code to the reset error state', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { user: null }, error: new Error('PKCE code verifier not found') });
    const response = await GET(new Request('https://stren.app/auth/callback?code=used-code&next=%2Freset-password'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://stren.app/reset-password?error=invalid_or_expired');
  });

  it('issues a short-lived HTTP-only recovery proof after a valid provider exchange', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const response = await GET(new Request('https://stren.app/auth/callback?code=fresh-code&next=%2Freset-password'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://stren.app/reset-password?reset=1');
    expect(response.headers.get('set-cookie')).toMatch(/stren_password_recovery=.*HttpOnly.*SameSite=Lax/i);
  });
});
