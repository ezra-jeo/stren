import { describe, expect, it } from 'vitest';
import { mapCreateGymError, validateAccountSignup } from '@/lib/auth-action-validation';

describe('auth action validation and error mapping', () => {
  it('rejects incomplete account signup input', () => {
    expect(validateAccountSignup({ name: 'A', email: 'bad', password: 'short' })).toBe('Enter your full name.');
    expect(validateAccountSignup({ name: 'Alex', email: 'bad', password: 'long-enough' })).toBe('Enter a valid email address.');
    expect(validateAccountSignup({ name: 'Alex', email: 'a@b.com', password: 'short' })).toContain('8 characters');
    expect(validateAccountSignup({ name: 'Alex', email: 'a@b.com', password: 'long-enough' })).toBeNull();
  });

  it('maps database guard errors to plain language', () => {
    expect(mapCreateGymError('That gym code is reserved')).toContain('reserved');
    expect(mapCreateGymError('duplicate key value')).toContain('already taken');
    expect(mapCreateGymError('Publish one of your gyms before creating another')).toContain('Publish one');
  });
});
