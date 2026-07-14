import { describe, expect, it } from 'vitest';
import { shouldPrefetchNavigation } from '@/lib/navigation-performance';

describe('intent-aware route prefetch policy', () => {
  it('prefetches on a normal connection but respects offline, data saver, and constrained networks', () => {
    expect(shouldPrefetchNavigation(undefined, true)).toBe(true);
    expect(shouldPrefetchNavigation({ saveData: false, effectiveType: '4g' }, true)).toBe(true);
    expect(shouldPrefetchNavigation({ saveData: true, effectiveType: '4g' }, true)).toBe(false);
    expect(shouldPrefetchNavigation({ saveData: false, effectiveType: '2g' }, true)).toBe(false);
    expect(shouldPrefetchNavigation({ saveData: false, effectiveType: 'slow-2g' }, true)).toBe(false);
    expect(shouldPrefetchNavigation({ saveData: false, effectiveType: '4g' }, false)).toBe(false);
  });
});
