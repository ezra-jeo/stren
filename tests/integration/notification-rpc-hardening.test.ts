import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/014_fix_notification_rpc_scope.sql',
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
});
