-- Assisted Onboarding foundation.
--
-- This migration is written against the effective 028 schema.  It adds only
-- the database/auth spine; the wizard and delivery routes are a later phase.
-- Platform authority remains app_metadata.platform_role=platform_admin and
-- all authorization-sensitive calls require the operator's user JWT.

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS branch_name TEXT;

CREATE TABLE IF NOT EXISTS public.gym_claim_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE RESTRICT,
  invited_email TEXT NOT NULL,
  invited_name TEXT,
  invited_role public.user_role NOT NULL DEFAULT 'owner',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  consent_method TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gym_claim_invites_owner_only
    CHECK (invited_role = 'owner'),
  CONSTRAINT gym_claim_invites_delivery_status
    CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  CONSTRAINT gym_claim_invites_consent_method
    CHECK (consent_method IN ('in_person', 'phone', 'email')),
  CONSTRAINT gym_claim_invites_hash_format
    CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS gym_claim_invites_one_active_per_gym
  ON public.gym_claim_invites(gym_id)
  WHERE consumed_at IS NULL AND superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS gym_claim_invites_gym_idx
  ON public.gym_claim_invites(gym_id, created_at DESC);

ALTER TABLE public.gym_claim_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gym_claim_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.gym_claim_invites TO service_role;

CREATE TABLE IF NOT EXISTS public.provisioning_runs (
  idempotency_key UUID PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'auth_pending',
  auth_resolution JSONB NOT NULL DEFAULT '{}'::JSONB,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL,
  result JSONB,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provisioning_runs_status
    CHECK (status IN ('auth_pending', 'auth_ready', 'provisioning', 'provisioned', 'failed')),
  CONSTRAINT provisioning_runs_fingerprint
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT provisioning_runs_auth_resolution_object
    CHECK (jsonb_typeof(auth_resolution) = 'object')
);

ALTER TABLE public.provisioning_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provisioning_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.provisioning_runs TO service_role;

CREATE OR REPLACE FUNCTION public.gym_feature_enabled(
  p_feature TEXT,
  p_gym_id UUID DEFAULT public.get_gym_id()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_default BOOLEAN;
  v_stored TEXT;
BEGIN
  v_default := CASE p_feature
    WHEN 'member_feed' THEN true
    WHEN 'leaderboards' THEN true
    WHEN 'public_team' THEN true
    WHEN 'public_pricing' THEN true
    WHEN 'public_location' THEN true
    WHEN 'announcements' THEN true
    WHEN 'promos' THEN true
    WHEN 'kiosk_checkin' THEN true
    WHEN 'staff_manual_checkin' THEN true
    WHEN 'occupancy_count' THEN true
    WHEN 'trainer_bookings' THEN false
    WHEN 'friends_chat' THEN false
    WHEN 'workout_log' THEN false
    WHEN 'session_posts' THEN false
    ELSE false
  END;

  IF p_feature IN ('trainer_bookings', 'friends_chat', 'workout_log', 'session_posts')
     OR p_gym_id IS NULL THEN
    RETURN v_default;
  END IF;

  SELECT flags ->> p_feature INTO v_stored
  FROM public.gym_feature_settings
  WHERE gym_id = p_gym_id;

  IF v_stored IN ('true', 'false') THEN
    RETURN v_stored::BOOLEAN;
  END IF;

  RETURN v_default;
END;
$$;

-- Keep the hardened kiosk boundary and add only explicitly approved controls.
CREATE OR REPLACE FUNCTION public.kiosk_checkin_by_member(p_member_id UUID, p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_qr TEXT;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id)
     OR NOT public.has_gym_permission('members:manage', p_gym_id)
     OR NOT public.gym_feature_enabled('staff_manual_checkin', p_gym_id) THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Manager verification is required');
  END IF;

  SELECT p.qr_code INTO v_qr
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  WHERE gu.gym_id = p_gym_id
    AND gu.user_id = p_member_id
    AND gu.role = 'member'
    AND gu.status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Member not found');
  END IF;

  -- kiosk_checkin remains the migration-027 hardened implementation, so its
  -- effective-membership gate, tenant checks, locking, attribution, and audit
  -- behavior are not bypassed by this manual lookup path.
  RETURN public.kiosk_checkin(v_qr, p_gym_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_get_occupancy(p_gym_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF NOT public.gym_feature_enabled('occupancy_count', p_gym_id) THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.attendance
  WHERE gym_id = p_gym_id AND check_out IS NULL;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kiosk_checkin_by_member(UUID, UUID)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.kiosk_get_occupancy(UUID)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.kiosk_checkin_by_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_get_occupancy(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_gym_id UUID := public.get_gym_id();
  v_permissions JSONB;
BEGIN
  SELECT gu.role INTO v_role
  FROM public.gym_users gu
  WHERE gu.user_id = auth.uid()
    AND gu.gym_id = v_gym_id
    AND gu.status = 'active';
  IF NOT FOUND OR v_gym_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT COALESCE(jsonb_agg(keys.permission ORDER BY keys.permission), '[]'::jsonb)
  INTO v_permissions
  FROM (
    SELECT permission FROM public.gym_role_permission_defaults WHERE role = 'owner'
  ) keys
  WHERE public.has_gym_permission(keys.permission, v_gym_id);

  RETURN jsonb_build_object(
    'role', v_role::TEXT,
    'gym_id', v_gym_id,
    'permissions', v_permissions,
    'features', jsonb_build_object(
      'member_feed', public.gym_feature_enabled('member_feed', v_gym_id),
      'leaderboards', public.gym_feature_enabled('leaderboards', v_gym_id),
      'public_team', public.gym_feature_enabled('public_team', v_gym_id),
      'public_pricing', public.gym_feature_enabled('public_pricing', v_gym_id),
      'public_location', public.gym_feature_enabled('public_location', v_gym_id),
      'announcements', public.gym_feature_enabled('announcements', v_gym_id),
      'promos', public.gym_feature_enabled('promos', v_gym_id),
      'kiosk_checkin', public.gym_feature_enabled('kiosk_checkin', v_gym_id),
      'staff_manual_checkin', public.gym_feature_enabled('staff_manual_checkin', v_gym_id),
      'occupancy_count', public.gym_feature_enabled('occupancy_count', v_gym_id),
      'trainer_bookings', false,
      'friends_chat', false,
      'workout_log', false,
      'session_posts', false
    )
  );
END;
$$;

-- Persist the non-transactional Auth resolution so a route can resume after
-- an Auth user was created but the Postgres transaction was not reached.
CREATE OR REPLACE FUNCTION public.record_platform_provisioning_auth_state(
  p_idempotency_key UUID,
  p_request_fingerprint TEXT,
  p_status TEXT,
  p_auth_resolution JSONB,
  p_failure_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.provisioning_runs%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'platform admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL
     OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_status NOT IN ('auth_pending', 'auth_ready', 'failed')
     OR jsonb_typeof(p_auth_resolution) <> 'object' THEN
    RAISE EXCEPTION 'invalid provisioning auth state' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_auth_resolution) AS field(key)
    WHERE field.key NOT IN (
      'ownerUserId', 'staffUserIds', 'importedMemberUserIds',
      'createdUserIds', 'unresolvedEmails'
    )
  ) THEN
    RAISE EXCEPTION 'raw claim credentials are not persisted' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.provisioning_runs
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint <> p_request_fingerprint THEN
      RAISE EXCEPTION 'provisioning idempotency key was reused with a different request'
        USING ERRCODE = '22023';
    END IF;
    IF v_existing.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'provisioning request belongs to another operator'
        USING ERRCODE = '42501';
    END IF;
    IF v_existing.status = 'provisioned' THEN
      RETURN jsonb_build_object('status', v_existing.status, 'result', v_existing.result);
    END IF;

    UPDATE public.provisioning_runs
    SET status = p_status,
        auth_resolution = p_auth_resolution,
        failure_code = NULLIF(trim(COALESCE(p_failure_code, '')), ''),
        updated_at = now()
    WHERE idempotency_key = p_idempotency_key;
  ELSE
    INSERT INTO public.provisioning_runs(
      idempotency_key, request_fingerprint, created_by, status,
      auth_resolution, failure_code
    ) VALUES (
      p_idempotency_key, p_request_fingerprint, auth.uid(), p_status,
      p_auth_resolution, NULLIF(trim(COALESCE(p_failure_code, '')), '')
    );
  END IF;

  RETURN jsonb_build_object(
    'status', p_status,
    'idempotencyKey', p_idempotency_key,
    'requestFingerprint', p_request_fingerprint,
    'authResolution', p_auth_resolution
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_platform_provisioning_auth_state(
  UUID, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_platform_provisioning_auth_state(
  UUID, TEXT, TEXT, JSONB, TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.provision_gym_workspace(
  p_payload JSONB,
  p_token_hash TEXT,
  p_idempotency_key UUID,
  p_request_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.provisioning_runs%ROWTYPE;
  v_gym public.gyms%ROWTYPE;
  v_name TEXT;
  v_code TEXT;
  v_owner_id UUID;
  v_owner_email TEXT;
  v_owner_name TEXT;
  v_staff JSONB;
  v_staff_entry JSONB;
  v_members JSONB;
  v_member_entry JSONB;
  v_plans JSONB;
  v_plan_entry JSONB;
  v_raw_flags JSONB;
  v_flags JSONB := '{}'::JSONB;
  v_flag RECORD;
  v_result JSONB;
  v_expires_at TIMESTAMPTZ := now() + INTERVAL '24 hours';
  v_role public.user_role;
BEGIN
  IF NOT public.is_platform_admin() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'platform admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL
     OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid provisioning idempotency or claim material'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.provisioning_runs
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint <> p_request_fingerprint THEN
      RAISE EXCEPTION 'provisioning idempotency key was reused with a different request'
        USING ERRCODE = '22023';
    END IF;
    IF v_existing.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'provisioning request belongs to another operator'
        USING ERRCODE = '42501';
    END IF;
    IF v_existing.status = 'provisioned' THEN
      RETURN v_existing.result;
    END IF;
    UPDATE public.provisioning_runs
    SET status = 'provisioning', failure_code = NULL, updated_at = now()
    WHERE idempotency_key = p_idempotency_key;
  ELSE
    INSERT INTO public.provisioning_runs(
      idempotency_key, request_fingerprint, created_by, status
    ) VALUES (
      p_idempotency_key, p_request_fingerprint, auth.uid(), 'provisioning'
    );
  END IF;

  v_name := trim(COALESCE(p_payload ->> 'gymName', ''));
  v_code := lower(trim(COALESCE(p_payload ->> 'slug', '')));
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'gym name must be between 2 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_code !~ '^[a-z0-9][a-z0-9-]{2,31}$'
     OR v_code ~ '--'
     OR right(v_code, 1) = '-' THEN
    RAISE EXCEPTION 'gym code must be 3-32 lowercase letters, numbers, or single hyphens'
      USING ERRCODE = '22023';
  END IF;
  IF v_code = ANY (ARRAY[
    'admin','api','auth','gym','gyms','kiosk','login','member','reset-password',
    'signup','stren','www','support','help','privacy','terms'
  ]) THEN
    RAISE EXCEPTION 'that gym code is reserved' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gyms WHERE lower(code) = v_code) THEN
    RAISE EXCEPTION 'that gym code is already taken' USING ERRCODE = '23505';
  END IF;
  IF COALESCE((p_payload ->> 'isPublished')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'assisted onboarding provisions private gyms only' USING ERRCODE = '22023';
  END IF;

  IF p_payload -> 'owner' IS NULL THEN
    RAISE EXCEPTION 'owner account is required' USING ERRCODE = '22023';
  END IF;
  v_owner_id := NULLIF(p_payload -> 'owner' ->> 'userId', '')::UUID;
  v_owner_email := lower(trim(COALESCE(p_payload -> 'owner' ->> 'email', '')));
  v_owner_name := NULLIF(trim(COALESCE(p_payload -> 'owner' ->> 'name', '')), '');
  IF v_owner_id IS NULL OR v_owner_email = '' THEN
    RAISE EXCEPTION 'owner account is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(NULLIF(p_payload -> 'owner' ->> 'role', ''), 'owner') <> 'owner' THEN
    RAISE EXCEPTION 'the designated claimant must be owner' USING ERRCODE = '22023';
  END IF;
  IF p_payload -> 'owner' ->> 'consentMethod' NOT IN ('in_person', 'phone', 'email') THEN
    RAISE EXCEPTION 'owner consent method is required' USING ERRCODE = '22023';
  END IF;

  v_staff := COALESCE(p_payload -> 'staff', '[]'::JSONB);
  v_members := COALESCE(p_payload -> 'importedMembers', '[]'::JSONB);
  v_plans := COALESCE(p_payload -> 'plans', '[]'::JSONB);
  IF jsonb_typeof(v_staff) <> 'array'
     OR jsonb_typeof(v_members) <> 'array'
     OR jsonb_typeof(v_plans) <> 'array'
     OR jsonb_array_length(v_plans) < 1 THEN
    RAISE EXCEPTION 'at least one membership plan is required' USING ERRCODE = '22023';
  END IF;

  v_raw_flags := COALESCE(p_payload -> 'featureFlags', '{}'::JSONB);
  IF jsonb_typeof(v_raw_flags) <> 'object' THEN
    RAISE EXCEPTION 'invalid feature flags' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_each(v_raw_flags) AS f(key, value)
    WHERE f.key NOT IN ('kiosk_checkin', 'staff_manual_checkin', 'occupancy_count')
       OR jsonb_typeof(f.value) <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'unsupported or invalid onboarding feature flag' USING ERRCODE = '22023';
  END IF;
  FOR v_flag IN SELECT key, value FROM jsonb_each(v_raw_flags)
  LOOP
    v_flags := v_flags || jsonb_build_object(v_flag.key, v_flag.value);
  END LOOP;

  INSERT INTO public.gyms(
    name, code, address, phone, branch_name, operating_hours,
    logo_path, is_published, brand_color
  ) VALUES (
    v_name,
    v_code,
    NULLIF(trim(COALESCE(p_payload ->> 'address', '')), ''),
    NULLIF(trim(COALESCE(p_payload ->> 'phone', '')), ''),
    NULLIF(trim(COALESCE(p_payload ->> 'branchName', '')), ''),
    COALESCE(p_payload -> 'operatingHours', 'null'::JSONB),
    NULLIF(trim(COALESCE(p_payload ->> 'logoPath', '')), ''),
    false,
    COALESCE(NULLIF(trim(p_payload ->> 'brandColor'), ''), '#D4956A')
  ) RETURNING * INTO v_gym;

  INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
  VALUES (v_gym.id, v_owner_id, 'owner', 'pending', auth.uid());

  FOR v_staff_entry IN SELECT value FROM jsonb_array_elements(v_staff) AS item(value)
  LOOP
    IF NULLIF(v_staff_entry ->> 'userId', '') IS NULL
       OR COALESCE(v_staff_entry ->> 'role', 'staff') NOT IN ('admin', 'staff') THEN
      RAISE EXCEPTION 'invalid staff account or role' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
    VALUES (
      v_gym.id,
      (v_staff_entry ->> 'userId')::UUID,
      COALESCE(v_staff_entry ->> 'role', 'staff')::public.user_role,
      'pending',
      auth.uid()
    );
  END LOOP;

  FOR v_plan_entry IN SELECT value FROM jsonb_array_elements(v_plans) AS item(value)
  LOOP
    IF length(trim(COALESCE(v_plan_entry ->> 'name', ''))) < 1
       OR (v_plan_entry ->> 'price') IS NULL
       OR (v_plan_entry ->> 'durationDays') IS NULL
       OR (v_plan_entry ->> 'durationDays')::INTEGER < 1 THEN
      RAISE EXCEPTION 'invalid membership plan' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.membership_plans(
      gym_id, name, price, duration_days, description, is_active, sort_order
    ) VALUES (
      v_gym.id,
      trim(v_plan_entry ->> 'name'),
      (v_plan_entry ->> 'price')::NUMERIC,
      (v_plan_entry ->> 'durationDays')::INTEGER,
      NULLIF(trim(COALESCE(v_plan_entry ->> 'description', '')), ''),
      COALESCE((v_plan_entry ->> 'isActive')::BOOLEAN, true),
      COALESCE((v_plan_entry ->> 'sortOrder')::INTEGER, 0)
    );
  END LOOP;

  IF v_flags <> '{}'::JSONB THEN
    INSERT INTO public.gym_feature_settings(gym_id, flags, updated_by)
    VALUES (v_gym.id, v_flags, auth.uid());
  END IF;

  FOR v_member_entry IN SELECT value FROM jsonb_array_elements(v_members) AS item(value)
  LOOP
    IF NULLIF(v_member_entry ->> 'userId', '') IS NULL THEN
      RAISE EXCEPTION 'invalid imported member account' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
    VALUES (v_gym.id, (v_member_entry ->> 'userId')::UUID, 'member', 'active', auth.uid());
    -- Active imported access must have a matching verification state.  This
    -- does not create a membership or a financial transaction; effective
    -- membership remains the access gate for kiosk operations.
    INSERT INTO public.gym_membership_verifications(
      gym_id, user_id, status, requested_at, decided_at, decided_by, last_reason
    ) VALUES (
      v_gym.id, (v_member_entry ->> 'userId')::UUID, 'approved',
      now(), now(), auth.uid(), 'Imported by platform-assisted onboarding'
    );
  END LOOP;

  INSERT INTO public.gym_claim_invites(
    gym_id, invited_email, invited_name, invited_role,
    token_hash, expires_at, consent_method, created_by
  ) VALUES (
    v_gym.id, v_owner_email, v_owner_name, 'owner', p_token_hash,
    v_expires_at, p_payload -> 'owner' ->> 'consentMethod', auth.uid()
  );

  PERFORM public.write_privileged_audit_event(
    v_gym.id,
    'platform.gym_provisioned',
    'gym',
    v_gym.id,
    NULL,
    jsonb_build_object(
      'code', v_gym.code,
      'is_published', false,
      'owner_status', 'pending',
      'staff_count', jsonb_array_length(v_staff),
      'plan_count', jsonb_array_length(v_plans),
      'imported_member_count', jsonb_array_length(v_members)
    ),
    'Assisted onboarding',
    auth.uid()
  );

  IF jsonb_array_length(v_members) > 0 THEN
    PERFORM public.write_privileged_audit_event(
      v_gym.id,
      'platform.member_imported',
      'gym',
      v_gym.id,
      NULL,
      jsonb_build_object('count', jsonb_array_length(v_members)),
      'Imported accounts have no membership or payment',
      auth.uid()
    );
  END IF;

  v_result := jsonb_build_object(
    'gymId', v_gym.id,
    'gymName', v_gym.name,
    'gymCode', v_gym.code,
    'ownerEmail', v_owner_email,
    'expiresAt', v_expires_at,
    'deliveryStatus', 'pending'
  );

  UPDATE public.provisioning_runs
  SET status = 'provisioned', gym_id = v_gym.id, result = v_result, updated_at = now()
  WHERE idempotency_key = p_idempotency_key;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_gym_workspace(JSONB, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.provision_gym_workspace(JSONB, TEXT, UUID, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_gym_ownership(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite public.gym_claim_invites%ROWTYPE;
  v_gym public.gyms%ROWTYPE;
  v_email TEXT := lower(NULLIF(auth.jwt() ->> 'email', ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P1002';
  END IF;

  SELECT * INTO v_invite
  FROM public.gym_claim_invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P1002';
  END IF;
  IF v_invite.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite superseded' USING ERRCODE = 'P1003';
  END IF;
  IF v_invite.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite already used' USING ERRCODE = 'P1004';
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'invite expired' USING ERRCODE = 'P1005';
  END IF;
  IF v_email IS NULL OR v_email <> v_invite.invited_email THEN
    RAISE EXCEPTION 'invite is for a different email' USING ERRCODE = 'P1006';
  END IF;

  PERFORM set_config('stren.allow_gym_user_privileged_write', 'on', true);
  UPDATE public.gym_users
  SET status = 'active', role = 'owner', updated_at = now()
  WHERE gym_id = v_invite.gym_id
    AND user_id = auth.uid()
    AND role = 'owner'
    AND status = 'pending';
  IF NOT FOUND THEN
    PERFORM set_config('stren.allow_gym_user_privileged_write', 'off', true);
    RAISE EXCEPTION 'owner claim is not prepared for this account' USING ERRCODE = 'P1007';
  END IF;
  PERFORM set_config('stren.allow_gym_user_privileged_write', 'off', true);

  UPDATE public.gym_claim_invites
  SET consumed_at = now(), updated_at = now()
  WHERE id = v_invite.id;
  UPDATE public.profiles
  SET active_gym_id = v_invite.gym_id
  WHERE id = auth.uid();

  SELECT * INTO v_gym FROM public.gyms WHERE id = v_invite.gym_id;
  PERFORM public.write_privileged_audit_event(
    v_invite.gym_id,
    'platform.owner_claimed',
    'gym',
    v_invite.gym_id,
    jsonb_build_object('owner_status', 'pending'),
    jsonb_build_object('owner_status', 'active', 'email', v_invite.invited_email),
    'Owner claim invitation accepted',
    auth.uid()
  );

  RETURN jsonb_build_object('gymId', v_gym.id, 'gymName', v_gym.name, 'gymCode', v_gym.code);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_gym_ownership(TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.claim_gym_ownership(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.supersede_claim_invite(
  p_gym_id UUID,
  p_new_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.gym_claim_invites%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'platform admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_new_token_hash !~ '^[0-9a-f]{64}$'
     OR p_expires_at <= now()
     OR p_expires_at > now() + INTERVAL '24 hours' + INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'invalid replacement invite' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.gym_claim_invites
  WHERE gym_id = p_gym_id AND consumed_at IS NULL AND superseded_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active invite to supersede' USING ERRCODE = 'P1002';
  END IF;

  UPDATE public.gym_claim_invites
  SET superseded_at = now(), updated_at = now()
  WHERE id = v_old.id;
  INSERT INTO public.gym_claim_invites(
    gym_id, invited_email, invited_name, invited_role, token_hash,
    expires_at, consent_method, created_by
  ) VALUES (
    v_old.gym_id, v_old.invited_email, v_old.invited_name, 'owner',
    p_new_token_hash, p_expires_at, v_old.consent_method, auth.uid()
  );

  PERFORM public.write_privileged_audit_event(
    p_gym_id,
    'platform.owner_invite_resent',
    'gym',
    p_gym_id,
    jsonb_build_object('invite_id', v_old.id),
    jsonb_build_object('replacement', true),
    'Owner claim invitation superseded',
    auth.uid()
  );
  RETURN jsonb_build_object('expiresAt', p_expires_at, 'deliveryStatus', 'pending');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.supersede_claim_invite(UUID, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.supersede_claim_invite(UUID, TEXT, TIMESTAMPTZ)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_claim_invite_delivery(
  p_gym_id UUID,
  p_token_hash TEXT,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite public.gym_claim_invites%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'platform admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('sent', 'failed') OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid delivery status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.gym_claim_invites
  SET delivery_status = p_status, updated_at = now()
  WHERE gym_id = p_gym_id AND token_hash = p_token_hash
  RETURNING * INTO v_invite;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P1002';
  END IF;

  PERFORM public.write_privileged_audit_event(
    p_gym_id,
    CASE WHEN p_status = 'sent'
      THEN 'platform.owner_invite_sent'
      ELSE 'platform.owner_invite_delivery_failed'
    END,
    'gym',
    p_gym_id,
    jsonb_build_object('delivery_status', CASE WHEN p_status = 'sent' THEN 'pending' ELSE 'pending' END),
    jsonb_build_object('delivery_status', p_status),
    'Owner claim invitation delivery state changed',
    auth.uid()
  );
  RETURN jsonb_build_object('deliveryStatus', p_status, 'expiresAt', v_invite.expires_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_claim_invite_delivery(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_claim_invite_delivery(UUID, TEXT, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_claim_invite_preview(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite public.gym_claim_invites%ROWTYPE;
  v_name TEXT;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;
  SELECT * INTO v_invite
  FROM public.gym_claim_invites
  WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;
  SELECT name INTO v_name FROM public.gyms WHERE id = v_invite.gym_id;

  IF v_invite.superseded_at IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'superseded', 'gymName', v_name);
  ELSIF v_invite.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'used', 'gymName', v_name);
  ELSIF v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('state', 'expired', 'gymName', v_name);
  END IF;

  RETURN jsonb_build_object(
    'state', 'active',
    'gymName', v_name,
    'invitedEmail', v_invite.invited_email,
    'expiresAt', v_invite.expires_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_claim_invite_preview(TEXT)
  FROM PUBLIC, service_role;
GRANT EXECUTE ON FUNCTION public.get_claim_invite_preview(TEXT) TO anon, authenticated;

-- Extend the protected-definition contract without changing the 028 baseline
-- function body: the legacy function is renamed once and wrapped additively.
DO $$
BEGIN
  IF to_regprocedure('public.deployment_protected_definition_hashes_028()') IS NULL
     AND to_regprocedure('public.deployment_protected_definition_hashes()') IS NOT NULL THEN
    ALTER FUNCTION public.deployment_protected_definition_hashes()
      RENAME TO deployment_protected_definition_hashes_028;
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
  SELECT public.deployment_protected_definition_hashes_028()
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
          ('function:gym_feature_enabled', 'public.gym_feature_enabled(text,uuid)'),
          ('function:kiosk_checkin_by_member', 'public.kiosk_checkin_by_member(uuid,uuid)'),
          ('function:kiosk_get_occupancy', 'public.kiosk_get_occupancy(uuid)'),
          ('function:get_my_access', 'public.get_my_access()'),
          ('function:provision_gym_workspace', 'public.provision_gym_workspace(jsonb,text,uuid,text)'),
          ('function:claim_gym_ownership', 'public.claim_gym_ownership(text)'),
          ('function:supersede_claim_invite', 'public.supersede_claim_invite(uuid,text,timestamp with time zone)'),
          ('function:mark_claim_invite_delivery', 'public.mark_claim_invite_delivery(uuid,text,text)'),
          ('function:get_claim_invite_preview', 'public.get_claim_invite_preview(text)'),
          ('function:record_platform_provisioning_auth_state', 'public.record_platform_provisioning_auth_state(uuid,text,text,jsonb,text)')
        ) AS target(key, identity)
      ) AS target
    ), '{}'::JSONB);
$$;

REVOKE ALL ON FUNCTION public.deployment_protected_definition_hashes()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deployment_protected_definition_hashes() TO service_role;
