/**
 * One read-only source of sample gym data for the member Demo Mode.
 * Account identity is intentionally absent: demo pages combine this fixture
 * with the authenticated profile at render time.
 */
export const DEMO_PREVIEW_NOTICE = 'This is a preview. Nothing here affects your account.';

export const DEMO_MEMBER_DATA = {
  gym: {
    name: 'Stren Demo Gym',
    subtitle: 'Sample workspace',
  },
  home: {
    memberName: 'Member',
    stats: {
      totalVisits: 18,
      monthlyVisits: 6,
      currentStreak: 1,
      bestStreak: 4,
      avgSessionMinutes: 62,
      leaderboardRank: 8,
    },
    visitedDates: ['2026-07-13', '2026-07-15', '2026-07-16'] as string[],
    peopleInGym: 12,
    thisWeekWorkouts: 3,
    gymName: 'Stren Demo Gym',
  },
  membership: {
    planName: 'Demo All Access',
    status: 'Active (Demo)',
    validUntil: 'December 31, 2026',
  },
} as const;

export function demoInitials(name: string | null | undefined): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return 'M';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}
