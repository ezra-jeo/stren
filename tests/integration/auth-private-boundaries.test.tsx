import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

type AuthCallback = (event: string, session: { user: User } | null) => void;

let authCallback: AuthCallback | null = null;
const getUserMock = vi.fn();
const signOutMock = vi.fn();
const rpcMock = vi.fn();
const profileLookupMock = vi.fn();
const replaceMock = vi.fn();
const refreshMock = vi.fn();
const routerMock = { replace: replaceMock, refresh: refreshMock };

const client = {
  auth: {
    getUser: (...args: unknown[]) => getUserMock(...args),
    signOut: (...args: unknown[]) => signOutMock(...args),
    setSession: vi.fn(),
    signInWithPassword: vi.fn(),
    onAuthStateChange: (callback: AuthCallback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
  rpc: (...args: unknown[]) => rpcMock(...args),
  from: () => ({
    select: () => {
      let userId = '';
      const builder = {
        eq: (_column: string, value: string) => {
          userId = value;
          return builder;
        },
        maybeSingle: () => profileLookupMock(userId),
      };
      return builder;
    },
  }),
};

vi.mock('next/navigation', () => ({
  usePathname: () => '/member',
  useRouter: () => routerMock,
}));
vi.mock('@/lib/supabase', () => ({ createClient: () => client }));

import { AuthProvider, useAuth } from '@/lib/auth-context';

let authApi: ReturnType<typeof useAuth> | null = null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function user(id: string): User {
  return { id, email: `${id}@example.com` } as User;
}

function profile(id: string, gymId: string) {
  return {
    data: {
      id,
      email: `${id}@example.com`,
      name: id,
      contact_number: null,
      avatar_url: null,
      avatar_updated_at: null,
      avatar_change_locked_until: null,
      avatar_change_count: 0,
      qr_code: '',
      created_at: '2026-07-14T00:00:00.000Z',
      active_gym_id: gymId,
    },
    error: null,
  };
}

function gyms(id: string, gymId: string) {
  return {
    data: [{ gym_id: gymId, code: gymId, name: gymId, logo_url: null, role: 'member', status: 'active' }],
    error: null,
  };
}

function Probe() {
  const auth = useAuth();
  authApi = auth;
  return <output>{`${auth.user?.id ?? 'none'}:${auth.profile?.id ?? 'none'}:${auth.activeScope?.gymId ?? 'none'}`}</output>;
}

beforeEach(() => {
  authApi = null;
  authCallback = null;
  getUserMock.mockReset();
  signOutMock.mockReset().mockResolvedValue({ error: null });
  rpcMock.mockReset().mockResolvedValue({ data: null, error: { message: 'unexpected gym lookup' } });
  profileLookupMock.mockReset().mockResolvedValue({ data: null, error: { message: 'unexpected profile lookup' } });
  replaceMock.mockReset();
  refreshMock.mockReset();
  sessionStorage.clear();
});

afterEach(() => vi.useRealTimers());

describe('AuthProvider private identity boundaries', () => {
  it('does not let a stale initial getUser result resurrect a signed-out account', async () => {
    const initial = deferred<{ data: { user: User | null }; error: null }>();
    getUserMock.mockReturnValue(initial.promise);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());

    act(() => authCallback?.('SIGNED_OUT', null));
    act(() => initial.resolve({ data: { user: user('account-a') }, error: null }));

    await waitFor(() => expect(screen.getByText('none:none:none')).toBeInTheDocument());
    expect(profileLookupMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('clears account A private state immediately while account B hydrates', async () => {
    const profileB = deferred<ReturnType<typeof profile>>();
    const gymsB = deferred<ReturnType<typeof gyms>>();
    getUserMock.mockResolvedValue({ data: { user: user('account-a') }, error: null });
    profileLookupMock.mockImplementation((id: string) => id === 'account-a' ? Promise.resolve(profile('account-a', 'gym-a')) : profileB.promise);
    rpcMock.mockReturnValueOnce(Promise.resolve(gyms('account-a', 'gym-a'))).mockReturnValueOnce(gymsB.promise);
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('account-a:account-a:gym-a');

    act(() => authCallback?.('SIGNED_IN', { user: user('account-b') }));

    expect(screen.getByText('account-b:none:none')).toBeInTheDocument();
    act(() => {
      profileB.resolve(profile('account-b', 'gym-b'));
      gymsB.resolve(gyms('account-b', 'gym-b'));
    });
    await screen.findByText('account-b:account-b:gym-b');
  });

  it('finishes navigation even when both global and local sign-out calls hang', async () => {
    vi.useFakeTimers();
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    signOutMock.mockImplementation(() => new Promise(() => {}));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(authApi).not.toBeNull();

    act(() => { void authApi?.signOut(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(13_000); });

    expect(signOutMock).toHaveBeenCalledTimes(2);
    expect(replaceMock).toHaveBeenCalledWith('/auth?mode=signin');
    expect(refreshMock).toHaveBeenCalled();
  });
});
