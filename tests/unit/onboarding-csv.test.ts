import { describe, expect, it } from 'vitest';
import { parseMemberCsv, CSV_TEMPLATE_HEADER } from '@/lib/onboarding/csv';

describe('parseMemberCsv', () => {
  it('parses valid rows with the documented template columns', () => {
    const csv = `${CSV_TEMPLATE_HEADER}\nJuan Dela Cruz,juan@example.com,09171234567\nMaria Santos,maria@example.com,`;
    const result = parseMemberCsv(csv);
    expect(result.headerError).toBeNull();
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0]).toEqual({ row: 2, name: 'Juan Dela Cruz', email: 'juan@example.com', contactNumber: '09171234567' });
    expect(result.invalid).toHaveLength(0);
  });

  it('rejects a file missing required columns', () => {
    const result = parseMemberCsv('full_name,contact\nJuan,09171234567');
    expect(result.headerError).toMatch(/Missing required column/);
  });

  it('collects row-numbered errors for invalid rows without silently importing them', () => {
    const csv = `${CSV_TEMPLATE_HEADER}\n,bad-email,\nJuan Dela Cruz,juan@example.com,`;
    const result = parseMemberCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].row).toBe(2);
    expect(result.invalid[0].errors.length).toBeGreaterThan(0);
  });

  it('detects duplicate emails within the file and rejects the later row', () => {
    const csv = `${CSV_TEMPLATE_HEADER}\nJuan Dela Cruz,juan@example.com,\nJuan Duplicate,juan@example.com,`;
    const result = parseMemberCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
    expect(result.duplicateEmails).toContain('juan@example.com');
    expect(result.invalid[0].errors.some((e) => /Duplicate email/.test(e))).toBe(true);
  });

  it('rejects an empty file', () => {
    expect(parseMemberCsv('').headerError).toMatch(/empty/i);
  });

  it('handles quoted fields containing commas', () => {
    const csv = `${CSV_TEMPLATE_HEADER}\n"Dela Cruz, Juan",juan@example.com,`;
    const result = parseMemberCsv(csv);
    expect(result.valid[0].name).toBe('Dela Cruz, Juan');
  });
});
