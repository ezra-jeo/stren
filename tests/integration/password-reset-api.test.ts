import { beforeEach, describe, expect, it, vi } from 'vitest';

const resetPasswordForEmailMock = vi.fn();
const generateLinkMock = vi.fn();
const sendPasswordResetEmailMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { resetPasswordForEmail: resetPasswordForEmailMock },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink: generateLinkMock } },
  }),
}));

vi.mock('@/lib/email', () => ({
  sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmailMock(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

import { POST } from '@/app/api/auth/password-reset/route';

const genericMessage = 'If an account exists for this email, we\u2019ve sent password-reset instructions.';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://stren.app');
  resetPasswordForEmailMock.mockReset();
  generateLinkMock.mockReset();
  sendPasswordResetEmailMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockReturnValue({ success: true, remaining: 2 });
  generateLinkMock.mockResolvedValue({
    data: { properties: { hashed_token: 'server-verifiable-recovery-token' } },
    error: null,
  });
  sendPasswordResetEmailMock.mockResolvedValue({ ok: true, messageId: 'email-1' });
});

describe('POST /api/auth/password-reset', () => {
  it('emails a server-verifiable recovery link and returns enumeration-safe copy', async () => {
    const response = await POST(new Request('https://stren.app/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8' },
      body: JSON.stringify({ email: '  Alex@Example.com ' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, message: genericMessage });
    expect(generateLinkMock).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'alex@example.com',
    });
    const resetLink = new URL(sendPasswordResetEmailMock.mock.calls[0][0].resetLink);
    expect(resetLink.origin).toBe('https://stren.app');
    expect(resetLink.pathname).toBe('/auth/confirm');
    expect(resetLink.searchParams.get('token_hash')).toBe('server-verifiable-recovery-token');
    expect(resetLink.searchParams.get('type')).toBe('recovery');
    expect(resetLink.searchParams.get('next')).toBe('/reset-password');
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'alex@example.com',
    }));
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it('does not claim delivery when the email provider reports a failure', async () => {
    sendPasswordResetEmailMock.mockResolvedValue({ ok: false, error: 'SMTP unavailable' });
    const response = await POST(new Request('https://stren.app/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alex@example.com' }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'We couldn\'t send password-reset instructions right now. Please try again later.',
    });
  });

  it('keeps an unknown email enumeration-safe without attempting delivery', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: null },
      error: { code: 'user_not_found', message: 'User not found' },
    });
    const response = await POST(new Request('https://stren.app/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.com' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, message: genericMessage });
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
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
    expect(generateLinkMock).not.toHaveBeenCalled();
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
    expect(generateLinkMock).not.toHaveBeenCalled();
  });
});
