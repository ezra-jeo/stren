import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = resolve(
  process.cwd(),
  'supabase/migrations/025_financial_integrity_and_reporting.sql',
);

describe('financial ledger application cutover', () => {
  it('uses the atomic payment RPC from both payment and renewal screens', () => {
    const payments = readFileSync(resolve(process.cwd(), 'app/admin/payments/page.tsx'), 'utf8');
    const members = readFileSync(resolve(process.cwd(), 'app/admin/members/page.tsx'), 'utf8');

    for (const source of [payments, members]) {
      expect(source).toMatch(/\.rpc\(["']record_membership_payment["']/i);
      expect(source).not.toMatch(/from\(["']memberships["']\)\.insert/i);
    }
  });

  it('defines the append-only ledger and the three trusted write RPCs', () => {
    const sql = readFileSync(migration, 'utf8');

    expect(sql).toMatch(/CREATE TABLE public\.financial_transactions/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.record_membership_payment/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_financial_transaction/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.record_financial_adjustment/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.financial_reconciliation/i);
  });
});
