import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyGym } from '@/lib/types';

// ── next/navigation ─────────────────────────────────────────────────────────
let currentSearch = '';
const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

// ── auth-context ────────────────────────────────────────────────────────────
let authValue: { myGyms: MyGym[]; activeGymId: string | null; isLoading: boolean; refreshMyGyms: () => void };
vi.mock('@/lib/auth-context', () => ({ useAuth: () => authValue }));

// ── auth-actions ────────────────────────────────────────────────────────────
const setActiveGymActionMock = vi.fn();
const joinGymActionMock = vi.fn();
vi.mock('@/lib/auth-actions', () => ({
  setActiveGymAction: (...a: unknown[]) => setActiveGymActionMock(...a),
  joinGymAction: (...a: unknown[]) => joinGymActionMock(...a),
}));

// ── supabase (search_gyms + get_gym_by_code) ────────────────────────────────
const rpcMock = vi.fn();
const limitMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: () => ({ select: () => ({ or: () => ({ order: () => ({ limit: limitMock }) }) }) }),
  }),
}));

import { GymHub } from '@/components/gyms/GymHub';

const refreshMyGymsMock = vi.fn();

function gym(overrides: Partial<MyGym>): MyGym {
  return { gymId: 'g1', code: 'iron-house', name: 'Iron House', logoUrl: null, role: 'owner', status: 'active', ...overrides };
}

beforeEach(() => {
  currentSearch = '';
  pushMock.mockReset();
  refreshMock.mockReset();
  setActiveGymActionMock.mockReset();
  joinGymActionMock.mockReset();
  refreshMyGymsMock.mockReset();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
  limitMock.mockReset();
  limitMock.mockResolvedValue({ data: [], error: null });
  authValue = { myGyms: [], activeGymId: null, isLoading: false, refreshMyGyms: refreshMyGymsMock };
});

describe('gym hub — your gyms', () => {
  it('renders each gym with a role chip', () => {
    authValue.myGyms = [gym({ role: 'owner' }), gym({ gymId: 'g2', name: 'Bay Strength', role: 'member', code: 'bay' })];
    authValue.activeGymId = 'g1';
    render(<GymHub />);
    expect(screen.getByText('Iron House')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Bay Strength')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
  });

  it('shows a pending gym as waiting for approval and not enterable', () => {
    authValue.myGyms = [gym({ status: 'pending', name: 'Pending Palace' })];
    render(<GymHub />);
    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enter pending palace/i })).not.toBeInTheDocument();
  });

  it('enters an active gym and routes by role', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({ role: 'member', name: 'Bay Strength' })];
    setActiveGymActionMock.mockResolvedValue({ role: 'member' });
    render(<GymHub />);

    await user.click(screen.getByRole('button', { name: /enter bay strength/i }));
    await waitFor(() => expect(setActiveGymActionMock).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/member'));
  });
});

describe('gym hub — empty state', () => {
  it('offers the two onboarding choices', () => {
    render(<GymHub />);
    expect(screen.getByText(/join your gym/i)).toBeInTheDocument();
    expect(screen.getByText(/i run a gym/i)).toBeInTheDocument();
  });
});

describe('gym hub — join a gym', () => {
  it('searches, confirms, and sends a join request', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({})]; // has a gym so the join panel is visible directly
    rpcMock.mockImplementation((name: string) =>
      name === 'search_gyms'
        ? Promise.resolve({ data: [{ id: 'g9', name: 'New Iron Gym', code: 'new-iron', address: 'Cebu' }], error: null })
        : Promise.resolve({ data: null, error: null }),
    );
    joinGymActionMock.mockResolvedValue({ status: 'pending' });
    render(<GymHub />);

    await user.type(screen.getByLabelText(/gym code or name/i), 'iron');
    expect(await screen.findByText('New Iron Gym')).toBeInTheDocument();

    await user.click(screen.getByText('New Iron Gym'));
    await user.click(screen.getByRole('button', { name: /request to join/i }));

    await waitFor(() => expect(joinGymActionMock).toHaveBeenCalledWith('g9'));
    expect(await screen.findByText(/request sent/i)).toBeInTheDocument();
    expect(refreshMyGymsMock).toHaveBeenCalled();
  });
});
