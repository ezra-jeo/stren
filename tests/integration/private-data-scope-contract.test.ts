import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('private data scope contracts', () => {
  it('pins every members-page read and write to the exact active scope', () => {
    const code = source('app/admin/members/page.tsx');

    expect(code).not.toMatch(/profile(?:\?\.)?\.gymId/);
    expect(code).toContain('const gymId = activeScope.gymId');
    expect(code).toContain('activeMembersRequestRef.current === requestKey');
    expect(code).toContain('profilesError');
    expect(code).toContain('membershipsError');
  });

  it('separates manager and member notification rows and supports legacy member types', () => {
    const manager = source('components/notifications-panel.tsx');
    const member = source('components/member-notifications-panel.tsx');

    expect(manager).toContain(".eq('for_member', false)");
    expect(manager).not.toMatch(/profile(?:\?\.)?\.gymId/);
    expect(member).toContain('notification_type, type');
    expect(member).toContain('membership_verified');
    expect(member).not.toMatch(/profile(?:\?\.)?\.gymId/);
  });
});
