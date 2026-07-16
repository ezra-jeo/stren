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
counts AS (
  SELECT jsonb_build_object(
    'authUsers', (SELECT count(*) FROM auth.users),
    'profiles', (SELECT count(*) FROM public.profiles),
    'gymUsers', (SELECT count(*) FROM public.gym_users),
    'memberships', (SELECT count(*) FROM public.memberships),
    'attendance', (SELECT count(*) FROM public.attendance),
    'auditEvents', (SELECT count(*) FROM public.member_onboarding_events),
    'financialTransactions', (SELECT count(*) FROM public.financial_transactions)
  ) AS value
)
SELECT jsonb_build_object(
  'migrationVersion', (SELECT max(version) FROM supabase_migrations.schema_migrations),
  'counts', (SELECT value FROM counts),
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
