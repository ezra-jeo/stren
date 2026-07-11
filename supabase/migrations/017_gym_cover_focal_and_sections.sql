-- Gym Page Studio metadata. This migration is intentionally safe to apply
-- before 015/016 in production even though clean resets use numeric order.

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS cover_focal JSONB NOT NULL DEFAULT '{"x":50,"y":50}'::jsonb;

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS section_visibility JSONB NOT NULL DEFAULT '{"amenities":true,"hours":true,"contact":true}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_gym_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym public.gyms%ROWTYPE;
  v_member_count INTEGER;
  v_public_team BOOLEAN := true;
  v_public_pricing BOOLEAN := true;
  v_public_location BOOLEAN := true;
  v_result JSONB;
BEGIN
  SELECT * INTO v_gym
  FROM public.gyms
  WHERE LOWER(code) = LOWER(p_code);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 017 may be rolled out before the feature-settings table. In that case all
  -- public surfaces retain their catalog-default enabled behavior.
  IF to_regclass('public.gym_feature_settings') IS NOT NULL THEN
    EXECUTE $query$
      SELECT
        COALESCE((flags ->> 'public_team')::boolean, true),
        COALESCE((flags ->> 'public_pricing')::boolean, true),
        COALESCE((flags ->> 'public_location')::boolean, true)
      FROM public.gym_feature_settings
      WHERE gym_id = $1
    $query$
    INTO v_public_team, v_public_pricing, v_public_location
    USING v_gym.id;
  END IF;

  v_public_team := COALESCE(v_public_team, true);
  v_public_pricing := COALESCE(v_public_pricing, true);
  v_public_location := COALESCE(v_public_location, true);

  SELECT COUNT(*) INTO v_member_count
  FROM public.profiles
  WHERE gym_id = v_gym.id
    AND status = 'active'
    AND role = 'member';

  v_result := jsonb_build_object(
    'id', v_gym.id,
    'name', v_gym.name,
    'code', v_gym.code,
    'address', v_gym.address,
    'phone', v_gym.phone,
    'tagline', v_gym.tagline,
    'description', v_gym.description,
    'logo_url', v_gym.logo_url,
    'cover_url', v_gym.cover_url,
    'logo_path', v_gym.logo_path,
    'cover_path', v_gym.cover_path,
    'cover_focal', v_gym.cover_focal,
    'section_visibility', v_gym.section_visibility,
    'brand_color', COALESCE(v_gym.brand_color, '#D4956A'),
    'secondary_color', v_gym.secondary_color,
    'operating_hours', v_gym.operating_hours,
    'amenities', v_gym.amenities,
    'social_links', v_gym.social_links,
    'member_count', v_member_count,
    -- Preserve the pre-016 visibility behavior until the separately approved
    -- is_published correction is applied in migration 016.
    'is_published', (v_gym.tagline IS NOT NULL AND TRIM(v_gym.tagline) <> ''),
    'features', jsonb_build_object(
      'public_team', v_public_team,
      'public_pricing', v_public_pricing,
      'public_location', v_public_location
    )
  );

  IF v_public_team THEN
    v_result := v_result || jsonb_build_object('team_members', v_gym.team_members);
  END IF;
  IF v_public_pricing THEN
    v_result := v_result || jsonb_build_object('pricing_packages', v_gym.pricing_packages);
  END IF;
  IF v_public_location THEN
    v_result := v_result || jsonb_build_object(
      'map_embed_url', v_gym.map_embed_url,
      'directions', v_gym.directions
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gym_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gym_by_code(TEXT) TO anon, authenticated, service_role;
