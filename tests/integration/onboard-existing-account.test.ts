import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('staff onboarding', () => {
  it('attaches an existing account and creates/invites only when absent', () => {
    const code = readFileSync(resolve(process.cwd(), 'app/api/admin/members/onboard/route.ts'), 'utf8');
    expect(code).toMatch(/from\(["']profiles["']\)[\s\S]*\.ilike\(["']email["'],\s*escapedEmail\)[\s\S]*maybeSingle/i);
    expect(code).toMatch(/if\s*\(!existingProfile\)[\s\S]*auth\.admin\.createUser/i);
    expect(code).toMatch(/if\s*\(!existingProfile\)[\s\S]*from\(["']profiles["']\)[\s\S]*upsert/i);
    expect(code).toMatch(/from\(["']gym_users["']\)[\s\S]*(?:insert|update|upsert)[\s\S]*added_by:\s*user\.id/i);
    expect(code).toMatch(/if\s*\(!existingProfile\)[\s\S]*generateLink/i);
    expect(code).toMatch(/created_by:\s*user\.id/i);
  });
});
