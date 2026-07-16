import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('staff onboarding', () => {
  it('attaches an existing account and creates/invites only when absent', () => {
    const code = readFileSync(resolve(process.cwd(), 'app/api/admin/members/onboard/route.ts'), 'utf8');
    expect(code).toMatch(/from\(["']profiles["']\)[\s\S]*\.eq\(["']email["'],\s*body\.email\)[\s\S]*maybeSingle/i);
    expect(code).toMatch(/if\s*\(!memberId\)[\s\S]*auth\.admin\.createUser/i);
    expect(code).toMatch(/findAuthUserIdByEmail/i);
    expect(code).toMatch(/from\(["']profiles["']\)[\s\S]*upsert/i);
    expect(code).toMatch(/from\(["']gym_users["']\)[\s\S]*(?:insert|update|upsert)[\s\S]*added_by:\s*user\.id/i);
    expect(code).toMatch(/if\s*\(createdAccount\)[\s\S]*generateLink/i);
    expect(code).toMatch(/hashed_token/i);
    expect(code).toMatch(/buildAuthConfirmationUrl/i);
    expect(code).toMatch(/type["']?\s*[:,=]\s*["']magiclink["']/i);
    expect(code).toMatch(/role:\s*["']member["']/i);
    expect(code).toMatch(/\.rpc\(["']record_membership_payment["']/i);
    expect(code).not.toMatch(/from\(["']memberships["']\)\.(?:insert|update)/i);
  });
});
