import { z } from 'zod';
import { validateSlugFormat } from '@/lib/onboarding/slug';

// Philippine mobile: 09XX XXX XXXX or +639XX XXX XXXX.
export const PH_MOBILE_REGEX = /^(\+63|0)9\d{9}$/;

export function normalizePhMobile(input: string): string {
  const digits = input.replace(/[\s-]/g, '');
  if (digits.startsWith('+63')) return digits;
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  return digits;
}

// -- Step 1: Gym ---------------------------------------------------------

export const gymStepSchema = z.object({
  gymName: z.string().trim().min(2, 'Gym name must be at least 2 characters').max(120),
  branchName: z.string().trim().max(120).optional().or(z.literal('')),
  address: z.string().trim().min(1, 'Location is required').max(200),
  slug: z.string().trim().toLowerCase().refine(
    (value) => validateSlugFormat(value).valid,
    (value) => ({ message: validateSlugFormat(value).reason ?? 'Enter a valid URL' }),
  ),
});
export type GymStepData = z.infer<typeof gymStepSchema>;

// -- Step 2: Owner & Staff ------------------------------------------------

export const CONSENT_METHODS = ['in_person', 'phone', 'email'] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const ownerSchema = z.object({
  name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  mobile: z.string().trim().regex(PH_MOBILE_REGEX, 'Enter a valid PH mobile number (09XX XXX XXXX or +639XX XXX XXXX)'),
  role: z.literal('owner'),
  consentMethod: z.enum(CONSENT_METHODS, { message: 'Select how consent was obtained' }),
});
export type OwnerData = z.infer<typeof ownerSchema>;

export const staffEntrySchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  mobile: z.string().trim().max(20).optional().or(z.literal('')),
  role: z.enum(['admin', 'staff']),
  inviteEnabled: z.boolean(),
});
export type StaffEntryData = z.infer<typeof staffEntrySchema>;

export const ownerStaffStepSchema = z.object({
  owner: ownerSchema,
  staff: z.array(staffEntrySchema),
}).superRefine((data, ctx) => {
  const seen = new Map<string, string>();
  const check = (email: string, path: (string | number)[]) => {
    const key = email.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', message: 'This email is already used elsewhere in this setup', path });
    }
    seen.set(key, path.join('.'));
  };
  check(data.owner.email, ['owner', 'email']);
  data.staff.forEach((entry, index) => check(entry.email, ['staff', index, 'email']));
});
export type OwnerStaffStepData = z.infer<typeof ownerStaffStepSchema>;

// -- Step 3: Plan & Access -------------------------------------------------

export const planEntrySchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Plan name is required').max(100),
  price: z.coerce.number().min(0, 'Price must be 0 or more'),
  durationValue: z.coerce.number().int().min(1, 'Duration must be at least 1'),
  durationUnit: z.enum(['days', 'months']),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  isActive: z.boolean(),
});
export type PlanEntryData = z.infer<typeof planEntrySchema>;

export function planDurationDays(entry: Pick<PlanEntryData, 'durationValue' | 'durationUnit'>): number {
  return entry.durationUnit === 'months' ? entry.durationValue * 30 : entry.durationValue;
}

export const plansStepSchema = z.array(planEntrySchema).min(1, 'At least one membership plan is required');

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}

export type OperatingHours = Record<DayKey, DayHours>;

export const DEFAULT_OPERATING_HOURS: OperatingHours = DAY_KEYS.reduce((acc, day) => {
  acc[day] = { closed: false, open: '05:00', close: '22:00' };
  return acc;
}, {} as OperatingHours);

export function validateOperatingHours(hours: OperatingHours): string | null {
  const openDays = DAY_KEYS.filter((day) => !hours[day].closed);
  if (openDays.length === 0) return 'At least one day must be open.';
  for (const day of openDays) {
    const { open, close } = hours[day];
    if (!open || !close) return `Set both opening and closing time for ${DAY_LABELS[day]}.`;
    if (open >= close) return `Closing time must be after opening time for ${DAY_LABELS[day]}.`;
  }
  return null;
}

/** Serializes to the existing free-text gyms.operating_hours JSONB shape. */
export function serializeOperatingHours(hours: OperatingHours): Record<string, string> {
  const result: Record<string, string> = {};
  for (const day of DAY_KEYS) {
    const entry = hours[day];
    result[DAY_LABELS[day]] = entry.closed ? 'Closed' : `${formatTime(entry.open)} - ${formatTime(entry.close)}`;
  }
  return result;
}

function formatTime(value: string): string {
  const [hourStr, minuteStr] = value.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr ?? '0');
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export interface AccessSwitches {
  kioskCheckin: boolean;
  generateInviteQr: boolean;
  staffManualCheckin: boolean;
  occupancyCount: boolean;
}

export const DEFAULT_ACCESS_SWITCHES: AccessSwitches = {
  kioskCheckin: true,
  generateInviteQr: true,
  staffManualCheckin: true,
  occupancyCount: true,
};

export function accessSwitchesToFeatureFlags(switches: AccessSwitches): Record<string, boolean> {
  return {
    kiosk_checkin: switches.kioskCheckin,
    staff_manual_checkin: switches.staffManualCheckin,
    occupancy_count: switches.occupancyCount,
  };
}

// -- Final provisioning payload (server-side re-validation; never trust the client draft as-is) --

export const importedMemberSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  contactNumber: z.string().trim().max(20).optional().or(z.literal('')),
});

export const provisionRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  gym: gymStepSchema,
  owner: ownerSchema,
  staff: z.array(staffEntrySchema),
  plans: plansStepSchema,
  operatingHours: z.record(z.enum(DAY_KEYS), z.object({ closed: z.boolean(), open: z.string(), close: z.string() })),
  switches: z.object({
    kioskCheckin: z.boolean(),
    generateInviteQr: z.boolean(),
    staffManualCheckin: z.boolean(),
    occupancyCount: z.boolean(),
  }),
  importedMembers: z.array(importedMemberSchema),
  logoDataUrl: z.string().nullable(),
}).superRefine((data, ctx) => {
  const seen = new Set<string>([data.owner.email, ...data.staff.map((s) => s.email)]);
  data.importedMembers.forEach((member, index) => {
    if (seen.has(member.email)) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate email with owner/staff', path: ['importedMembers', index, 'email'] });
    }
    seen.add(member.email);
  });
  const hoursError = validateOperatingHours(data.operatingHours as OperatingHours);
  if (hoursError) ctx.addIssue({ code: 'custom', message: hoursError, path: ['operatingHours'] });
});
export type ProvisionRequestData = z.infer<typeof provisionRequestSchema>;
