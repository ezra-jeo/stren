import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/029_assisted_onboarding.sql'),
  'utf8',
);

describe('assisted onboarding migration contract', () => {
  it('keeps platform authority, private provisioning, and safe feature boundaries explicit', () => {
    expect(migration).toMatch(/app_metadata\.platform_role=platform_admin/);
    expect(migration).toMatch(/logo_path, is_published, brand_color/);
    expect(migration).toMatch(/\n\s*false,\n\s*COALESCE\(NULLIF\(trim\(p_payload/);
    expect(migration).toMatch(/invited_role public\.user_role NOT NULL DEFAULT 'owner'/);
    expect(migration).toMatch(/CHECK \(invited_role = 'owner'\)/);
    expect(migration).toMatch(/request_fingerprint TEXT NOT NULL/);
    expect(migration).toMatch(/different request/i);
    expect(migration).toMatch(/record_platform_provisioning_auth_state/);
    expect(migration).not.toMatch(/platform_onboarding_events/);
    expect(migration).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.platform_/i);
  });

  it('rejects legacy unsafe switches instead of persisting them', () => {
    expect(migration).toMatch(/unsupported or invalid onboarding feature flag/);
    expect(migration).toMatch(/'staff_manual_checkin', 'occupancy_count'/);
    expect(migration).not.toMatch(/auto_approve_joins|checkin_requires_membership/i);
  });

  it('composes manual kiosk access through hardened membership-gated RPCs', () => {
    expect(migration).toMatch(/public\.kiosk_access_allowed\(p_gym_id\)/);
    expect(migration).toMatch(/public\.has_gym_permission\('members:manage', p_gym_id\)/);
    expect(migration).toMatch(/public\.kiosk_checkin\(v_qr, p_gym_id\)/);
    expect(migration).toMatch(/effective-membership gate/);
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.kiosk_checkin_by_member[\s\S]*service_role/);
  });

  it('never returns or records raw claim credentials', () => {
    expect(migration).toMatch(/raw claim credentials are not persisted/);
    expect(migration).toMatch(/'deliveryStatus', 'pending'/);
    expect(migration).not.toMatch(/claimLink|rawToken|claim_token/i);
    expect(migration).not.toMatch(/jsonb_build_object\([^)]*tokenHash/i);
  });
});
