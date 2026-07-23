-- Shot B closure: keep the legacy payments table as historical evidence only.
-- Financial writes continue exclusively through the append-only ledger RPCs.

DROP POLICY IF EXISTS payments_insert ON public.payments;
DROP POLICY IF EXISTS payments_update ON public.payments;
DROP POLICY IF EXISTS payments_delete ON public.payments;

REVOKE ALL ON TABLE public.payments
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.payments TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.payments'::REGCLASS
      AND conname = 'payments_amount_nonnegative'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_amount_nonnegative
      CHECK (amount >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE amount < 0) THEN
    ALTER TABLE public.payments
      VALIDATE CONSTRAINT payments_amount_nonnegative;
  ELSE
    RAISE WARNING
      'legacy payments contains negative historical rows; new invalid writes are blocked and validation remains pending';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.payments'::REGCLASS
      AND conname = 'payments_amount_finite_nonnegative'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_amount_finite_nonnegative
      CHECK (
        amount NOT IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
        AND amount >= 0
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE amount IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
       OR amount < 0
  ) THEN
    ALTER TABLE public.payments
      VALIDATE CONSTRAINT payments_amount_finite_nonnegative;
  ELSE
    RAISE WARNING
      'legacy payments contains invalid historical amounts; writes are closed and finite-value validation remains pending';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.membership_plans
    WHERE price IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
       OR price < 0 OR duration_days <= 0
  ) OR EXISTS (
    SELECT 1 FROM public.promos
    WHERE discount_value IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
       OR discount_value < 0
  ) OR EXISTS (
    SELECT 1 FROM public.memberships
    WHERE amount_paid IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
       OR amount_paid < 0
  ) OR EXISTS (
    SELECT 1 FROM public.financial_transactions
    WHERE ledger_amount IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
       OR gross_amount IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
       OR discount_amount IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
  ) THEN
    RAISE EXCEPTION
      'financial amount inventory requires repair before migration 028';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.membership_plans'::REGCLASS
      AND conname = 'membership_plans_price_finite_nonnegative'
  ) THEN
    ALTER TABLE public.membership_plans
      ADD CONSTRAINT membership_plans_price_finite_nonnegative
      CHECK (
        price NOT IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
        AND price >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.promos'::REGCLASS
      AND conname = 'promos_discount_value_finite'
  ) THEN
    ALTER TABLE public.promos
      ADD CONSTRAINT promos_discount_value_finite
      CHECK (
        discount_value NOT IN (
          'NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.memberships'::REGCLASS
      AND conname = 'memberships_amount_paid_finite_nonnegative'
  ) THEN
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_amount_paid_finite_nonnegative
      CHECK (
        amount_paid IS NULL
        OR (
          amount_paid NOT IN (
            'NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC
          )
          AND amount_paid >= 0
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.financial_transactions'::REGCLASS
      AND conname = 'financial_transactions_amounts_finite'
  ) THEN
    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT financial_transactions_amounts_finite
      CHECK (
        ledger_amount NOT IN (
          'NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC
        )
        AND gross_amount NOT IN (
          'NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC
        )
        AND discount_amount NOT IN (
          'NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC
        )
      );
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
  WITH function_targets(key, identity) AS (
    VALUES
      ('function:record_membership_payment', 'public.record_membership_payment(uuid,uuid,public.payment_method,text,uuid,date)'),
      ('function:reverse_financial_transaction', 'public.reverse_financial_transaction(uuid,text,numeric,text,boolean,text)'),
      ('function:record_financial_adjustment', 'public.record_financial_adjustment(uuid,numeric,text,text,timestamp with time zone)'),
      ('function:effective_membership_status', 'public.effective_membership_status(uuid,uuid,date)'),
      ('function:admin_membership_status_export', 'public.admin_membership_status_export()'),
      ('function:has_member_portal_entitlement', 'public.has_member_portal_entitlement(uuid,uuid)'),
      ('function:admin_dashboard_stats', 'public.admin_dashboard_stats()'),
      ('function:admin_reports_data', 'public.admin_reports_data(integer)'),
      ('function:financial_reconciliation', 'public.financial_reconciliation(date,date)')
  ),
  definitions AS (
    SELECT target.key, pg_get_functiondef(to_regprocedure(target.identity)) AS definition
    FROM function_targets target
    WHERE to_regprocedure(target.identity) IS NOT NULL

    UNION ALL

    SELECT
      'policy:' || policy.schemaname || '.' || policy.tablename || '.' || policy.policyname,
      concat_ws('|', policy.cmd, policy.permissive, array_to_string(policy.roles, ','), policy.qual, policy.with_check)
    FROM pg_catalog.pg_policies policy
    WHERE (policy.schemaname, policy.tablename, policy.policyname) IN (
      ('public', 'payments', 'payments_select'),
      ('public', 'financial_transactions', 'financial_transactions_select'),
      ('public', 'profiles', 'profiles_select_self'),
      ('public', 'attendance', 'attendance_select')
    )

    UNION ALL

    SELECT
      'trigger:' || namespace.nspname || '.' || relation.relname || '.' || trigger.tgname,
      pg_get_triggerdef(trigger.oid, true)
    FROM pg_catalog.pg_trigger trigger
    JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND (relation.relname, trigger.tgname) IN (
        ('financial_transactions', 'validate_financial_transaction_insert'),
        ('financial_transactions', 'reject_financial_transaction_update_delete'),
        ('memberships', 'prevent_overlapping_membership_access'),
        ('privileged_audit_events', 'privileged_audit_events_immutable'),
        ('gym_users', 'guard_gym_user_privileged_change')
      )

    UNION ALL

    SELECT
      'constraint:' || namespace.nspname || '.' || relation.relname || '.' || constraint_row.conname,
      pg_get_constraintdef(constraint_row.oid, true)
    FROM pg_catalog.pg_constraint constraint_row
    JOIN pg_catalog.pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND (relation.relname, constraint_row.conname) IN (
        ('payments', 'payments_amount_nonnegative'),
        ('payments', 'payments_amount_finite_nonnegative'),
        ('membership_plans', 'membership_plans_price_finite_nonnegative'),
        ('promos', 'promos_discount_value_finite'),
        ('memberships', 'memberships_amount_paid_finite_nonnegative'),
        ('financial_transactions', 'financial_transactions_amounts_finite'),
        ('financial_transactions', 'financial_transactions_event_shape'),
        ('memberships', 'memberships_dates_ordered'),
        ('memberships', 'memberships_no_overlapping_paid_access'),
        ('financial_idempotency_requests', 'financial_idempotency_requests_pkey'),
        ('financial_idempotency_requests', 'financial_idempotency_requests_fingerprint_check'),
        ('financial_idempotency_requests', 'financial_idempotency_requests_operation_check'),
        ('financial_idempotency_requests', 'financial_idempotency_requests_transaction_key'),
        ('financial_idempotency_requests', 'financial_idempotency_requests_transaction_gym_fkey')
      )

    UNION ALL

    SELECT 'grants:protected_financial_boundaries', COALESCE(string_agg(item, E'\n' ORDER BY item), '')
    FROM (
      SELECT
        grant_row.table_schema || '.' || grant_row.table_name || ':' ||
        grant_row.grantee || ':' || grant_row.privilege_type AS item
      FROM information_schema.role_table_grants grant_row
      WHERE grant_row.table_schema = 'public'
        AND grant_row.table_name IN (
          'payments', 'financial_transactions', 'financial_idempotency_requests', 'memberships'
        )
        AND grant_row.grantee IN ('anon', 'authenticated', 'service_role')
      UNION ALL
      SELECT
        grant_row.routine_schema || '.' || grant_row.routine_name || ':' ||
        grant_row.grantee || ':' || grant_row.privilege_type AS item
      FROM information_schema.routine_privileges grant_row
      WHERE grant_row.routine_schema = 'public'
        AND grant_row.routine_name IN (
          'record_membership_payment', 'reverse_financial_transaction',
          'record_financial_adjustment', 'admin_dashboard_stats',
          'admin_reports_data', 'admin_membership_status_export',
          'financial_reconciliation'
        )
        AND grant_row.grantee IN ('anon', 'authenticated', 'service_role')
    ) grants
  )
  SELECT COALESCE(jsonb_object_agg(
    definitions.key,
    encode(
      extensions.digest(
        convert_to(regexp_replace(trim(definitions.definition), '\s+', ' ', 'g'), 'UTF8'),
        'sha256'
      ),
      'hex'
    )
    ORDER BY definitions.key
  ), '{}'::JSONB)
  FROM definitions;
$$;

REVOKE EXECUTE ON FUNCTION public.deployment_protected_definition_hashes()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deployment_protected_definition_hashes()
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.deployment_contract_snapshot_legacy_026()') IS NULL THEN
    ALTER FUNCTION public.deployment_contract_snapshot()
      RENAME TO deployment_contract_snapshot_legacy_026;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.deployment_contract_snapshot_legacy_026()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.deployment_contract_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claims TEXT;
  v_role TEXT;
BEGIN
  v_role := NULLIF(current_setting('request.jwt.claim.role', TRUE), '');
  IF v_role IS NULL THEN
    v_claims := NULLIF(current_setting('request.jwt.claims', TRUE), '');
    IF v_claims IS NOT NULL THEN
      v_role := v_claims::JSONB ->> 'role';
    END IF;
  END IF;

  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN public.deployment_contract_snapshot_legacy_026()
    || jsonb_build_object(
      'definitionHashes', public.deployment_protected_definition_hashes()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.deployment_contract_snapshot()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deployment_contract_snapshot()
  TO service_role;

CREATE OR REPLACE FUNCTION public.assert_development_seed_allowed(
  p_opt_in TEXT,
  p_project_id TEXT,
  p_api_url TEXT,
  p_server_addr INET
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_opt_in IS DISTINCT FROM 'stren-local-development' THEN
    RAISE EXCEPTION 'DEVELOPMENT-ONLY seed refused: explicit opt-in is missing';
  END IF;
  IF p_project_id IS DISTINCT FROM 'stren' THEN
    RAISE EXCEPTION 'DEVELOPMENT-ONLY seed refused: project identity is not allowlisted';
  END IF;
  IF p_api_url !~ '^http://(127\.0\.0\.1|localhost):54321/?$' THEN
    RAISE EXCEPTION 'DEVELOPMENT-ONLY seed refused: an exact loopback API URL is required';
  END IF;
  IF p_server_addr IS NULL
     OR NOT (
       p_server_addr << inet '127.0.0.0/8'
       OR p_server_addr << inet '10.0.0.0/8'
       OR p_server_addr << inet '172.16.0.0/12'
       OR p_server_addr << inet '192.168.0.0/16'
     ) THEN
    RAISE EXCEPTION 'DEVELOPMENT-ONLY seed refused: local database network marker is absent';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_development_seed_allowed(
  TEXT, TEXT, TEXT, INET
) FROM PUBLIC, anon, authenticated, service_role;

-- Idempotency is a first-class persisted request contract. The immutable
-- ledger remains untouched; this registry records the canonical request that
-- produced each historical or new event.
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_id_gym_key
  ON public.financial_transactions(id, gym_id);

CREATE TABLE IF NOT EXISTS public.financial_idempotency_requests (
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  transaction_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_idempotency_requests_pkey
    PRIMARY KEY (gym_id, idempotency_key),
  CONSTRAINT financial_idempotency_requests_operation_check
    CHECK (operation IN ('payment', 'reversal', 'adjustment', 'legacy_backfill')),
  CONSTRAINT financial_idempotency_requests_key_check
    CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 200),
  CONSTRAINT financial_idempotency_requests_fingerprint_check
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT financial_idempotency_requests_transaction_key
    UNIQUE (transaction_id),
  CONSTRAINT financial_idempotency_requests_transaction_gym_fkey
    FOREIGN KEY (transaction_id, gym_id)
    REFERENCES public.financial_transactions(id, gym_id)
    ON DELETE RESTRICT
);

ALTER TABLE public.financial_idempotency_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_idempotency_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.financial_idempotency_requests TO service_role;

CREATE OR REPLACE FUNCTION public.financial_request_fingerprint(
  p_operation TEXT,
  p_request JSONB
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT encode(
    extensions.digest(
      convert_to(lower(trim(p_operation)) || ':' || p_request::TEXT, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.financial_request_fingerprint(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.financial_request_fingerprint(TEXT, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.paid_membership_end_date(
  p_start_date DATE,
  p_duration_days INTEGER
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
BEGIN
  IF p_start_date IS NULL OR p_duration_days IS NULL OR p_duration_days <= 0 THEN
    RAISE EXCEPTION 'invalid paid membership period';
  END IF;
  RETURN p_start_date + (p_duration_days - 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.paid_membership_end_date(DATE, INTEGER)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paid_membership_end_date(DATE, INTEGER)
  TO authenticated, service_role;

INSERT INTO public.financial_idempotency_requests(
  gym_id, idempotency_key, operation, request_fingerprint,
  transaction_id, created_at
)
SELECT
  ft.gym_id,
  ft.idempotency_key,
  CASE
    WHEN ft.source = 'legacy_membership_backfill' THEN 'legacy_backfill'
    WHEN ft.kind = 'payment' THEN 'payment'
    WHEN ft.kind IN ('refund', 'void') THEN 'reversal'
    ELSE 'adjustment'
  END,
  public.financial_request_fingerprint(
    CASE
      WHEN ft.source = 'legacy_membership_backfill' THEN 'legacy_backfill'
      WHEN ft.kind = 'payment' THEN 'payment'
      WHEN ft.kind IN ('refund', 'void') THEN 'reversal'
      ELSE 'adjustment'
    END,
    CASE
      WHEN ft.kind = 'payment' THEN jsonb_build_object(
        'member_id', ft.member_id,
        'plan_id', ft.plan_snapshot ->> 'id',
        'payment_method', ft.payment_method,
        'promo_id', ft.discount_snapshot ->> 'id',
        'requested_start_date', ft.metadata ->> 'requested_start_date'
      )
      WHEN ft.kind IN ('refund', 'void') THEN jsonb_build_object(
        'transaction_id', ft.reverses_transaction_id,
        'kind', ft.kind,
        'amount', -ft.ledger_amount,
        'reason', ft.reason,
        'revoke_membership', COALESCE(
          (ft.metadata ->> 'membership_revoked')::BOOLEAN,
          false
        )
      )
      WHEN ft.kind = 'adjustment' THEN jsonb_build_object(
        'member_id', ft.member_id,
        'amount', ft.ledger_amount,
        'reason', ft.reason,
        'occurred_at', ft.occurred_at
      )
      ELSE jsonb_build_object('membership_id', ft.membership_id)
    END
  ),
  ft.id,
  ft.created_at
FROM public.financial_transactions ft
ON CONFLICT (gym_id, idempotency_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reverse_financial_transaction(
  p_transaction_id UUID,
  p_kind TEXT,
  p_amount NUMERIC,
  p_reason TEXT,
  p_revoke_membership BOOLEAN,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_actor_name TEXT;
  v_actor_role public.user_role;
  v_original public.financial_transactions%ROWTYPE;
  v_existing public.financial_transactions%ROWTYPE;
  v_request public.financial_idempotency_requests%ROWTYPE;
  v_fingerprint TEXT;
  v_reversed NUMERIC(12,2);
  v_remaining NUMERIC(12,2);
  v_amount NUMERIC(12,2);
  v_reversal_id UUID;
BEGIN
  p_kind := lower(trim(p_kind));
  p_reason := trim(p_reason);
  p_idempotency_key := trim(p_idempotency_key);
  IF v_actor_id IS NULL OR v_gym_id IS NULL
     OR p_kind NOT IN ('refund', 'void')
     OR p_revoke_membership IS NULL
     OR length(p_reason) < 3
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid reversal request';
  END IF;
  IF NOT public.is_gym_owner(v_actor_id, v_gym_id)
     OR NOT public.has_gym_permission('payments:reverse', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_fingerprint := public.financial_request_fingerprint(
    'reversal',
    jsonb_build_object(
      'transaction_id', p_transaction_id,
      'kind', p_kind,
      'amount', CASE WHEN p_amount IS NULL THEN NULL ELSE round(p_amount, 2) END,
      'reason', p_reason,
      'revoke_membership', p_revoke_membership
    )
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_gym_id::TEXT || ':financial-idempotency:' || p_idempotency_key, 0)
  );

  SELECT * INTO v_request
  FROM public.financial_idempotency_requests
  WHERE gym_id = v_gym_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_request.operation <> 'reversal'
       OR v_request.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'idempotency key was already used for a different request';
    END IF;
    SELECT * INTO STRICT v_existing
    FROM public.financial_transactions
    WHERE id = v_request.transaction_id AND gym_id = v_gym_id;
    RETURN jsonb_build_object(
      'transaction_id', v_existing.id,
      'reversed_transaction_id', v_existing.reverses_transaction_id,
      'amount', -v_existing.ledger_amount,
      'membership_revoked', COALESCE(
        (v_existing.metadata ->> 'membership_revoked')::BOOLEAN,
        false
      ),
      'idempotent_replay', true
    );
  END IF;

  SELECT * INTO v_original
  FROM public.financial_transactions
  WHERE id = p_transaction_id AND gym_id = v_gym_id
  FOR UPDATE;
  IF NOT FOUND OR v_original.ledger_amount <= 0 THEN
    RAISE EXCEPTION 'positive transaction was not found in the current gym';
  END IF;

  SELECT COALESCE(sum(-ledger_amount), 0)
  INTO v_reversed
  FROM public.financial_transactions
  WHERE reverses_transaction_id = v_original.id
    AND kind IN ('refund', 'void');
  v_remaining := round(v_original.ledger_amount - v_reversed, 2);
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'transaction is already fully reversed';
  END IF;

  v_amount := round(COALESCE(p_amount, v_remaining), 2);
  IF v_amount <= 0 OR v_amount > v_remaining THEN
    RAISE EXCEPTION 'reversal exceeds remaining transaction value';
  END IF;
  IF p_kind = 'void' AND v_amount <> v_remaining THEN
    RAISE EXCEPTION 'void must reverse the full remaining transaction value';
  END IF;

  SELECT gu.role, p.name INTO v_actor_role, v_actor_name
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  WHERE gu.gym_id = v_gym_id
    AND gu.user_id = v_actor_id
    AND gu.status = 'active';

  INSERT INTO public.financial_transactions(
    gym_id, member_id, membership_id, kind, source,
    reverses_transaction_id, ledger_amount, gross_amount, discount_amount,
    currency, payment_method, plan_snapshot, discount_snapshot,
    actor_id, actor_snapshot, snapshot_quality,
    membership_start_date, membership_end_date,
    reason, idempotency_key, occurred_at, metadata
  ) VALUES (
    v_gym_id, v_original.member_id, v_original.membership_id, p_kind, 'reversal_rpc',
    v_original.id, -v_amount, 0, 0,
    v_original.currency, v_original.payment_method,
    v_original.plan_snapshot, v_original.discount_snapshot,
    v_actor_id,
    jsonb_build_object('id', v_actor_id, 'name', v_actor_name, 'role', v_actor_role::TEXT),
    'exact', v_original.membership_start_date, v_original.membership_end_date,
    p_reason, p_idempotency_key, now(),
    jsonb_build_object('membership_revoked', p_revoke_membership)
  ) RETURNING id INTO v_reversal_id;

  INSERT INTO public.financial_idempotency_requests(
    gym_id, idempotency_key, operation, request_fingerprint, transaction_id
  ) VALUES (
    v_gym_id, p_idempotency_key, 'reversal', v_fingerprint, v_reversal_id
  );

  IF p_revoke_membership AND v_original.membership_id IS NOT NULL THEN
    UPDATE public.memberships
    SET status = 'expired', cancelled_at = now(), cancelled_reason = p_reason
    WHERE id = v_original.membership_id
      AND gym_id = v_gym_id
      AND member_id = v_original.member_id;
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', v_reversal_id,
    'reversed_transaction_id', v_original.id,
    'amount', v_amount,
    'remaining_amount', v_remaining - v_amount,
    'membership_revoked', p_revoke_membership,
    'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_membership_payment(
  p_member_id UUID,
  p_plan_id UUID,
  p_payment_method public.payment_method,
  p_idempotency_key TEXT,
  p_promo_id UUID DEFAULT NULL,
  p_requested_start_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_actor_name TEXT;
  v_actor_role public.user_role;
  v_plan public.membership_plans%ROWTYPE;
  v_promo public.promos%ROWTYPE;
  v_existing public.financial_transactions%ROWTYPE;
  v_request public.financial_idempotency_requests%ROWTYPE;
  v_fingerprint TEXT;
  v_membership_id UUID;
  v_transaction_id UUID;
  v_today DATE := public.manila_business_date();
  v_start DATE;
  v_end DATE;
  v_latest_end DATE;
  v_gross NUMERIC(12,2);
  v_discount NUMERIC(12,2) := 0;
  v_final NUMERIC(12,2);
  v_discount_snapshot JSONB;
BEGIN
  p_idempotency_key := trim(p_idempotency_key);
  IF v_actor_id IS NULL OR v_gym_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid idempotency key';
  END IF;
  IF NOT public.has_gym_permission('payments:create', v_gym_id)
     OR NOT public.has_gym_permission('members:manage', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_fingerprint := public.financial_request_fingerprint(
    'payment',
    jsonb_build_object(
      'member_id', p_member_id,
      'plan_id', p_plan_id,
      'payment_method', p_payment_method,
      'promo_id', p_promo_id,
      'requested_start_date', p_requested_start_date
    )
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_gym_id::TEXT || ':financial-idempotency:' || p_idempotency_key, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_gym_id::TEXT || ':membership-payment:' || p_member_id::TEXT, 0)
  );

  SELECT * INTO v_request
  FROM public.financial_idempotency_requests
  WHERE gym_id = v_gym_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_request.operation <> 'payment'
       OR v_request.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'idempotency key was already used for a different request';
    END IF;
    SELECT * INTO STRICT v_existing
    FROM public.financial_transactions
    WHERE id = v_request.transaction_id AND gym_id = v_gym_id;
    RETURN jsonb_build_object(
      'transaction_id', v_existing.id,
      'membership_id', v_existing.membership_id,
      'gross_amount', v_existing.gross_amount,
      'discount_amount', v_existing.discount_amount,
      'final_amount', v_existing.ledger_amount,
      'start_date', v_existing.membership_start_date,
      'end_date', v_existing.membership_end_date,
      'idempotent_replay', true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_users gu
    WHERE gu.gym_id = v_gym_id
      AND gu.user_id = p_member_id
      AND gu.role = 'member'
      AND gu.status = 'active'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'member is not active in the current gym';
  END IF;

  SELECT * INTO v_plan
  FROM public.membership_plans
  WHERE id = p_plan_id AND gym_id = v_gym_id
  FOR SHARE;
  IF NOT FOUND OR NOT COALESCE(v_plan.is_active, false) THEN
    RAISE EXCEPTION 'membership plan is invalid or inactive';
  END IF;

  SELECT gu.role, p.name INTO v_actor_role, v_actor_name
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  WHERE gu.gym_id = v_gym_id
    AND gu.user_id = v_actor_id
    AND gu.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'financial actor is not active in the current gym';
  END IF;

  v_gross := round(v_plan.price, 2);
  IF p_promo_id IS NOT NULL THEN
    IF NOT public.gym_feature_enabled('promos', v_gym_id)
       OR NOT public.has_gym_permission('payments:discount', v_gym_id) THEN
      RAISE EXCEPTION 'permission denied for discounts';
    END IF;

    SELECT * INTO v_promo
    FROM public.promos
    WHERE id = p_promo_id AND gym_id = v_gym_id
    FOR SHARE;

    IF NOT FOUND
       OR NOT COALESCE(v_promo.is_active, false)
       OR (v_promo.plan_id IS NOT NULL AND v_promo.plan_id <> p_plan_id)
       OR (v_promo.valid_from IS NOT NULL AND v_today < v_promo.valid_from)
       OR (v_promo.valid_until IS NOT NULL AND v_today > v_promo.valid_until)
       OR v_promo.discount_type NOT IN ('fixed', 'percent')
       OR v_promo.discount_value < 0
       OR (v_promo.discount_type = 'percent' AND v_promo.discount_value > 100) THEN
      RAISE EXCEPTION 'promo is invalid, expired, or not available for this plan';
    END IF;

    IF v_promo.discount_type = 'percent' THEN
      v_discount := round(v_gross * v_promo.discount_value / 100, 2);
    ELSE
      v_discount := round(v_promo.discount_value, 2);
    END IF;
    IF v_discount > v_gross THEN
      RAISE EXCEPTION 'discount cannot exceed the plan price';
    END IF;

    v_discount_snapshot := jsonb_build_object(
      'id', v_promo.id,
      'name', v_promo.name,
      'type', v_promo.type,
      'discount_type', v_promo.discount_type,
      'discount_value', v_promo.discount_value,
      'valid_from', v_promo.valid_from,
      'valid_until', v_promo.valid_until,
      'plan_id', v_promo.plan_id
    );
  END IF;

  v_final := round(v_gross - v_discount, 2);
  v_start := COALESCE(p_requested_start_date, v_today);

  SELECT max(m.end_date) INTO v_latest_end
  FROM public.memberships m
  WHERE m.gym_id = v_gym_id
    AND m.member_id = p_member_id
    AND m.status IN ('active', 'frozen')
    AND m.cancelled_at IS NULL
    AND m.end_date >= v_start;

  IF v_latest_end IS NOT NULL THEN
    v_start := v_latest_end + 1;
  END IF;
  -- Both endpoints are inclusive: N paid Manila dates end at start + (N - 1).
  -- Existing settled rows are deliberately retained as historical access;
  -- this forward rule applies to payments created from migration 028 onward.
  v_end := public.paid_membership_end_date(v_start, v_plan.duration_days);

  INSERT INTO public.memberships(
    member_id, plan_id, start_date, end_date, status,
    payment_method, amount_paid, gym_id, created_by
  ) VALUES (
    p_member_id, v_plan.id, v_start, v_end, 'active',
    p_payment_method, v_final, v_gym_id, v_actor_id
  ) RETURNING id INTO v_membership_id;

  INSERT INTO public.financial_transactions(
    gym_id, member_id, membership_id, kind, source,
    ledger_amount, gross_amount, discount_amount, currency, payment_method,
    plan_snapshot, discount_snapshot, actor_id, actor_snapshot,
    snapshot_quality, membership_start_date, membership_end_date,
    idempotency_key, occurred_at, metadata
  ) VALUES (
    v_gym_id, p_member_id, v_membership_id, 'payment', 'payment_rpc',
    v_final, v_gross, v_discount, 'PHP', p_payment_method,
    jsonb_build_object(
      'id', v_plan.id,
      'name', v_plan.name,
      'price', v_plan.price,
      'duration_days', v_plan.duration_days,
      'description', v_plan.description,
      'benefits', v_plan.benefits
    ),
    v_discount_snapshot,
    v_actor_id,
    jsonb_build_object(
      'id', v_actor_id,
      'name', v_actor_name,
      'role', v_actor_role::TEXT
    ),
    'exact', v_start, v_end,
    p_idempotency_key, now(),
    jsonb_build_object(
      'requested_start_date', p_requested_start_date,
      'date_semantics', 'inclusive_calendar_dates_v2',
      'calendar_date_count', v_plan.duration_days
    )
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO public.financial_idempotency_requests(
    gym_id, idempotency_key, operation, request_fingerprint, transaction_id
  ) VALUES (
    v_gym_id, p_idempotency_key, 'payment', v_fingerprint, v_transaction_id
  );

  UPDATE public.memberships
  SET financial_transaction_id = v_transaction_id
  WHERE id = v_membership_id;

  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'membership_id', v_membership_id,
    'gross_amount', v_gross,
    'discount_amount', v_discount,
    'final_amount', v_final,
    'start_date', v_start,
    'end_date', v_end,
    'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_financial_adjustment(
  p_member_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_idempotency_key TEXT,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_actor_name TEXT;
  v_actor_role public.user_role;
  v_existing public.financial_transactions%ROWTYPE;
  v_request public.financial_idempotency_requests%ROWTYPE;
  v_fingerprint TEXT;
  v_transaction_id UUID;
  v_amount NUMERIC(12,2) := round(p_amount, 2);
BEGIN
  p_reason := trim(p_reason);
  p_idempotency_key := trim(p_idempotency_key);
  IF v_actor_id IS NULL OR v_gym_id IS NULL
     OR p_amount IS NULL
     OR v_amount = 0
     OR v_amount = 'NaN'::NUMERIC
     OR length(p_reason) < 3
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid adjustment request';
  END IF;
  IF NOT public.is_gym_owner(v_actor_id, v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF NOT public.has_active_gym_affiliation(p_member_id, v_gym_id) THEN
    RAISE EXCEPTION 'member is not in the current gym';
  END IF;

  v_fingerprint := public.financial_request_fingerprint(
    'adjustment',
    jsonb_build_object(
      'member_id', p_member_id,
      'amount', v_amount,
      'reason', p_reason,
      'occurred_at', p_occurred_at
    )
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_gym_id::TEXT || ':financial-idempotency:' || p_idempotency_key, 0)
  );
  SELECT * INTO v_request
  FROM public.financial_idempotency_requests
  WHERE gym_id = v_gym_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_request.operation <> 'adjustment'
       OR v_request.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'idempotency key was already used for a different request';
    END IF;
    SELECT * INTO STRICT v_existing
    FROM public.financial_transactions
    WHERE id = v_request.transaction_id AND gym_id = v_gym_id;
    RETURN jsonb_build_object(
      'transaction_id', v_existing.id,
      'amount', v_existing.ledger_amount,
      'idempotent_replay', true
    );
  END IF;

  SELECT gu.role, p.name INTO v_actor_role, v_actor_name
  FROM public.gym_users gu
  JOIN public.profiles p ON p.id = gu.user_id
  WHERE gu.gym_id = v_gym_id
    AND gu.user_id = v_actor_id
    AND gu.status = 'active';

  INSERT INTO public.financial_transactions(
    gym_id, member_id, kind, source,
    ledger_amount, gross_amount, discount_amount, currency,
    plan_snapshot, actor_id, actor_snapshot, snapshot_quality,
    reason, idempotency_key, occurred_at, metadata
  ) VALUES (
    v_gym_id, p_member_id, 'adjustment', 'adjustment_rpc',
    v_amount, 0, 0, 'PHP',
    jsonb_build_object('id', NULL, 'name', 'Financial adjustment'),
    v_actor_id,
    jsonb_build_object('id', v_actor_id, 'name', v_actor_name, 'role', v_actor_role::TEXT),
    'exact', p_reason, p_idempotency_key, COALESCE(p_occurred_at, now()),
    jsonb_build_object('requested_occurred_at', p_occurred_at)
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO public.financial_idempotency_requests(
    gym_id, idempotency_key, operation, request_fingerprint, transaction_id
  ) VALUES (
    v_gym_id, p_idempotency_key, 'adjustment', v_fingerprint, v_transaction_id
  );

  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'amount', v_amount,
    'idempotent_replay', false
  );
END;
$$;

-- One PostgreSQL-owned status contract drives entitlement and every aggregate.
ALTER TYPE public.profile_status ADD VALUE IF NOT EXISTS 'banned';

CREATE OR REPLACE FUNCTION public.effective_membership_status(
  p_user_id UUID,
  p_gym_id UUID,
  p_on_date DATE DEFAULT public.manila_business_date()
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH affiliation AS (
    SELECT gu.role, gu.status::TEXT AS status
    FROM public.gym_users gu
    WHERE gu.user_id = p_user_id AND gu.gym_id = p_gym_id
  ),
  current_period AS (
    SELECT CASE
      WHEN m.cancelled_at IS NOT NULL THEN 'cancelled'
      WHEN m.status = 'active' THEN 'active'
      WHEN m.status = 'frozen' THEN 'frozen'
      ELSE 'expired'
    END AS status
    FROM public.memberships m
    WHERE m.member_id = p_user_id
      AND m.gym_id = p_gym_id
      AND m.start_date <= p_on_date
      AND m.end_date >= p_on_date
    ORDER BY
      CASE
        WHEN m.cancelled_at IS NULL AND m.status = 'active' THEN 0
        WHEN m.cancelled_at IS NULL AND m.status = 'frozen' THEN 1
        WHEN m.cancelled_at IS NOT NULL THEN 2
        ELSE 3
      END,
      m.start_date DESC,
      m.created_at DESC,
      m.id DESC
    LIMIT 1
  ),
  next_period AS (
    SELECT 1
    FROM public.memberships m
    WHERE m.member_id = p_user_id
      AND m.gym_id = p_gym_id
      AND m.cancelled_at IS NULL
      AND m.status IN ('active', 'frozen')
      AND m.start_date > p_on_date
    LIMIT 1
  ),
  latest_period AS (
    SELECT CASE
      WHEN m.cancelled_at IS NOT NULL THEN 'cancelled'
      ELSE 'expired'
    END AS status
    FROM public.memberships m
    WHERE m.member_id = p_user_id AND m.gym_id = p_gym_id
    ORDER BY m.start_date DESC, m.end_date DESC, m.created_at DESC, m.id DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM affiliation) THEN 'not_connected'
    WHEN (SELECT role FROM affiliation) <> 'member' THEN 'not_member'
    WHEN (SELECT status FROM affiliation) <> 'active'
      THEN (SELECT status FROM affiliation)
    WHEN EXISTS (SELECT 1 FROM current_period)
      THEN (SELECT status FROM current_period)
    WHEN EXISTS (SELECT 1 FROM next_period) THEN 'scheduled'
    WHEN EXISTS (SELECT 1 FROM latest_period)
      THEN (SELECT status FROM latest_period)
    ELSE 'inactive'
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.effective_membership_status(UUID, UUID, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_membership_status(UUID, UUID, DATE)
  TO service_role;

CREATE OR REPLACE FUNCTION public.effective_membership_status_counts(
  p_gym_id UUID,
  p_on_date DATE DEFAULT public.manila_business_date()
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_object_agg(status, count), '{}'::JSONB)
  FROM (
    SELECT
      public.effective_membership_status(gu.user_id, gu.gym_id, p_on_date) AS status,
      count(*) AS count
    FROM public.gym_users gu
    WHERE gu.gym_id = p_gym_id AND gu.role = 'member'
    GROUP BY 1
  ) grouped;
$$;

REVOKE EXECUTE ON FUNCTION public.effective_membership_status_counts(UUID, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_membership_status_counts(UUID, DATE)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_membership_status_export()
RETURNS TABLE(
  member_id UUID,
  name TEXT,
  email TEXT,
  effective_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
BEGIN
  IF auth.uid() IS NULL
     OR v_gym_id IS NULL
     OR NOT public.has_gym_permission('members:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  SELECT
    gu.user_id,
    profile.name,
    profile.email,
    public.effective_membership_status(
      gu.user_id,
      gu.gym_id,
      public.manila_business_date()
    )
  FROM public.gym_users gu
  JOIN public.profiles profile ON profile.id = gu.user_id
  WHERE gu.gym_id = v_gym_id AND gu.role = 'member'
  ORDER BY profile.name, gu.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_membership_status_export()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_membership_status_export()
  TO authenticated, service_role;

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
        (
          gu.role = 'member'
          AND public.effective_membership_status(
            gu.user_id, gu.gym_id, public.manila_business_date()
          ) = 'active'
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

REVOKE EXECUTE ON FUNCTION public.has_member_portal_entitlement(UUID, UUID)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_member_portal_entitlement(UUID, UUID)
  TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.admin_dashboard_stats_legacy_025()') IS NULL THEN
    ALTER FUNCTION public.admin_dashboard_stats()
      RENAME TO admin_dashboard_stats_legacy_025;
  END IF;
  IF to_regprocedure('public.admin_reports_data_legacy_025(integer)') IS NULL THEN
    ALTER FUNCTION public.admin_reports_data(INTEGER)
      RENAME TO admin_reports_data_legacy_025;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats_legacy_025()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reports_data_legacy_025(INTEGER)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_counts JSONB;
  v_result JSONB;
BEGIN
  IF NOT public.has_gym_permission('dashboard:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  v_result := public.admin_dashboard_stats_legacy_025();
  v_counts := public.effective_membership_status_counts(
    v_gym_id,
    public.manila_business_date()
  );
  RETURN v_result || jsonb_build_object(
    'active_plans', COALESCE((v_counts ->> 'active')::INTEGER, 0),
    'frozen_plans', COALESCE((v_counts ->> 'frozen')::INTEGER, 0),
    'cancelled_plans', COALESCE((v_counts ->> 'cancelled')::INTEGER, 0),
    'expired_plans', COALESCE((v_counts ->> 'expired')::INTEGER, 0),
    'rejected_plans', COALESCE((v_counts ->> 'rejected')::INTEGER, 0),
    'disabled_plans', COALESCE((v_counts ->> 'disabled')::INTEGER, 0),
    'banned_plans', COALESCE((v_counts ->> 'banned')::INTEGER, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reports_data(p_days INTEGER DEFAULT 14)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_counts JSONB;
  v_result JSONB;
BEGIN
  IF p_days NOT BETWEEN 1 AND 366
     OR NOT public.has_gym_permission('reports:attendance:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  v_result := public.admin_reports_data_legacy_025(p_days);
  v_counts := public.effective_membership_status_counts(
    v_gym_id,
    public.manila_business_date()
  );
  RETURN v_result || jsonb_build_object(
    'active_count', COALESCE((v_counts ->> 'active')::INTEGER, 0),
    'frozen_count', COALESCE((v_counts ->> 'frozen')::INTEGER, 0),
    'cancelled_count', COALESCE((v_counts ->> 'cancelled')::INTEGER, 0),
    'expired_count', COALESCE((v_counts ->> 'expired')::INTEGER, 0),
    'rejected_count', COALESCE((v_counts ->> 'rejected')::INTEGER, 0),
    'disabled_count', COALESCE((v_counts ->> 'disabled')::INTEGER, 0),
    'banned_count', COALESCE((v_counts ->> 'banned')::INTEGER, 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats()
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_reports_data(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reports_data(INTEGER)
  TO authenticated, service_role;

-- The old overlap trigger gives a friendly sequential error but cannot close
-- a two-transaction race. Inventory first, then add the concurrency-safe
-- exclusion invariant without rewriting any historical paid period.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$
DECLARE
  v_overlaps BIGINT;
BEGIN
  SELECT count(*) INTO v_overlaps
  FROM public.memberships a
  JOIN public.memberships b
    ON b.gym_id = a.gym_id
   AND b.member_id = a.member_id
   AND b.id > a.id
   AND daterange(a.start_date, a.end_date, '[]')
       && daterange(b.start_date, b.end_date, '[]')
  WHERE a.status IN ('active', 'frozen')
    AND b.status IN ('active', 'frozen')
    AND a.cancelled_at IS NULL
    AND b.cancelled_at IS NULL;

  IF v_overlaps > 0 THEN
    RAISE EXCEPTION
      'membership overlap inventory requires repair before migration 028 (overlapping_pairs=%)',
      v_overlaps;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.memberships'::REGCLASS
      AND conname = 'memberships_no_overlapping_paid_access'
  ) THEN
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_no_overlapping_paid_access
      EXCLUDE USING gist (
        gym_id WITH =,
        member_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
      )
      WHERE (
        status IN ('active', 'frozen')
        AND cancelled_at IS NULL
      );
  END IF;
END;
$$;
