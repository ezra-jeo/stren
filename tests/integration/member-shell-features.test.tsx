import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemberShell } from '@/components/member/MemberShell';
import { MemberHomeClient, type MemberHomeData } from '@/components/member/MemberHomeClient';
import type { MemberStats } from '@/lib/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/member',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/member-notifications-panel', () => ({ MemberNotificationsPanel: () => null }));

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
