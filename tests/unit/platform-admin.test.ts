import { describe, expect, it } from 'vitest';
import {
  isPlatformAdminUser,
  provisioningRequestFingerprint,
} from '@/lib/platform-admin';

describe('platform-admin boundary', () => {
  it('accepts only the server-controlled app_metadata platform claim', () => {
    expect(isPlatformAdminUser({ app_metadata: { platform_role: 'platform_admin' } } as never)).toBe(true);
    expect(isPlatformAdminUser({ app_metadata: { platform_role: 'owner' } } as never)).toBe(false);
    expect(isPlatformAdminUser({ app_metadata: {}, user_metadata: { platform_role: 'platform_admin' } } as never)).toBe(false);
    expect(isPlatformAdminUser(null)).toBe(false);
  });

  it('produces the same request fingerprint regardless of object key order', () => {
    expect(provisioningRequestFingerprint({ gym: { name: 'A', slug: 'a' }, owner: 'one' }))
      .toBe(provisioningRequestFingerprint({ owner: 'one', gym: { slug: 'a', name: 'A' } }));
    expect(provisioningRequestFingerprint({ slug: 'a' }))
      .not.toBe(provisioningRequestFingerprint({ slug: 'b' }));
  });
});
