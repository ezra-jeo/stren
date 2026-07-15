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
let authValue: {
  myGyms: MyGym[];
  activeGymId: string | null;
  isLoading: boolean;
  refreshMyGyms: () => void;
  profile: { name: string } | null;
  user: { email: string } | null;
  gymAccessError: string | null;
  signOut: () => Promise<void>;
};
vi.mock('@/lib/auth-context', () => ({ useAuth: () => authValue }));

// ── auth-actions ────────────────────────────────────────────────────────────
const setActiveGymActionMock = vi.fn();
const joinGymActionMock = vi.fn();
const verifyMembershipActionMock = vi.fn();
const saveGymActionMock = vi.fn();
const sendVerificationReminderActionMock = vi.fn();
const withdrawVerificationActionMock = vi.fn();
vi.mock('@/lib/auth-actions', () => ({
  setActiveGymAction: (...a: unknown[]) => setActiveGymActionMock(...a),
  joinGymAction: (...a: unknown[]) => joinGymActionMock(...a),
  verifyMembershipAction: (...a: unknown[]) => verifyMembershipActionMock(...a),
  saveGymAction: (...a: unknown[]) => saveGymActionMock(...a),
  sendVerificationReminderAction: (...a: unknown[]) => sendVerificationReminderActionMock(...a),
  withdrawVerificationAction: (...a: unknown[]) => withdrawVerificationActionMock(...a),
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
  verifyMembershipActionMock.mockReset();
  saveGymActionMock.mockReset();
  sendVerificationReminderActionMock.mockReset();
  withdrawVerificationActionMock.mockReset();
  saveGymActionMock.mockResolvedValue({ saved: true });
  sendVerificationReminderActionMock.mockResolvedValue({ nextReminderAt: '2026-07-20T00:00:00Z' });
  withdrawVerificationActionMock.mockResolvedValue({ withdrawn: true });
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
  authValue = {
    myGyms: [], activeGymId: null, isLoading: false, refreshMyGyms: refreshMyGymsMock,
    profile: { name: 'Alex Cruz' }, user: { email: 'alex@example.com' }, gymAccessError: null,
    signOut: vi.fn().mockResolvedValue(undefined),
  };
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

  it('shows a pending gym as membership verification and not enterable', async () => {
    authValue.myGyms = [gym({ status: 'pending', name: 'Pending Palace' })];
    rpcMock.mockImplementation((name: string) => Promise.resolve({
      data: name === 'get_my_membership_verifications'
        ? [{ gym_id: 'g1', code: 'iron-house', name: 'Pending Palace', address: null, logo_url: null, status: 'pending', submitted_at: '2026-07-01T00:00:00Z', last_reminded_at: null }]
        : [],
      error: null,
    }));
    render(<GymHub />);
    expect(await screen.findByText(/waiting for gym confirmation/i)).toBeInTheDocument();
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
  it('never presents onboarding when the gym access lookup failed', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [];
    authValue.gymAccessError = 'We could not load your gym access.';
    refreshMyGymsMock.mockRejectedValueOnce(new Error('still unavailable'));
    render(<GymHub />);

    expect(screen.getByRole('heading', { name: /couldn.t load your gyms/i })).toBeInTheDocument();
    expect(screen.getByText(/signed in as alex@example.com/i)).toBeInTheDocument();
    expect(screen.queryByText(/not connected to a gym yet/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(refreshMyGymsMock).toHaveBeenCalled();
  });

  it('renders a useful no-gym member home instead of a mandatory join form', () => {
    render(<GymHub />);
    expect(screen.getByRole('heading', { level: 1, name: /hi, alex/i })).toBeInTheDocument();
    expect(screen.getByText(/signed in as alex@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/you.re not connected to a gym yet/i)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search gyms/i })).toHaveAttribute('placeholder', expect.stringMatching(/name.*location.*code/i));
    expect(screen.getByRole('button', { name: /scan gym qr code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preview the demo/i })).toBeInTheDocument();
    expect(screen.getByText(/member tools/i)).toBeInTheDocument();
    expect(screen.queryByText(/all types|all locations|more filters|personal mode/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tell your gym about stren/i })).toHaveAttribute('href', '/for-gym-owners');
  });

  it('keeps beta tools honest and isolates the sample-data demo', async () => {
    const user = userEvent.setup();
    render(<GymHub />);
    await user.click(screen.getByRole('button', { name: /preview the demo/i }));
    expect(pushMock).toHaveBeenCalledWith('/member/demo');
    await user.click(screen.getByRole('button', { name: /workouts/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/currently in beta/i);
  });

  it('shows and manages more than one pending membership verification', async () => {
    const user = userEvent.setup();
    rpcMock.mockImplementation((name: string) => Promise.resolve({
      data: name === 'get_my_membership_verifications'
        ? [
            { gym_id: 'g1', code: 'one', name: 'Gym One', address: 'Cebu', logo_url: null, status: 'pending', submitted_at: '2026-07-01T00:00:00Z', last_reminded_at: null },
            { gym_id: 'g2', code: 'two', name: 'Gym Two', address: 'Mandaue', logo_url: null, status: 'pending', submitted_at: '2026-07-02T00:00:00Z', last_reminded_at: null },
          ]
        : [],
      error: null,
    }));
    render(<GymHub />);
    expect(await screen.findByText('Gym One')).toBeInTheDocument();
    expect(screen.getByText('Gym Two')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /send reminder/i })[0]);
    expect(sendVerificationReminderActionMock).toHaveBeenCalledWith('g1');
    await user.click(screen.getAllByRole('button', { name: /withdraw verification/i })[1]);
    await waitFor(() => expect(withdrawVerificationActionMock).toHaveBeenCalledWith('g2'));
    expect(screen.queryByText('Gym Two')).not.toBeInTheDocument();
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
    expect(screen.getByRole('searchbox', { name: /search gyms/i })).toBeEnabled();
  });

  it('reports malformed codes and lookup failures without duplicate submissions', async () => {
    const user = userEvent.setup();
    render(<GymHub />);
    const input = screen.getByRole('searchbox', { name: /search gyms/i });

    await user.type(input, 'x');
    await user.click(screen.getByRole('button', { name: /^search gyms$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least two/i);
    expect(rpcMock).not.toHaveBeenCalledWith('get_gym_by_code', expect.anything());
    expect(rpcMock).not.toHaveBeenCalledWith('search_gyms', expect.anything());

    await user.clear(input);
    await user.type(input, 'valid-gym');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await user.click(screen.getByRole('button', { name: /^search gyms$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not search/i);
    expect(rpcMock).toHaveBeenCalledWith('get_gym_by_code', { p_code: 'valid-gym' });
    expect(rpcMock).toHaveBeenCalledWith('search_gyms', { p_query: 'valid-gym' });
  });

  it('looks up an exact code and starts membership verification', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({})]; // has a gym so the join panel is visible directly
    rpcMock.mockImplementation((name: string) =>
      name === 'get_gym_by_code'
        ? Promise.resolve({ data: { id: 'g9', name: 'New Iron Gym', code: 'new-iron', address: 'Cebu', logo_url: null }, error: null })
        : Promise.resolve({ data: null, error: null }),
    );
    verifyMembershipActionMock.mockResolvedValue({ status: 'pending', role: 'member', matched: false });
    render(<GymHub />);

    await user.type(screen.getByRole('searchbox', { name: /search gyms/i }), '  NEW-IRON  ');
    await user.click(screen.getByRole('button', { name: /^search gyms$/i }));
    expect(await screen.findByText('New Iron Gym')).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith('get_gym_by_code', { p_code: 'new-iron' });
    await user.click(screen.getByRole('button', { name: /i.m already a member/i }));

    await waitFor(() => expect(verifyMembershipActionMock).toHaveBeenCalledWith('g9'));
    expect(await screen.findByRole('heading', { name: /membership verification started/i })).toBeInTheDocument();
    expect(refreshMyGymsMock).toHaveBeenCalled();
  });

  it('searches published gyms by supported name and location fields', async () => {
    const user = userEvent.setup();
    rpcMock.mockImplementation((name: string) => Promise.resolve({
      data: name === 'search_gyms'
        ? [{ id: 'g8', name: 'Cebu Strength', code: 'cebu-strength', address: 'Cebu City' }]
        : [],
      error: null,
    }));
    render(<GymHub />);
    await user.type(screen.getByRole('searchbox', { name: /search gyms/i }), 'Cebu City');
    await user.click(screen.getByRole('button', { name: /^search gyms$/i }));
    expect(await screen.findByText('Cebu Strength')).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith('search_gyms', { p_query: 'Cebu City' });
    expect(screen.getByRole('link', { name: /view gym profile/i })).toHaveAttribute('href', '/gym/cebu-strength');
  });

  it('saving a gym never refreshes membership access', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({})];
    rpcMock.mockImplementation((name: string) => Promise.resolve({
      data: name === 'get_gym_by_code'
        ? { id: 'g9', name: 'New Iron Gym', code: 'new-iron', address: 'Cebu' }
        : null,
      error: null,
    }));
    render(<GymHub />);
    await user.type(screen.getByRole('searchbox', { name: /search gyms/i }), 'new-iron');
    await user.click(screen.getByRole('button', { name: /^search gyms$/i }));
    await user.click(await screen.findByRole('button', { name: /save new iron gym/i }));
    expect(saveGymActionMock).toHaveBeenCalledWith('g9', true);
    expect(refreshMyGymsMock).not.toHaveBeenCalled();
  });

  it('opens the member dashboard immediately after a deterministic membership match', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({})];
    rpcMock.mockImplementation((name: string) => Promise.resolve({
      data: name === 'get_gym_by_code'
        ? { id: 'g9', name: 'New Iron Gym', code: 'new-iron', address: 'Cebu' }
        : null,
      error: null,
    }));
    verifyMembershipActionMock.mockResolvedValue({ status: 'active', role: 'member', matched: true });
    setActiveGymActionMock.mockResolvedValue({ role: 'member' });
    render(<GymHub />);
    await user.type(screen.getByRole('searchbox', { name: /search gyms/i }), 'new-iron');
    await user.click(screen.getByRole('button', { name: /^search gyms$/i }));
    await user.click(await screen.findByRole('button', { name: /i.m already a member/i }));
    await waitFor(() => expect(setActiveGymActionMock).toHaveBeenCalledWith('g9'));
    expect(pushMock).toHaveBeenCalledWith('/member');
  });
});
