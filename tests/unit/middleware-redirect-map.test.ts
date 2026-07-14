import { describe, expect, it } from 'vitest';
import { config, LEGACY_AUTH_REDIRECTS } from '@/middleware';

describe('legacy auth redirect map', () => {
  it.each([
    ['/gym/ABC/login', '/auth?mode=signin&gym=ABC'],
    ['/gym/ABC/signup', '/auth?mode=signup&gym=ABC'],
    ['/login', '/auth?mode=signin'],
    ['/signup', '/auth?mode=signup'],
    ['/signup/admin', '/for-gym-owners'],
    ['/signup/member', '/auth?mode=signup'],
    ['/gyms/new', '/for-gym-owners'],
    ['/register-gym', '/for-gym-owners'],
    ['/gym-select', '/gyms'],
    ['/kiosk/signup', '/kiosk'],
  ])('%s permanently maps to %s', (source, expected) => {
    const redirect = LEGACY_AUTH_REDIRECTS.find((entry) => source.match(entry.pattern));
    const match = redirect ? source.match(redirect.pattern) : null;
    expect(redirect && match ? redirect.target(match, new URL(`https://stren.app${source}`)) : null).toBe(expected);
  });
});

describe('middleware matcher', () => {
  it('does not intercept Vercel telemetry assets', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test('/_vercel/insights/script.js')).toBe(false);
    expect(matcher.test('/admin/members')).toBe(true);
  });
});
