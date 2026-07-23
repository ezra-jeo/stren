\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql TEXT, p_pattern TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* p_pattern THEN
      RAISE EXCEPTION 'expected error matching %, received %', p_pattern, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error matching %, but statement succeeded', p_pattern;
END;
$$;

SELECT pg_temp.expect_error($sql$
  SELECT public.assert_development_seed_allowed(
    '', 'stren', 'http://127.0.0.1:54321', '172.18.0.2'::INET
  )
$sql$, 'explicit opt-in');

SELECT pg_temp.expect_error($sql$
  SELECT public.assert_development_seed_allowed(
    'stren-local-development', 'different-project',
    'http://127.0.0.1:54321', '172.18.0.2'::INET
  )
$sql$, 'project identity');

SELECT pg_temp.expect_error($sql$
  SELECT public.assert_development_seed_allowed(
    'stren-local-development', 'stren',
    'https://10.20.30.40', '10.20.30.40'::INET
  )
$sql$, 'loopback API');

SELECT public.assert_development_seed_allowed(
  'stren-local-development', 'stren',
  'http://127.0.0.1:54321', '172.18.0.2'::INET
);

ROLLBACK;
\echo 'development-seed-guard.sql: all assertions passed'
