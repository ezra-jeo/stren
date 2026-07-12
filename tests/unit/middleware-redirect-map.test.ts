import { describe, expect, it } from 'vitest';
import { LEGACY_AUTH_REDIRECTS } from '@/middleware';

describe('legacy auth redirect map', () => {
  it.each([
    ['/gym/ABC/login', '/login?gym=ABC'],
    ['/gym/ABC/signup', '/signup?gym=ABC'],
    ['/signup/admin', '/gyms/new'],
    ['/signup/member', '/signup'],
    ['/gym-select', '/gyms'],
    ['/kiosk/signup', '/kiosk'],
  ])('%s permanently maps to %s', (source, expected) => {
    const redirect = LEGACY_AUTH_REDIRECTS.find((entry) => source.match(entry.pattern));
    const match = redirect ? source.match(redirect.pattern) : null;
    expect(redirect && match ? redirect.target(match) : null).toBe(expected);
  });
});
