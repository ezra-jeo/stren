import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/016_feature_toggles.sql');

describe('SQL feature-toggle model', () => {
  it('stores flags, applies catalog defaults, and returns effective flags in get_my_access', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.gym_feature_settings/i);
    for (const column of ['gym_id', 'flags', 'updated_by', 'updated_at']) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, 'i'));
    }
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.gym_feature_enabled');
    expect(sql).toMatch(/WHEN 'member_feed' THEN true/i);
    expect(sql).toMatch(/WHEN 'trainer_bookings' THEN false/i);
    expect(sql).toMatch(/has_gym_permission\('features:manage'/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_my_access\(\)[\s\S]*?'features'[\s\S]*?gym_feature_enabled\('kiosk_checkin'/i);
  });

  it('publishes public feature flags while omitting disabled feature data', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_gym_by_code/i);
    for (const key of ['public_team', 'public_pricing', 'public_location']) {
      expect(sql).toMatch(new RegExp(`gym_feature_enabled\\('${key}'`, 'i'));
    }
    for (const key of ['logo_path', 'cover_path', 'cover_focal', 'section_visibility']) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toMatch(/IF v_public_team THEN[\s\S]*?'team_members'/i);
    expect(sql).toMatch(/IF v_public_pricing THEN[\s\S]*?'pricing_packages'/i);
    expect(sql).toMatch(/IF v_public_location THEN[\s\S]*?'map_embed_url'[\s\S]*?'directions'/i);
  });

  it('retains tagline-derived public visibility until the owner approves the behavior change', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const getGymByCode = sql.slice(sql.indexOf('FUNCTION public.get_gym_by_code'), sql.indexOf('-- Feature-aware RLS policies.'));

    expect(getGymByCode).toMatch(/'is_published',\s*\(v_gym\.tagline IS NOT NULL AND TRIM\(v_gym\.tagline\) <> ''\)/i);
    expect(getGymByCode).not.toMatch(/'is_published',\s*v_gym\.is_published/i);
  });

  it('enforces disabled features in RLS and RPC truth layers', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/CREATE POLICY feed_select[\s\S]*?gym_feature_enabled\('member_feed'/i);
    expect(sql).toMatch(/CREATE POLICY feed_insert[\s\S]*?gym_feature_enabled\('member_feed'/i);
    expect(sql).toMatch(/CREATE POLICY announcements_manage[\s\S]*?gym_feature_enabled\('announcements'/i);
    expect(sql).toMatch(/CREATE POLICY promos_manage[\s\S]*?gym_feature_enabled\('promos'/i);

    for (const fn of [
      'leaderboard_workouts',
      'leaderboard_week_streak',
      'leaderboard_longest_member',
    ]) {
      const start = sql.indexOf(`FUNCTION public.${fn}`);
      expect(start).toBeGreaterThan(-1);
      expect(sql.slice(start, start + 2_500)).toContain("gym_feature_enabled('leaderboards'");
    }

    const kioskGuardStart = sql.indexOf('FUNCTION public.kiosk_access_allowed');
    expect(kioskGuardStart).toBeGreaterThan(-1);
    const kioskGuard = sql.slice(kioskGuardStart, kioskGuardStart + 2_000);
    expect(kioskGuard).toContain("gym_feature_enabled('kiosk_checkin'");
    expect(kioskGuard).toContain("has_gym_permission('kiosk:use'");

    for (const fn of [
      'kiosk_checkin',
      'kiosk_checkin_by_member',
      'kiosk_checkout',
      'kiosk_get_checked_in',
      'kiosk_search_members',
      'kiosk_update_streak',
    ]) {
      const start = sql.indexOf(`FUNCTION public.${fn}`);
      expect(start).toBeGreaterThan(-1);
      const body = sql.slice(start, start + 4_000);
      expect(body).toContain('kiosk_access_allowed');
    }

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.member_home_stats\(\)[\s\S]*?'people_in_gym'/i);
  });
});
