import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieGetMock = vi.fn();
const getUserMock = vi.fn();
const updateUserMock = vi.fn();
const signOutMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGetMock }),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: getUserMock,
      updateUser: updateUserMock,
      signOut: signOutMock,
    },
  }),
}));

import { POST } from '@/app/api/auth/password-reset/complete/route';
import { createPasswordRecoveryProof } from '@/lib/password-recovery';

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-secret');
  cookieGetMock.mockReset();
  getUserMock.mockReset();
  updateUserMock.mockReset();
  signOutMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  updateUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  signOutMock.mockResolvedValue({ error: null });
});

describe('POST /api/auth/password-reset/complete', () => {
  it('updates the password only with a signed proof for the current recovery user, then consumes it', async () => {
    cookieGetMock.mockReturnValue({ value: createPasswordRecoveryProof('user-1') });
    const response = await POST(new Request('https://stren.app/api/auth/password-reset/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'new-password-123' }),
    }));

    expect(response.status).toBe(200);
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'new-password-123' });
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(response.headers.get('set-cookie')).toMatch(/stren_password_recovery=;.*Max-Age=0/i);
  });

  it('rejects an ordinary authenticated session with no valid recovery proof', async () => {
    cookieGetMock.mockReturnValue({ value: 'forged-proof' });
    const response = await POST(new Request('https://stren.app/api/auth/password-reset/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'new-password-123' }),
    }));

    expect(response.status).toBe(401);
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
