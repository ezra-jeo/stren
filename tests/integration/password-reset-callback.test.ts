import { beforeEach, describe, expect, it, vi } from 'vitest';

const exchangeCodeForSessionMock = vi.fn();
const verifyOtpMock = vi.fn();
const callbackSupabase = {
  auth: {
    exchangeCodeForSession: exchangeCodeForSessionMock,
    verifyOtp: verifyOtpMock,
  },
};

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => callbackSupabase,
}));

const resolvePostAuthDestinationMock = vi.fn();
vi.mock('@/lib/auth-actions', () => ({
  resolvePostAuthDestination: (...args: unknown[]) => resolvePostAuthDestinationMock(...args),
}));

const resolvePostAuthSessionMock = vi.fn();
vi.mock('@/lib/post-auth-session', () => ({
  resolvePostAuthDestinationForSession: (...args: unknown[]) => resolvePostAuthSessionMock(...args),
}));

import { GET } from '@/app/auth/callback/route';

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-secret');
  exchangeCodeForSessionMock.mockReset();
  verifyOtpMock.mockReset();
  resolvePostAuthDestinationMock.mockReset();
  resolvePostAuthSessionMock.mockReset();
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

describe('Google OAuth callback', () => {
  it('returns a cancelled Google authorization to plain-language auth recovery', async () => {
    const response = await GET(new Request('https://stren.app/auth/callback?flow=google&error=access_denied'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://stren.app/auth?mode=signin&error=oauth_cancelled');
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it('does not expose a provider failure message in the auth URL', async () => {
    const response = await GET(new Request('https://stren.app/auth/callback?flow=google&error=server_error&error_description=provider-internal-detail'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://stren.app/auth?mode=signin&error=oauth_failed');
  });
});

describe('member magic-link callback', () => {
  it('resolves access from the newly verified member session instead of a stale browser account', async () => {
    verifyOtpMock.mockResolvedValue({ data: { user: { id: 'new-member' } }, error: null });
    resolvePostAuthSessionMock.mockResolvedValue('/member');

    const response = await GET(new Request('https://stren.app/auth/callback?token_hash=member-token&type=magiclink'));

    expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: 'member-token', type: 'magiclink' });
    expect(resolvePostAuthSessionMock).toHaveBeenCalledWith(callbackSupabase, 'new-member', undefined);
    expect(resolvePostAuthDestinationMock).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://stren.app/member?first_login=1');
  });
});
