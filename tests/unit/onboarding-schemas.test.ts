import { describe, expect, it } from 'vitest';
import {
  PH_MOBILE_REGEX, normalizePhMobile, gymStepSchema, ownerStaffStepSchema,
  planDurationDays, plansStepSchema, validateOperatingHours, serializeOperatingHours,
  DEFAULT_OPERATING_HOURS, accessSwitchesToFeatureFlags, DEFAULT_ACCESS_SWITCHES,
} from '@/lib/onboarding/schemas';

describe('PH mobile validation', () => {
  it.each([
    '09171234567', '0917 123 4567', '+639171234567', '+63917 123 4567',
  ])('accepts %s', (value) => {
    expect(PH_MOBILE_REGEX.test(value.replace(/\s/g, ''))).toBe(true);
  });

  it.each([
    '08171234567', // wrong prefix
    '091712345',   // too short
    '+639171234567890', // too long
    'not-a-number',
  ])('rejects %s', (value) => {
    expect(PH_MOBILE_REGEX.test(value)).toBe(false);
  });

  it('normalizes 09XX to +639XX and leaves +63 untouched', () => {
    expect(normalizePhMobile('0917 123 4567')).toBe('+639171234567');
    expect(normalizePhMobile('+639171234567')).toBe('+639171234567');
  });
});

describe('gymStepSchema', () => {
  it('rejects an invalid slug format', () => {
    const result = gymStepSchema.safeParse({ gymName: 'Iron Fitness', branchName: '', address: 'Manila', slug: 'a' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid draft', () => {
    const result = gymStepSchema.safeParse({ gymName: 'Iron Fitness', branchName: 'Main', address: 'Manila', slug: 'iron-fitness' });
    expect(result.success).toBe(true);
  });
});

describe('ownerStaffStepSchema duplicate-email guard', () => {
  const base = {
    owner: { name: 'Jane Owner', email: 'jane@example.com', mobile: '+639171234567', role: 'owner' as const, consentMethod: 'in_person' as const },
  };

  it('rejects a staff email that duplicates the owner email', () => {
    const result = ownerStaffStepSchema.safeParse({
      ...base,
      staff: [{ id: '1', name: 'Staff One', email: 'jane@example.com', mobile: '', role: 'staff' as const, inviteEnabled: true }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts distinct emails', () => {
    const result = ownerStaffStepSchema.safeParse({
      ...base,
      staff: [{ id: '1', name: 'Staff One', email: 'staff@example.com', mobile: '', role: 'staff' as const, inviteEnabled: true }],
    });
    expect(result.success).toBe(true);
  });
});

describe('plan duration conversion (stored as duration_days)', () => {
  it('converts months to 30-day multiples', () => {
    expect(planDurationDays({ durationValue: 1, durationUnit: 'months' })).toBe(30);
    expect(planDurationDays({ durationValue: 3, durationUnit: 'months' })).toBe(90);
  });

  it('passes days through unchanged', () => {
    expect(planDurationDays({ durationValue: 14, durationUnit: 'days' })).toBe(14);
  });
});

describe('plansStepSchema', () => {
  it('requires at least one plan', () => {
    expect(plansStepSchema.safeParse([]).success).toBe(false);
  });
});

describe('operating hours', () => {
  it('defaults to 5:00 AM - 10:00 PM every day', () => {
    for (const day of Object.keys(DEFAULT_OPERATING_HOURS)) {
      expect(DEFAULT_OPERATING_HOURS[day as keyof typeof DEFAULT_OPERATING_HOURS]).toEqual({ closed: false, open: '05:00', close: '22:00' });
    }
    const serialized = serializeOperatingHours(DEFAULT_OPERATING_HOURS);
    expect(serialized.Monday).toBe('5:00 AM - 10:00 PM');
  });

  it('requires at least one open day', () => {
    const allClosed = Object.fromEntries(
      Object.keys(DEFAULT_OPERATING_HOURS).map((day) => [day, { closed: true, open: '', close: '' }]),
    ) as typeof DEFAULT_OPERATING_HOURS;
    expect(validateOperatingHours(allClosed)).toMatch(/at least one day/i);
  });

  it('rejects closing time not after opening time', () => {
    const bad = { ...DEFAULT_OPERATING_HOURS, mon: { closed: false, open: '10:00', close: '09:00' } };
    expect(validateOperatingHours(bad)).toMatch(/after opening time/i);
  });

  it('passes for the valid default', () => {
    expect(validateOperatingHours(DEFAULT_OPERATING_HOURS)).toBeNull();
  });
});

describe('accessSwitchesToFeatureFlags', () => {
  it('maps only the approved stored switches to their feature keys', () => {
    expect(accessSwitchesToFeatureFlags(DEFAULT_ACCESS_SWITCHES)).toEqual({
      kiosk_checkin: true,
      staff_manual_checkin: true,
      occupancy_count: true,
    });
  });
});

