import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Gym Page Studio persistence contract', () => {
  it('stores focal and section settings and exposes them in the public payload', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/017_gym_cover_focal_and_sections.sql'),
      'utf8',
    );

    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS cover_focal JSONB NOT NULL DEFAULT '\{"x":50,"y":50\}'::jsonb/i,
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS section_visibility JSONB NOT NULL DEFAULT '\{"amenities":true,"hours":true,"contact":true\}'::jsonb/i,
    );
    for (const key of ['cover_focal', 'section_visibility', 'logo_path', 'cover_path']) {
      expect(sql).toContain(`'${key}'`);
    }
  });
});
