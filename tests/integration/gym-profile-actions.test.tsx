import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const refreshMyGymsMock = vi.fn();
let authValue: Record<string, unknown>;
vi.mock('@/lib/auth-context', () => ({ useAuth: () => authValue }));

const setActiveGymActionMock = vi.fn();
vi.mock('@/lib/auth-actions', () => ({
  setActiveGymAction: (...args: unknown[]) => setActiveGymActionMock(...args),
}));

const rpcMock = vi.fn();
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ rpc: rpcMock }) }));

import { GymProfileActions } from '@/components/gyms/GymProfileActions';

const gym = { gymId: 'g1', code: 'iron-house', name: 'Iron House' };

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  refreshMyGymsMock.mockReset();
  setActiveGymActionMock.mockReset();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: false, error: null });
  authValue = { user: null, myGyms: [], isLoading: false, refreshMyGyms: refreshMyGymsMock };
});

describe('public gym profile actions', () => {
  it('offers signed-out visitors a real sign-in route without exposing member access', () => {
    render(<GymProfileActions gym={gym} />);
    expect(screen.getByRole('link', { name: /sign in to save or verify membership/i })).toHaveAttribute('href', '/auth?mode=signin&gym=iron-house');
    expect(screen.queryByRole('button', { name: /open gym/i })).not.toBeInTheDocument();
  });

  it('saves a public gym without refreshing or granting gym membership', async () => {
    const user = userEvent.setup();
    authValue = { user: { id: 'u1' }, myGyms: [], isLoading: false, refreshMyGyms: refreshMyGymsMock };
    rpcMock.mockImplementation((name: string) => Promise.resolve(
      name === 'save_gym' ? { data: { saved: true }, error: null } : { data: false, error: null },
    ));
    render(<GymProfileActions gym={gym} />);

    await user.click(await screen.findByRole('button', { name: /save iron house/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('save_gym', { p_gym_id: 'g1' }));
    expect(refreshMyGymsMock).not.toHaveBeenCalled();
    expect(screen.getByText(/saved for later/i)).toBeInTheDocument();
  });

  it('uses membership verification language for an unmatched member', async () => {
    const user = userEvent.setup();
    authValue = { user: { id: 'u1' }, myGyms: [], isLoading: false, refreshMyGyms: refreshMyGymsMock };
    rpcMock.mockImplementation((name: string) => Promise.resolve(
      name === 'verify_gym_membership'
        ? { data: { status: 'pending', role: 'member', matched: false }, error: null }
        : { data: false, error: null },
    ));
    render(<GymProfileActions gym={gym} />);

    await user.click(await screen.findByRole('button', { name: /i.m already a member/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('verify_gym_membership', { p_gym_id: 'g1' }));
    expect(await screen.findByText(/waiting for the gym to confirm your membership/i)).toBeInTheDocument();
    expect(refreshMyGymsMock).toHaveBeenCalled();
  });
});
