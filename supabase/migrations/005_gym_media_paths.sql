-- 005 — Store gym media as bucket-relative paths
-- Long-term fix: path-based media storage avoids environment-bound full URLs.

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS logo_path TEXT,
  ADD COLUMN IF NOT EXISTS cover_path TEXT;

-- Backfill path columns from legacy URL columns when possible.
UPDATE public.gyms
SET logo_path = NULLIF(
  regexp_replace(
    CASE
      WHEN logo_url LIKE '%/storage/v1/object/public/gym-assets/%'
        THEN split_part(logo_url, '/storage/v1/object/public/gym-assets/', 2)
      ELSE logo_url
    END,
    '\\?.*$',
    ''
  ),
  ''
)
WHERE logo_url IS NOT NULL
  AND (logo_path IS NULL OR logo_path = '');

UPDATE public.gyms
SET cover_path = NULLIF(
  regexp_replace(
    CASE
      WHEN cover_url LIKE '%/storage/v1/object/public/gym-assets/%'
        THEN split_part(cover_url, '/storage/v1/object/public/gym-assets/', 2)
      ELSE cover_url
    END,
    '\\?.*$',
    ''
  ),
  ''
)
WHERE cover_url IS NOT NULL
  AND (cover_path IS NULL OR cover_path = '');
