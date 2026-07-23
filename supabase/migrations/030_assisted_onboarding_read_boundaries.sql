-- Phase 2 application support for Assisted Onboarding.
-- These read boundaries keep platform metadata behind the operator JWT; the
-- service-role client remains limited to Auth and Storage in application code.

CREATE OR REPLACE FUNCTION public.get_platform_claim_invite(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'platform admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'gymName', g.name,
    'ownerEmail', i.invited_email,
    'ownerName', i.invited_name,
    'expiresAt', i.expires_at,
    'deliveryStatus', i.delivery_status
  )
  INTO v_result
  FROM public.gym_claim_invites i
  JOIN public.gyms g ON g.id = i.gym_id
  WHERE i.gym_id = p_gym_id
    AND i.consumed_at IS NULL
    AND i.superseded_at IS NULL;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_claim_invite(UUID)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_claim_invite(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_platform_account_resolution(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'platform admin access required' USING ERRCODE = '42501';
  END IF;
  IF v_email = '' OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid account email' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'exists', (p.id IS NOT NULL),
    'ownsOrManagesGymCount', COALESCE(COUNT(gu.gym_id) FILTER (
      WHERE gu.status IN ('active', 'pending')
        AND gu.role IN ('owner', 'admin', 'staff')
    ), 0),
    'pendingInvite', (
      SELECT jsonb_build_object(
        'gymName', g.name,
        'expiresAt', i.expires_at
      )
      FROM public.gym_claim_invites i
      JOIN public.gyms g ON g.id = i.gym_id
      WHERE i.invited_email = v_email
        AND i.consumed_at IS NULL
        AND i.superseded_at IS NULL
      ORDER BY i.created_at DESC
      LIMIT 1
    )
  )
  INTO v_result
  FROM public.profiles p
  LEFT JOIN public.gym_users gu ON gu.user_id = p.id
  WHERE lower(p.email) = v_email
  GROUP BY p.id;

  RETURN COALESCE(v_result, jsonb_build_object(
    'exists', false,
    'ownsOrManagesGymCount', 0,
    'pendingInvite', NULL
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_account_resolution(TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_account_resolution(TEXT)
  TO authenticated;

-- Extend the protected-definition contract without changing the Phase 1
-- hashes. This read boundary is security-sensitive and must drift-detect like
-- the provisioning and claim functions it accompanies.
DO $$
BEGIN
  IF to_regprocedure('public.deployment_protected_definition_hashes_029()') IS NULL
     AND to_regprocedure('public.deployment_protected_definition_hashes()') IS NOT NULL THEN
    ALTER FUNCTION public.deployment_protected_definition_hashes()
      RENAME TO deployment_protected_definition_hashes_029;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.deployment_protected_definition_hashes()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.deployment_protected_definition_hashes_029()
    || COALESCE((
      SELECT jsonb_object_agg(
        target.key,
        encode(
          extensions.digest(
            convert_to(regexp_replace(trim(target.definition), '\s+', ' ', 'g'), 'UTF8'),
            'sha256'
          ),
          'hex'
        )
      )
      FROM (
        SELECT key, pg_get_functiondef(to_regprocedure(identity)) AS definition
        FROM (VALUES
          ('function:get_platform_claim_invite', 'public.get_platform_claim_invite(uuid)'),
          ('function:get_platform_account_resolution', 'public.get_platform_account_resolution(text)')
        ) AS target(key, identity)
      ) AS target
    ), '{}'::JSONB);
$$;

REVOKE ALL ON FUNCTION public.deployment_protected_definition_hashes()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deployment_protected_definition_hashes() TO service_role;
