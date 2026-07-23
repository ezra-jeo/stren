import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCESS_SWITCHES,
  accessSwitchesToFeatureFlags,
  ownerSchema,
} from '@/lib/onboarding/schemas';

describe('Assisted Onboarding security-boundary draft', () => {
  it('offers only private-by-default, approved operational switches', () => {
    expect(Object.keys(DEFAULT_ACCESS_SWITCHES).sort()).toEqual([
      'generateInviteQr', 'kioskCheckin', 'occupancyCount', 'staffManualCheckin',
    ]);
    expect(accessSwitchesToFeatureFlags(DEFAULT_ACCESS_SWITCHES)).toEqual({
      kiosk_checkin: true,
      staff_manual_checkin: true,
      occupancy_count: true,
    });
  });

  it('cannot designate a non-owner claimant', () => {
    expect(ownerSchema.safeParse({
      name: 'A Owner', email: 'owner@example.com', mobile: '09171234567', role: 'admin', consentMethod: 'email',
    }).success).toBe(false);
  });
});
