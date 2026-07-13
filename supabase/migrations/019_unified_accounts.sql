-- Unified accounts: one identity may belong to many gyms.
-- Ordered deliberately: schema -> backfill -> helpers -> RPCs -> legacy drops
-- -> per-gym fixes/function sweep -> profile column drops.

-- ---------------------------------------------------------------------------
-- 1. gym_users + server-side active gym
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gym_users (
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'member',
  status public.profile_status NOT NULL DEFAULT 'active',
  added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, user_id)
);

CREATE INDEX IF NOT EXISTS gym_users_user_idx ON public.gym_users(user_id);
CREATE INDEX IF NOT EXISTS gym_users_gym_role_status_idx
  ON public.gym_users(gym_id, role, status);

CREATE UNIQUE INDEX IF NOT EXISTS gyms_code_lower_key
  ON public.gyms(lower(code));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Mechanical backfill (strictly before any legacy profile-column drop).
-- Dynamic SQL keeps the migration re-runnable after those columns are gone.
-- ---------------------------------------------------------------------------

DO $backfill$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'gym_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.gym_users(gym_id, user_id, role, status)
      SELECT gym_id, id, role, status
      FROM public.profiles
      WHERE gym_id IS NOT NULL
      ON CONFLICT (gym_id, user_id) DO NOTHING
    $sql$;

    EXECUTE $sql$
      UPDATE public.profiles
      SET active_gym_id = gym_id
      WHERE gym_id IS NOT NULL AND active_gym_id IS NULL
    $sql$;
  END IF;
END;
$backfill$;

-- ---------------------------------------------------------------------------
-- 3. Helper stack: same public signatures, gym_users-backed internals.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_gym_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.active_gym_id
  FROM public.profiles p
  JOIN public.gym_users gu
    ON gu.user_id = p.id
   AND gu.gym_id = p.active_gym_id
   AND gu.status = 'active'
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT gu.role::TEXT
  FROM public.gym_users gu
  WHERE gu.user_id = auth.uid()
    AND gu.gym_id = public.get_gym_id()
    AND gu.status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.is_manager_of(p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.gym_users gu
    WHERE gu.user_id = auth.uid()
      AND gu.gym_id = p_gym_id
      AND gu.status = 'active'
      AND gu.role IN ('owner', 'admin', 'staff')
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_manager_of(public.get_gym_id());
$$;

CREATE OR REPLACE FUNCTION public.has_active_gym_affiliation(
  p_user_id UUID,
  p_gym_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1 FROM public.gym_users gu
    WHERE gu.user_id = p_user_id
      AND gu.gym_id = p_gym_id
      AND gu.status = 'active'
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.is_gym_owner(
  p_user_id UUID,
  p_gym_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1 FROM public.gym_users gu
    WHERE gu.user_id = p_user_id
      AND gu.gym_id = p_gym_id
      AND gu.role = 'owner'
  ), false);
$$;

-- Managers are members too. A manager with no billing history receives member
-- behavior; once any subscription exists, the same active/lapsed rules apply.
CREATE OR REPLACE FUNCTION public.has_member_portal_entitlement(
  p_user_id UUID,
  p_gym_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.gym_users gu
    WHERE gu.user_id = p_user_id
      AND gu.gym_id = p_gym_id
      AND gu.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.member_id = p_user_id
            AND m.gym_id = p_gym_id
            AND m.status = 'active'
            AND m.end_date >= CURRENT_DATE
        )
        OR (
          gu.role <> 'member'
          AND NOT EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.member_id = p_user_id AND m.gym_id = p_gym_id
          )
        )
      )
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.shares_active_gym(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1 FROM public.gym_users gu
    WHERE gu.user_id = p_user_id
      AND gu.gym_id = public.get_gym_id()
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.has_gym_permission(
  p_permission TEXT,
  p_gym_id UUID DEFAULT public.get_gym_id()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_result BOOLEAN;
BEGIN
  SELECT gu.role INTO v_role
  FROM public.gym_users gu
  WHERE gu.user_id = auth.uid()
    AND gu.gym_id = p_gym_id
    AND gu.status = 'active';

  IF NOT FOUND OR p_gym_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_role_permission_defaults
    WHERE permission = p_permission
  ) THEN
    RAISE EXCEPTION 'unknown permission: %', p_permission;
  END IF;

  SELECT granted INTO v_result
  FROM public.gym_user_permission_overrides
  WHERE gym_id = p_gym_id
    AND user_id = auth.uid()
    AND permission = p_permission;

  IF NOT FOUND THEN
    SELECT EXISTS (
      SELECT 1 FROM public.gym_role_permission_defaults
      WHERE role = v_role AND permission = p_permission
    ) INTO v_result;
  END IF;

  IF p_permission = 'gym_page:view'
     AND NOT v_result
     AND public.has_gym_permission('gym_page:edit', p_gym_id) THEN
    RETURN true;
  END IF;

  RETURN COALESCE(v_result, false);
END;
$$;

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
    SELECT permission
    FROM public.gym_role_permission_defaults
    WHERE role = 'owner'
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
      'trainer_bookings', false,
      'friends_chat', false,
      'workout_log', false,
      'session_posts', false
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_permission_override()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_target_role public.user_role;
BEGIN
  IF NEW.permission IN ('roles:manage', 'features:manage', 'gym_page:publish') THEN
    RAISE EXCEPTION 'permission cannot be delegated: %', NEW.permission;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_role_permission_defaults
    WHERE role = 'owner' AND permission = NEW.permission
  ) THEN
    RAISE EXCEPTION 'unknown permission: %', NEW.permission;
  END IF;

  SELECT gu.role INTO v_target_role
  FROM public.gym_users gu
  WHERE gu.user_id = NEW.user_id
    AND gu.gym_id = NEW.gym_id
    AND gu.status = 'active';

  IF NOT FOUND OR v_target_role IN ('owner', 'member') THEN
    RAISE EXCEPTION 'invalid permission override target';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles(id, email, name, qr_code)
  VALUES (
    NEW.id,
    lower(NEW.email),
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    gen_random_uuid()::TEXT
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gym_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_manager() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_manager_of(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_gym_affiliation(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_gym_owner(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_member_portal_entitlement(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shares_active_gym(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_gym_permission(TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_access() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_gym_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager_of(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_gym_affiliation(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_gym_owner(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_member_portal_entitlement(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_active_gym(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_gym_permission(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated, service_role;

-- Active-gym integrity and last-owner protection.
CREATE OR REPLACE FUNCTION public.validate_active_gym()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.active_gym_id IS NOT NULL
     AND NOT public.has_active_gym_affiliation(NEW.id, NEW.active_gym_id) THEN
    RAISE EXCEPTION 'active gym requires an active gym user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_active_gym ON public.profiles;
CREATE TRIGGER validate_active_gym
  BEFORE UPDATE OF active_gym_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_active_gym();

CREATE OR REPLACE FUNCTION public.protect_last_active_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.role = 'owner' AND OLD.status = 'active' THEN
    IF (TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NEW.status <> 'active')
       AND NOT EXISTS (
         SELECT 1 FROM public.gym_users gu
         WHERE gu.gym_id = OLD.gym_id
           AND gu.user_id <> OLD.user_id
           AND gu.role = 'owner'
           AND gu.status = 'active'
       ) THEN
      RAISE EXCEPTION 'a gym must keep at least one active owner';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_last_active_owner ON public.gym_users;
CREATE TRIGGER protect_last_active_owner
  BEFORE UPDATE OF role, status OR DELETE ON public.gym_users
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_active_owner();

CREATE OR REPLACE FUNCTION public.clear_invalid_active_gym()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET active_gym_id = NULL
    WHERE id = OLD.user_id AND active_gym_id = OLD.gym_id;
    RETURN OLD;
  END IF;
  IF NEW.status <> 'active' THEN
    UPDATE public.profiles
    SET active_gym_id = NULL
    WHERE id = OLD.user_id AND active_gym_id = OLD.gym_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_invalid_active_gym ON public.gym_users;
CREATE TRIGGER clear_invalid_active_gym
  AFTER UPDATE OF status OR DELETE ON public.gym_users
  FOR EACH ROW EXECUTE FUNCTION public.clear_invalid_active_gym();

CREATE OR REPLACE FUNCTION public.stamp_gym_user_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'active' THEN
    -- Service-role approvals have no auth.uid(); keep the existing stamp.
    NEW.added_by := COALESCE(auth.uid(), NEW.added_by);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_gym_user_approval ON public.gym_users;
CREATE TRIGGER stamp_gym_user_approval
  BEFORE UPDATE OF status ON public.gym_users
  FOR EACH ROW EXECUTE FUNCTION public.stamp_gym_user_approval();

-- RLS: gym_users policies never query gym_users directly; all tenant checks use
-- definer helpers to avoid recursive policy evaluation.
ALTER TABLE public.gym_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gym_users_select ON public.gym_users;
DROP POLICY IF EXISTS gym_users_update ON public.gym_users;
DROP POLICY IF EXISTS gym_users_insert ON public.gym_users;
DROP POLICY IF EXISTS gym_users_delete ON public.gym_users;

CREATE POLICY gym_users_select ON public.gym_users
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (gym_id = public.get_gym_id() AND public.is_manager())
  );

CREATE POLICY gym_users_update ON public.gym_users
  FOR UPDATE TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('members:manage', gym_id)
    AND NOT public.is_gym_owner(user_id, gym_id)
  )
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('members:manage', gym_id)
    -- Only owners may promote to owner; USING already blocks targeting owner rows.
    AND (role <> 'owner' OR public.get_user_role() = 'owner')
  );

DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_active_gym(id));

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR (public.is_manager() AND public.shares_active_gym(id)))
  WITH CHECK (id = auth.uid() OR (public.is_manager() AND public.shares_active_gym(id)));

GRANT SELECT ON public.gym_users TO authenticated;
GRANT UPDATE(role, status, added_by, updated_at) ON public.gym_users TO authenticated;
REVOKE INSERT, DELETE ON public.gym_users FROM authenticated;
REVOKE UPDATE(active_gym_id) ON public.profiles FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. Unified-account RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_gyms()
RETURNS TABLE(
  gym_id UUID,
  code TEXT,
  name TEXT,
  logo_url TEXT,
  role public.user_role,
  status public.profile_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id, g.code, g.name, g.logo_url, gu.role, gu.status
  FROM public.gym_users gu
  JOIN public.gyms g ON g.id = gu.gym_id
  WHERE gu.user_id = auth.uid()
  ORDER BY g.name, g.id;
$$;

CREATE OR REPLACE FUNCTION public.set_active_gym(p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT gu.role INTO v_role
  FROM public.gym_users gu
  WHERE gu.user_id = auth.uid()
    AND gu.gym_id = p_gym_id
    AND gu.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You do not have active access to that gym';
  END IF;

  UPDATE public.profiles SET active_gym_id = p_gym_id WHERE id = auth.uid();
  RETURN jsonb_build_object('role', v_role::TEXT);
END;
$$;

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
  VALUES (p_gym_id, auth.uid(), 'member', 'pending', NULL)
  ON CONFLICT (gym_id, user_id) DO NOTHING;

  SELECT gu.status INTO v_status
  FROM public.gym_users gu
  WHERE gu.gym_id = p_gym_id AND gu.user_id = auth.uid();
  RETURN jsonb_build_object('status', v_status::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_gym(p_name TEXT, p_code TEXT)
RETURNS public.gyms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code TEXT := lower(trim(p_code));
  v_name TEXT := trim(p_name);
  v_gym public.gyms%ROWTYPE;
  v_unpublished_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
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

  SELECT count(*) INTO v_unpublished_count
  FROM public.gym_users gu
  JOIN public.gyms g ON g.id = gu.gym_id
  WHERE gu.user_id = auth.uid()
    AND gu.role = 'owner'
    AND gu.status = 'active'
    AND NOT COALESCE(g.is_published, false);
  IF v_unpublished_count >= 3 THEN
    RAISE EXCEPTION 'Publish one of your gyms before creating another';
  END IF;

  INSERT INTO public.gyms(name, code, is_published)
  VALUES (v_name, v_code, false)
  RETURNING * INTO v_gym;

  INSERT INTO public.gym_users(gym_id, user_id, role, status, added_by)
  VALUES (v_gym.id, auth.uid(), 'owner', 'active', auth.uid())
  ON CONFLICT (gym_id, user_id) DO UPDATE
    SET role = 'owner', status = 'active', added_by = auth.uid(), updated_at = now();

  UPDATE public.profiles SET active_gym_id = v_gym.id WHERE id = auth.uid();
  RETURN v_gym;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_gyms() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_active_gym(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_gym(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_gym(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_gyms() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_active_gym(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_gym(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_gym(TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Legacy RPC drops.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.check_gym_membership(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_gym_and_owner(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- ---------------------------------------------------------------------------
-- 6. Per-gym unique fixes (and every affected ON CONFLICT target).
-- ---------------------------------------------------------------------------

UPDATE public.streaks s
SET gym_id = gu.gym_id
FROM public.gym_users gu
WHERE s.member_id = gu.user_id AND s.gym_id IS NULL;

ALTER TABLE public.streaks DROP CONSTRAINT IF EXISTS streaks_member_id_key;
DROP INDEX IF EXISTS public.streaks_member_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS streaks_member_gym_key
  ON public.streaks(member_id, gym_id);

ALTER TABLE public.member_notification_preferences
  DROP CONSTRAINT IF EXISTS member_notification_preferences_member_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS member_notification_preferences_member_gym_key
  ON public.member_notification_preferences(member_id, gym_id);

ALTER TABLE public.notification_cooldowns
  DROP CONSTRAINT IF EXISTS notification_cooldowns_member_id_notification_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS notification_cooldowns_member_gym_type_key
  ON public.notification_cooldowns(member_id, gym_id, notification_type);

-- ---------------------------------------------------------------------------
-- 7. Function sweep: member subscription gate and leaderboards.
-- ---------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.attribute_recorded_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    NEW.recorded_by := COALESCE(NEW.recorded_by, auth.uid());
  ELSE
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attribute_recorded_payment ON public.payments;
CREATE TRIGGER attribute_recorded_payment
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.attribute_recorded_payment();

DROP TRIGGER IF EXISTS attribute_recorded_membership ON public.memberships;
CREATE TRIGGER attribute_recorded_membership
  BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.attribute_recorded_payment();

CREATE OR REPLACE FUNCTION public.notify_owners_of_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID;
  v_gym_id UUID;
  v_member_id UUID;
  v_amount NUMERIC;
  v_method TEXT;
  v_actor_name TEXT;
  v_member_name TEXT;
  v_owner RECORD;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    v_actor_id := NEW.recorded_by;
    v_gym_id := NEW.gym_id;
    v_member_id := NEW.member_id;
    v_amount := NEW.amount;
    v_method := COALESCE(NEW.method, 'unknown');
  ELSE
    v_actor_id := NEW.created_by;
    v_gym_id := NEW.gym_id;
    v_member_id := NEW.member_id;
    v_amount := NEW.amount_paid;
    v_method := NEW.payment_method::TEXT;
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
  SELECT name INTO v_member_name FROM public.profiles WHERE id = v_member_id;

  FOR v_owner IN
    SELECT gu.user_id
    FROM public.gym_users gu
    WHERE gu.gym_id = v_gym_id
      AND gu.role = 'owner'
      AND gu.status = 'active'
  LOOP
    INSERT INTO public.notifications(
      gym_id, member_id, type, title, body, is_read, for_member
    ) VALUES (
      v_gym_id,
      v_owner.user_id,
      'payment_recorded',
      'Payment recorded',
      format('%s recorded ₱%s %s — %s',
        COALESCE(v_actor_name, 'A staff member'), v_amount, v_method,
        COALESCE(v_member_name, 'Unknown member')),
      false,
      false
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_owners_of_payment ON public.payments;
CREATE TRIGGER notify_owners_of_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_owners_of_payment();

DROP TRIGGER IF EXISTS notify_owners_of_membership ON public.memberships;
CREATE TRIGGER notify_owners_of_membership
  AFTER INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.notify_owners_of_payment();

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY[
  'member_pending', 'member_checkin', 'membership_expiring',
  'membership_expiry_7d', 'membership_expiry_0d', 'streak_milestone',
  'inactivity_nudge', 'announcement', 'payment_recorded'
]::TEXT[]));

CREATE OR REPLACE FUNCTION public.get_gym_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym public.gyms%ROWTYPE;
  v_member_count INTEGER;
  v_public_team BOOLEAN;
  v_public_pricing BOOLEAN;
  v_public_location BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT * INTO v_gym FROM public.gyms WHERE lower(code) = lower(trim(p_code));
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_public_team := public.gym_feature_enabled('public_team', v_gym.id);
  v_public_pricing := public.gym_feature_enabled('public_pricing', v_gym.id);
  v_public_location := public.gym_feature_enabled('public_location', v_gym.id);
  SELECT count(*) INTO v_member_count
  FROM public.gym_users gu WHERE gu.gym_id = v_gym.id AND gu.status = 'active';

  v_result := jsonb_build_object(
    'id', v_gym.id, 'name', v_gym.name, 'code', v_gym.code,
    'address', v_gym.address, 'phone', v_gym.phone,
    'tagline', v_gym.tagline, 'description', v_gym.description,
    'logo_url', v_gym.logo_url, 'cover_url', v_gym.cover_url,
    'logo_path', v_gym.logo_path, 'cover_path', v_gym.cover_path,
    'cover_focal', v_gym.cover_focal,
    'section_visibility', v_gym.section_visibility,
    'brand_color', COALESCE(v_gym.brand_color, '#D4956A'),
    'secondary_color', v_gym.secondary_color,
    'operating_hours', v_gym.operating_hours, 'amenities', v_gym.amenities,
    'social_links', v_gym.social_links, 'member_count', v_member_count,
    'is_published', (v_gym.tagline IS NOT NULL AND trim(v_gym.tagline) <> ''),
    'features', jsonb_build_object(
      'public_team', v_public_team, 'public_pricing', v_public_pricing,
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
      'map_embed_url', v_gym.map_embed_url, 'directions', v_gym.directions
    );
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_today DATE := CURRENT_DATE;
  v_result JSONB;
BEGIN
  IF NOT public.has_gym_permission('dashboard:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  SELECT jsonb_build_object(
    'currently_in', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'member_id', a.member_id, 'check_in', a.check_in, 'name', p.name
      )), '[]'::jsonb)
      FROM public.attendance a JOIN public.profiles p ON p.id = a.member_id
      WHERE a.gym_id = v_gym_id AND a.check_out IS NULL
    ),
    'today_visits', (SELECT count(*) FROM public.attendance WHERE gym_id = v_gym_id AND check_in::DATE = v_today),
    'total_members', (SELECT count(*) FROM public.gym_users WHERE gym_id = v_gym_id AND status = 'active'),
    'pending_count', (SELECT count(*) FROM public.gym_users WHERE gym_id = v_gym_id AND status = 'pending'),
    'active_plans', (SELECT count(*) FROM public.memberships WHERE gym_id = v_gym_id AND status = 'active'),
    'expired_plans', (SELECT count(*) FROM public.memberships WHERE gym_id = v_gym_id AND status = 'expired'),
    'frozen_plans', (SELECT count(*) FROM public.memberships WHERE gym_id = v_gym_id AND status = 'frozen'),
    'attendance_7d', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'Dy'), 'date', to_char(d.day, 'MM/DD'),
        'visits', COALESCE(v.visits, 0)
      ) ORDER BY d.day), '[]'::jsonb)
      FROM (SELECT generate_series(v_today - 6, v_today, '1 day')::DATE AS day) d
      LEFT JOIN (
        SELECT check_in::DATE AS day, count(*) AS visits FROM public.attendance
        WHERE gym_id = v_gym_id AND check_in::DATE >= v_today - 6 GROUP BY 1
      ) v ON v.day = d.day
    )
  ) INTO v_result;
  IF public.has_gym_permission('dashboard:finance:view', v_gym_id) THEN
    v_result := v_result || jsonb_build_object(
      'today_revenue', (SELECT COALESCE(sum(amount_paid), 0) FROM public.memberships WHERE gym_id = v_gym_id AND created_at::DATE = v_today),
      'month_revenue', (SELECT COALESCE(sum(amount_paid), 0) FROM public.memberships WHERE gym_id = v_gym_id AND date_trunc('month', created_at) = date_trunc('month', now())),
      'revenue_7d', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'day', to_char(d.day, 'Dy'), 'date', to_char(d.day, 'MM/DD'),
          'revenue', COALESCE(r.revenue, 0)
        ) ORDER BY d.day), '[]'::jsonb)
        FROM (SELECT generate_series(v_today - 6, v_today, '1 day')::DATE AS day) d
        LEFT JOIN (
          SELECT created_at::DATE AS day, sum(amount_paid) AS revenue FROM public.memberships
          WHERE gym_id = v_gym_id AND created_at::DATE >= v_today - 6 GROUP BY 1
        ) r ON r.day = d.day
      )
    );
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_avatar_with_cooldown(
  p_member_id UUID,
  p_avatar_url TEXT,
  p_lock_days INTEGER DEFAULT 14
)
RETURNS TABLE(updated BOOLEAN, next_allowed_at TIMESTAMPTZ, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_gym_id UUID := public.get_gym_id();
  v_locked_until TIMESTAMPTZ;
  v_lock_days INTEGER := greatest(1, least(30, p_lock_days));
BEGIN
  IF auth.uid() IS NULL OR v_gym_id IS NULL
     OR NOT public.has_active_gym_affiliation(p_member_id, v_gym_id) THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 'Member not found.'::TEXT; RETURN;
  END IF;
  IF auth.uid() <> p_member_id AND NOT public.is_manager_of(v_gym_id) THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 'Forbidden.'::TEXT; RETURN;
  END IF;
  SELECT avatar_change_locked_until INTO v_locked_until
  FROM public.profiles WHERE id = p_member_id;
  IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
    RETURN QUERY SELECT false, v_locked_until, 'Avatar can only be changed after cooldown.'::TEXT; RETURN;
  END IF;
  UPDATE public.profiles SET
    avatar_url = p_avatar_url, avatar_updated_at = v_now,
    avatar_change_locked_until = v_now + make_interval(days => v_lock_days),
    avatar_change_count = COALESCE(avatar_change_count, 0) + 1
  WHERE id = p_member_id;
  RETURN QUERY SELECT true, v_now + make_interval(days => v_lock_days), 'Avatar updated.'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_avg_visit_interval(
  p_member_id UUID,
  p_gym_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_visits INTEGER;
  v_first_visit DATE;
  v_last_visit DATE;
  v_days_span INTEGER;
  v_avg_interval NUMERIC(5,2);
BEGIN
  SELECT count(*)::INTEGER, min(check_in::DATE), max(check_in::DATE)
  INTO v_total_visits, v_first_visit, v_last_visit
  FROM public.attendance
  WHERE member_id = p_member_id AND gym_id = p_gym_id;
  IF v_total_visits < 3 THEN RETURN NULL; END IF;
  v_days_span := v_last_visit - v_first_visit;
  IF v_days_span = 0 THEN v_avg_interval := 1.0;
  ELSE v_avg_interval := v_days_span::NUMERIC / (v_total_visits - 1); END IF;
  UPDATE public.streaks
  SET avg_visit_interval_days = v_avg_interval,
      total_visits = v_total_visits,
      first_visit_date = v_first_visit
  WHERE member_id = p_member_id AND gym_id = p_gym_id;
  RETURN v_avg_interval;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_avg_visit_interval(p_member_id UUID)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.calculate_avg_visit_interval(p_member_id, public.get_gym_id());
$$;

CREATE OR REPLACE FUNCTION public.can_send_member_notification_for_gym(
  p_member_id UUID,
  p_gym_id UUID,
  p_notification_type public.notification_type
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_service BOOLEAN := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''
  ) = 'service_role';
  v_prefs RECORD;
  v_cooldown RECORD;
  v_daily_count INTEGER;
  v_weekly_count INTEGER;
BEGIN
  IF NOT public.has_active_gym_affiliation(p_member_id, p_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF NOT v_is_service AND NOT (
    (auth.uid() = p_member_id AND public.get_gym_id() = p_gym_id)
    OR public.is_manager_of(p_gym_id)
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT COALESCE(inactivity_nudges_enabled, true) AS inactivity_enabled,
         COALESCE(streak_notifications_enabled, true) AS streak_enabled
  INTO v_prefs
  FROM public.member_notification_preferences
  WHERE member_id = p_member_id AND gym_id = p_gym_id;
  IF NOT FOUND THEN
    v_prefs.inactivity_enabled := true;
    v_prefs.streak_enabled := true;
  END IF;
  IF p_notification_type = 'inactivity_nudge' AND NOT v_prefs.inactivity_enabled THEN RETURN false; END IF;
  IF p_notification_type = 'streak_milestone' AND NOT v_prefs.streak_enabled THEN RETURN false; END IF;

  IF p_notification_type = 'inactivity_nudge' AND NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE member_id = p_member_id AND gym_id = p_gym_id
      AND status = 'active' AND end_date >= CURRENT_DATE
  ) THEN RETURN false; END IF;

  SELECT count(*) INTO v_daily_count FROM public.notifications
  WHERE member_id = p_member_id AND gym_id = p_gym_id
    AND for_member = true AND created_at::DATE = CURRENT_DATE;
  IF v_daily_count >= 2 THEN RETURN false; END IF;
  SELECT count(*) INTO v_weekly_count FROM public.notifications
  WHERE member_id = p_member_id AND gym_id = p_gym_id
    AND for_member = true AND created_at >= now() - INTERVAL '7 days';
  IF v_weekly_count >= 5 THEN RETURN false; END IF;

  SELECT * INTO v_cooldown FROM public.notification_cooldowns
  WHERE member_id = p_member_id AND gym_id = p_gym_id
    AND notification_type = p_notification_type;
  IF FOUND THEN
    IF p_notification_type = 'inactivity_nudge' THEN
      IF v_cooldown.inactivity_nudge_count >= 2
         OR v_cooldown.last_sent_at > now() - INTERVAL '7 days' THEN RETURN false; END IF;
    ELSIF p_notification_type = 'announcement'
      AND v_cooldown.last_sent_at > now() - INTERVAL '24 hours' THEN RETURN false;
    END IF;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_send_member_notification(
  p_member_id UUID,
  p_notification_type public.notification_type
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.can_send_member_notification_for_gym(
    p_member_id, public.get_gym_id(), p_notification_type
  );
$$;

CREATE OR REPLACE FUNCTION public.record_notification_sent(
  p_member_id UUID,
  p_gym_id UUID,
  p_notification_type public.notification_type
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.notification_cooldowns(
    member_id, gym_id, notification_type, last_sent_at,
    inactivity_nudge_count, daily_count, daily_count_date
  ) VALUES (
    p_member_id, p_gym_id, p_notification_type, now(),
    CASE WHEN p_notification_type = 'inactivity_nudge' THEN 1 ELSE 0 END,
    1, CURRENT_DATE
  )
  ON CONFLICT (member_id, gym_id, notification_type) DO UPDATE SET
    last_sent_at = now(),
    inactivity_nudge_count = CASE
      WHEN p_notification_type = 'inactivity_nudge'
      THEN public.notification_cooldowns.inactivity_nudge_count + 1
      ELSE public.notification_cooldowns.inactivity_nudge_count END,
    daily_count = CASE
      WHEN public.notification_cooldowns.daily_count_date = CURRENT_DATE
      THEN public.notification_cooldowns.daily_count + 1 ELSE 1 END,
    daily_count_date = CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_member_notification(
  p_member_id UUID,
  p_gym_id UUID,
  p_type public.notification_type,
  p_title TEXT,
  p_body TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  IF NOT public.can_send_member_notification_for_gym(p_member_id, p_gym_id, p_type) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications(
    gym_id, member_id, type, title, body, is_read, for_member, notification_type
  ) VALUES (p_gym_id, p_member_id, p_type::TEXT, p_title, p_body, false, true, p_type)
  RETURNING id INTO v_notification_id;
  PERFORM public.record_notification_sent(p_member_id, p_gym_id, p_type);
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_expiry_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER := 0;
  v_member RECORD;
  v_type public.notification_type;
  v_title TEXT;
  v_body TEXT;
BEGIN
  FOR v_member IN
    SELECT m.member_id, m.gym_id, m.end_date,
      (m.end_date - CURRENT_DATE) AS days_until_expiry
    FROM public.memberships m
    JOIN public.gym_users gu ON gu.user_id = m.member_id AND gu.gym_id = m.gym_id AND gu.status = 'active'
    WHERE m.status = 'active' AND m.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
  LOOP
    IF v_member.days_until_expiry = 7 THEN
      v_type := 'membership_expiry_7d'; v_title := 'Membership ending soon';
      v_body := 'Your membership ends on ' || to_char(v_member.end_date, 'Mon DD') || '. Renew anytime.';
    ELSIF v_member.days_until_expiry = 0 THEN
      v_type := 'membership_expiry_0d'; v_title := 'Last day of membership';
      v_body := 'Today is the last day of your membership.';
    ELSE CONTINUE;
    END IF;
    IF public.create_member_notification(
      v_member.member_id, v_member.gym_id, v_type, v_title, v_body
    ) IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_inactivity_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER := 0;
  v_member RECORD;
  v_avg_interval NUMERIC;
  v_threshold_days NUMERIC;
  v_nudge_count INTEGER;
BEGIN
  FOR v_member IN
    SELECT s.member_id, s.gym_id, s.last_visit_date,
      s.avg_visit_interval_days, s.total_visits, p.name,
      CURRENT_DATE - s.last_visit_date AS days_since_visit
    FROM public.streaks s
    JOIN public.gym_users gu ON gu.user_id = s.member_id AND gu.gym_id = s.gym_id AND gu.status = 'active'
    JOIN public.profiles p ON p.id = s.member_id
    WHERE s.last_visit_date IS NOT NULL AND s.last_visit_date < CURRENT_DATE
      AND EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.member_id = s.member_id AND m.gym_id = s.gym_id
          AND m.status = 'active' AND m.end_date >= CURRENT_DATE
      )
  LOOP
    v_avg_interval := v_member.avg_visit_interval_days;
    IF v_avg_interval IS NULL AND v_member.total_visits >= 3 THEN
      v_avg_interval := public.calculate_avg_visit_interval(v_member.member_id, v_member.gym_id);
    END IF;
    v_threshold_days := CASE WHEN v_avg_interval IS NULL THEN 7
      ELSE greatest(5, least(21, v_avg_interval * 1.5)) END;
    IF v_member.days_since_visit < v_threshold_days THEN CONTINUE; END IF;
    SELECT COALESCE(inactivity_nudge_count, 0) INTO v_nudge_count
    FROM public.notification_cooldowns
    WHERE member_id = v_member.member_id AND gym_id = v_member.gym_id
      AND notification_type = 'inactivity_nudge';
    IF COALESCE(v_nudge_count, 0) >= 2 THEN CONTINUE; END IF;
    IF public.create_member_notification(
      v_member.member_id, v_member.gym_id, 'inactivity_nudge',
      CASE WHEN COALESCE(v_nudge_count, 0) = 0 THEN 'We miss you!' ELSE 'Still here when you are ready' END,
      'Your next workout is waiting.'
    ) IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_inactivity_nudge_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.notification_cooldowns SET inactivity_nudge_count = 0
  WHERE member_id = NEW.member_id AND gym_id = NEW.gym_id
    AND notification_type = 'inactivity_nudge';
  PERFORM public.calculate_avg_visit_interval(NEW.member_id, NEW.gym_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_streak_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_title TEXT;
BEGIN
  IF NEW.current_streak <= OLD.current_streak
     OR NEW.current_streak <> ALL(ARRAY[7,14,30,50,100]) THEN RETURN NEW; END IF;
  v_title := NEW.current_streak || '-day streak!';
  PERFORM public.create_member_notification(
    NEW.member_id, NEW.gym_id, 'streak_milestone', v_title,
    'Your consistency is paying off. Keep it up!'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_pending_member_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT name INTO v_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.notifications(gym_id, type, title, body, member_id)
    VALUES (NEW.gym_id, 'member_pending', 'New member request',
      COALESCE(v_name, 'A member') || ' is waiting for approval', NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_pending_member ON public.profiles;
DROP TRIGGER IF EXISTS on_pending_gym_user ON public.gym_users;
CREATE TRIGGER on_pending_gym_user
  AFTER INSERT ON public.gym_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_pending_member_notification();

DROP TRIGGER IF EXISTS on_streak_milestone ON public.streaks;
CREATE TRIGGER on_streak_milestone
  AFTER UPDATE ON public.streaks
  FOR EACH ROW EXECUTE FUNCTION public.check_streak_milestone();

REVOKE EXECUTE ON FUNCTION public.can_send_member_notification(UUID, public.notification_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_send_member_notification_for_gym(UUID, UUID, public.notification_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_member_notification(UUID, UUID, public.notification_type, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_daily_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_member_notification(UUID, public.notification_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_member_notification(UUID, UUID, public.notification_type, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_daily_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.member_home_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_tz TEXT := 'Asia/Manila';
  v_month_start DATE := date_trunc('month', CURRENT_DATE AT TIME ZONE 'Asia/Manila')::DATE;
  v_subscription_status TEXT;
  v_lapsed_summary JSONB;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL OR v_gym_id IS NULL
     OR NOT public.has_active_gym_affiliation(v_uid, v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.member_id = v_uid AND m.gym_id = v_gym_id
        AND m.status = 'active' AND m.end_date >= CURRENT_DATE
    ) THEN 'active'
    WHEN EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.member_id = v_uid AND m.gym_id = v_gym_id
    ) THEN 'expired'
    ELSE 'none'
  END INTO v_subscription_status;

  SELECT jsonb_build_object(
    'current_streak', COALESCE(s.current_streak, 0),
    'best_streak', COALESCE(s.best_streak, 0),
    'total_visits', (SELECT count(*) FROM public.attendance a WHERE a.member_id = v_uid AND a.gym_id = v_gym_id),
    'member_since', gu.created_at
  ) INTO v_lapsed_summary
  FROM public.gym_users gu
  LEFT JOIN public.streaks s ON s.member_id = gu.user_id AND s.gym_id = gu.gym_id
  WHERE gu.user_id = v_uid AND gu.gym_id = v_gym_id;

  IF NOT public.has_member_portal_entitlement(v_uid, v_gym_id) THEN
    RETURN jsonb_build_object(
      'subscription_status', v_subscription_status,
      'lapsed_summary', COALESCE(v_lapsed_summary, '{}'::jsonb)
    );
  END IF;

  SELECT jsonb_build_object(
    'subscription_status', v_subscription_status,
    'lapsed_summary', v_lapsed_summary,
    'people_in_gym', (
      SELECT count(*) FROM public.attendance
      WHERE gym_id = v_gym_id AND check_out IS NULL
    ),
    'total_visits', (
      SELECT count(*) FROM public.attendance WHERE member_id = v_uid AND gym_id = v_gym_id
    ),
    'monthly_visits', (
      SELECT count(*) FROM public.attendance
      WHERE member_id = v_uid AND gym_id = v_gym_id
        AND (check_in AT TIME ZONE v_tz)::DATE >= v_month_start
    ),
    'avg_session_minutes', (
      SELECT COALESCE(round(avg(duration_min)), 0)
      FROM public.attendance
      WHERE member_id = v_uid AND gym_id = v_gym_id AND duration_min IS NOT NULL
    ),
    'streak', (
      SELECT jsonb_build_object(
        'current_streak', COALESCE(current_streak, 0),
        'best_streak', COALESCE(best_streak, 0),
        'last_visit_date', last_visit_date
      ) FROM public.streaks WHERE member_id = v_uid AND gym_id = v_gym_id
    ),
    'recent_visits', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', (check_in AT TIME ZONE v_tz)::DATE,
        'duration_min', duration_min
      ) ORDER BY check_in DESC), '[]'::jsonb)
      FROM (
        SELECT check_in, duration_min FROM public.attendance
        WHERE member_id = v_uid AND gym_id = v_gym_id
        ORDER BY check_in DESC LIMIT 10
      ) recent
    ),
    'calendar_dates', (
      SELECT COALESCE(jsonb_agg(DISTINCT (check_in AT TIME ZONE v_tz)::DATE), '[]'::jsonb)
      FROM public.attendance
      WHERE member_id = v_uid AND gym_id = v_gym_id
        AND (check_in AT TIME ZONE v_tz)::DATE >= CURRENT_DATE - INTERVAL '60 days'
    ),
    'membership', (
      SELECT jsonb_build_object(
        'plan_name', COALESCE(mp.name, 'Unknown'), 'status', m.status,
        'start_date', m.start_date, 'end_date', m.end_date,
        'days_left', greatest(0, m.end_date::DATE - CURRENT_DATE)
      )
      FROM public.memberships m
      LEFT JOIN public.membership_plans mp ON mp.id = m.plan_id
      WHERE m.member_id = v_uid AND m.gym_id = v_gym_id
      ORDER BY m.created_at DESC LIMIT 1
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_workouts(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.name, p.avatar_url, count(a.id)
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  JOIN public.attendance a ON a.member_id = p.id AND a.gym_id = gu.gym_id
  WHERE gu.gym_id = public.get_gym_id()
    AND gu.status = 'active'
    AND public.gym_feature_enabled('leaderboards', gu.gym_id)
    AND public.has_member_portal_entitlement(gu.user_id, gu.gym_id)
  GROUP BY p.id, p.name, p.avatar_url
  ORDER BY count(a.id) DESC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_week_streak(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH weekly_visits AS (
    SELECT a.member_id, date_trunc('week', a.check_in)::DATE AS week_start
    FROM public.attendance a
    WHERE a.gym_id = public.get_gym_id()
    GROUP BY a.member_id, date_trunc('week', a.check_in)::DATE
  ), ranked AS (
    SELECT member_id, week_start,
      row_number() OVER (PARTITION BY member_id ORDER BY week_start DESC) AS rn,
      (date_trunc('week', CURRENT_DATE)::DATE -
        ((row_number() OVER (PARTITION BY member_id ORDER BY week_start DESC) - 1) * INTERVAL '7 days'))::DATE AS expected_week
    FROM weekly_visits
  ), streak_values AS (
    SELECT member_id, count(*)::INTEGER AS week_streak
    FROM ranked WHERE week_start = expected_week GROUP BY member_id
  )
  SELECT p.id, p.name, p.avatar_url, COALESCE(s.week_streak, 0)
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  JOIN streak_values s ON s.member_id = gu.user_id
  WHERE gu.gym_id = public.get_gym_id()
    AND gu.status = 'active'
    AND public.gym_feature_enabled('leaderboards', gu.gym_id)
    AND public.has_member_portal_entitlement(gu.user_id, gu.gym_id)
    AND s.week_streak > 0
  ORDER BY s.week_streak DESC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_longest_member(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(member_id UUID, member_name TEXT, avatar_url TEXT, value INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.name, p.avatar_url,
    (extract(YEAR FROM age(CURRENT_DATE, gu.created_at::DATE)) * 12
      + extract(MONTH FROM age(CURRENT_DATE, gu.created_at::DATE)))::INTEGER AS value
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  WHERE gu.gym_id = public.get_gym_id()
    AND gu.status = 'active'
    AND public.gym_feature_enabled('leaderboards', gu.gym_id)
    AND public.has_member_portal_entitlement(gu.user_id, gu.gym_id)
  ORDER BY value DESC LIMIT p_limit;
$$;

-- Kiosk is explicitly pinned and never follows active gym.
-- Drop old overloads first so no unpinned entry point survives.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.kiosk_checkin(TEXT);
DROP FUNCTION IF EXISTS public.kiosk_checkin_by_member(UUID);
DROP FUNCTION IF EXISTS public.kiosk_checkout(UUID);
DROP FUNCTION IF EXISTS public.kiosk_get_checked_in();
DROP FUNCTION IF EXISTS public.kiosk_search_members(TEXT);

CREATE OR REPLACE FUNCTION public.kiosk_access_allowed(p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_gym_id IS NOT NULL
    AND public.is_manager_of(p_gym_id)
    AND public.has_gym_permission('kiosk:use', p_gym_id)
    AND public.gym_feature_enabled('kiosk_checkin', p_gym_id);
$$;

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

  IF NOT public.has_member_portal_entitlement(v_member.id, p_gym_id) THEN
    RETURN jsonb_build_object('error', 'membership_inactive', 'message', 'Membership renewal required');
  END IF;

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

CREATE OR REPLACE FUNCTION public.kiosk_checkin_by_member(p_member_id UUID, p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_qr TEXT;
BEGIN
  IF NOT public.has_active_gym_affiliation(p_member_id, p_gym_id) THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Member not found');
  END IF;
  SELECT qr_code INTO v_qr FROM public.profiles WHERE id = p_member_id;
  RETURN public.kiosk_checkin(v_qr, p_gym_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_checkout(p_attendance_id UUID, p_gym_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_duration INTEGER;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Kiosk check-ins are unavailable');
  END IF;
  UPDATE public.attendance
  SET check_out = now()
  WHERE id = p_attendance_id AND gym_id = p_gym_id AND check_out IS NULL
  RETURNING duration_min INTO v_duration;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  RETURN jsonb_build_object('duration_min', v_duration);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_get_checked_in(p_gym_id UUID)
RETURNS TABLE(attendance_id UUID, member_id UUID, member_name TEXT, check_in TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id) THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN QUERY
  SELECT a.id, a.member_id, p.name, a.check_in
  FROM public.attendance a
  JOIN public.profiles p ON p.id = a.member_id
  WHERE a.gym_id = p_gym_id AND a.check_out IS NULL
  ORDER BY a.check_in;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_search_members(p_query TEXT, p_gym_id UUID)
RETURNS TABLE(
  id UUID, name TEXT, email TEXT, contact_number TEXT,
  membership_status TEXT, plan_name TEXT, end_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pattern TEXT;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id)
     OR NOT public.has_gym_permission('members:view', p_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  v_pattern := '%' || public.escape_ilike(p_query) || '%';
  RETURN QUERY
  SELECT p.id, p.name, p.email, p.contact_number,
    latest.status::TEXT, mp.name, latest.end_date
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  LEFT JOIN LATERAL (
    SELECT m.status, m.end_date, m.plan_id
    FROM public.memberships m
    WHERE m.member_id = p.id AND m.gym_id = p_gym_id
    ORDER BY m.created_at DESC LIMIT 1
  ) latest ON true
  LEFT JOIN public.membership_plans mp ON mp.id = latest.plan_id
  WHERE gu.gym_id = p_gym_id
    AND gu.status = 'active'
    AND (p.name ILIKE v_pattern ESCAPE '\' OR p.contact_number ILIKE v_pattern ESCAPE '\')
  ORDER BY p.name LIMIT 20;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_update_streak(p_member_id UUID, p_gym_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_last_visit DATE;
  v_current INTEGER;
  v_best INTEGER;
BEGIN
  IF NOT public.kiosk_access_allowed(p_gym_id)
     OR NOT public.has_active_gym_affiliation(p_member_id, p_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT last_visit_date, current_streak, best_streak
  INTO v_last_visit, v_current, v_best
  FROM public.streaks
  WHERE member_id = p_member_id AND gym_id = p_gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.streaks(member_id, gym_id, current_streak, best_streak, last_visit_date)
    VALUES (p_member_id, p_gym_id, 1, 1, v_today)
    ON CONFLICT (member_id, gym_id) DO NOTHING;
    RETURN;
  END IF;
  IF v_last_visit = v_today THEN RETURN; END IF;
  IF v_last_visit = v_today - 1 THEN v_current := v_current + 1; ELSE v_current := 1; END IF;
  v_best := greatest(v_best, v_current);
  UPDATE public.streaks
  SET current_streak = v_current, best_streak = v_best, last_visit_date = v_today
  WHERE member_id = p_member_id AND gym_id = p_gym_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kiosk_access_allowed(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_checkin(TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_checkin_by_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_checkout(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_get_checked_in(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_search_members(TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kiosk_update_streak(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_access_allowed(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kiosk_checkin(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kiosk_checkin_by_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kiosk_checkout(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kiosk_get_checked_in(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kiosk_search_members(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kiosk_update_streak(UUID, UUID) TO authenticated, service_role;

-- Gym asset ownership follows the active gym affiliation. These policies were
-- created outside the numbered baseline on the hosted project, so they must be
-- replaced explicitly before profiles.role and profiles.gym_id are removed.
DROP POLICY IF EXISTS gym_assets_owner_upload ON storage.objects;
CREATE POLICY gym_assets_owner_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gym-assets'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_gym_id()::TEXT
    AND public.is_gym_owner(auth.uid(), public.get_gym_id())
  );

DROP POLICY IF EXISTS gym_assets_owner_update ON storage.objects;
CREATE POLICY gym_assets_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'gym-assets'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_gym_id()::TEXT
    AND public.is_gym_owner(auth.uid(), public.get_gym_id())
  );

DROP POLICY IF EXISTS gym_assets_owner_delete ON storage.objects;
CREATE POLICY gym_assets_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gym-assets'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_gym_id()::TEXT
    AND public.is_gym_owner(auth.uid(), public.get_gym_id())
  );

-- ---------------------------------------------------------------------------
-- 8. Legacy identity columns are dropped only after the backfill and all
-- dependent policies/functions are replaced above/below.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
DROP TRIGGER IF EXISTS on_pending_member ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_profile_privilege_escalation();
DROP INDEX IF EXISTS public.idx_profiles_gym;
DROP INDEX IF EXISTS public.idx_profiles_gym_role_status;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS gym_id,
  DROP COLUMN IF EXISTS status;
