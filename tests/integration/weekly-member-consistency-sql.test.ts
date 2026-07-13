import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/022_weekly_member_consistency.sql'), 'utf8');

describe('weekly member consistency SQL contract', () => {
  it('uses Asia/Manila Monday boundaries and keeps the open week as grace', () => {
    expect(sql).toMatch(/now\(\) AT TIME ZONE 'Asia\/Manila'/);
    expect(sql).toMatch(/date_trunc\('week'/);
    expect(sql).toMatch(/CASE WHEN v_has_current_week THEN v_current_week ELSE v_current_week - 7 END/);
  });

  it('deduplicates visits by week and recalculates ranks from qualifying attendance', () => {
    expect(sql).toMatch(/SELECT DISTINCT date_trunc\('week', a\.check_in AT TIME ZONE v_tz\)::DATE/);
    expect(sql).toMatch(/FUNCTION public\.member_weekly_streak/);
    expect(sql).toMatch(/FUNCTION public\.my_weekly_streak/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.member_weekly_streak\(UUID, UUID\) TO authenticated/);
    expect(sql).toMatch(/FUNCTION public\.leaderboard_week_streak/);
  });
});
