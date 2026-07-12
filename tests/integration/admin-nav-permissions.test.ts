import { describe, expect, it } from 'vitest';
import { visibleAdminNav } from '@/components/admin/admin-nav-items';
import { accessFromRoleDefaults, buildAccess } from '@/lib/access';
import { defaultFeatureFlags } from '@/lib/features';

const hrefs = (access: Parameters<typeof visibleAdminNav>[0]) => visibleAdminNav(access).map((i) => i.href);

describe('admin nav filtering (§7.9 / §6 client table)', () => {
  it('owner sees every nav item', () => {
    const nav = hrefs(accessFromRoleDefaults('owner', 'g'));
    expect(nav).toContain('/admin/gym-profile');
    expect(nav).toContain('/admin/access');
    expect(nav).toContain('/admin/join-code');
    expect(nav).toContain('/kiosk');
    expect(nav).toHaveLength(11);
  });

  it('admin sees operations but NOT Gym Page or People & access', () => {
    const nav = hrefs(accessFromRoleDefaults('admin', 'g'));
    expect(nav).not.toContain('/admin/gym-profile');
    expect(nav).not.toContain('/admin/access');
    expect(nav).toEqual([
      '/admin', '/admin/members', '/admin/join-code', '/admin/payments', '/admin/plans',
      '/admin/promos', '/admin/announcements', '/admin/reports', '/kiosk',
    ]);
  });

  it('staff sees only Members and Kiosk', () => {
    expect(hrefs(accessFromRoleDefaults('staff', 'g'))).toEqual(['/admin/members', '/admin/join-code', '/kiosk']);
  });

  it('a granted Studio switch reveals Gym Page for an admin', () => {
    const access = buildAccess(
      'admin',
      'g',
      [{ permission: 'gym_page:view', granted: true }, { permission: 'gym_page:edit', granted: true }],
      defaultFeatureFlags(),
    );
    expect(hrefs(access)).toContain('/admin/gym-profile');
  });

  it('a disabled feature hides its nav item even with the permission', () => {
    const access = buildAccess('admin', 'g', [], { ...defaultFeatureFlags(), kiosk_checkin: false });
    expect(hrefs(access)).not.toContain('/kiosk');
  });
});
