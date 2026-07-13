import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyGym } from '@/lib/types';

const scannerStartMock = vi.fn();
const scannerStopMock = vi.fn();
const scannerClearMock = vi.fn();
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    start(...args: unknown[]) { return scannerStartMock(...args); }
    stop() { return scannerStopMock(); }
    clear() { return scannerClearMock(); }
  },
}));

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
import { extractGymCodeFromQr } from '@/components/gyms/JoinGymPanel';

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
  scannerStartMock.mockReset();
  scannerStartMock.mockResolvedValue(undefined);
  scannerStopMock.mockReset();
  scannerStopMock.mockResolvedValue(undefined);
  scannerClearMock.mockReset();
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
  it('opens the join workflow directly and points owners to assisted onboarding', () => {
    render(<GymHub />);
    expect(screen.getByRole('heading', { level: 1, name: /^join a gym$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan gym qr code/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^gym code$/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tell your gym about stren/i })).toHaveAttribute('href', '/for-gym-owners');
    expect(screen.queryByText(/i run a gym/i)).not.toBeInTheDocument();
  });
});

describe('gym hub — join a gym', () => {
  it('normalizes Stren QR links and rejects unrelated QR payloads', () => {
    expect(extractGymCodeFromQr('https://stren.app/auth?mode=signup&gym=Iron-House')).toBe('iron-house');
    expect(extractGymCodeFromQr('https://stren.app/gym/BAY-STRENGTH')).toBe('bay-strength');
    expect(extractGymCodeFromQr('not a gym code')).toBeNull();
  });

  it('does not request the camera before the user asks and explains denied permission', async () => {
    const user = userEvent.setup();
    scannerStartMock.mockRejectedValue(new Error('NotAllowedError: permission denied'));
    render(<GymHub />);

    expect(scannerStartMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /scan gym qr code/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission was denied/i);
    expect(screen.getByLabelText(/^gym code$/i)).toBeEnabled();
  });

  it('reports malformed codes and lookup failures without duplicate submissions', async () => {
    const user = userEvent.setup();
    render(<GymHub />);
    const input = screen.getByLabelText(/^gym code$/i);

    await user.type(input, 'x');
    await user.click(screen.getByRole('button', { name: /find gym/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid gym code/i);
    expect(rpcMock).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'valid-gym');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await user.click(screen.getByRole('button', { name: /find gym/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not look up/i);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('looks up an exact code, confirms the gym, and sends a join request', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({})]; // has a gym so the join panel is visible directly
    rpcMock.mockImplementation((name: string) =>
      name === 'get_gym_by_code'
        ? Promise.resolve({ data: { id: 'g9', name: 'New Iron Gym', code: 'new-iron', address: 'Cebu', logo_url: null }, error: null })
        : Promise.resolve({ data: null, error: null }),
    );
    joinGymActionMock.mockResolvedValue({ status: 'pending' });
    render(<GymHub />);

    await user.type(screen.getByLabelText(/^gym code$/i), '  NEW-IRON  ');
    await user.click(screen.getByRole('button', { name: /find gym/i }));
    expect(await screen.findByText('New Iron Gym')).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith('get_gym_by_code', { p_code: 'new-iron' });
    await user.click(screen.getByRole('button', { name: /request to join/i }));

    await waitFor(() => expect(joinGymActionMock).toHaveBeenCalledWith('g9'));
    expect(await screen.findByRole('heading', { name: /request sent/i })).toBeInTheDocument();
    expect(refreshMyGymsMock).toHaveBeenCalled();
  });
});
