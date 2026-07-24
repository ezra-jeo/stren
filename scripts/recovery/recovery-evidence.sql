WITH financial_by_gym AS (
  SELECT
    substr(encode(digest(ft.gym_id::TEXT, 'sha256'), 'hex'), 1, 16) AS gym_key,
    count(*)::BIGINT AS ledger_count,
    count(*) FILTER (WHERE ft.kind = 'payment')::BIGINT AS payment_count,
    count(*) FILTER (WHERE ft.kind = 'refund')::BIGINT AS refund_count,
    count(*) FILTER (WHERE ft.kind = 'void')::BIGINT AS void_count,
    count(*) FILTER (WHERE ft.kind = 'adjustment')::BIGINT AS adjustment_count,
    COALESCE(sum(ft.ledger_amount) FILTER (WHERE ft.kind = 'payment'), 0) AS payment_total,
    COALESCE(sum(ft.ledger_amount) FILTER (WHERE ft.kind = 'refund'), 0) AS refund_total,
    COALESCE(sum(ft.ledger_amount) FILTER (WHERE ft.kind = 'void'), 0) AS void_total,
    COALESCE(sum(ft.ledger_amount) FILTER (WHERE ft.kind = 'adjustment'), 0) AS adjustment_total,
    COALESCE(sum(ft.ledger_amount), 0) AS net_total,
    count(*) FILTER (
      WHERE jsonb_typeof(ft.plan_snapshot) <> 'object'
         OR jsonb_typeof(ft.actor_snapshot) <> 'object'
    )::BIGINT AS incomplete_snapshot_count
  FROM public.financial_transactions ft
  GROUP BY ft.gym_id
),
reversal_overruns AS (
  SELECT count(*)::BIGINT AS count
  FROM public.financial_transactions original
  WHERE original.kind = 'payment'
    AND COALESCE((
      SELECT sum(abs(reversal.ledger_amount))
      FROM public.financial_transactions reversal
      WHERE reversal.reverses_transaction_id = original.id
    ), 0) > original.ledger_amount
),
auth_identity_digest AS (
  SELECT encode(digest(COALESCE(string_agg(
    concat_ws('|', id::TEXT, lower(email), aud, role), E'\n'
    ORDER BY id
  ), 'empty'), 'sha256'), 'hex') AS value
  FROM auth.users
),
financial_snapshot_digest AS (
  SELECT encode(digest(COALESCE(string_agg(
    concat_ws('|',
      id::TEXT, gym_id::TEXT, member_id::TEXT, membership_id::TEXT,
      kind, ledger_amount::TEXT, plan_snapshot::TEXT,
      discount_snapshot::TEXT, actor_snapshot::TEXT,
      membership_start_date::TEXT, membership_end_date::TEXT, metadata::TEXT
    ), E'\n' ORDER BY id
  ), 'empty'), 'sha256'), 'hex') AS value
  FROM public.financial_transactions
),
idempotency_digest AS (
  SELECT encode(digest(COALESCE(string_agg(
    concat_ws('|', gym_id::TEXT, idempotency_key, operation,
      request_fingerprint, transaction_id::TEXT), E'\n'
    ORDER BY gym_id, idempotency_key
  ), 'empty'), 'sha256'), 'hex') AS value
  FROM public.financial_idempotency_requests
),
membership_digest AS (
  SELECT encode(digest(COALESCE(string_agg(
    concat_ws('|', id::TEXT, gym_id::TEXT, member_id::TEXT, plan_id::TEXT,
      start_date::TEXT, end_date::TEXT, status::TEXT, cancelled_at::TEXT,
      financial_transaction_id::TEXT), E'\n'
    ORDER BY id
  ), 'empty'), 'sha256'), 'hex') AS value
  FROM public.memberships
),
audit_rows AS (
  SELECT 'onboarding|' || to_jsonb(event)::TEXT AS value
  FROM public.member_onboarding_events event
  UNION ALL
  SELECT 'privileged|' || to_jsonb(event)::TEXT AS value
  FROM public.privileged_audit_events event
),
audit_digest AS (
  SELECT encode(digest(COALESCE(string_agg(value, E'\n' ORDER BY value), 'empty'), 'sha256'), 'hex') AS value
  FROM audit_rows
),
counts AS (
  SELECT jsonb_build_object(
    'authUsers', (SELECT count(*) FROM auth.users),
    'profiles', (SELECT count(*) FROM public.profiles),
    'gymUsers', (SELECT count(*) FROM public.gym_users),
    'memberships', (SELECT count(*) FROM public.memberships),
    'attendance', (SELECT count(*) FROM public.attendance),
    'auditEvents', (SELECT count(*) FROM public.member_onboarding_events),
    'privilegedAuditEvents', (SELECT count(*) FROM public.privileged_audit_events),
    'financialTransactions', (SELECT count(*) FROM public.financial_transactions),
    'financialIdempotencyRequests', (SELECT count(*) FROM public.financial_idempotency_requests)
  ) AS value
)
SELECT jsonb_build_object(
  'migrationVersion', (SELECT max(version) FROM supabase_migrations.schema_migrations),
  'counts', (SELECT value FROM counts),
  'authIdentityDigest', (SELECT value FROM auth_identity_digest),
  'financialSnapshotDigest', (SELECT value FROM financial_snapshot_digest),
  'idempotencyDigest', (SELECT value FROM idempotency_digest),
  'membershipDigest', (SELECT value FROM membership_digest),
  'auditDigest', (SELECT value FROM audit_digest),
  'protectedDefinitionHashes', public.deployment_protected_definition_hashes(),
  'newestFinancialTransactionAt', (
    SELECT max(occurred_at) FROM public.financial_transactions
  ),
  'financialByGym', COALESCE((
    SELECT jsonb_agg(to_jsonb(f) ORDER BY f.gym_key) FROM financial_by_gym f
  ), '[]'::JSONB),
  'reversalOverrunCount', (SELECT count FROM reversal_overruns),
  'membershipsMissingTransaction', (
    SELECT count(*) FROM public.memberships WHERE financial_transaction_id IS NULL
  ),
  'paymentLedgerMissingMembership', (
    SELECT count(*) FROM public.financial_transactions
    WHERE kind = 'payment' AND membership_id IS NULL
  ),
  'overlappingPaidMembershipCount', (
    SELECT count(*)
    FROM public.memberships first_period
    JOIN public.memberships second_period
      ON second_period.gym_id = first_period.gym_id
     AND second_period.member_id = first_period.member_id
     AND second_period.id > first_period.id
     AND daterange(second_period.start_date, second_period.end_date, '[]')
         && daterange(first_period.start_date, first_period.end_date, '[]')
    WHERE first_period.cancelled_at IS NULL
      AND second_period.cancelled_at IS NULL
      AND first_period.status IN ('active', 'frozen')
      AND second_period.status IN ('active', 'frozen')
  ),
  'invalidAttendanceCount', (
    SELECT count(*) FROM public.attendance
    WHERE member_id IS NULL OR gym_id IS NULL OR check_in IS NULL
       OR (check_out IS NOT NULL AND check_out < check_in)
  ),
  'invalidAuditReferenceCount', (
    SELECT count(*)
    FROM public.member_onboarding_events e
    LEFT JOIN public.profiles member ON member.id = e.member_id
    LEFT JOIN public.profiles actor ON actor.id = e.created_by
    LEFT JOIN public.gyms gym ON gym.id = e.gym_id
    WHERE member.id IS NULL OR actor.id IS NULL OR gym.id IS NULL
  )
);
