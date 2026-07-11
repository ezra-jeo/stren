-- Role defaults + per-user overrides. The checked-in TypeScript fixture is
-- mirrored below; owner rows are the canonical permission-key registry.

CREATE TABLE IF NOT EXISTS public.gym_role_permission_defaults (
  role public.user_role NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS public.gym_user_permission_overrides (
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  granted_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, user_id, permission)
);

INSERT INTO public.gym_role_permission_defaults (role, permission) VALUES
  ('owner', 'dashboard:view'),
  ('owner', 'dashboard:finance:view'),
  ('owner', 'reports:attendance:view'),
  ('owner', 'reports:finance:view'),
  ('owner', 'members:view'),
  ('owner', 'members:manage'),
  ('owner', 'members:payment_history:view'),
  ('owner', 'payments:view'),
  ('owner', 'payments:create'),
  ('owner', 'plans:manage'),
  ('owner', 'promos:manage'),
  ('owner', 'announcements:manage'),
  ('owner', 'gym_page:view'),
  ('owner', 'gym_page:edit'),
  ('owner', 'gym_page:publish'),
  ('owner', 'features:manage'),
  ('owner', 'roles:manage'),
  ('owner', 'kiosk:use'),
  ('owner', 'cache:revalidate'),
  ('admin', 'dashboard:view'),
  ('admin', 'dashboard:finance:view'),
  ('admin', 'reports:attendance:view'),
  ('admin', 'reports:finance:view'),
  ('admin', 'members:view'),
  ('admin', 'members:manage'),
  ('admin', 'members:payment_history:view'),
  ('admin', 'payments:view'),
  ('admin', 'payments:create'),
  ('admin', 'plans:manage'),
  ('admin', 'promos:manage'),
  ('admin', 'announcements:manage'),
  ('admin', 'kiosk:use'),
  ('admin', 'cache:revalidate'),
  ('staff', 'members:view'),
  ('staff', 'kiosk:use')
ON CONFLICT (role, permission) DO NOTHING;

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
  v_profile_gym UUID;
  v_result BOOLEAN;
BEGIN
  SELECT role, gym_id INTO v_role, v_profile_gym
  FROM public.profiles
  WHERE id = auth.uid() AND status <> 'rejected';

  IF NOT FOUND OR p_gym_id IS NULL OR v_profile_gym IS DISTINCT FROM p_gym_id THEN
    RETURN false;
  END IF;

  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.gym_role_permission_defaults
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
      SELECT 1
      FROM public.gym_role_permission_defaults
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

REVOKE EXECUTE ON FUNCTION public.has_gym_permission(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_gym_permission(TEXT, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_gym_id UUID;
  v_permissions JSONB;
BEGIN
  SELECT role, gym_id INTO v_role, v_gym_id
  FROM public.profiles
  WHERE id = auth.uid() AND status <> 'rejected';

  IF NOT FOUND THEN
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
      'member_feed', true,
      'leaderboards', true,
      'public_team', true,
      'public_pricing', true,
      'public_location', true,
      'announcements', true,
      'promos', true,
      'kiosk_checkin', true,
      'trainer_bookings', false,
      'friends_chat', false,
      'workout_log', false,
      'session_posts', false
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated, service_role;

ALTER TABLE public.gym_role_permission_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_user_permission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permission_defaults_select ON public.gym_role_permission_defaults;
CREATE POLICY permission_defaults_select
  ON public.gym_role_permission_defaults FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS permission_overrides_select ON public.gym_user_permission_overrides;
CREATE POLICY permission_overrides_select
  ON public.gym_user_permission_overrides FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (gym_id = public.get_gym_id() AND public.is_manager())
  );

DROP POLICY IF EXISTS permission_overrides_insert ON public.gym_user_permission_overrides;
CREATE POLICY permission_overrides_insert
  ON public.gym_user_permission_overrides FOR INSERT TO authenticated
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('roles:manage', gym_id)
  );

DROP POLICY IF EXISTS permission_overrides_update ON public.gym_user_permission_overrides;
CREATE POLICY permission_overrides_update
  ON public.gym_user_permission_overrides FOR UPDATE TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('roles:manage', gym_id)
  )
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('roles:manage', gym_id)
  );

DROP POLICY IF EXISTS permission_overrides_delete ON public.gym_user_permission_overrides;
CREATE POLICY permission_overrides_delete
  ON public.gym_user_permission_overrides FOR DELETE TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('roles:manage', gym_id)
  );

CREATE OR REPLACE FUNCTION public.validate_permission_override()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_target_role public.user_role;
  v_target_gym UUID;
BEGIN
  IF NEW.permission IN ('roles:manage', 'features:manage', 'gym_page:publish') THEN
    RAISE EXCEPTION 'permission cannot be delegated: %', NEW.permission;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.gym_role_permission_defaults
    WHERE role = 'owner' AND permission = NEW.permission
  ) THEN
    RAISE EXCEPTION 'unknown permission: %', NEW.permission;
  END IF;

  SELECT role, gym_id INTO v_target_role, v_target_gym
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF NOT FOUND
     OR v_target_gym IS DISTINCT FROM NEW.gym_id
     OR v_target_role IN ('owner', 'member') THEN
    RAISE EXCEPTION 'invalid permission override target';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_permission_override ON public.gym_user_permission_overrides;
CREATE TRIGGER validate_permission_override
  BEFORE INSERT OR UPDATE ON public.gym_user_permission_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_permission_override();

-- Permission-based policy swaps.
DROP POLICY IF EXISTS gyms_update ON public.gyms;
CREATE POLICY gyms_update
  ON public.gyms FOR UPDATE TO authenticated
  USING (
    id = public.get_gym_id()
    AND public.has_gym_permission('gym_page:edit', id)
  )
  WITH CHECK (
    id = public.get_gym_id()
    AND public.has_gym_permission('gym_page:edit', id)
  );

CREATE OR REPLACE FUNCTION public.protect_gym_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_published IS DISTINCT FROM OLD.is_published
     AND NOT public.has_gym_permission('gym_page:publish', NEW.id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_gym_publish() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_gym_publish ON public.gyms;
CREATE TRIGGER protect_gym_publish
  BEFORE UPDATE ON public.gyms
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_gym_publish();

DROP POLICY IF EXISTS dev_all_payments ON public.payments;
DROP POLICY IF EXISTS payments_select ON public.payments;
DROP POLICY IF EXISTS payments_insert ON public.payments;

CREATE POLICY payments_select
  ON public.payments FOR SELECT TO authenticated
  USING (
    auth.uid() = member_id
    OR (
      gym_id = public.get_gym_id()
      AND (
        public.has_gym_permission('payments:view', gym_id)
        OR public.has_gym_permission('members:payment_history:view', gym_id)
      )
    )
  );

CREATE POLICY payments_insert
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('payments:create', gym_id)
  );

DROP POLICY IF EXISTS plans_manage ON public.membership_plans;
DROP POLICY IF EXISTS plans_admin_all ON public.membership_plans;
CREATE POLICY plans_manage
  ON public.membership_plans FOR ALL TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('plans:manage', gym_id)
  )
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('plans:manage', gym_id)
  );

DROP POLICY IF EXISTS promos_manage ON public.promos;
DROP POLICY IF EXISTS promos_admin_all ON public.promos;
CREATE POLICY promos_manage
  ON public.promos FOR ALL TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('promos:manage', gym_id)
  )
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('promos:manage', gym_id)
  );

DROP POLICY IF EXISTS announcements_manage ON public.announcements;
DROP POLICY IF EXISTS announcements_admin_all ON public.announcements;
CREATE POLICY announcements_manage
  ON public.announcements FOR ALL TO authenticated
  USING (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('announcements:manage', gym_id)
  )
  WITH CHECK (
    gym_id = public.get_gym_id()
    AND public.has_gym_permission('announcements:manage', gym_id)
  );

-- Dashboard data is available only to dashboard viewers. Money-denominated
-- fields are appended only for callers with the separate finance permission.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
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
        'id', a.id,
        'member_id', a.member_id,
        'check_in', a.check_in,
        'name', p.name
      )), '[]'::jsonb)
      FROM public.attendance a
      JOIN public.profiles p ON p.id = a.member_id
      WHERE a.gym_id = v_gym_id AND a.check_out IS NULL
    ),
    'today_visits', (
      SELECT COUNT(*) FROM public.attendance
      WHERE gym_id = v_gym_id AND check_in::DATE = v_today
    ),
    'total_members', (
      SELECT COUNT(*) FROM public.profiles
      WHERE gym_id = v_gym_id AND role = 'member' AND status = 'active'
    ),
    'pending_count', (
      SELECT COUNT(*) FROM public.profiles
      WHERE gym_id = v_gym_id AND role = 'member' AND status = 'pending'
    ),
    'active_plans', (
      SELECT COUNT(*) FROM public.memberships
      WHERE gym_id = v_gym_id AND status = 'active'
    ),
    'expired_plans', (
      SELECT COUNT(*) FROM public.memberships
      WHERE gym_id = v_gym_id AND status = 'expired'
    ),
    'frozen_plans', (
      SELECT COUNT(*) FROM public.memberships
      WHERE gym_id = v_gym_id AND status = 'frozen'
    ),
    'attendance_7d', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day', TO_CHAR(d.day, 'Dy'),
        'date', TO_CHAR(d.day, 'MM/DD'),
        'visits', COALESCE(v.visits, 0)
      ) ORDER BY d.day), '[]'::jsonb)
      FROM (
        SELECT generate_series(v_today - 6, v_today, '1 day'::interval)::DATE AS day
      ) d
      LEFT JOIN (
        SELECT check_in::DATE AS day, COUNT(*) AS visits
        FROM public.attendance
        WHERE gym_id = v_gym_id AND check_in::DATE >= v_today - 6
        GROUP BY 1
      ) v ON v.day = d.day
    )
  ) INTO v_result;

  IF public.has_gym_permission('dashboard:finance:view', v_gym_id) THEN
    v_result := v_result || jsonb_build_object(
      'today_revenue', (
        SELECT COALESCE(SUM(amount_paid), 0) FROM public.memberships
        WHERE gym_id = v_gym_id AND created_at::DATE = v_today
      ),
      'month_revenue', (
        SELECT COALESCE(SUM(amount_paid), 0) FROM public.memberships
        WHERE gym_id = v_gym_id
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      ),
      'revenue_7d', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'day', TO_CHAR(d.day, 'Dy'),
          'date', TO_CHAR(d.day, 'MM/DD'),
          'revenue', COALESCE(r.revenue, 0)
        ) ORDER BY d.day), '[]'::jsonb)
        FROM (
          SELECT generate_series(v_today - 6, v_today, '1 day'::interval)::DATE AS day
        ) d
        LEFT JOIN (
          SELECT created_at::DATE AS day, SUM(amount_paid) AS revenue
          FROM public.memberships
          WHERE gym_id = v_gym_id AND created_at::DATE >= v_today - 6
          GROUP BY 1
        ) r ON r.day = d.day
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_reports_data(p_days INTEGER DEFAULT 14)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_today DATE := CURRENT_DATE;
  v_month_start DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_result JSONB;
BEGIN
  IF NOT public.has_gym_permission('reports:attendance:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT jsonb_build_object(
    'active_count', (
      SELECT COUNT(*) FROM public.memberships
      WHERE gym_id = v_gym_id AND status = 'active'
    ),
    'expired_count', (
      SELECT COUNT(*) FROM public.memberships
      WHERE gym_id = v_gym_id AND status = 'expired'
    ),
    'attendance_by_day', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', TO_CHAR(d.day, 'MM/DD'),
        'visits', COALESCE(v.visits, 0)
      ) ORDER BY d.day), '[]'::jsonb)
      FROM (
        SELECT generate_series(v_today - (p_days - 1), v_today, '1 day'::interval)::DATE AS day
      ) d
      LEFT JOIN (
        SELECT check_in::DATE AS day, COUNT(*) AS visits
        FROM public.attendance
        WHERE gym_id = v_gym_id AND check_in::DATE >= v_today - (p_days - 1)
        GROUP BY 1
      ) v ON v.day = d.day
    ),
    'peak_hours', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'hour', h,
        'label', TO_CHAR((h || ':00')::time, 'HH12 AM'),
        'count', cnt
      ) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT EXTRACT(HOUR FROM check_in)::INT AS h, COUNT(*) AS cnt
        FROM public.attendance
        WHERE gym_id = v_gym_id AND check_in IS NOT NULL
        GROUP BY 1 ORDER BY cnt DESC LIMIT 5
      ) t
    )
  ) INTO v_result;

  IF public.has_gym_permission('reports:finance:view', v_gym_id) THEN
    v_result := v_result || jsonb_build_object(
      'month_revenue', (
        SELECT COALESCE(SUM(amount_paid), 0) FROM public.memberships
        WHERE gym_id = v_gym_id AND created_at::DATE >= v_month_start
      ),
      'revenue_by_day', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'date', TO_CHAR(d.day, 'MM/DD'),
          'revenue', COALESCE(r.revenue, 0)
        ) ORDER BY d.day), '[]'::jsonb)
        FROM (
          SELECT generate_series(v_today - (p_days - 1), v_today, '1 day'::interval)::DATE AS day
        ) d
        LEFT JOIN (
          SELECT created_at::DATE AS day, SUM(amount_paid) AS revenue
          FROM public.memberships
          WHERE gym_id = v_gym_id AND created_at::DATE >= v_today - (p_days - 1)
          GROUP BY 1
        ) r ON r.day = d.day
      ),
      'revenue_by_dom', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'day', dom,
          'amount', total
        ) ORDER BY total DESC), '[]'::jsonb)
        FROM (
          SELECT EXTRACT(DAY FROM created_at)::INT AS dom, SUM(amount_paid) AS total
          FROM public.memberships
          WHERE gym_id = v_gym_id
          GROUP BY 1 ORDER BY total DESC LIMIT 5
        ) t
      ),
      'method_breakdown', (
        SELECT jsonb_build_object(
          'cash_total', COALESCE(SUM(amount_paid) FILTER (WHERE payment_method = 'cash'), 0),
          'cash_count', COUNT(*) FILTER (WHERE payment_method = 'cash'),
          'gcash_total', COALESCE(SUM(amount_paid) FILTER (WHERE payment_method = 'gcash'), 0),
          'gcash_count', COUNT(*) FILTER (WHERE payment_method = 'gcash')
        )
        FROM public.memberships
        WHERE gym_id = v_gym_id
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reports_data(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reports_data(INTEGER) TO authenticated, service_role;
