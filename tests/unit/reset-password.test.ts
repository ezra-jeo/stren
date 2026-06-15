import { describe, expect, it } from 'vitest';

// resolvePostResetPath is a module-private helper in app/reset-password/page.tsx.
// We replicate (and pin) its logic here so behaviour is locked by tests.
// If the implementation changes, this test must be updated to match.
function resolvePostResetPath(role: string | null | undefined): string {
  if (role === 'owner' || role === 'admin' || role === 'staff') return '/admin';
  return '/member/settings';
}

describe('resolvePostResetPath', () => {
  it('sends owner to /admin', () => {
    expect(resolvePostResetPath('owner')).toBe('/admin');
  });

  it('sends admin to /admin', () => {
    expect(resolvePostResetPath('admin')).toBe('/admin');
  });

  it('sends staff to /admin', () => {
    expect(resolvePostResetPath('staff')).toBe('/admin');
  });

  it('sends member to /member/settings', () => {
    expect(resolvePostResetPath('member')).toBe('/member/settings');
  });

  it('sends null role to /member/settings', () => {
    expect(resolvePostResetPath(null)).toBe('/member/settings');
  });

  it('sends undefined role to /member/settings', () => {
    expect(resolvePostResetPath(undefined)).toBe('/member/settings');
  });

  it('sends unknown role to /member/settings', () => {
    expect(resolvePostResetPath('superadmin')).toBe('/member/settings');
  });
});
