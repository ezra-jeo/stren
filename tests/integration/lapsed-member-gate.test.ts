import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/019_unified_accounts.sql');

describe('lapsed-member SQL gate', () => {
  it('locks lapsed subscriptions while preserving member behavior for managers without billing rows', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const home = sql.slice(sql.indexOf('FUNCTION public.member_home_stats'), sql.indexOf('FUNCTION public.leaderboard_workouts'));

    expect(sql).toContain('FUNCTION public.has_member_portal_entitlement');
    const entitlement = sql.slice(
      sql.indexOf('FUNCTION public.has_member_portal_entitlement'),
      sql.indexOf('FUNCTION public.shares_active_gym'),
    );
    expect(entitlement).toMatch(/gu\.role <> 'member'/i);
    expect(entitlement).toMatch(/NOT EXISTS \([\s\S]*FROM public\.memberships/i);
    expect(entitlement).toMatch(/m\.status = 'active'[\s\S]*m\.end_date >= CURRENT_DATE/i);

    expect(home).toContain("'subscription_status'");
    expect(home).toContain("'lapsed_summary'");
    for (const field of ['current_streak', 'best_streak', 'total_visits', 'member_since']) {
      expect(home).toContain(`'${field}'`);
    }
    expect(home).toMatch(/IF NOT public\.has_member_portal_entitlement\(v_uid, v_gym_id\) THEN[\s\S]*RETURN jsonb_build_object/i);

    for (const fn of ['leaderboard_workouts', 'leaderboard_week_streak', 'leaderboard_longest_member']) {
      const start = sql.indexOf(`FUNCTION public.${fn}`);
      expect(start).toBeGreaterThan(-1);
      const body = sql.slice(start, start + 3_500);
      expect(body).toMatch(/(?:FROM|JOIN) public\.gym_users gu/i);
      expect(body).toMatch(/gu\.status = 'active'/i);
      expect(body).toMatch(/public\.has_member_portal_entitlement\(gu\.user_id, gu\.gym_id\)/i);
      expect(body).not.toMatch(/gu\.role = 'member'/i);
    }
  });

  it('aliases the longest-member duration before ordering by the leaderboard value', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const start = sql.indexOf('FUNCTION public.leaderboard_longest_member');
    const body = sql.slice(start, start + 1_500);

    expect(body).toMatch(/\)::INTEGER\s+AS value[\s\S]*ORDER BY value DESC/i);
  });
});
