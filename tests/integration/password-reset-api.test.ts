import { beforeEach, describe, expect, it, vi } from 'vitest';

const resetPasswordForEmailMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { resetPasswordForEmail: resetPasswordForEmailMock },
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

import { POST } from '@/app/api/auth/password-reset/route';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://stren.app');
  resetPasswordForEmailMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockReturnValue({ success: true, remaining: 2 });
});

describe('POST /api/auth/password-reset', () => {
  it('uses the auth provider recovery flow and returns enumeration-safe copy', async () => {
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
    const response = await POST(new Request('https://stren.app/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8' },
      body: JSON.stringify({ email: '  Alex@Example.com ' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      message: 'If an account exists for this email, we’ve sent password-reset instructions.',
    });
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith('alex@example.com', {
      redirectTo: 'https://stren.app/auth/callback?next=%2Freset-password',
    });
  });

  it('does not claim delivery when the auth provider reports an email failure', async () => {
    resetPasswordForEmailMock.mockResolvedValue({ data: null, error: new Error('SMTP unavailable') });
    const response = await POST(new Request('https://stren.app/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alex@example.com' }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'We couldn’t send password-reset instructions right now. Please try again later.',
    });
  });

  it('fails truthfully when the allowed application URL is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    const response = await POST(new Request('https://stren.app/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alex@example.com' }),
    }));

    expect(response.status).toBe(503);
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it('rate-limits repeated reset requests without storing raw email addresses in the key', async () => {
    rateLimitMock.mockReturnValueOnce({ success: true, remaining: 0 }).mockReturnValueOnce({ success: false, remaining: 0 });
    const response = await POST(new Request('https://stren.app/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8' },
      body: JSON.stringify({ email: 'alex@example.com' }),
    }));

    expect(response.status).toBe(429);
    expect(rateLimitMock.mock.calls[1][0]).not.toContain('alex@example.com');
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });
});
