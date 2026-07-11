import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Role = 'owner' | 'admin' | 'staff' | 'member';

function currentPaymentAccess(args: {
  role: Role;
  sameGym: boolean;
  ownRow: boolean;
  operation: 'read' | 'insert';
}): boolean {
  const manager = args.role === 'owner' || args.role === 'admin' || args.role === 'staff';
  if (!args.sameGym) return false;
  return args.operation === 'read' ? args.ownRow || manager : manager;
}

describe('payment RLS before migration 015', () => {
  it('pins the current same-gym read and insert behavior for every role', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/011_security_hardening.sql'),
      'utf8',
    );

    expect(sql).toMatch(
      /CREATE POLICY payments_select[\s\S]*?gym_id = public\.get_gym_id\(\)[\s\S]*?auth\.uid\(\) = member_id OR public\.is_manager\(\)/i,
    );
    expect(sql).toMatch(
      /CREATE POLICY payments_insert[\s\S]*?gym_id = public\.get_gym_id\(\) AND public\.is_manager\(\)/i,
    );

    for (const role of ['owner', 'admin', 'staff'] as const) {
      expect(currentPaymentAccess({ role, sameGym: true, ownRow: false, operation: 'read' })).toBe(true);
      expect(currentPaymentAccess({ role, sameGym: true, ownRow: false, operation: 'insert' })).toBe(true);
      expect(currentPaymentAccess({ role, sameGym: false, ownRow: false, operation: 'read' })).toBe(false);
      expect(currentPaymentAccess({ role, sameGym: false, ownRow: false, operation: 'insert' })).toBe(false);
    }

    expect(currentPaymentAccess({ role: 'member', sameGym: true, ownRow: true, operation: 'read' })).toBe(true);
    expect(currentPaymentAccess({ role: 'member', sameGym: true, ownRow: false, operation: 'read' })).toBe(false);
    expect(currentPaymentAccess({ role: 'member', sameGym: true, ownRow: true, operation: 'insert' })).toBe(false);
  });
});
