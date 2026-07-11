import { describe, expect, it } from 'vitest';
import { isSameGymScope } from '@/app/api/admin/revalidate-gym/route';

describe('gym cache revalidation authorization', () => {
  it('allows only the caller profile gym to be revalidated', () => {
    expect(isSameGymScope('gym-a', 'gym-a')).toBe(true);
    expect(isSameGymScope('gym-a', 'gym-b')).toBe(false);
    expect(isSameGymScope(null, 'gym-a')).toBe(false);
    expect(isSameGymScope('gym-a', null)).toBe(false);
  });
});
