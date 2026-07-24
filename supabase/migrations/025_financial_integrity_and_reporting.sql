-- Financial integrity and reporting: memberships grant access; this immutable
-- ledger is the only financial source of truth after this migration.

-- Fail closed before making any change if the unused legacy table contains
-- rows. Its relationship to membership history is unknown and must be reviewed
-- rather than silently double-imported.
DO $legacy_payments_inventory$
DECLARE
  v_count BIGINT;
  v_total NUMERIC;
BEGIN
  SELECT count(*), COALESCE(sum(amount), 0)
  INTO v_count, v_total
  FROM public.payments;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'legacy payments inventory requires review before migration 025 (rows=%, total=%)',
      v_count, v_total;
  END IF;
END;
$legacy_payments_inventory$;

-- Invalid legacy membership rows cannot be represented truthfully in the
-- tenant-safe ledger. Report aggregate counts only and stop before backfill.
DO $legacy_membership_inventory$
DECLARE
  v_invalid BIGINT;
BEGIN
  SELECT count(*)
  INTO v_invalid
  FROM public.memberships m
  WHERE m.gym_id IS NULL
     OR m.member_id IS NULL
     OR m.start_date > m.end_date
     OR m.amount_paid < 0
     OR NOT EXISTS (
       SELECT 1
       FROM public.gym_users gu
       WHERE gu.gym_id = m.gym_id AND gu.user_id = m.member_id
     )
     OR (
       m.plan_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.membership_plans mp
         WHERE mp.id = m.plan_id AND mp.gym_id = m.gym_id
       )
     );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION
      'legacy membership inventory requires repair before migration 025 (invalid_rows=%)',
      v_invalid;
  END IF;
END;
$legacy_membership_inventory$;

CREATE OR REPLACE FUNCTION public.manila_business_date(
  p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS DATE
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT (p_at AT TIME ZONE 'Asia/Manila')::DATE;
$$;

REVOKE EXECUTE ON FUNCTION public.manila_business_date(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manila_business_date(TIMESTAMPTZ)
  TO authenticated, service_role;

ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS benefits JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.membership_plans
  DROP CONSTRAINT IF EXISTS membership_plans_price_nonnegative,
  DROP CONSTRAINT IF EXISTS membership_plans_duration_positive,
  DROP CONSTRAINT IF EXISTS membership_plans_benefits_array;
ALTER TABLE public.membership_plans
  ADD CONSTRAINT membership_plans_price_nonnegative CHECK (price >= 0),
  ADD CONSTRAINT membership_plans_duration_positive CHECK (duration_days > 0),
  ADD CONSTRAINT membership_plans_benefits_array CHECK (jsonb_typeof(benefits) = 'array');

ALTER TABLE public.promos
  DROP CONSTRAINT IF EXISTS promos_discount_type_valid,
  DROP CONSTRAINT IF EXISTS promos_discount_value_valid,
  DROP CONSTRAINT IF EXISTS promos_validity_ordered;
ALTER TABLE public.promos
  ADD CONSTRAINT promos_discount_type_valid
    CHECK (discount_type IN ('fixed', 'percent')),
  ADD CONSTRAINT promos_discount_value_valid
    CHECK (
      discount_value >= 0
      AND (discount_type <> 'percent' OR discount_value <= 100)
    ),
  ADD CONSTRAINT promos_validity_ordered
    CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until);

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS financial_transaction_id UUID,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_dates_ordered,
  DROP CONSTRAINT IF EXISTS memberships_cancellation_complete;
ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_dates_ordered CHECK (start_date <= end_date),
  ADD CONSTRAINT memberships_cancellation_complete CHECK (
    (cancelled_at IS NULL AND cancelled_reason IS NULL)
    OR (cancelled_at IS NOT NULL AND length(trim(cancelled_reason)) >= 3)
  );

CREATE UNIQUE INDEX IF NOT EXISTS memberships_id_gym_member_key
  ON public.memberships(id, gym_id, member_id);

CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  membership_id UUID,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  reverses_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  ledger_amount NUMERIC(12,2) NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'PHP',
  payment_method public.payment_method,
  plan_snapshot JSONB NOT NULL,
  discount_snapshot JSONB,
  actor_id UUID,
  actor_snapshot JSONB NOT NULL,
  snapshot_quality TEXT NOT NULL,
  membership_start_date DATE,
  membership_end_date DATE,
  reason TEXT,
  idempotency_key TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT financial_transactions_kind_valid
    CHECK (kind IN ('payment', 'refund', 'void', 'adjustment')),
  CONSTRAINT financial_transactions_source_valid
    CHECK (source IN (
      'payment_rpc', 'reversal_rpc', 'adjustment_rpc',
      'legacy_membership_backfill'
    )),
  CONSTRAINT financial_transactions_currency_php CHECK (currency = 'PHP'),
  CONSTRAINT financial_transactions_snapshot_quality_valid
    CHECK (snapshot_quality IN ('exact', 'reconstructed')),
  CONSTRAINT financial_transactions_snapshots_objects CHECK (
    jsonb_typeof(plan_snapshot) = 'object'
    AND jsonb_typeof(actor_snapshot) = 'object'
    AND (discount_snapshot IS NULL OR jsonb_typeof(discount_snapshot) = 'object')
  ),
  CONSTRAINT financial_transactions_idempotency_nonempty
    CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 200),
  CONSTRAINT financial_transactions_membership_dates_ordered CHECK (
    membership_start_date IS NULL
    OR membership_end_date IS NULL
    OR membership_start_date <= membership_end_date
  ),
  CONSTRAINT financial_transactions_event_shape CHECK (
    (
      kind = 'payment'
      AND ledger_amount >= 0
      AND gross_amount >= 0
      AND discount_amount >= 0
      AND discount_amount <= gross_amount
      AND ledger_amount = round(gross_amount - discount_amount, 2)
      AND payment_method IS NOT NULL
      AND membership_id IS NOT NULL
      AND reverses_transaction_id IS NULL
      AND membership_start_date IS NOT NULL
      AND membership_end_date IS NOT NULL
    )
    OR (
      kind IN ('refund', 'void')
      AND ledger_amount < 0
      AND gross_amount = 0
      AND discount_amount = 0
      AND payment_method IS NOT NULL
      AND reverses_transaction_id IS NOT NULL
      AND length(trim(reason)) >= 3
    )
    OR (
      kind = 'adjustment'
      AND ledger_amount <> 0
      AND gross_amount = 0
      AND discount_amount = 0
      AND payment_method IS NULL
      AND reverses_transaction_id IS NULL
      AND length(trim(reason)) >= 3
    )
  ),
  CONSTRAINT financial_transactions_membership_tenant_fk
    FOREIGN KEY (membership_id, gym_id, member_id)
    REFERENCES public.memberships(id, gym_id, member_id)
    ON DELETE RESTRICT,
  CONSTRAINT financial_transactions_gym_idempotency_key
    UNIQUE (gym_id, idempotency_key)
);

CREATE INDEX financial_transactions_gym_occurred_idx
  ON public.financial_transactions(gym_id, occurred_at DESC, id DESC);
CREATE INDEX financial_transactions_member_occurred_idx
  ON public.financial_transactions(gym_id, member_id, occurred_at DESC, id DESC);
CREATE INDEX financial_transactions_reversal_idx
  ON public.financial_transactions(reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX financial_transactions_payment_membership_key
  ON public.financial_transactions(membership_id)
  WHERE kind = 'payment';

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_financial_transaction_fk;
ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_financial_transaction_fk
  FOREIGN KEY (financial_transaction_id)
  REFERENCES public.financial_transactions(id)
  ON DELETE RESTRICT;

-- Defensive insert checks remain in force even for a future trusted writer.
CREATE OR REPLACE FUNCTION public.validate_financial_transaction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_original public.financial_transactions%ROWTYPE;
  v_reversed NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.gym_users gu
    WHERE gu.gym_id = NEW.gym_id
      AND gu.user_id = NEW.member_id
  ) THEN
    RAISE EXCEPTION 'financial transaction member must belong to the transaction gym';
  END IF;

  IF NEW.snapshot_quality = 'exact' THEN
    IF NEW.actor_id IS NULL OR NOT public.has_active_gym_affiliation(NEW.actor_id, NEW.gym_id) THEN
      RAISE EXCEPTION 'exact financial transaction requires an active same-gym actor';
    END IF;
  END IF;

  IF NEW.kind IN ('refund', 'void') THEN
    SELECT * INTO v_original
    FROM public.financial_transactions
    WHERE id = NEW.reverses_transaction_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_original.ledger_amount <= 0
       OR v_original.gym_id IS DISTINCT FROM NEW.gym_id
       OR v_original.member_id IS DISTINCT FROM NEW.member_id
       OR v_original.currency IS DISTINCT FROM NEW.currency
       OR v_original.occurred_at > NEW.occurred_at THEN
      RAISE EXCEPTION 'invalid reversal target';
    END IF;

    SELECT COALESCE(sum(-ledger_amount), 0)
    INTO v_reversed
    FROM public.financial_transactions
    WHERE reverses_transaction_id = v_original.id
      AND kind IN ('refund', 'void');

    IF v_reversed + (-NEW.ledger_amount) > v_original.ledger_amount THEN
      RAISE EXCEPTION 'reversal exceeds remaining transaction value';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_financial_transaction_insert
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_financial_transaction_insert();

CREATE OR REPLACE FUNCTION public.reject_financial_transaction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'financial transactions are immutable; append a correction event';
END;
$$;

CREATE TRIGGER reject_financial_transaction_update_delete
  BEFORE UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.reject_financial_transaction_mutation();

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_transactions_select
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (
    member_id = auth.uid()
    OR (
      gym_id = public.get_gym_id()
      AND (
        public.has_gym_permission('payments:view', gym_id)
        OR public.has_gym_permission('members:payment_history:view', gym_id)
      )
    )
  );

REVOKE ALL ON TABLE public.financial_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.financial_transactions TO authenticated;
GRANT ALL ON TABLE public.financial_transactions TO service_role;
REVOKE EXECUTE ON FUNCTION public.validate_financial_transaction_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_financial_transaction_mutation()
  FROM PUBLIC, anon, authenticated;

-- New payment capabilities. Applying a configured promo is delegable with the
-- payment switch; reversing money is owner-only and explicitly non-delegable.
INSERT INTO public.gym_role_permission_defaults(role, permission) VALUES
  ('owner', 'payments:discount'),
  ('owner', 'payments:reverse'),
  ('admin', 'payments:discount')
ON CONFLICT (role, permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.validate_permission_override()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_target_role public.user_role;
BEGIN
  IF NEW.permission IN (
    'payments:reverse', 'roles:manage', 'features:manage', 'gym_page:publish'
  ) THEN
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

-- Prevent new direct membership money writes while retaining the narrow status
-- update path used for freeze/unfreeze. SECURITY DEFINER financial RPCs are the
-- only insert path after cutover.
REVOKE INSERT, DELETE ON TABLE public.memberships FROM authenticated;

CREATE OR REPLACE FUNCTION public.protect_membership_financial_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND (
       NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
       OR NEW.gym_id IS DISTINCT FROM OLD.gym_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.financial_transaction_id IS DISTINCT FROM OLD.financial_transaction_id
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancelled_reason IS DISTINCT FROM OLD.cancelled_reason
     ) THEN
    RAISE EXCEPTION 'membership financial fields are writable only through trusted financial RPCs';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_membership_financial_fields
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.protect_membership_financial_fields();

CREATE OR REPLACE FUNCTION public.prevent_overlapping_membership_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('active', 'frozen') AND NEW.cancelled_at IS NULL
     AND EXISTS (
       SELECT 1
       FROM public.memberships existing
       WHERE existing.gym_id = NEW.gym_id
         AND existing.member_id = NEW.member_id
         AND existing.id <> NEW.id
         AND existing.status IN ('active', 'frozen')
         AND existing.cancelled_at IS NULL
         AND daterange(existing.start_date, existing.end_date, '[]')
             && daterange(NEW.start_date, NEW.end_date, '[]')
     ) THEN
    RAISE EXCEPTION 'paid membership access periods cannot overlap';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_overlapping_membership_access
  BEFORE INSERT OR UPDATE OF member_id, gym_id, start_date, end_date, status, cancelled_at
  ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.prevent_overlapping_membership_access();

REVOKE EXECUTE ON FUNCTION public.protect_membership_financial_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_overlapping_membership_access()
  FROM PUBLIC, anon, authenticated;

-- Idempotent, explicitly reconstructed legacy membership backfill. Mutable
-- plan/profile values are copied only as currently-known context and never
-- presented as exact historical facts.
INSERT INTO public.financial_transactions(
  gym_id,
  member_id,
  membership_id,
  kind,
  source,
  ledger_amount,
  gross_amount,
  discount_amount,
  currency,
  payment_method,
  plan_snapshot,
  discount_snapshot,
  actor_id,
  actor_snapshot,
  snapshot_quality,
  membership_start_date,
  membership_end_date,
  idempotency_key,
  occurred_at,
  metadata
)
SELECT
  m.gym_id,
  m.member_id,
  m.id,
  'payment',
  'legacy_membership_backfill',
  round(m.amount_paid, 2),
  round(m.amount_paid, 2),
  0,
  'PHP',
  m.payment_method,
  jsonb_build_object(
    'id', m.plan_id,
    'name', COALESCE(mp.name, 'Unknown legacy plan'),
    'price', mp.price,
    'duration_days', mp.duration_days,
    'description', mp.description,
    'benefits', COALESCE(mp.benefits, '[]'::JSONB)
  ),
  NULL,
  m.created_by,
  jsonb_build_object(
    'id', m.created_by,
    'name', COALESCE(actor.name, 'Unknown legacy actor'),
    'role', COALESCE(actor_gu.role::TEXT, 'unknown')
  ),
  'reconstructed',
  m.start_date,
  m.end_date,
  'legacy-membership:' || m.id::TEXT,
  COALESCE(
    m.created_at,
    m.start_date::TIMESTAMP AT TIME ZONE 'Asia/Manila'
  ),
  jsonb_build_object('legacy_membership_id', m.id)
FROM public.memberships m
LEFT JOIN public.membership_plans mp
  ON mp.id = m.plan_id AND mp.gym_id = m.gym_id
LEFT JOIN public.profiles actor ON actor.id = m.created_by
LEFT JOIN public.gym_users actor_gu
  ON actor_gu.user_id = m.created_by AND actor_gu.gym_id = m.gym_id
WHERE m.financial_transaction_id IS NULL
ON CONFLICT (gym_id, idempotency_key) DO NOTHING;

UPDATE public.memberships m
SET financial_transaction_id = ft.id
FROM public.financial_transactions ft
WHERE ft.gym_id = m.gym_id
  AND ft.idempotency_key = 'legacy-membership:' || m.id::TEXT
  AND m.financial_transaction_id IS DISTINCT FROM ft.id;

CREATE UNIQUE INDEX IF NOT EXISTS memberships_financial_transaction_key
  ON public.memberships(financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.backfill_legacy_membership_financial_transactions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted_count BIGINT;
  v_inserted_total NUMERIC;
BEGIN
  WITH inserted AS (
    INSERT INTO public.financial_transactions(
      gym_id, member_id, membership_id, kind, source,
      ledger_amount, gross_amount, discount_amount, currency, payment_method,
      plan_snapshot, discount_snapshot, actor_id, actor_snapshot,
      snapshot_quality, membership_start_date, membership_end_date,
      idempotency_key, occurred_at, metadata
    )
    SELECT
      m.gym_id, m.member_id, m.id, 'payment', 'legacy_membership_backfill',
      round(m.amount_paid, 2), round(m.amount_paid, 2), 0, 'PHP', m.payment_method,
      jsonb_build_object(
        'id', m.plan_id,
        'name', COALESCE(mp.name, 'Unknown legacy plan'),
        'price', mp.price,
        'duration_days', mp.duration_days,
        'description', mp.description,
        'benefits', COALESCE(mp.benefits, '[]'::JSONB)
      ),
      NULL,
      m.created_by,
      jsonb_build_object(
        'id', m.created_by,
        'name', COALESCE(actor.name, 'Unknown legacy actor'),
        'role', COALESCE(actor_gu.role::TEXT, 'unknown')
      ),
      'reconstructed', m.start_date, m.end_date,
      'legacy-membership:' || m.id::TEXT,
      COALESCE(m.created_at, m.start_date::TIMESTAMP AT TIME ZONE 'Asia/Manila'),
      jsonb_build_object('legacy_membership_id', m.id)
    FROM public.memberships m
    LEFT JOIN public.membership_plans mp
      ON mp.id = m.plan_id AND mp.gym_id = m.gym_id
    LEFT JOIN public.profiles actor ON actor.id = m.created_by
    LEFT JOIN public.gym_users actor_gu
      ON actor_gu.user_id = m.created_by AND actor_gu.gym_id = m.gym_id
    WHERE m.financial_transaction_id IS NULL
    ON CONFLICT (gym_id, idempotency_key) DO NOTHING
    RETURNING ledger_amount
  )
  SELECT count(*), COALESCE(sum(ledger_amount), 0)
  INTO v_inserted_count, v_inserted_total
  FROM inserted;

  UPDATE public.memberships m
  SET financial_transaction_id = ft.id
  FROM public.financial_transactions ft
  WHERE ft.gym_id = m.gym_id
    AND ft.idempotency_key = 'legacy-membership:' || m.id::TEXT
    AND m.financial_transaction_id IS DISTINCT FROM ft.id;

  RETURN jsonb_build_object(
    'inserted_count', v_inserted_count,
    'inserted_total', v_inserted_total,
    'ledger_backfill_count', (
      SELECT count(*) FROM public.financial_transactions
      WHERE source = 'legacy_membership_backfill'
    ),
    'ledger_backfill_total', (
      SELECT COALESCE(sum(ledger_amount), 0) FROM public.financial_transactions
      WHERE source = 'legacy_membership_backfill'
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_legacy_membership_financial_transactions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_legacy_membership_financial_transactions()
  TO service_role;

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

  -- One lock protects retry identity; the second serializes all paid-time
  -- changes for this member at this gym.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_gym_id::TEXT || ':financial-idempotency:' || p_idempotency_key, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_gym_id::TEXT || ':membership-payment:' || p_member_id::TEXT, 0)
  );

  SELECT * INTO v_existing
  FROM public.financial_transactions
  WHERE gym_id = v_gym_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.kind <> 'payment'
       OR v_existing.member_id IS DISTINCT FROM p_member_id
       OR v_existing.payment_method IS DISTINCT FROM p_payment_method
       OR v_existing.plan_snapshot ->> 'id' IS DISTINCT FROM p_plan_id::TEXT
       OR v_existing.discount_snapshot ->> 'id' IS DISTINCT FROM p_promo_id::TEXT THEN
      RAISE EXCEPTION 'idempotency key was already used for a different request';
    END IF;
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
  v_end := v_start + v_plan.duration_days;

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
    jsonb_build_object('requested_start_date', p_requested_start_date)
  ) RETURNING id INTO v_transaction_id;

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
     OR length(p_reason) < 3
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid reversal request';
  END IF;
  IF NOT public.is_gym_owner(v_actor_id, v_gym_id)
     OR NOT public.has_gym_permission('payments:reverse', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_gym_id::TEXT || ':financial-idempotency:' || p_idempotency_key, 0)
  );

  SELECT * INTO v_existing
  FROM public.financial_transactions
  WHERE gym_id = v_gym_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.kind IS DISTINCT FROM p_kind
       OR v_existing.reverses_transaction_id IS DISTINCT FROM p_transaction_id THEN
      RAISE EXCEPTION 'idempotency key was already used for a different request';
    END IF;
    RETURN jsonb_build_object(
      'transaction_id', v_existing.id,
      'reversed_transaction_id', v_existing.reverses_transaction_id,
      'amount', -v_existing.ledger_amount,
      'membership_revoked', COALESCE((v_existing.metadata ->> 'membership_revoked')::BOOLEAN, false),
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

CREATE OR REPLACE FUNCTION public.record_financial_adjustment(
  p_member_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_idempotency_key TEXT,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
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
  v_transaction_id UUID;
  v_amount NUMERIC(12,2) := round(p_amount, 2);
BEGIN
  p_reason := trim(p_reason);
  p_idempotency_key := trim(p_idempotency_key);
  IF v_actor_id IS NULL OR v_gym_id IS NULL
     OR v_amount = 0
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

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_gym_id::TEXT || ':financial-idempotency:' || p_idempotency_key, 0)
  );
  SELECT * INTO v_existing
  FROM public.financial_transactions
  WHERE gym_id = v_gym_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.kind <> 'adjustment'
       OR v_existing.member_id IS DISTINCT FROM p_member_id
       OR v_existing.ledger_amount IS DISTINCT FROM v_amount THEN
      RAISE EXCEPTION 'idempotency key was already used for a different request';
    END IF;
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
    reason, idempotency_key, occurred_at
  ) VALUES (
    v_gym_id, p_member_id, 'adjustment', 'adjustment_rpc',
    v_amount, 0, 0, 'PHP',
    jsonb_build_object('id', NULL, 'name', 'Financial adjustment'),
    v_actor_id,
    jsonb_build_object('id', v_actor_id, 'name', v_actor_name, 'role', v_actor_role::TEXT),
    'exact', p_reason, p_idempotency_key, p_occurred_at
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'amount', v_amount,
    'idempotent_replay', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_membership_payment(
  UUID, UUID, public.payment_method, TEXT, UUID, DATE
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_financial_transaction(
  UUID, TEXT, NUMERIC, TEXT, BOOLEAN, TEXT
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_financial_adjustment(
  UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_membership_payment(
  UUID, UUID, public.payment_method, TEXT, UUID, DATE
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_financial_transaction(
  UUID, TEXT, NUMERIC, TEXT, BOOLEAN, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_financial_adjustment(
  UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ
) TO authenticated;

CREATE OR REPLACE FUNCTION public.membership_is_effective(
  p_status public.membership_status,
  p_start_date DATE,
  p_end_date DATE,
  p_cancelled_at TIMESTAMPTZ,
  p_on_date DATE DEFAULT public.manila_business_date()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT p_status = 'active'
    AND p_cancelled_at IS NULL
    AND p_start_date <= p_on_date
    AND p_end_date >= p_on_date;
$$;

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
          SELECT 1
          FROM public.memberships m
          WHERE m.member_id = p_user_id
            AND m.gym_id = p_gym_id
            AND public.membership_is_effective(
              m.status, m.start_date, m.end_date, m.cancelled_at
            )
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

REVOKE EXECUTE ON FUNCTION public.membership_is_effective(
  public.membership_status, DATE, DATE, TIMESTAMPTZ, DATE
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.membership_is_effective(
  public.membership_status, DATE, DATE, TIMESTAMPTZ, DATE
) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.has_member_portal_entitlement(UUID, UUID)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_member_portal_entitlement(UUID, UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financial_transaction_history(
  p_member_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_method TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_rows JSONB;
  v_count BIGINT;
  v_total NUMERIC;
BEGIN
  IF v_gym_id IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR p_offset < 0 THEN
    RAISE EXCEPTION 'invalid financial history request';
  END IF;
  IF p_member_id IS NULL THEN
    IF NOT public.has_gym_permission('payments:view', v_gym_id) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  ELSIF p_member_id <> auth.uid()
        AND NOT public.has_gym_permission('members:payment_history:view', v_gym_id)
        AND NOT public.has_gym_permission('payments:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  WITH filtered AS (
    SELECT ft.*, p.name AS member_name
    FROM public.financial_transactions ft
    LEFT JOIN public.profiles p ON p.id = ft.member_id
    WHERE ft.gym_id = v_gym_id
      AND (p_member_id IS NULL OR ft.member_id = p_member_id)
      AND (p_method IS NULL OR ft.payment_method::TEXT = p_method)
      AND (p_from_date IS NULL OR public.manila_business_date(ft.occurred_at) >= p_from_date)
      AND (p_to_date IS NULL OR public.manila_business_date(ft.occurred_at) <= p_to_date)
      AND (
        NULLIF(trim(p_search), '') IS NULL
        OR COALESCE(p.name, '') ILIKE '%' || trim(p_search) || '%'
        OR COALESCE(ft.plan_snapshot ->> 'name', '') ILIKE '%' || trim(p_search) || '%'
      )
  )
  SELECT count(*), COALESCE(sum(ledger_amount), 0)
  INTO v_count, v_total
  FROM filtered;

  WITH filtered AS (
    SELECT ft.*, p.name AS member_name
    FROM public.financial_transactions ft
    LEFT JOIN public.profiles p ON p.id = ft.member_id
    WHERE ft.gym_id = v_gym_id
      AND (p_member_id IS NULL OR ft.member_id = p_member_id)
      AND (p_method IS NULL OR ft.payment_method::TEXT = p_method)
      AND (p_from_date IS NULL OR public.manila_business_date(ft.occurred_at) >= p_from_date)
      AND (p_to_date IS NULL OR public.manila_business_date(ft.occurred_at) <= p_to_date)
      AND (
        NULLIF(trim(p_search), '') IS NULL
        OR COALESCE(p.name, '') ILIKE '%' || trim(p_search) || '%'
        OR COALESCE(ft.plan_snapshot ->> 'name', '') ILIKE '%' || trim(p_search) || '%'
      )
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', page.id,
    'member_id', page.member_id,
    'member_name', COALESCE(page.member_name, 'Unknown member'),
    'membership_id', page.membership_id,
    'kind', page.kind,
    'source', page.source,
    'reverses_transaction_id', page.reverses_transaction_id,
    'plan_name', COALESCE(page.plan_snapshot ->> 'name', 'Unknown plan'),
    'gross_amount', page.gross_amount,
    'discount_amount', page.discount_amount,
    'ledger_amount', page.ledger_amount,
    'remaining_reversible_amount', CASE
      WHEN page.ledger_amount > 0 THEN GREATEST(
        page.ledger_amount + COALESCE((
          SELECT sum(reversal.ledger_amount)
          FROM public.financial_transactions reversal
          WHERE reversal.reverses_transaction_id = page.id
            AND reversal.kind IN ('refund', 'void')
        ), 0),
        0
      )
      ELSE 0
    END,
    'payment_method', page.payment_method,
    'currency', page.currency,
    'reason', page.reason,
    'snapshot_quality', page.snapshot_quality,
    'occurred_at', page.occurred_at
  ) ORDER BY page.occurred_at DESC, page.id DESC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT * FROM filtered
    ORDER BY occurred_at DESC, id DESC
    LIMIT p_limit OFFSET p_offset
  ) page;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total_count', v_count,
    'net_total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.financial_transaction_history(
  UUID, INTEGER, INTEGER, TEXT, TEXT, DATE, DATE
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_transaction_history(
  UUID, INTEGER, INTEGER, TEXT, TEXT, DATE, DATE
) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID := public.get_gym_id();
  v_today DATE := public.manila_business_date();
  v_month_start DATE := date_trunc('month', v_today)::DATE;
  v_result JSONB;
BEGIN
  IF NOT public.has_gym_permission('dashboard:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT jsonb_build_object(
    'currently_in', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'member_id', a.member_id,
        'check_in', a.check_in, 'name', p.name
      )), '[]'::JSONB)
      FROM public.attendance a
      JOIN public.profiles p ON p.id = a.member_id
      WHERE a.gym_id = v_gym_id AND a.check_out IS NULL
    ),
    'today_visits', (
      SELECT count(*) FROM public.attendance
      WHERE gym_id = v_gym_id
        AND public.manila_business_date(check_in) = v_today
    ),
    'total_members', (
      SELECT count(*) FROM public.gym_users
      WHERE gym_id = v_gym_id AND role = 'member' AND status = 'active'
    ),
    'pending_count', (
      SELECT count(*) FROM public.gym_users
      WHERE gym_id = v_gym_id AND role = 'member' AND status = 'pending'
    ),
    'active_plans', (
      SELECT count(DISTINCT m.member_id)
      FROM public.memberships m
      WHERE m.gym_id = v_gym_id
        AND public.membership_is_effective(
          m.status, m.start_date, m.end_date, m.cancelled_at, v_today
        )
    ),
    'frozen_plans', (
      SELECT count(DISTINCT m.member_id)
      FROM public.memberships m
      WHERE m.gym_id = v_gym_id
        AND m.status = 'frozen'
        AND m.cancelled_at IS NULL
        AND m.start_date <= v_today AND m.end_date >= v_today
        AND NOT EXISTS (
          SELECT 1 FROM public.memberships active_m
          WHERE active_m.gym_id = m.gym_id AND active_m.member_id = m.member_id
            AND public.membership_is_effective(
              active_m.status, active_m.start_date, active_m.end_date,
              active_m.cancelled_at, v_today
            )
        )
    ),
    'cancelled_plans', (
      SELECT count(DISTINCT m.member_id)
      FROM public.memberships m
      WHERE m.gym_id = v_gym_id AND m.cancelled_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.memberships current_m
          WHERE current_m.gym_id = m.gym_id AND current_m.member_id = m.member_id
            AND (
              public.membership_is_effective(
                current_m.status, current_m.start_date, current_m.end_date,
                current_m.cancelled_at, v_today
              )
              OR (
                current_m.status = 'frozen' AND current_m.cancelled_at IS NULL
                AND current_m.start_date <= v_today AND current_m.end_date >= v_today
              )
            )
        )
    ),
    'expired_plans', (
      SELECT count(DISTINCT gu.user_id)
      FROM public.gym_users gu
      WHERE gu.gym_id = v_gym_id AND gu.role = 'member' AND gu.status = 'active'
        AND EXISTS (
          SELECT 1 FROM public.memberships any_m
          WHERE any_m.gym_id = gu.gym_id AND any_m.member_id = gu.user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.memberships current_m
          WHERE current_m.gym_id = gu.gym_id AND current_m.member_id = gu.user_id
            AND (
              current_m.cancelled_at IS NOT NULL
              OR public.membership_is_effective(
                current_m.status, current_m.start_date, current_m.end_date,
                current_m.cancelled_at, v_today
              )
              OR (
                current_m.status = 'frozen' AND current_m.cancelled_at IS NULL
                AND current_m.start_date <= v_today AND current_m.end_date >= v_today
              )
            )
        )
    ),
    'attendance_7d', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'Dy'), 'date', to_char(d.day, 'MM/DD'),
        'visits', COALESCE(v.visits, 0)
      ) ORDER BY d.day), '[]'::JSONB)
      FROM (SELECT generate_series(v_today - 6, v_today, '1 day')::DATE AS day) d
      LEFT JOIN (
        SELECT public.manila_business_date(check_in) AS day, count(*) AS visits
        FROM public.attendance
        WHERE gym_id = v_gym_id
          AND public.manila_business_date(check_in) >= v_today - 6
        GROUP BY 1
      ) v ON v.day = d.day
    )
  ) INTO v_result;

  IF public.has_gym_permission('dashboard:finance:view', v_gym_id) THEN
    v_result := v_result || jsonb_build_object(
      'today_revenue', (
        SELECT COALESCE(sum(ledger_amount), 0)
        FROM public.financial_transactions
        WHERE gym_id = v_gym_id
          AND public.manila_business_date(occurred_at) = v_today
      ),
      'month_revenue', (
        SELECT COALESCE(sum(ledger_amount), 0)
        FROM public.financial_transactions
        WHERE gym_id = v_gym_id
          AND public.manila_business_date(occurred_at) >= v_month_start
          AND public.manila_business_date(occurred_at) < (v_month_start + INTERVAL '1 month')::DATE
      ),
      'revenue_7d', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'day', to_char(d.day, 'Dy'), 'date', to_char(d.day, 'MM/DD'),
          'revenue', COALESCE(r.revenue, 0)
        ) ORDER BY d.day), '[]'::JSONB)
        FROM (SELECT generate_series(v_today - 6, v_today, '1 day')::DATE AS day) d
        LEFT JOIN (
          SELECT public.manila_business_date(occurred_at) AS day,
                 sum(ledger_amount) AS revenue
          FROM public.financial_transactions
          WHERE gym_id = v_gym_id
            AND public.manila_business_date(occurred_at) >= v_today - 6
          GROUP BY 1
        ) r ON r.day = d.day
      )
    );
  END IF;
  RETURN v_result;
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
  v_today DATE := public.manila_business_date();
  v_month_start DATE := date_trunc('month', v_today)::DATE;
  v_result JSONB;
BEGIN
  IF p_days NOT BETWEEN 1 AND 366
     OR NOT public.has_gym_permission('reports:attendance:view', v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT jsonb_build_object(
    'active_count', (
      SELECT count(DISTINCT m.member_id)
      FROM public.memberships m
      WHERE m.gym_id = v_gym_id
        AND public.membership_is_effective(
          m.status, m.start_date, m.end_date, m.cancelled_at, v_today
        )
    ),
    'expired_count', (
      SELECT count(DISTINCT gu.user_id)
      FROM public.gym_users gu
      WHERE gu.gym_id = v_gym_id AND gu.role = 'member' AND gu.status = 'active'
        AND EXISTS (
          SELECT 1 FROM public.memberships any_m
          WHERE any_m.gym_id = gu.gym_id AND any_m.member_id = gu.user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.memberships current_m
          WHERE current_m.gym_id = gu.gym_id AND current_m.member_id = gu.user_id
            AND (
              current_m.cancelled_at IS NOT NULL
              OR public.membership_is_effective(
                current_m.status, current_m.start_date, current_m.end_date,
                current_m.cancelled_at, v_today
              )
              OR (
                current_m.status = 'frozen' AND current_m.cancelled_at IS NULL
                AND current_m.start_date <= v_today AND current_m.end_date >= v_today
              )
            )
        )
    ),
    'frozen_count', (
      SELECT count(DISTINCT m.member_id)
      FROM public.memberships m
      WHERE m.gym_id = v_gym_id
        AND m.status = 'frozen' AND m.cancelled_at IS NULL
        AND m.start_date <= v_today AND m.end_date >= v_today
    ),
    'cancelled_count', (
      SELECT count(DISTINCT m.member_id)
      FROM public.memberships m
      WHERE m.gym_id = v_gym_id AND m.cancelled_at IS NOT NULL
    ),
    'attendance_by_day', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', to_char(d.day, 'MM/DD'), 'visits', COALESCE(v.visits, 0)
      ) ORDER BY d.day), '[]'::JSONB)
      FROM (
        SELECT generate_series(v_today - (p_days - 1), v_today, '1 day')::DATE AS day
      ) d
      LEFT JOIN (
        SELECT public.manila_business_date(check_in) AS day, count(*) AS visits
        FROM public.attendance
        WHERE gym_id = v_gym_id
          AND public.manila_business_date(check_in) >= v_today - (p_days - 1)
        GROUP BY 1
      ) v ON v.day = d.day
    ),
    'peak_hours', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'hour', h, 'label', to_char((h || ':00')::TIME, 'HH12 AM'), 'count', cnt
      ) ORDER BY cnt DESC), '[]'::JSONB)
      FROM (
        SELECT extract(hour FROM check_in AT TIME ZONE 'Asia/Manila')::INTEGER AS h,
               count(*) AS cnt
        FROM public.attendance
        WHERE gym_id = v_gym_id AND check_in IS NOT NULL
        GROUP BY 1 ORDER BY cnt DESC LIMIT 5
      ) t
    )
  ) INTO v_result;

  IF public.has_gym_permission('reports:finance:view', v_gym_id) THEN
    v_result := v_result || jsonb_build_object(
      'month_revenue', (
        SELECT COALESCE(sum(ledger_amount), 0)
        FROM public.financial_transactions
        WHERE gym_id = v_gym_id
          AND public.manila_business_date(occurred_at) >= v_month_start
          AND public.manila_business_date(occurred_at) < (v_month_start + INTERVAL '1 month')::DATE
      ),
      'revenue_by_day', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'date', to_char(d.day, 'MM/DD'), 'revenue', COALESCE(r.revenue, 0)
        ) ORDER BY d.day), '[]'::JSONB)
        FROM (
          SELECT generate_series(v_today - (p_days - 1), v_today, '1 day')::DATE AS day
        ) d
        LEFT JOIN (
          SELECT public.manila_business_date(occurred_at) AS day,
                 sum(ledger_amount) AS revenue
          FROM public.financial_transactions
          WHERE gym_id = v_gym_id
            AND public.manila_business_date(occurred_at) >= v_today - (p_days - 1)
          GROUP BY 1
        ) r ON r.day = d.day
      ),
      'revenue_by_dom', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'day', dom, 'amount', total
        ) ORDER BY total DESC), '[]'::JSONB)
        FROM (
          SELECT extract(day FROM occurred_at AT TIME ZONE 'Asia/Manila')::INTEGER AS dom,
                 sum(ledger_amount) AS total
          FROM public.financial_transactions
          WHERE gym_id = v_gym_id
          GROUP BY 1 ORDER BY total DESC LIMIT 5
        ) t
      ),
      'method_breakdown', (
        SELECT jsonb_build_object(
          'cash_total', COALESCE(sum(ledger_amount) FILTER (WHERE payment_method = 'cash'), 0),
          'cash_count', count(*) FILTER (WHERE payment_method = 'cash' AND kind = 'payment'),
          'gcash_total', COALESCE(sum(ledger_amount) FILTER (WHERE payment_method = 'gcash'), 0),
          'gcash_count', count(*) FILTER (WHERE payment_method = 'gcash' AND kind = 'payment')
        )
        FROM public.financial_transactions
        WHERE gym_id = v_gym_id
      )
    );
  END IF;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_reports_data(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reports_data(INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financial_reconciliation(
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_gym_id UUID := public.get_gym_id();
  v_result JSONB;
BEGIN
  IF v_gym_id IS NULL OR p_from_date > p_to_date
     OR NOT public.is_gym_owner(v_actor_id, v_gym_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT jsonb_build_object(
    'gym_id', v_gym_id,
    'from_date', p_from_date,
    'to_date', p_to_date,
    'payment_total', COALESCE(sum(ledger_amount) FILTER (WHERE kind = 'payment'), 0),
    'refund_total', COALESCE(sum(ledger_amount) FILTER (WHERE kind = 'refund'), 0),
    'void_total', COALESCE(sum(ledger_amount) FILTER (WHERE kind = 'void'), 0),
    'adjustment_total', COALESCE(sum(ledger_amount) FILTER (WHERE kind = 'adjustment'), 0),
    'net_total', COALESCE(sum(ledger_amount), 0),
    'transaction_count', count(*),
    'legacy_backfill_count', count(*) FILTER (WHERE source = 'legacy_membership_backfill'),
    'legacy_backfill_total', COALESCE(sum(ledger_amount) FILTER (
      WHERE source = 'legacy_membership_backfill'
    ), 0),
    'memberships_missing_transaction', (
      SELECT count(*) FROM public.memberships m
      WHERE m.gym_id = v_gym_id AND m.financial_transaction_id IS NULL
    ),
    'ledger_rows_missing_membership', (
      SELECT count(*) FROM public.financial_transactions missing
      WHERE missing.gym_id = v_gym_id
        AND missing.kind IN ('payment', 'refund', 'void')
        AND missing.membership_id IS NULL
    ),
    'duplicate_idempotency_keys', (
      SELECT count(*) FROM (
        SELECT idempotency_key
        FROM public.financial_transactions duplicate_ft
        WHERE duplicate_ft.gym_id = v_gym_id
        GROUP BY idempotency_key HAVING count(*) > 1
      ) duplicates
    ),
    'impossible_reversal_balances', (
      SELECT count(*)
      FROM public.financial_transactions original
      WHERE original.gym_id = v_gym_id
        AND original.ledger_amount > 0
        AND original.ledger_amount + COALESCE((
          SELECT sum(reversal.ledger_amount)
          FROM public.financial_transactions reversal
          WHERE reversal.reverses_transaction_id = original.id
            AND reversal.kind IN ('refund', 'void')
        ), 0) < 0
    )
  ) INTO v_result
  FROM public.financial_transactions ft
  WHERE ft.gym_id = v_gym_id
    AND public.manila_business_date(ft.occurred_at) BETWEEN p_from_date AND p_to_date;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.financial_reconciliation(DATE, DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation(DATE, DATE)
  TO authenticated;
