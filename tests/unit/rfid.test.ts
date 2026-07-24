import { describe, expect, it } from 'vitest';
import { initialsForName, maskRfidUid, normalizeRfidUid } from '@/lib/rfid';

describe('RFID UID handling', () => {
  it('normalizes reader separators and case without changing identifier bytes', () => {
    expect(normalizeRfidUid('  04:ab-0C  19\n')).toBe('04AB0C19');
  });

  it('rejects malformed or implausibly short UIDs', () => {
    expect(normalizeRfidUid('abc')).toBeNull();
    expect(normalizeRfidUid('04GG19')).toBeNull();
  });

  it('only renders a masked suffix', () => {
    expect(maskRfidUid('04AB0C19')).toBe('•••• 0C19');
  });

  it('derives two initials from a member name', () => {
    expect(initialsForName('Bon Aquino')).toBe('BA');
    expect(initialsForName('Madonna')).toBe('M');
  });
});
