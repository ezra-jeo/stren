import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/014_fix_notification_rpc_scope.sql',
);
const serviceContextFixPath = resolve(
  process.cwd(),
  'supabase/migrations/018_fix_service_context_notification_guards.sql',
);

describe('notification RPC authorization contract', () => {
  it('blocks direct unscoped notification and streak RPC access', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.process_daily_notifications\(\) FROM PUBLIC, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.process_daily_notifications\(\) TO service_role;/i,
    );

    for (const signature of [
      'public.create_member_notification',
      'public.kiosk_update_streak',
      'public.can_send_member_notification',
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION ${signature}`);
    }

    expect(sql).toMatch(/v_caller_id\s+UUID\s*:=\s*auth\.uid\(\)/i);
    expect(sql).toMatch(/p_gym_id\s*<>\s*public\.get_gym_id\(\)/i);
    expect(sql).toMatch(/auth\.uid\(\)\s*=\s*p_member_id/i);
    expect(sql.match(/FROM PUBLIC, anon;/gi)).toHaveLength(3);
  });

  it('allows only service-role claims to bypass caller checks while retaining target scope', () => {
    const sql = readFileSync(serviceContextFixPath, 'utf8');

    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.create_member_notification',
    );
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.can_send_member_notification',
    );
    expect(sql.match(/v_is_service\s+BOOLEAN\s*:=\s*COALESCE\(\s*NULLIF\(current_setting\('request\.jwt\.claims',\s*true\),\s*''\)::jsonb\s*->>\s*'role',\s*''\s*\)\s*=\s*'service_role'/gi)).toHaveLength(2);

    const canSendBody = sql.match(
      /CREATE OR REPLACE FUNCTION public\.can_send_member_notification[\s\S]*?\$\$;/i,
    )?.[0];
    const createBody = sql.match(
      /CREATE OR REPLACE FUNCTION public\.create_member_notification[\s\S]*?\$\$;/i,
    )?.[0];

    expect(canSendBody).toMatch(
      /WHERE id = p_member_id AND role = 'member';[\s\S]*?IF v_member_gym IS NULL THEN[\s\S]*?IF NOT v_is_service THEN[\s\S]*?v_caller_id IS NULL[\s\S]*?auth\.uid\(\) = p_member_id[\s\S]*?public\.is_manager\(\)[\s\S]*?v_caller_gym <> v_member_gym[\s\S]*?END IF;/i,
    );
    expect(createBody).toMatch(
      /IF NOT EXISTS \([\s\S]*?id = p_member_id[\s\S]*?gym_id = p_gym_id[\s\S]*?role = 'member'[\s\S]*?RAISE EXCEPTION 'permission denied';[\s\S]*?IF NOT v_is_service THEN[\s\S]*?v_caller_id IS NULL[\s\S]*?NOT public\.is_manager\(\)[\s\S]*?p_gym_id <> public\.get_gym_id\(\)/i,
    );

    expect(sql).not.toMatch(/\b(?:GRANT|REVOKE)\b/i);
    expect(sql).not.toContain('get_gym_by_code');
  });
});
