# Staff Onboarding DB Steps (SQL Editor)

Use this because migration history is currently broken and you are applying directly via Supabase SQL Editor.

## 1. Pre-check (read-only)

Run this first to confirm current state:

```sql
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_change_locked_until'
  ) AS has_avatar_cooldown_columns,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'member_onboarding_events'
  ) AS has_member_onboarding_events,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_member_avatar_with_cooldown'
  ) AS has_avatar_cooldown_function;
```

Also validate required helper functions are present before applying the script:

```sql
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'gym_id',
    'get_gym_id',
    'get_user_role',
    'is_manager',
    'create_gym_and_owner',
    'kiosk_checkin',
    'kiosk_checkin_by_member',
    'kiosk_search_members'
  )
ORDER BY p.proname;
```

Expected: all listed functions return at least one row.

## 2. Apply setup script

Copy-paste the whole content of:

- supabase/migrations/010_staff_email_qr_onboarding.sql

into Supabase SQL Editor and run it.

Notes:
- Script is idempotent (safe to re-run).
- It adds missing profile columns, onboarding audit table, RLS policies, and avatar cooldown function.

## 3. Post-check (structure)

Run:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN (
    'avatar_updated_at',
    'avatar_change_locked_until',
    'avatar_change_count',
    'avatar_required'
  )
ORDER BY column_name;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'member_onboarding_events';

SELECT policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'member_onboarding_events'
ORDER BY policyname;
```

## 4. Functional test (quick)

A. Test onboarding endpoint from app:
- POST /api/admin/members/onboard as admin/staff/owner
- Expect: memberId, membershipId, qrCode, magicLink

B. Confirm DB rows:

```sql
SELECT id, email, name, role, status, gym_id, qr_code, avatar_url
FROM public.profiles
WHERE email = 'replace-with-test-email@example.com';

SELECT id, member_id, gym_id, status, start_date, end_date, amount_paid
FROM public.memberships
WHERE member_id = 'replace-with-member-id'
ORDER BY created_at DESC;

SELECT id, member_id, created_by, email, sent_via, sent_at
FROM public.member_onboarding_events
WHERE member_id = 'replace-with-member-id'
ORDER BY created_at DESC;
```

## 5. Avatar cooldown test

Use a logged-in member/admin session and call:

```sql
SELECT *
FROM public.set_member_avatar_with_cooldown(
  'replace-with-member-id'::uuid,
  'https://example.com/avatar-1.jpg',
  14
);
```

Immediate second call should return updated = false with next_allowed_at.

## 6. Auth redirect configuration (required for magic links)

In Supabase Auth settings, ensure allowed redirect URLs include:
- http://localhost:3000/auth/callback
- your production domain /auth/callback

## 7. Server env check (required)

Your app runtime must have:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_SITE_URL (or NEXT_PUBLIC_APP_URL)

## 8. If script fails

Common causes:
- Missing helper functions public.gym_id() / public.is_manager()
- Insufficient privileges to create extensions/functions

Quick check:

```sql
SELECT public.gym_id(), public.is_manager();
```

If this errors, apply your existing auth helper script first (from current baseline), then re-run 010 script.
