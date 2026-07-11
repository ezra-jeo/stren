import { describe, expect, it } from 'vitest';
import {
  FEATURE_CATALOG,
  defaultFeatureFlags,
  isFeatureEnabled,
  type FeatureKey,
} from '@/lib/features';

describe('FEATURE_CATALOG — §4 defaults', () => {
  it('has 12 entries: 8 available on, 4 coming_soon off', () => {
    expect(FEATURE_CATALOG).toHaveLength(12);
    const available = FEATURE_CATALOG.filter((f) => f.status === 'available');
    const coming = FEATURE_CATALOG.filter((f) => f.status === 'coming_soon');
    expect(available).toHaveLength(8);
    expect(coming).toHaveLength(4);
    expect(available.every((f) => f.defaultEnabled)).toBe(true);
    expect(coming.every((f) => !f.defaultEnabled)).toBe(true);
  });

  it('marks exactly the three public-surface features', () => {
    const publicKeys = FEATURE_CATALOG.filter((f) => f.publicSurface).map((f) => f.key).sort();
    expect(publicKeys).toEqual(['public_location', 'public_pricing', 'public_team']);
  });

  it('the four teasers are the coming_soon group', () => {
    const coming = FEATURE_CATALOG.filter((f) => f.group === 'coming_soon').map((f) => f.key);
    expect(coming).toEqual(['trainer_bookings', 'friends_chat', 'workout_log', 'session_posts']);
  });

  it('every entry carries a label and effect line', () => {
    for (const def of FEATURE_CATALOG) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.effect.length).toBeGreaterThan(0);
    }
  });
});

describe('isFeatureEnabled', () => {
  it('missing row/key falls back to the catalog default', () => {
    expect(isFeatureEnabled(null, 'member_feed')).toBe(true);
    expect(isFeatureEnabled(undefined, 'leaderboards')).toBe(true);
    expect(isFeatureEnabled({}, 'public_pricing')).toBe(true);
  });

  it('an explicit stored value wins over the default', () => {
    expect(isFeatureEnabled({ leaderboards: false }, 'leaderboards')).toBe(false);
    expect(isFeatureEnabled({ member_feed: false }, 'member_feed')).toBe(false);
  });

  it('coming_soon teasers are never enabled, even with a stored true', () => {
    for (const key of ['trainer_bookings', 'friends_chat', 'workout_log', 'session_posts'] as FeatureKey[]) {
      expect(isFeatureEnabled(null, key)).toBe(false);
      expect(isFeatureEnabled({ [key]: true }, key)).toBe(false);
    }
  });
});

describe('defaultFeatureFlags', () => {
  it('mirrors the catalog defaults', () => {
    const flags = defaultFeatureFlags();
    for (const def of FEATURE_CATALOG) {
      expect(flags[def.key]).toBe(def.defaultEnabled);
    }
  });
});
