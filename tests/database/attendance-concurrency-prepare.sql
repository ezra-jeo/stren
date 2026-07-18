\set ON_ERROR_STOP on

DELETE FROM public.attendance
WHERE gym_id = '10000000-0000-0000-0000-000000000001'
  AND member_id = 'aaaaaaaa-0001-0001-0001-000000000004'
  AND source = 'kiosk'
  AND recorded_by = 'aaaaaaaa-0001-0001-0001-000000000001';

UPDATE public.attendance
SET check_out = greatest(now(), check_in),
    source = 'manual_correction',
    correction_reason = 'attendance concurrency test preparation'
WHERE gym_id = '10000000-0000-0000-0000-000000000001'
  AND member_id = 'aaaaaaaa-0001-0001-0001-000000000004'
  AND check_out IS NULL;

CREATE OR REPLACE FUNCTION public.test_delay_attendance_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.gym_id = '10000000-0000-0000-0000-000000000001'
     AND NEW.member_id = 'aaaaaaaa-0001-0001-0001-000000000004' THEN
    PERFORM pg_sleep(1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_test_delay_attendance_insert ON public.attendance;
CREATE TRIGGER zz_test_delay_attendance_insert
  BEFORE INSERT ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.test_delay_attendance_insert();
