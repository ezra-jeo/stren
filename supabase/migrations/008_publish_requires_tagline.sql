-- 007 - Require tagline for published gyms
-- Ensure existing invalid rows are made compliant before adding the check.
UPDATE public.gyms
SET is_published = FALSE
WHERE is_published IS TRUE
  AND (tagline IS NULL OR btrim(tagline) = '');

ALTER TABLE public.gyms
  DROP CONSTRAINT IF EXISTS gyms_publish_requires_tagline;

ALTER TABLE public.gyms
  ADD CONSTRAINT gyms_publish_requires_tagline
  CHECK (
    is_published IS NOT TRUE
    OR (tagline IS NOT NULL AND btrim(tagline) <> '')
  );
