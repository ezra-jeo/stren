import { beforeEach, describe, expect, it, vi } from 'vitest';

const signUpMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ origin: 'https://stren.app' }),
}));
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { signUp: signUpMock } }),
}));

import { signUpAccount } from '@/lib/auth-actions';

beforeEach(() => signUpMock.mockReset());

describe('account signup session completion', () => {
  it('continues as authenticated when Supabase establishes a session', async () => {
    signUpMock.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null });

    await expect(signUpAccount({ name: ' Alex Cruz ', email: ' ALEX@EXAMPLE.COM ', password: 'hunter2!!' }))
      .resolves.toEqual({ error: null, status: 'authenticated' });
    expect(signUpMock).toHaveBeenCalledWith({
      email: 'alex@example.com',
      password: 'hunter2!!',
      options: {
        data: { name: 'Alex Cruz' },
        emailRedirectTo: 'https://stren.app/auth/callback',
      },
    });
  });

  it('reports the real verification state when no session is issued', async () => {
    signUpMock.mockResolvedValue({ data: { session: null }, error: null });
    await expect(signUpAccount({ name: 'Alex Cruz', email: 'alex@example.com', password: 'hunter2!!' }))
      .resolves.toEqual({ error: null, status: 'verification_required' });
  });
});
