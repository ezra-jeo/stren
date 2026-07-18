-- Assisted Onboarding: platform-admin-provisioned gyms with a secure,
-- single-use, 24-hour owner-claim invitation. No new database role — every
-- new function is gated by the existing public.is_platform_admin() (020).

-- ---------------------------------------------------------------------------
-- 1. Single-branch display name (no branches table; ADR-0004 deferral).
-- ---------------------------------------------------------------------------

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS branch_name TEXT;

-- ---------------------------------------------------------------------------
-- 2. Claim invitations: hashed, single-use, 24-hour, one active per gym.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gym_claim_invites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id         UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  invited_email  TEXT NOT NULL,
  invited_name   TEXT,
  invited_role   public.user_role NOT NULL DEFAULT 'owner',
  token_hash     TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ,
  superseded_at  TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  consent_method TEXT NOT NULL,
  created_by     UUID NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gym_claim_invites_role_check
    CHECK (invited_role IN ('owner', 'admin')),
  CONSTRAINT gym_claim_invites_delivery_check
    CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  CONSTRAINT gym_claim_invites_consent_check
    CHECK (consent_method IN ('in_person', 'phone', 'email'))
);

CREATE UNIQUE INDEX IF NOT EXISTS gym_claim_invites_one_active_per_gym
  ON public.gym_claim_invites(gym_id)
  WHERE consumed_at IS NULL AND superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS gym_claim_invites_gym_idx
  ON public.gym_claim_invites(gym_id);

ALTER TABLE public.gym_claim_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gym_claim_invites_platform_admin ON public.gym_claim_invites;
CREATE POLICY gym_claim_invites_platform_admin ON public.gym_claim_invites
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Idempotent provisioning replay.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.provisioning_runs (
  idempotency_key UUID PRIMARY KEY,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  gym_id          UUID REFERENCES public.gyms(id) ON DELETE SET NULL,
  result          JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provisioning_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provisioning_runs_platform_admin ON public.provisioning_runs;
CREATE POLICY provisioning_runs_platform_admin ON public.provisioning_runs
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. Platform-level audit trail (member_onboarding_events stays member-scoped).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_onboarding_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     UUID REFERENCES public.gyms(id) ON DELETE CASCADE,
  actor      UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  detail     JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_onboarding_events_type_check CHECK (event_type IN (
    'provisioned', 'invite_sent', 'invite_send_failed', 'invite_resent', 'claimed', 'member_import'
  ))
);

CREATE INDEX IF NOT EXISTS platform_onboarding_events_gym_idx
  ON public.platform_onboarding_events(gym_id);

ALTER TABLE public.platform_onboarding_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_onboarding_events_platform_admin ON public.platform_onboarding_events;
CREATE POLICY platform_onboarding_events_platform_admin ON public.platform_onboarding_events
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 5. Feature-key mirrors for the four new access switches (§17.8). The
-- catalog rows live in lib/features.ts; gym_feature_enabled must know their
-- defaults the same way it already knows kiosk_checkin's.
-- ---------------------------------------------------------------------------

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
    WHEN 'trainer_bookings' THEN false
    WHEN 'friends_chat' THEN false
    WHEN 'workout_log' THEN false
    WHEN 'session_posts' THEN false
    WHEN 'auto_approve_joins' THEN false
    WHEN 'staff_manual_checkin' THEN true
    WHEN 'checkin_requires_membership' THEN true
    WHEN 'occupancy_count' THEN true
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

-- ---------------------------------------------------------------------------
-- 6. Additive switch enforcement (existing RPC bodies otherwise unchanged).
-- ---------------------------------------------------------------------------

-- "Auto-approve members joining via gym QR" (§13-C item 3).
CREATE OR REPLACE FUNCTION public.join_gym(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status public.profile_status;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.gyms WHERE id = p_gym_id) THEN
    RAISE EXCEPTION 'Gym not found';
  END IF;

  INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
  VALUES (
    p_gym_id, auth.uid(), 'member',
    CASE WHEN public.gym_feature_enabled('auto_approve_joins', p_gym_id) THEN 'active' ELSE 'pending' END,
    NULL
  )
  ON CONFLICT (gym_id, user_id) DO NOTHING;

  SELECT gu.status INTO v_status
  FROM public.gym_users gu
  WHERE gu.gym_id = p_gym_id AND gu.user_id = auth.uid();
  RETURN jsonb_build_object('status', v_status::TEXT);
END;
$$;

-- "Active membership required for check-in" (§13-C item 6).
CREATE OR REPLACE FUNCTION public.kiosk_checkin(p_qr_code TEXT, p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member RECORD;
  v_open public.attendance%ROWTYPE;
  v_att_id UUID;
  v_duration INTEGER;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Kiosk check-ins are unavailable');
  END IF;

  SELECT p.id, p.name, gu.status
  INTO v_member
  FROM public.profiles p
  JOIN public.gym_users gu
    ON gu.user_id = p.id
   AND gu.gym_id = p_gym_id
   AND gu.status = 'active'
  WHERE p.qr_code = p_qr_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unknown_qr', 'message', 'QR code not recognised');
  END IF;

  IF public.gym_feature_enabled('checkin_requires_membership', p_gym_id)
     AND NOT public.has_member_portal_entitlement(v_member.id, p_gym_id) THEN
    RETURN jsonb_build_object('error', 'membership_inactive', 'message', 'Membership renewal required');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_gym_id::text || ':' || v_member.id::text, 0));

  SELECT * INTO v_open
  FROM public.attendance
  WHERE member_id = v_member.id AND gym_id = p_gym_id AND check_out IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.attendance SET check_out = now()
    WHERE id = v_open.id RETURNING id, duration_min INTO v_att_id, v_duration;
    RETURN jsonb_build_object(
      'action', 'checked_out', 'attendance_id', v_att_id,
      'member_id', v_member.id, 'member_name', v_member.name,
      'duration_min', v_duration
    );
  END IF;

  INSERT INTO public.attendance(member_id, gym_id, check_in)
  VALUES (v_member.id, p_gym_id, now())
  RETURNING id INTO v_att_id;
  PERFORM public.kiosk_update_streak(v_member.id, p_gym_id);
  RETURN jsonb_build_object(
    'action', 'checked_in', 'attendance_id', v_att_id,
    'member_id', v_member.id, 'member_name', v_member.name,
    'member_status', v_member.status, 'duration_min', NULL
  );
END;
$$;

-- "Allow staff manual check-in" (§13-C item 5).
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

  IF NOT public.has_active_gym_affiliation(p_member_id, p_gym_id) THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Member not found');
  END IF;

  SELECT qr_code INTO v_qr FROM public.profiles WHERE id = p_member_id;
  RETURN public.kiosk_checkin(v_qr, p_gym_id);
END;
$$;

-- "Enable occupancy count" (§13-C item 7) — disabled reads as empty, not an error.
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

-- ---------------------------------------------------------------------------
-- 7. Atomic, idempotent provisioning. Auth users for owner/staff/imported
-- members are created by the caller (server route) via the Supabase admin
-- API *before* this call — that cannot be transactional with Postgres — and
-- are passed in already resolved. Everything else commits in one transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_gym_workspace(
  p_payload JSONB,
  p_token_hash TEXT,
  p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing JSONB;
  v_gym public.gyms%ROWTYPE;
  v_code TEXT;
  v_name TEXT;
  v_owner_id UUID;
  v_owner_role public.user_role;
  v_staff JSONB;
  v_staff_entry JSONB;
  v_members JSONB;
  v_member_entry JSONB;
  v_plans JSONB;
  v_plan_entry JSONB;
  v_flags JSONB;
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin access required';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT result INTO v_existing
  FROM public.provisioning_runs
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_name := trim(p_payload ->> 'gymName');
  v_code := lower(trim(p_payload ->> 'slug'));

  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Gym name must be between 2 and 120 characters';
  END IF;
  IF v_code !~ '^[a-z0-9][a-z0-9-]{2,31}$' OR v_code ~ '--' OR right(v_code, 1) = '-' THEN
    RAISE EXCEPTION 'Gym code must be 3-32 lowercase letters, numbers, or single hyphens';
  END IF;
  IF v_code = ANY (ARRAY[
    'admin','api','auth','gym','gyms','kiosk','login','member','reset-password',
    'signup','stren','www','support','help','privacy','terms'
  ]) THEN
    RAISE EXCEPTION 'That gym code is reserved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gyms WHERE lower(code) = v_code) THEN
    RAISE EXCEPTION 'That gym code is already taken';
  END IF;

  v_owner_id := (p_payload -> 'owner' ->> 'userId')::UUID;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Owner account is required';
  END IF;
  v_owner_role := COALESCE(NULLIF(p_payload -> 'owner' ->> 'role', ''), 'owner')::public.user_role;
  IF v_owner_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Invalid owner role';
  END IF;

  v_plans := COALESCE(p_payload -> 'plans', '[]'::JSONB);
  IF jsonb_array_length(v_plans) < 1 THEN
    RAISE EXCEPTION 'At least one membership plan is required';
  END IF;

  -- 1-4. Gym workspace, identity, slug, branch, logo, hours.
  INSERT INTO public.gyms(
    name, code, address, phone, branch_name, operating_hours,
    logo_path, is_published, brand_color
  )
  VALUES (
    v_name, v_code,
    NULLIF(trim(p_payload ->> 'address'), ''),
    NULLIF(trim(p_payload ->> 'phone'), ''),
    NULLIF(trim(p_payload ->> 'branchName'), ''),
    COALESCE(p_payload -> 'operatingHours', 'null'::JSONB),
    NULLIF(p_payload ->> 'logoPath', ''),
    COALESCE((p_payload ->> 'isPublished')::BOOLEAN, false),
    COALESCE(NULLIF(p_payload ->> 'brandColor', ''), '#D4956A')
  )
  RETURNING * INTO v_gym;

  -- 5-6. Owner account + pending owner/manager access relationship.
  INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
  VALUES (v_gym.id, v_owner_id, v_owner_role, 'pending', auth.uid())
  ON CONFLICT (gym_id, user_id) DO UPDATE
    SET role = v_owner_role, status = 'pending', added_by = auth.uid(), updated_at = now();

  -- 7-8. Staff accounts + pending staff access.
  v_staff := COALESCE(p_payload -> 'staff', '[]'::JSONB);
  FOR v_staff_entry IN SELECT * FROM jsonb_array_elements(v_staff)
  LOOP
    IF (v_staff_entry ->> 'userId') IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
    VALUES (
      v_gym.id,
      (v_staff_entry ->> 'userId')::UUID,
      COALESCE(NULLIF(v_staff_entry ->> 'role', ''), 'staff')::public.user_role,
      'pending',
      auth.uid()
    )
    ON CONFLICT (gym_id, user_id) DO UPDATE
      SET role = EXCLUDED.role, status = 'pending', added_by = auth.uid(), updated_at = now();
  END LOOP;

  -- 9. Membership plans.
  FOR v_plan_entry IN SELECT * FROM jsonb_array_elements(v_plans)
  LOOP
    INSERT INTO public.membership_plans(name, price, duration_days, gym_id, description, is_active, sort_order)
    VALUES (
      trim(v_plan_entry ->> 'name'),
      (v_plan_entry ->> 'price')::NUMERIC,
      (v_plan_entry ->> 'durationDays')::INTEGER,
      v_gym.id,
      NULLIF(trim(v_plan_entry ->> 'description'), ''),
      COALESCE((v_plan_entry ->> 'isActive')::BOOLEAN, true),
      COALESCE((v_plan_entry ->> 'sortOrder')::INTEGER, 0)
    );
  END LOOP;

  -- 11. Access + operational settings (feature-toggle deltas).
  v_flags := COALESCE(p_payload -> 'featureFlags', '{}'::JSONB);
  IF v_flags <> '{}'::JSONB THEN
    INSERT INTO public.gym_feature_settings(gym_id, flags, updated_by)
    VALUES (v_gym.id, v_flags, auth.uid())
    ON CONFLICT (gym_id) DO UPDATE SET flags = EXCLUDED.flags, updated_by = auth.uid(), updated_at = now();
  END IF;

  -- 12. Validated member import — active gym users only; no memberships/payments.
  v_members := COALESCE(p_payload -> 'importedMembers', '[]'::JSONB);
  FOR v_member_entry IN SELECT * FROM jsonb_array_elements(v_members)
  LOOP
    IF (v_member_entry ->> 'userId') IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
    VALUES (v_gym.id, (v_member_entry ->> 'userId')::UUID, 'member', 'active', auth.uid())
    ON CONFLICT (gym_id, user_id) DO NOTHING;
  END LOOP;

  -- 14. Secure owner-claim invitation.
  INSERT INTO public.gym_claim_invites(
    gym_id, invited_email, invited_name, invited_role,
    token_hash, expires_at, delivery_status, consent_method, created_by
  )
  VALUES (
    v_gym.id,
    lower(trim(p_payload -> 'owner' ->> 'email')),
    NULLIF(trim(p_payload -> 'owner' ->> 'name'), ''),
    v_owner_role,
    p_token_hash,
    now() + INTERVAL '24 hours',
    'pending',
    p_payload -> 'owner' ->> 'consentMethod',
    auth.uid()
  );

  -- 16. Audit.
  INSERT INTO public.platform_onboarding_events(gym_id, actor, event_type, detail)
  VALUES (
    v_gym.id, auth.uid(), 'provisioned',
    jsonb_build_object(
      'staffCount', jsonb_array_length(v_staff),
      'planCount', jsonb_array_length(v_plans),
      'importedCount', jsonb_array_length(v_members),
      'consentMethod', p_payload -> 'owner' ->> 'consentMethod'
    )
  );
  IF jsonb_array_length(v_members) > 0 THEN
    INSERT INTO public.platform_onboarding_events(gym_id, actor, event_type, detail)
    VALUES (v_gym.id, auth.uid(), 'member_import', jsonb_build_object('count', jsonb_array_length(v_members)));
  END IF;

  v_result := jsonb_build_object(
    'gymId', v_gym.id,
    'gymName', v_gym.name,
    'gymCode', v_gym.code,
    'ownerEmail', lower(trim(p_payload -> 'owner' ->> 'email')),
    'expiresAt', (now() + INTERVAL '24 hours')
  );

  INSERT INTO public.provisioning_runs(idempotency_key, created_by, gym_id, result)
  VALUES (p_idempotency_key, auth.uid(), v_gym.id, v_result);

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_gym_workspace(JSONB, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_gym_workspace(JSONB, TEXT, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Owner claim: single-use, email-bound, 24-hour token.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_gym_ownership(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite public.gym_claim_invites%ROWTYPE;
  v_jwt_email TEXT := lower(auth.jwt() ->> 'email');
  v_gym public.gyms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_invite
  FROM public.gym_claim_invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invite.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite superseded' USING ERRCODE = 'P0003';
  END IF;
  IF v_invite.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite already used' USING ERRCODE = 'P0004';
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'invite expired' USING ERRCODE = 'P0005';
  END IF;
  IF v_invite.invited_email <> v_jwt_email THEN
    RAISE EXCEPTION 'invite is for a different email' USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.gym_users
  SET role = v_invite.invited_role, status = 'active', updated_at = now()
  WHERE gym_id = v_invite.gym_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
    VALUES (v_invite.gym_id, auth.uid(), v_invite.invited_role, 'active', v_invite.created_by);
  END IF;

  UPDATE public.gym_claim_invites SET consumed_at = now(), updated_at = now() WHERE id = v_invite.id;
  UPDATE public.profiles SET active_gym_id = v_invite.gym_id WHERE id = auth.uid();

  SELECT * INTO v_gym FROM public.gyms WHERE id = v_invite.gym_id;

  INSERT INTO public.platform_onboarding_events(gym_id, actor, event_type, detail)
  VALUES (v_invite.gym_id, auth.uid(), 'claimed', jsonb_build_object('email', v_jwt_email));

  RETURN jsonb_build_object('gymId', v_gym.id, 'gymName', v_gym.name, 'gymCode', v_gym.code);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_gym_ownership(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_gym_ownership(TEXT) TO authenticated, service_role;

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
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin access required';
  END IF;

  SELECT * INTO v_old
  FROM public.gym_claim_invites
  WHERE gym_id = p_gym_id AND consumed_at IS NULL AND superseded_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active invite to supersede' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.gym_claim_invites SET superseded_at = now(), updated_at = now() WHERE id = v_old.id;

  INSERT INTO public.gym_claim_invites(
    gym_id, invited_email, invited_name, invited_role,
    token_hash, expires_at, delivery_status, consent_method, created_by
  )
  VALUES (
    v_old.gym_id, v_old.invited_email, v_old.invited_name, v_old.invited_role,
    p_new_token_hash, p_expires_at, 'pending', v_old.consent_method, auth.uid()
  );

  INSERT INTO public.platform_onboarding_events(gym_id, actor, event_type, detail)
  VALUES (p_gym_id, auth.uid(), 'invite_resent', jsonb_build_object('email', v_old.invited_email));

  RETURN jsonb_build_object('expiresAt', p_expires_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.supersede_claim_invite(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supersede_claim_invite(UUID, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_claim_invite_delivery(
  p_gym_id UUID,
  p_token_hash TEXT,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin access required';
  END IF;
  IF p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'invalid delivery status';
  END IF;

  UPDATE public.gym_claim_invites
  SET delivery_status = p_status, updated_at = now()
  WHERE gym_id = p_gym_id AND token_hash = p_token_hash;

  INSERT INTO public.platform_onboarding_events(gym_id, actor, event_type, detail)
  VALUES (
    p_gym_id, auth.uid(),
    CASE WHEN p_status = 'sent' THEN 'invite_sent' ELSE 'invite_send_failed' END,
    '{}'::JSONB
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_claim_invite_delivery(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_claim_invite_delivery(UUID, TEXT, TEXT) TO authenticated, service_role;

-- Read-only lookup for the public claim page (by hash only; never lists invites).
CREATE OR REPLACE FUNCTION public.get_claim_invite_preview(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite public.gym_claim_invites%ROWTYPE;
  v_gym_name TEXT;
BEGIN
  SELECT * INTO v_invite FROM public.gym_claim_invites WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;

  SELECT name INTO v_gym_name FROM public.gyms WHERE id = v_invite.gym_id;

  IF v_invite.superseded_at IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'superseded', 'gymName', v_gym_name);
  END IF;
  IF v_invite.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'used', 'gymName', v_gym_name);
  END IF;
  IF v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('state', 'expired', 'gymName', v_gym_name);
  END IF;

  RETURN jsonb_build_object(
    'state', 'active',
    'gymName', v_gym_name,
    'invitedEmail', v_invite.invited_email,
    'expiresAt', v_invite.expires_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_claim_invite_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_claim_invite_preview(TEXT) TO anon, authenticated, service_role;
