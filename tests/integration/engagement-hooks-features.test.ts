import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ from: fromMock, rpc: rpcMock }) }));
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
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
    rpcMock.mockImplementation(async (name: string) => {
      if (name === 'get_my_access') return { data: { gym_id: 'gym-1' }, error: null };
      if (name === 'kiosk_checkin_by_member') {
        return { data: { action: 'checked_in', attendance_id: 'attendance-1' }, error: null };
      }
      if (name === 'get_gym_directory') {
        return { data: [{ user_id: 'member-1', name: 'Member' }], error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
  });

  it('skips feed items when member_feed is disabled', async () => {
    const settings = builder([{ flags: { member_feed: false } }]);
    const feedInsert = vi.fn();

    fromMock.mockImplementation((table: string) => {
      if (table === 'gym_feature_settings') return settings;
      if (table === 'feed_items') return { insert: feedInsert };
      if (table === undefined) return builder([]);
      throw new Error(`unexpected table ${table}`);
    });

    const { handleScan } = await import('@/lib/engagement-hooks');
    const result = await handleScan('member-1');
    expect(result.status).toBe('checked_in');
    expect(rpcMock).toHaveBeenCalledWith('kiosk_checkin_by_member', {
      p_member_id: 'member-1',
      p_gym_id: 'gym-1',
    });
    expect(feedInsert).not.toHaveBeenCalled();
  });

  it('keeps the check-in successful when a flag-flip race rejects the feed insert', async () => {
    const settings = builder([{ flags: { member_feed: true } }]);
    const streaks = builder([{ current_streak: 1 }]);
    const feedInsert = vi.fn().mockResolvedValue({ error: { message: 'RLS denied' } });

    fromMock.mockImplementation((table: string) => {
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
