import { describe, expect, it } from 'vitest';
import { bestWeeklyStreak, completedWeekKeys, trainedThisWeek, weeklyStreak } from '@/lib/member-weekly-streak';

describe('member weekly consistency streaks', () => {
  it('counts one qualifying visit as a completed week', () => {
    expect(weeklyStreak(['2026-07-06T02:00:00.000Z'], new Date('2026-07-08T12:00:00.000Z'), 'Asia/Manila')).toBe(1);
  });

  it('counts multiple visits in the same week once', () => {
    expect(completedWeekKeys([
      '2026-07-06T02:00:00.000Z',
      '2026-07-08T02:00:00.000Z',
      '2026-07-12T02:00:00.000Z',
    ], 'Asia/Manila')).toHaveLength(1);
  });

  it('builds a streak across consecutive completed weeks', () => {
    expect(weeklyStreak([
      '2026-06-22T02:00:00.000Z',
      '2026-06-29T02:00:00.000Z',
      '2026-07-06T02:00:00.000Z',
    ], new Date('2026-07-08T12:00:00.000Z'), 'Asia/Manila')).toBe(3);
  });

  it('keeps the best weekly streak separate from the currently active one', () => {
    expect(bestWeeklyStreak(['2026-06-08T02:00:00.000Z', '2026-06-15T02:00:00.000Z', '2026-07-06T02:00:00.000Z'], 'Asia/Manila')).toBe(2);
  });

  it('breaks after a missed completed week', () => {
    expect(weeklyStreak([
      '2026-06-22T02:00:00.000Z',
      '2026-07-06T02:00:00.000Z',
    ], new Date('2026-07-08T12:00:00.000Z'), 'Asia/Manila')).toBe(1);
  });

  it('keeps last week active throughout an incomplete current week', () => {
    expect(weeklyStreak(['2026-06-29T02:00:00.000Z'], new Date('2026-07-08T12:00:00.000Z'), 'Asia/Manila')).toBe(1);
  });

  it('separates training this week from the grace-period streak', () => {
    expect(trainedThisWeek(['2026-06-29T02:00:00.000Z'], new Date('2026-07-08T12:00:00.000Z'), 'Asia/Manila')).toBe(false);
  });

  it('uses the gym timezone to decide a calendar-week boundary', () => {
    const visit = '2026-07-05T16:30:00.000Z'; // Monday in Manila, Sunday in UTC.
    expect(completedWeekKeys([visit], 'Asia/Manila')).toEqual(['2026-07-06']);
  });
});
