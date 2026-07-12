import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/019_unified_accounts.sql');

describe('payment attribution SQL', () => {
  it('attributes payment and subscription inserts and creates one in-app alert per active owner', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/ALTER TABLE public\.payments[\s\S]*recorded_by UUID REFERENCES public\.profiles/i);
    expect(sql).toMatch(/ALTER TABLE public\.memberships[\s\S]*created_by UUID REFERENCES public\.profiles/i);
    expect(sql).toContain('FUNCTION public.attribute_recorded_payment');
    expect(sql).toMatch(/NEW\.recorded_by := COALESCE\(NEW\.recorded_by, auth\.uid\(\)\)/i);
    expect(sql).toMatch(/NEW\.created_by := COALESCE\(NEW\.created_by, auth\.uid\(\)\)/i);

    const alert = sql.slice(sql.indexOf('FUNCTION public.notify_owners_of_payment'), sql.indexOf('TRIGGER notify_owners_of_membership'));
    expect(alert).toMatch(/FROM public\.gym_users gu[\s\S]*gu\.role = 'owner'[\s\S]*gu\.status = 'active'/i);
    expect(alert).toMatch(/INSERT INTO public\.notifications/i);
    expect(alert).toContain("'payment_recorded'");
  });
});
