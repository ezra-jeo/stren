import { describe, expect, it } from 'vitest';
import { isPlatformAdminUser as middlewareIsPlatformAdminUser } from '@/middleware';
import { isPlatformAdminUser } from '@/lib/platform-admin';

describe('isPlatformAdminUser (lib/platform-admin.ts)', () => {
  it('approves only app_metadata.platform_role === "platform_admin"', () => {
    expect(isPlatformAdminUser({ app_metadata: { platform_role: 'platform_admin' } })).toBe(true);
  });

  it('rejects an authenticated user without the claim', () => {
    expect(isPlatformAdminUser({ app_metadata: {} })).toBe(false);
    expect(isPlatformAdminUser({ app_metadata: { platform_role: 'owner' } })).toBe(false);
  });

  it('rejects a client-spoofed user_metadata claim — only app_metadata is trusted', () => {
    expect(isPlatformAdminUser({
      app_metadata: {},
      // @ts-expect-error — verifying user_metadata is never consulted
      user_metadata: { platform_role: 'platform_admin' },
    })).toBe(false);
  });

  it('rejects null/undefined (unauthenticated)', () => {
    expect(isPlatformAdminUser(null)).toBe(false);
    expect(isPlatformAdminUser(undefined)).toBe(false);
  });
});

describe('middleware isPlatformAdminUser mirrors the lib helper', () => {
  it('agrees with lib/platform-admin.ts on the approval matrix', () => {
    const cases = [
      { app_metadata: { platform_role: 'platform_admin' } },
      { app_metadata: {} },
      { app_metadata: { platform_role: 'owner' } },
      null,
    ];
    for (const user of cases) {
      expect(middlewareIsPlatformAdminUser(user)).toBe(isPlatformAdminUser(user));
    }
  });
});
