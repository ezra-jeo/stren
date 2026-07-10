import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemberShell } from '@/components/member/MemberShell';
import { MemberHomeClient, type MemberHomeData } from '@/components/member/MemberHomeClient';
import type { MemberStats } from '@/lib/types';

vi.mock('next/navigation', () => ({ usePathname: () => '/member' }));
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

  it('shows the feed + leaderboard quick links by default', () => {
    render(<MemberHomeClient data={base} />);
    expect(screen.getByText('Activity Feed')).toBeInTheDocument();
    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
  });

  it('hides the feed + leaderboard quick links when features are off', () => {
    render(<MemberHomeClient data={{ ...base, features: { member_feed: false, leaderboards: false } }} />);
    expect(screen.queryByText('Activity Feed')).not.toBeInTheDocument();
    expect(screen.queryByText('Leaderboard')).not.toBeInTheDocument();
    expect(screen.getByText('My QR Code')).toBeInTheDocument();
  });
});
