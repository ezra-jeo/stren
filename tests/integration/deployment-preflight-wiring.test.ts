import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('deployment preflight wiring', () => {
  it('checks the live Supabase contract before Netlify and production deployment builds', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const netlify = readFileSync(resolve(process.cwd(), 'netlify.toml'), 'utf8');
    const ci = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

    expect(packageJson.scripts['verify:deployment']).toBe(
      'node scripts/verify-deployment-contract.mjs',
    );
    expect(netlify).toMatch(
      /command\s*=\s*"npm run verify:deployment && npm run build"/,
    );
    expect(ci).toMatch(
      /name:\s*Verify Supabase deployment contract[\s\S]*run:\s*npm run verify:deployment[\s\S]*SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY):/,
    );
  });

  it('maps Supabase modern publishable environment names into the browser build', () => {
    const nextConfig = readFileSync(
      resolve(process.cwd(), 'next.config.mjs'),
      'utf8',
    );

    expect(nextConfig).toContain('SUPABASE_PROJECT_ID');
    expect(nextConfig).toContain('SUPABASE_PUBLISHABLE_KEY');
    expect(nextConfig).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(nextConfig).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(nextConfig).not.toContain('SUPABASE_SECRET_KEY');
  });
});
