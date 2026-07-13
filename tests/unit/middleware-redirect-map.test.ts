import { describe, expect, it } from 'vitest';
import { LEGACY_AUTH_REDIRECTS } from '@/middleware';

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
