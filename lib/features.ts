/**
 * Feature toggle catalog — pure source of truth (ImplementationPlan.md §8.2 / §4).
 *
 * A feature toggle answers "is this capability enabled for this gym?" and is
 * checked BEFORE permissions. The SQL helper `gym_feature_enabled` mirrors these
 * defaults. Technical keys are NEVER rendered in owner UI — only label/effect.
 *
 * The four `coming_soon` entries are teasers: real catalog keys now (zero
 * migration work when they ship) but never enabled and never enforced.
 */

export type FeatureKey =
  | 'member_feed' | 'leaderboards' | 'public_team' | 'public_pricing'
  | 'public_location' | 'announcements' | 'promos' | 'kiosk_checkin' | 'rfid_kiosk'
  | 'staff_manual_checkin' | 'occupancy_count'
  | 'trainer_bookings' | 'friends_chat' | 'workout_log' | 'session_posts';

export interface FeatureDef {
  key: FeatureKey;
  label: string;                 // §4 label column, verbatim
  effect: string;                // §4 effect column, verbatim
  group: 'members' | 'public' | 'operations' | 'coming_soon';
  defaultEnabled: boolean;       // all true except the four coming_soon teasers
  status: 'available' | 'coming_soon';
  publicSurface: boolean;        // true: public_team, public_pricing, public_location
}

export const FEATURE_CATALOG: readonly FeatureDef[] = [
  // MEMBERS
  { key: 'member_feed', label: 'Show gym feed', effect: 'Members see a live feed of check-ins and milestones.', group: 'members', defaultEnabled: true, status: 'available', publicSurface: false },
  { key: 'leaderboards', label: 'Show leaderboard to members', effect: 'Members see workout and streak rankings.', group: 'members', defaultEnabled: true, status: 'available', publicSurface: false },
  // PUBLIC PAGE
  { key: 'public_team', label: 'Show trainers & team', effect: 'Your coaches appear on the public Contact page.', group: 'public', defaultEnabled: true, status: 'available', publicSurface: true },
  { key: 'public_pricing', label: 'Show pricing page', effect: 'Visitors can see your membership prices.', group: 'public', defaultEnabled: true, status: 'available', publicSurface: true },
  { key: 'public_location', label: 'Show location page', effect: 'Visitors can see your map and directions.', group: 'public', defaultEnabled: true, status: 'available', publicSurface: true },
  // OPERATIONS
  { key: 'announcements', label: 'Enable announcements', effect: 'You can post announcements that members see in notifications.', group: 'operations', defaultEnabled: true, status: 'available', publicSurface: false },
  { key: 'promos', label: 'Enable promos', effect: 'You can create promo discounts to apply to payments.', group: 'operations', defaultEnabled: true, status: 'available', publicSurface: false },
  { key: 'kiosk_checkin', label: 'Enable kiosk check-ins', effect: 'The front-desk kiosk can check members in and out.', group: 'operations', defaultEnabled: true, status: 'available', publicSurface: false },
  { key: 'rfid_kiosk', label: 'Enable RFID tap', effect: 'Authorized kiosk operators can check members in and out with assigned RFID cards.', group: 'operations', defaultEnabled: false, status: 'available', publicSurface: false },
  { key: 'staff_manual_checkin', label: 'Allow staff manual check-in', effect: 'Authorized staff can check in a verified member by name or account.', group: 'operations', defaultEnabled: true, status: 'available', publicSurface: false },
  { key: 'occupancy_count', label: 'Show kiosk occupancy count', effect: 'The kiosk can show the current count of open attendance sessions.', group: 'operations', defaultEnabled: true, status: 'available', publicSurface: false },
  // COMING SOON (teasers)
  { key: 'trainer_bookings', label: 'Trainer bookings', effect: 'Members can book sessions with your trainers, see their schedules, and chat with them.', group: 'coming_soon', defaultEnabled: false, status: 'coming_soon', publicSurface: false },
  { key: 'friends_chat', label: 'Friends & Chat', effect: 'Members can add friends and message each other.', group: 'coming_soon', defaultEnabled: false, status: 'coming_soon', publicSurface: false },
  { key: 'workout_log', label: 'Workout routines', effect: 'Members can record their own exercise routines.', group: 'coming_soon', defaultEnabled: false, status: 'coming_soon', publicSurface: false },
  { key: 'session_posts', label: 'Posts', effect: 'Members can share their gym sessions to the feed, like a social post.', group: 'coming_soon', defaultEnabled: false, status: 'coming_soon', publicSurface: false },
];

const FEATURE_BY_KEY: ReadonlyMap<FeatureKey, FeatureDef> = new Map(
  FEATURE_CATALOG.map((def) => [def.key, def]),
);

export function getFeatureDef(key: FeatureKey): FeatureDef | undefined {
  return FEATURE_BY_KEY.get(key);
}

export type FeatureFlags = Partial<Record<FeatureKey, boolean>>;

/**
 * Is a feature effectively on for a gym?
 * Missing row/key ⇒ catalog default. `coming_soon` teasers are never enabled,
 * regardless of any stored flag.
 */
export function isFeatureEnabled(flags: FeatureFlags | null | undefined, key: FeatureKey): boolean {
  const def = FEATURE_BY_KEY.get(key);
  if (!def) return false;
  if (def.status === 'coming_soon') return false;
  const stored = flags?.[key];
  if (typeof stored === 'boolean') return stored;
  return def.defaultEnabled;
}

/** Effective flags built purely from catalog defaults (used as the safe fallback). */
export function defaultFeatureFlags(): FeatureFlags {
  const flags: FeatureFlags = {};
  for (const def of FEATURE_CATALOG) flags[def.key] = def.defaultEnabled;
  return flags;
}
