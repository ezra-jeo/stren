import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/027_assisted_onboarding.sql');
const sql = readFileSync(migrationPath, 'utf8');

describe('SQL migration 027 — assisted onboarding', () => {
  it('adds a single-branch display column additively', () => {
    expect(sql).toMatch(/ALTER TABLE public\.gyms\s+ADD COLUMN IF NOT EXISTS branch_name TEXT/i);
  });

  it('creates gym_claim_invites with one-active-per-gym, hashed unique token, and platform-admin-only RLS', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.gym_claim_invites/i);
    expect(sql).toContain('token_hash     TEXT NOT NULL UNIQUE');
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS gym_claim_invites_one_active_per_gym[\s\S]*?WHERE consumed_at IS NULL AND superseded_at IS NULL/i);
    expect(sql).toMatch(/gym_claim_invites_consent_check[\s\S]*?CHECK \(consent_method IN \('in_person', 'phone', 'email'\)\)/i);
    expect(sql).toMatch(/gym_claim_invites_delivery_check[\s\S]*?CHECK \(delivery_status IN \('pending', 'sent', 'failed'\)\)/i);
    expect(sql).toMatch(/ALTER TABLE public\.gym_claim_invites ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY gym_claim_invites_platform_admin[\s\S]*?USING \(public\.is_platform_admin\(\)\)/i);
  });

  it('creates provisioning_runs and platform_onboarding_events with platform-admin-only RLS', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.provisioning_runs[\s\S]*?idempotency_key UUID PRIMARY KEY/i);
    expect(sql).toMatch(/CREATE POLICY provisioning_runs_platform_admin[\s\S]*?USING \(public\.is_platform_admin\(\)\)/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.platform_onboarding_events/i);
    expect(sql).toMatch(/platform_onboarding_events_type_check CHECK \(event_type IN \(\s*'provisioned', 'invite_sent', 'invite_send_failed', 'invite_resent', 'claimed', 'member_import'/i);
    expect(sql).toMatch(/CREATE POLICY platform_onboarding_events_platform_admin[\s\S]*?USING \(public\.is_platform_admin\(\)\)/i);
  });

  it('mirrors the four new feature-switch defaults in gym_feature_enabled', () => {
    const fn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.gym_feature_enabled'),
      sql.indexOf('-- ---------------------------------------------------------------------------\n-- 6.'),
    );
    expect(fn).toMatch(/WHEN 'auto_approve_joins' THEN false/);
    expect(fn).toMatch(/WHEN 'staff_manual_checkin' THEN true/);
    expect(fn).toMatch(/WHEN 'checkin_requires_membership' THEN true/);
    expect(fn).toMatch(/WHEN 'occupancy_count' THEN true/);
  });

  it('gates join_gym auto-approval on the auto_approve_joins switch instead of always pending', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.join_gym'), sql.indexOf('-- "Active membership required'));
    expect(fn).toMatch(/CASE WHEN public\.gym_feature_enabled\('auto_approve_joins', p_gym_id\) THEN 'active' ELSE 'pending' END/);
  });

  it('gates kiosk_checkin membership requirement on checkin_requires_membership', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.kiosk_checkin(p_qr_code'), sql.indexOf('-- "Allow staff manual check-in"'));
    expect(fn).toMatch(/IF public\.gym_feature_enabled\('checkin_requires_membership', p_gym_id\)\s+AND NOT public\.has_member_portal_entitlement/);
  });

  it('gates manual staff check-in on staff_manual_checkin', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.kiosk_checkin_by_member'), sql.indexOf('-- "Enable occupancy count"'));
    expect(fn).toMatch(/NOT public\.gym_feature_enabled\('staff_manual_checkin', p_gym_id\)/);
  });

  it('gates occupancy reporting on occupancy_count without raising for a disabled gym', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.kiosk_get_occupancy'), sql.indexOf('-- ---------------------------------------------------------------------------\n-- 7.'));
    expect(fn).toMatch(/IF NOT public\.gym_feature_enabled\('occupancy_count', p_gym_id\) THEN\s+RETURN 0;/);
  });

  it('provision_gym_workspace requires platform admin, is idempotent, validates the slug like create_gym, and requires >=1 plan', () => {
    const fn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.provision_gym_workspace'),
      sql.indexOf('REVOKE EXECUTE ON FUNCTION public.provision_gym_workspace'),
    );
    expect(fn).toMatch(/IF NOT public\.is_platform_admin\(\) THEN\s+RAISE EXCEPTION 'platform admin access required'/);
    expect(fn).toMatch(/SELECT result INTO v_existing\s+FROM public\.provisioning_runs\s+WHERE idempotency_key = p_idempotency_key;\s+IF FOUND THEN\s+RETURN v_existing;/);
    expect(fn).toMatch(/v_code !~ '\^\[a-z0-9\]\[a-z0-9-\]\{2,31\}\$'/);
    expect(fn).toMatch(/IF jsonb_array_length\(v_plans\) < 1 THEN\s+RAISE EXCEPTION 'At least one membership plan is required'/);
    expect(fn).toMatch(/INSERT INTO public\.gym_claim_invites/);
    expect(fn).toMatch(/INSERT INTO public\.provisioning_runs\(idempotency_key, created_by, gym_id, result\)/);
  });

  it('provisions owner and staff as pending gym_users, never inserts payments or memberships', () => {
    const fn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.provision_gym_workspace'),
      sql.indexOf('REVOKE EXECUTE ON FUNCTION public.provision_gym_workspace'),
    );
    expect(fn).toMatch(/INSERT INTO public\.gym_users\(gym_id, user_id, role, status, added_by\)\s+VALUES \(v_gym\.id, v_owner_id, v_owner_role, 'pending', auth\.uid\(\)\)/);
    expect(fn).not.toMatch(/INSERT INTO public\.payments/);
    expect(fn).not.toMatch(/INSERT INTO public\.memberships/);
    expect(fn.match(/INSERT INTO public\.gym_users/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('provision_gym_workspace is revoked from public/anon', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.provision_gym_workspace\(JSONB, TEXT, UUID\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.provision_gym_workspace\(JSONB, TEXT, UUID\) TO authenticated, service_role/);
  });

  it('claim_gym_ownership enforces single-use, expiry, supersession, and email binding with distinct error codes', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.claim_gym_ownership'), sql.indexOf('REVOKE EXECUTE ON FUNCTION public.claim_gym_ownership'));
    expect(fn).toMatch(/FOR UPDATE;/);
    expect(fn).toMatch(/IF v_invite\.superseded_at IS NOT NULL THEN\s+RAISE EXCEPTION 'invite superseded' USING ERRCODE = 'P0003'/);
    expect(fn).toMatch(/IF v_invite\.consumed_at IS NOT NULL THEN\s+RAISE EXCEPTION 'invite already used' USING ERRCODE = 'P0004'/);
    expect(fn).toMatch(/IF v_invite\.expires_at <= now\(\) THEN\s+RAISE EXCEPTION 'invite expired' USING ERRCODE = 'P0005'/);
    expect(fn).toMatch(/IF v_invite\.invited_email <> v_jwt_email THEN\s+RAISE EXCEPTION 'invite is for a different email' USING ERRCODE = 'P0006'/);
    expect(fn).toMatch(/UPDATE public\.gym_claim_invites SET consumed_at = now\(\)/);
  });

  it('supersede_claim_invite requires platform admin and invalidates the prior active invite', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.supersede_claim_invite'), sql.indexOf('REVOKE EXECUTE ON FUNCTION public.supersede_claim_invite'));
    expect(fn).toMatch(/IF NOT public\.is_platform_admin\(\) THEN/);
    expect(fn).toMatch(/WHERE gym_id = p_gym_id AND consumed_at IS NULL AND superseded_at IS NULL\s+FOR UPDATE;/);
    expect(fn).toMatch(/UPDATE public\.gym_claim_invites SET superseded_at = now\(\)/);
  });

  it('get_claim_invite_preview is readable by anon but never exposes the token', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_claim_invite_preview'), sql.length);
    expect(fn).not.toMatch(/token_hash['",]/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_claim_invite_preview\(TEXT\) TO anon, authenticated, service_role/);
  });
});
