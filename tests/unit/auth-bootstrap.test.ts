import { describe, expect, it } from 'vitest';
import { shouldSkipAuthBootstrap } from '@/lib/auth-context';

describe('auth bootstrap route policy', () => {
  it('hydrates sessions on landing and public gym pages that expose authenticated actions', () => {
    expect(shouldSkipAuthBootstrap('/landing')).toBe(false);
    expect(shouldSkipAuthBootstrap('/gym/iron-house')).toBe(false);
  });

  it('still avoids competing session bootstraps on redirect and recovery surfaces', () => {
    expect(shouldSkipAuthBootstrap('/')).toBe(true);
    expect(shouldSkipAuthBootstrap('/auth')).toBe(true);
    expect(shouldSkipAuthBootstrap('/reset-password')).toBe(true);
    expect(shouldSkipAuthBootstrap('/gyms')).toBe(false);
  });
});
