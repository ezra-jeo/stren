import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, isDemoMemberPath, LEGACY_AUTH_REDIRECTS, middleware } from '@/middleware';

describe('legacy auth redirect map', () => {
  it.each([
    ['/app/auth/confirm?token_hash=recovery-token&type=recovery&next=%2Freset-password', '/auth/confirm?token_hash=recovery-token&type=recovery&next=%2Freset-password', 307],
    ['/gym/ABC/login', '/auth?mode=signin&gym=ABC', 308],
    ['/gym/ABC/signup', '/auth?mode=signup&gym=ABC', 308],
    ['/login', '/auth?mode=signin', 308],
    ['/signup', '/auth?mode=signup', 308],
    ['/signup/admin', '/for-gym-owners', 308],
    ['/signup/member', '/auth?mode=signup', 308],
    ['/gyms/new', '/for-gym-owners', 308],
    ['/register-gym', '/for-gym-owners', 308],
    ['/gym-select', '/gyms', 308],
    ['/kiosk/signup', '/kiosk', 308],
  ])('%s maps to %s', (source, expected, expectedStatus) => {
    const url = new URL(`https://stren.app${source}`);
    const redirect = LEGACY_AUTH_REDIRECTS.find((entry) => url.pathname.match(entry.pattern));
    const match = redirect ? url.pathname.match(redirect.pattern) : null;
    expect(redirect && match ? redirect.target(match, url) : null).toBe(expected);
    expect(redirect && 'status' in redirect ? redirect.status : 308).toBe(expectedStatus);
  });

  it('redirects an app-prefixed recovery link before auth and preserves its one-time parameters', async () => {
    const response = await middleware(new NextRequest(
      'https://stren.netlify.app/app/auth/confirm?token_hash=recovery-token&type=recovery&next=%2Freset-password',
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://stren.netlify.app/auth/confirm?token_hash=recovery-token&type=recovery&next=%2Freset-password',
    );
  });
});

describe('middleware matcher', () => {
  it('does not intercept Vercel telemetry assets', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test('/_vercel/insights/script.js')).toBe(false);
    expect(matcher.test('/admin/members')).toBe(true);
  });
});

describe('member Demo Mode route boundary', () => {
  it('recognizes only the isolated demo namespace', () => {
    expect(isDemoMemberPath('/member/demo')).toBe(true);
    expect(isDemoMemberPath('/member/demo/profile')).toBe(true);
    expect(isDemoMemberPath('/member')).toBe(false);
    expect(isDemoMemberPath('/member/profile')).toBe(false);
  });
});
