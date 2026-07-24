\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;

SELECT
  gym_id,
  payment_method,
  status,
  (COALESCE(created_at, start_date::TIMESTAMP AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')::DATE AS business_date,
  count(*) AS membership_count,
  COALESCE(sum(amount_paid), 0) AS membership_total
FROM public.memberships
GROUP BY gym_id, payment_method, status, business_date
ORDER BY gym_id, business_date, payment_method, status;

SELECT count(*) AS legacy_payment_count, COALESCE(sum(amount), 0) AS legacy_payment_total
FROM public.payments;

SELECT COALESCE(jsonb_agg(DISTINCT key ORDER BY key), '[]'::JSONB) AS legacy_payment_columns
FROM public.payments p
CROSS JOIN LATERAL jsonb_object_keys(to_jsonb(p)) key;

SELECT
  count(*) FILTER (WHERE member_id IS NULL) AS null_members,
  count(*) FILTER (WHERE plan_id IS NULL) AS null_plans,
  count(*) FILTER (WHERE created_by IS NULL) AS null_actors,
  count(*) FILTER (WHERE gym_id IS NULL) AS null_gyms,
  count(*) FILTER (WHERE start_date > end_date) AS invalid_dates,
  count(*) FILTER (WHERE amount_paid < 0) AS negative_amounts,
  count(*) FILTER (
    WHERE gym_id IS NOT NULL AND member_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.gym_users gu
      WHERE gu.gym_id = memberships.gym_id AND gu.user_id = memberships.member_id
    )
  ) AS cross_gym_members,
  count(*) FILTER (
    WHERE plan_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.membership_plans mp
      WHERE mp.id = memberships.plan_id AND mp.gym_id = memberships.gym_id
    )
  ) AS cross_gym_plans
FROM public.memberships;

SELECT count(*) AS duplicate_member_day_groups
FROM (
  SELECT gym_id, member_id, start_date
  FROM public.memberships
  GROUP BY gym_id, member_id, start_date
  HAVING count(*) > 1
) duplicates;

SELECT count(*) AS expected_backfill_count, COALESCE(sum(amount_paid), 0) AS expected_backfill_total
FROM public.memberships;

ROLLBACK;
