-- 012 — Login / gym-search / password-reset bug fixes
-- 1. New RPC: check_gym_membership — used by LoginForm to gate forgot-password to
--    members of the current gym before sending a reset link.
-- 2. Drop tagline-gated publish constraint so gyms without a tagline are searchable.

-- ─── 1. check_gym_membership ──────────────────────────────────────────────────
-- Returns true iff an email address belongs to a non-rejected member of the given gym code.
-- SECURITY DEFINER so it can read profiles/auth.users without exposing rows.
-- Returns a plain boolean — no PII is returned.
CREATE OR REPLACE FUNCTION public.check_gym_membership(
  p_email  text,
  p_gym_code text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id  uuid;
  v_count   int;
BEGIN
  -- Look up gym by code (anon-readable via SECURITY DEFINER get_gym_by_code pattern)
  SELECT id INTO v_gym_id
  FROM public.gyms
  WHERE code = p_gym_code
  LIMIT 1;

  IF v_gym_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = lower(trim(p_email))
    AND p.gym_id = v_gym_id
    AND (p.status IS NULL OR p.status <> 'rejected');

  RETURN v_count > 0;
END;
$$;

-- Revoke public/anon execute; allow anon and authenticated (needed for the login page
-- which uses the anon key before the user is signed in).
REVOKE ALL ON FUNCTION public.check_gym_membership(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_gym_membership(text, text) TO anon, authenticated;

-- ─── 2. Drop tagline-gated publish constraint ─────────────────────────────────
-- Migration 008 added gyms_publish_requires_tagline, which forced is_published=FALSE
-- for any gym without a tagline and prevented such gyms from appearing in search.
-- The webpage fallback design that required this is no longer used, so we drop it.

ALTER TABLE public.gyms
  DROP CONSTRAINT IF EXISTS gyms_publish_requires_tagline;

-- Re-publish any gyms that were forced unpublished solely because they had no tagline.
-- (is_published was deliberately set false by 008 for those rows; restore them.)
UPDATE public.gyms
SET is_published = TRUE
WHERE is_published IS FALSE
  AND (tagline IS NULL OR btrim(tagline) = '');

-- Ensure the column default is TRUE so new gyms are discoverable from creation.
ALTER TABLE public.gyms
  ALTER COLUMN is_published SET DEFAULT TRUE;
