\set ON_ERROR_STOP on

DO $$
DECLARE
  v_open_sessions INTEGER;
  v_invalid_tenant_rows INTEGER;
BEGIN
  SELECT count(*) INTO v_open_sessions
  FROM public.attendance
  WHERE gym_id = '10000000-0000-0000-0000-000000000001'
    AND member_id = 'aaaaaaaa-0001-0001-0001-000000000004'
    AND check_out IS NULL;

  SELECT count(*) INTO v_invalid_tenant_rows
  FROM public.attendance a
  LEFT JOIN public.gym_users gu
    ON gu.gym_id = a.gym_id AND gu.user_id = a.member_id
  WHERE gu.user_id IS NULL;

  IF v_open_sessions > 1 OR v_invalid_tenant_rows <> 0 THEN
    RAISE EXCEPTION
      'attendance concurrency assertion failed (open=%, invalid_tenant=%)',
      v_open_sessions, v_invalid_tenant_rows;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS zz_test_delay_attendance_insert ON public.attendance;
DROP FUNCTION IF EXISTS public.test_delay_attendance_insert();

DELETE FROM public.attendance
WHERE gym_id = '10000000-0000-0000-0000-000000000001'
  AND member_id = 'aaaaaaaa-0001-0001-0001-000000000004'
  AND source = 'kiosk'
  AND recorded_by = 'aaaaaaaa-0001-0001-0001-000000000001';

SELECT count(*) AS open_sessions
FROM public.attendance
WHERE gym_id = '10000000-0000-0000-0000-000000000001'
  AND member_id = 'aaaaaaaa-0001-0001-0001-000000000004'
  AND check_out IS NULL;
