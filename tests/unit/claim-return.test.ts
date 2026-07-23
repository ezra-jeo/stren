import { describe, expect, it } from 'vitest';
import { sanitizePostAuthReturn } from '@/lib/auth-return';

describe('bounded post-auth return', () => {
  it('accepts only a first-party claim path', () => {
    expect(sanitizePostAuthReturn('/claim/abc123')).toBe('/claim/abc123');
    expect(sanitizePostAuthReturn('/claim/abc123?next=/admin')).toBeNull();
    expect(sanitizePostAuthReturn('/admin')).toBeNull();
  });

  it('rejects external, protocol-relative, malformed, and nested destinations', () => {
    expect(sanitizePostAuthReturn('https://evil.example/claim/abc123')).toBeNull();
    expect(sanitizePostAuthReturn('//evil.example/claim/abc123')).toBeNull();
    expect(sanitizePostAuthReturn('/claim/abc/extra')).toBeNull();
    expect(sanitizePostAuthReturn(null)).toBeNull();
  });
});
