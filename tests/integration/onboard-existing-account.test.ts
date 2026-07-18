import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('staff onboarding', () => {
  it('preflights and resumes onboarding without returning or persisting credentials', () => {
    const code = readFileSync(resolve(process.cwd(), 'app/api/admin/members/onboard/route.ts'), 'utf8');
    expect(code).toMatch(/rpc\(\s*['"]preflight_member_onboarding['"]/i);
    expect(code).toMatch(/from\(["']profiles["']\)[\s\S]*\.eq\(["']email["'],\s*body\.email\)[\s\S]*maybeSingle/i);
    expect(code).toMatch(/if\s*\(!memberId\)[\s\S]*auth\.admin\.createUser/i);
    expect(code).toMatch(/findAuthUserIdByEmail/i);
    expect(code).not.toMatch(/\.upsert\s*\(/i);
    expect(code).toMatch(/rpc\(\s*['"]complete_member_onboarding['"]/i);
    expect(code).toMatch(/mark_member_onboarding_failure/i);
    expect(code).toMatch(/record_member_onboarding_delivery/i);
    expect(code).not.toMatch(/member_onboarding_events/);
    expect(code).not.toMatch(/return NextResponse\.json\(\{[^}]*?(?:magicLink|qrCode|tokenHash)/i);
  });
});
