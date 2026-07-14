import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyGym } from '@/lib/types';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: refreshMock }),
  useSearchParams: () => new URLSearchParams(),
}));

let authValue: {
  myGyms: MyGym[];
  activeGymId: string | null;
  signOut: () => void;
  isSigningOut: boolean;
  refreshProfile: () => Promise<void>;
  refreshMyGyms: () => Promise<void>;
  beginPrivateScopeChange: () => void;
};
vi.mock('@/lib/auth-context', () => ({ useAuth: () => authValue }));

const setActiveGymActionMock = vi.fn();
vi.mock('@/lib/auth-actions', () => ({ setActiveGymAction: (...a: unknown[]) => setActiveGymActionMock(...a) }));

import { GymSwitcher } from '@/components/gyms/GymSwitcher';

function gym(o: Partial<MyGym>): MyGym {
  return { gymId: 'g1', code: 'iron', name: 'Iron House', logoUrl: null, role: 'owner', status: 'active', ...o };
}

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  refreshMock.mockReset();
  setActiveGymActionMock.mockReset();
  authValue = {
    myGyms: [],
    activeGymId: 'g1',
    signOut: vi.fn(),
    isSigningOut: false,
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    refreshMyGyms: vi.fn().mockResolvedValue(undefined),
    beginPrivateScopeChange: vi.fn(),
  };
});

describe('GymSwitcher', () => {
  it('shows the active gym as the anchor', () => {
    authValue.myGyms = [gym({})];
    render(<GymSwitcher variant="admin" />);
    expect(screen.getByRole('button', { name: /current gym: iron house/i })).toBeInTheDocument();
  });

  it('lists other active gyms and switches on click', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({}), gym({ gymId: 'g2', name: 'Bay Strength', code: 'bay', role: 'member' })];
    setActiveGymActionMock.mockResolvedValue({ role: 'member' });
    render(<GymSwitcher variant="admin" />);

    await user.click(screen.getByRole('button', { name: /current gym/i }));
    const menu = screen.getByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: /bay strength/i }));

    await waitFor(() => expect(setActiveGymActionMock).toHaveBeenCalledWith('g2'));
    expect(screen.getByRole('status')).toHaveTextContent(/switching to bay strength/i);
    expect(authValue.beginPrivateScopeChange).toHaveBeenCalled();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/member?scope=g2'));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('rolls back the previous gym if post-switch hydration fails', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({}), gym({ gymId: 'g2', name: 'Bay Strength', code: 'bay', role: 'owner' })];
    setActiveGymActionMock
      .mockResolvedValueOnce({ role: 'owner' })
      .mockResolvedValueOnce({ role: 'owner' });
    vi.mocked(authValue.refreshProfile)
      .mockRejectedValueOnce(new Error('new scope unavailable'))
      .mockResolvedValueOnce(undefined);
    render(<GymSwitcher variant="admin" />);

    await user.click(screen.getByRole('button', { name: /current gym/i }));
    await user.click(screen.getByRole('menuitem', { name: /bay strength/i }));

    await waitFor(() => expect(setActiveGymActionMock).toHaveBeenNthCalledWith(2, 'g1'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not switch gyms/i);
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers Member view in the admin shell', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({})];
    render(<GymSwitcher variant="admin" />);
    await user.click(screen.getByRole('button', { name: /current gym/i }));
    expect(screen.getByRole('menuitem', { name: /member view/i })).toBeInTheDocument();
  });

  it('offers Admin view in the member shell only for managers', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({ role: 'owner' })];
    render(<GymSwitcher variant="member" />);
    await user.click(screen.getByRole('button', { name: /current gym/i }));
    expect(screen.getByRole('menuitem', { name: /admin view/i })).toBeInTheDocument();
  });

  it('hides Admin view for a plain member', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({ role: 'member' })];
    render(<GymSwitcher variant="member" />);
    await user.click(screen.getByRole('button', { name: /current gym/i }));
    expect(screen.queryByRole('menuitem', { name: /admin view/i })).not.toBeInTheDocument();
  });

  it('single-gym account has no switch-gym list', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({})];
    render(<GymSwitcher variant="admin" />);
    await user.click(screen.getByRole('button', { name: /current gym/i }));
    expect(screen.queryByText(/switch gym/i)).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /all gyms/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    authValue.myGyms = [gym({})];
    render(<GymSwitcher variant="admin" />);
    await user.click(screen.getByRole('button', { name: /current gym/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
