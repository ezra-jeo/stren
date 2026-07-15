import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemberShell } from '@/components/member/MemberShell';
import { MemberHomeClient, type MemberHomeData } from '@/components/member/MemberHomeClient';
import type { MemberStats } from '@/lib/types';

let currentSearch = '';
const replaceMock = vi.fn();
const updateUserMock = vi.fn();
const completePasswordSetupMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/member',
  useSearchParams: () => new URLSearchParams(currentSearch),
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn() }),
}));
vi.mock('@/components/member-notifications-panel', () => ({ MemberNotificationsPanel: () => null }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    profile: { id: 'member-1', name: 'Alex', email: 'alex@example.com' },
    isLoading: false,
    myGyms: [],
    completePasswordSetup: completePasswordSetupMock,
  }),
}));
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { updateUser: updateUserMock } }),
}));

beforeEach(() => {
  currentSearch = '';
  replaceMock.mockReset();
  updateUserMock.mockReset();
  completePasswordSetupMock.mockReset();
  updateUserMock.mockResolvedValue({ data: { user: { id: 'member-1' } }, error: null });
});

const stats: MemberStats = {
  currentStreak: 0,
  longestStreak: 0,
  totalVisits: 0,
  thisMonthVisits: 0,
  thisWeekVisits: 0,
  membershipStatus: 'active',
  membershipEndDate: null,
  planName: null,
} as unknown as MemberStats;

describe('MemberShell — feature-gated nav (§8.5)', () => {
  it('opens the member profile from the account pill in the desktop sidebar', () => {
    render(<MemberShell gymBranding={null} hasServerUser>content</MemberShell>);

    expect(screen.getByRole('link', { name: /open your profile/i })).toHaveAttribute('href', '/member/profile');
  });

  it('shows Feed and Ranks by default (features on)', () => {
    render(<MemberShell gymBranding={null} hasServerUser>content</MemberShell>);
    expect(screen.getAllByText('Feed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ranks').length).toBeGreaterThan(0);
  });

  it('hides Feed and Ranks when their features are off', () => {
    render(
      <MemberShell gymBranding={null} hasServerUser features={{ member_feed: false, leaderboards: false }}>
        content
      </MemberShell>,
    );
    expect(screen.queryByText('Feed')).not.toBeInTheDocument();
    expect(screen.queryByText('Ranks')).not.toBeInTheDocument();
    // Home + Settings remain.
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });

  it('offers a skippable password setup before a magic-link member continues', () => {
    currentSearch = 'first_login=1';
    render(<MemberShell gymBranding={null} hasServerUser>content</MemberShell>);

    expect(screen.getByRole('dialog', { name: /secure your account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set a password/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeEnabled();
  });

  it('sets the member password from the first-login prompt and removes the one-time URL state', async () => {
    const user = userEvent.setup();
    currentSearch = 'first_login=1';
    render(<MemberShell gymBranding={null} hasServerUser>content</MemberShell>);

    await user.click(screen.getByRole('button', { name: /set a password/i }));
    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'new-password-123');
    await user.click(screen.getByRole('button', { name: /save password/i }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ password: 'new-password-123' }));
    expect(completePasswordSetupMock).toHaveBeenCalledWith('member-1');
    expect(replaceMock).toHaveBeenCalledWith('/member');
  });
});

describe('MemberHomeClient — feature-gated quick links (§8.5)', () => {
  const base: MemberHomeData = { memberName: 'Sam Doe', stats, visitedDates: [], peopleInGym: 0 };

  it('shows the Feed and Ranks recommendations by default', () => {
    render(<MemberHomeClient data={base} />);
    expect(screen.getByText('Gym activity')).toBeInTheDocument();
    expect(screen.getByText('Latest ranks')).toBeInTheDocument();
  });

  it('replaces unavailable community recommendations with existing member tools', () => {
    render(<MemberHomeClient data={{ ...base, features: { member_feed: false, leaderboards: false } }} />);
    expect(screen.queryByText('Gym activity')).not.toBeInTheDocument();
    expect(screen.queryByText('Latest ranks')).not.toBeInTheDocument();
    expect(screen.getByText('Your member QR code')).toBeInTheDocument();
  });
});
