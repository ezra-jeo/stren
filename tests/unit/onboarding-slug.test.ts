import { describe, expect, it } from 'vitest';
import { slugify, validateSlugFormat, SLUG_PATTERN, RESERVED_SLUGS } from '@/lib/onboarding/slug';

describe('slugify', () => {
  it('lowercases, replaces non-alphanumerics with hyphens, and trims edges', () => {
    expect(slugify('Iron Fitness Gym!')).toBe('iron-fitness-gym');
    expect(slugify('  Leading/Trailing  ')).toBe('leading-trailing');
    expect(slugify('Multiple---Hyphens')).toBe('multiple-hyphens');
  });

  it('caps length at 32 characters', () => {
    const long = 'a'.repeat(50);
    expect(slugify(long).length).toBeLessThanOrEqual(32);
  });
});

describe('validateSlugFormat (mirrors migration 020/027 server rule)', () => {
  it('accepts a well-formed slug', () => {
    expect(validateSlugFormat('iron-fitness-gym').valid).toBe(true);
  });

  it('rejects too-short slugs', () => {
    expect(validateSlugFormat('ab').valid).toBe(false);
  });

  it('rejects double hyphens and trailing hyphens', () => {
    expect(validateSlugFormat('iron--gym').valid).toBe(false);
    expect(validateSlugFormat('iron-gym-').valid).toBe(false);
  });

  it('rejects reserved words', () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(validateSlugFormat(reserved).valid).toBe(false);
    }
  });

  it('matches the exact regex used by the server RPCs', () => {
    expect(SLUG_PATTERN.test('gym')).toBe(true); // format-valid; reserved word rejected separately
    expect(SLUG_PATTERN.test('g')).toBe(false);
    expect(SLUG_PATTERN.test('Gym-Name')).toBe(false);
  });
});
