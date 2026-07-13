import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JoinQrPoster, joinSignupPath } from '@/components/admin/JoinQrPoster';
import { MemberHomeClient, type MemberHomeData } from '@/components/member/MemberHomeClient';
import type { MemberStats } from '@/lib/types';

const zeroStats: MemberStats = {
  totalVisits: 0,
  monthlyVisits: 0,
  currentStreak: 0,
  bestStreak: 0,
  avgSessionMinutes: 0,
  leaderboardRank: null,
};

describe('join-QR poster', () => {
  it('encodes the shared auth join link', () => {
    expect(joinSignupPath('iron-house')).toBe('/auth?mode=signup&gym=iron-house');
  });

  it('renders the join URL for the gym', async () => {
    render(<JoinQrPoster gymName="Iron House" gymCode="iron-house" />);
    await waitFor(() =>
      expect(screen.getByTestId('join-url')).toHaveTextContent(/\/auth\?mode=signup&gym=iron-house$/),
    );
    expect(screen.getByText('Iron House')).toBeInTheDocument();
  });
});

describe('lapsed lock screen', () => {
  it('names the saved streak, visits, and member-since instead of stats', () => {
    const data: MemberHomeData = {
      memberName: 'Alex',
      stats: zeroStats,
      visitedDates: [],
      peopleInGym: 0,
      subscriptionStatus: 'expired',
      gymName: 'Iron House',
      lapsedSummary: { current_streak: 3, best_streak: 47, total_visits: 218, member_since: '2024-01-01' },
    };
    render(<MemberHomeClient data={data} />);

    expect(screen.getByText(/renew at the front desk/i)).toBeInTheDocument();
    expect(screen.getByText('47 days')).toBeInTheDocument();
    expect(screen.getByText('218')).toBeInTheDocument();
    // Normal home content is replaced, not shown.
    expect(screen.queryByText(/quick access/i)).not.toBeInTheDocument();
  });

  it('renders the normal home when the subscription is active (safe default)', () => {
    const data: MemberHomeData = {
      memberName: 'Alex',
      stats: zeroStats,
      visitedDates: [],
      peopleInGym: 0,
    };
    render(<MemberHomeClient data={data} />);
    expect(screen.getByText(/quick access/i)).toBeInTheDocument();
    expect(screen.queryByText(/renew at the front desk/i)).not.toBeInTheDocument();
  });
});
