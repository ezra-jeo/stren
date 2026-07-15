import { beforeEach, describe, expect, it, vi } from 'vitest';

const signUpMock = vi.fn();

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ origin: 'https://stren.app' }),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { signUp: signUpMock },
  }),
}));

import { signUpAccount } from '@/lib/auth-actions';

beforeEach(() => {
  signUpMock.mockReset();
});

describe('account signup', () => {
  it('recognizes Supabase\'s obfuscated response for an existing confirmed account', async () => {
    signUpMock.mockResolvedValue({
      data: {
        user: { id: 'obfuscated-user', identities: [] },
        session: null,
      },
      error: null,
    });

    await expect(signUpAccount({
      name: 'Alex Cruz',
      email: 'Alex@Example.com',
      password: 'password-123',
    })).resolves.toEqual({ error: null, status: 'already_exists' });
  });
});
