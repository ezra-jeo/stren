import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ from: fromMock }) }));
vi.mock('@/lib/streaks', () => ({
  updateStreak: vi.fn().mockResolvedValue({ currentStreak: 1, bestStreak: 1, isNewBest: true }),
}));

function builder(rows: unknown[], onInsert?: (value: unknown) => unknown) {
  const api: Record<string, any> = {};
  for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
    api[method] = vi.fn(() => api);
  }
  api.insert = vi.fn((value: unknown) => onInsert?.(value) ?? api);
  api.maybeSingle = vi.fn(async () => ({ data: rows.shift() ?? null, error: null }));
  return api;
}

describe('check-in engagement feature behavior', () => {
  beforeEach(() => fromMock.mockReset());

  it('skips feed items when member_feed is disabled', async () => {
    const attendanceInserts: unknown[] = [];
    const profiles = builder([{ gym_id: 'gym-1' }]);
    const attendance = builder(
      [null, { id: 'attendance-1' }],
      (value) => { attendanceInserts.push(value); return attendance; },
    );
    const settings = builder([{ flags: { member_feed: false } }]);
    const feedInsert = vi.fn();

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') return profiles;
      if (table === 'attendance') return attendance;
      if (table === 'gym_feature_settings') return settings;
      if (table === 'feed_items') return { insert: feedInsert };
      if (table === undefined) return builder([]);
      throw new Error(`unexpected table ${table}`);
    });

    const { handleScan } = await import('@/lib/engagement-hooks');
    const result = await handleScan('member-1');
    expect(result.status).toBe('checked_in');
    expect(attendanceInserts).toHaveLength(1);
    expect(feedInsert).not.toHaveBeenCalled();
  });

  it('keeps the check-in successful when a flag-flip race rejects the feed insert', async () => {
    const profiles = builder([{ gym_id: 'gym-1' }, { name: 'Member' }]);
    const attendance = builder([null, { id: 'attendance-2' }]);
    const settings = builder([{ flags: { member_feed: true } }]);
    const streaks = builder([{ current_streak: 1 }]);
    const feedInsert = vi.fn().mockResolvedValue({ error: { message: 'RLS denied' } });

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') return profiles;
      if (table === 'attendance') return attendance;
      if (table === 'gym_feature_settings') return settings;
      if (table === 'streaks') return streaks;
      if (table === 'feed_items') return { insert: feedInsert };
      if (table === undefined) return builder([]);
      throw new Error(`unexpected table ${table}`);
    });

    const { handleScan } = await import('@/lib/engagement-hooks');
    await expect(handleScan('member-1')).resolves.toMatchObject({ status: 'checked_in' });
    expect(feedInsert).toHaveBeenCalledTimes(1);
  });
});
