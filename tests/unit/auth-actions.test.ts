import { describe, expect, it } from 'vitest';
import { validateAccountSignup } from '@/lib/auth-action-validation';

describe('auth action validation and error mapping', () => {
  it('rejects incomplete account signup input', () => {
    expect(validateAccountSignup({ name: 'A', email: 'bad', password: 'short' })).toBe('Enter your full name.');
    expect(validateAccountSignup({ name: 'Alex', email: 'bad', password: 'long-enough' })).toBe('Enter a valid email address.');
    expect(validateAccountSignup({ name: 'Alex', email: 'a@b.com', password: 'short' })).toContain('8 characters');
    expect(validateAccountSignup({ name: 'Alex', email: 'a@b.com', password: 'long-enough' })).toBeNull();
  });
});
