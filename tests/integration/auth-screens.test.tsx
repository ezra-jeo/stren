import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Controllable next/navigation ────────────────────────────────────────────
let currentSearch = '';
const replaceMock = vi.fn();
const refreshMock = vi.fn();
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

// ── auth-context ────────────────────────────────────────────────────────────
const signInMock = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ signIn: signInMock, completePasswordSetup: vi.fn(), signOut: vi.fn() }),
}));

// ── auth-actions (server actions) ───────────────────────────────────────────
const resolvePostAuthDestinationMock = vi.fn();
const signUpAccountMock = vi.fn();
vi.mock('@/lib/auth-actions', () => ({
  resolvePostAuthDestination: (...args: unknown[]) => resolvePostAuthDestinationMock(...args),
  signUpAccount: (...args: unknown[]) => signUpAccountMock(...args),
}));

// ── supabase (get_gym_by_code for the ?gym flavor header) ───────────────────
const rpcMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

import LoginPage from '@/app/login/page';
import SignupPage from '@/app/signup/page';

beforeEach(() => {
  currentSearch = '';
  replaceMock.mockReset();
  refreshMock.mockReset();
  pushMock.mockReset();
  signInMock.mockReset();
  resolvePostAuthDestinationMock.mockReset();
  signUpAccountMock.mockReset();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

describe('/login', () => {
  it('shows a plain-language banner for a magic-link ?error code', async () => {
    currentSearch = 'error=otp_expired';
    render(<LoginPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
    expect(screen.queryByText(/otp_expired/)).not.toBeInTheDocument();
  });

  it('signs in and routes to the resolved destination', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValue({ error: null });
    resolvePostAuthDestinationMock.mockResolvedValue('/admin');
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'owner@example.com');
    await user.type(screen.getByLabelText(/password/i), 'hunter2!!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(signInMock).toHaveBeenCalledWith('owner@example.com', 'hunter2!!'));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/admin'));
  });

  it('surfaces invalid credentials from signIn', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValue({ error: 'Invalid login credentials' });
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'owner@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid login credentials/i);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders a gym-flavored header when ?gym resolves to a real gym', async () => {
    currentSearch = 'gym=iron-house';
    rpcMock.mockResolvedValue({ data: { id: 'g1', name: 'Iron House', code: 'iron-house', logo_url: null }, error: null });
    render(<LoginPage />);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('get_gym_by_code', { p_code: 'iron-house' }));
    expect(await screen.findByText('Iron House')).toBeInTheDocument();
  });

  it('carries ?gym through to the create-account link', () => {
    currentSearch = 'gym=iron-house';
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /create account/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('gym=iron-house'));
  });
});

describe('/signup', () => {
  it('shows a join-intent notice when ?gym is present', async () => {
    currentSearch = 'gym=iron-house';
    rpcMock.mockResolvedValue({ data: { id: 'g1', name: 'Iron House', code: 'iron-house', logo_url: null }, error: null });
    render(<SignupPage />);
    // The gym name appears in both the flavor header and the join notice.
    expect((await screen.findAllByText('Iron House')).length).toBeGreaterThan(0);
    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument();
  });

  it('creates the account with the join code and lands on login', async () => {
    const user = userEvent.setup();
    currentSearch = 'gym=iron-house';
    signUpAccountMock.mockResolvedValue({ error: null });
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/name/i), 'Alex Cruz');
    await user.type(screen.getByLabelText(/email/i), 'alex@example.com');
    await user.type(screen.getByLabelText(/password/i), 'hunter2!!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(signUpAccountMock).toHaveBeenCalledWith({
        name: 'Alex Cruz',
        email: 'alex@example.com',
        password: 'hunter2!!',
        joinGymCode: 'iron-house',
      }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining('/login')));
  });

  it('surfaces a signup error', async () => {
    const user = userEvent.setup();
    signUpAccountMock.mockResolvedValue({ error: 'Email already registered' });
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/name/i), 'Alex Cruz');
    await user.type(screen.getByLabelText(/email/i), 'alex@example.com');
    await user.type(screen.getByLabelText(/password/i), 'hunter2!!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already registered/i);
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
