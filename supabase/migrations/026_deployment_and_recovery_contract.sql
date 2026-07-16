-- Full deployment metadata contract and canonical application Storage bucket.
-- The snapshot contains schema names only (never rows, secrets, or PII) and is
-- callable only by postgres/supabase_admin or a service-role JWT.

INSERT INTO storage.buckets (id, name, public)
VALUES ('gym-assets', 'gym-assets', TRUE)
ON CONFLICT (id) DO NOTHING;

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

  RETURN jsonb_build_object(
    'migrations', COALESCE((
      SELECT jsonb_agg(sm.version ORDER BY sm.version)
      FROM supabase_migrations.schema_migrations sm
    ), '[]'::JSONB),
    'columns', COALESCE((
      SELECT jsonb_agg(
        c.table_schema || '.' || c.table_name || '.' || c.column_name
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
      )
      FROM information_schema.columns c
      WHERE c.table_schema IN ('public', 'storage')
    ), '[]'::JSONB),
    'functions', COALESCE((
      SELECT jsonb_agg(
        n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')'
        ORDER BY n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes)
      )
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    ), '[]'::JSONB),
    'policies', COALESCE((
      SELECT jsonb_agg(
        p.schemaname || '.' || p.tablename || '.' || p.policyname
        ORDER BY p.schemaname, p.tablename, p.policyname
      )
      FROM pg_catalog.pg_policies p
      WHERE p.schemaname IN ('public', 'storage')
    ), '[]'::JSONB),
    'rlsTables', COALESCE((
      SELECT jsonb_agg(n.nspname || '.' || c.relname ORDER BY n.nspname, c.relname)
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND c.relrowsecurity
        AND n.nspname IN ('public', 'storage')
    ), '[]'::JSONB),
    'grants', COALESCE((
      SELECT jsonb_agg(
        g.table_schema || '.' || g.table_name || ':' || g.grantee || ':' || g.privilege_type
        ORDER BY g.table_schema, g.table_name, g.grantee, g.privilege_type
      )
      FROM information_schema.role_table_grants g
      WHERE g.table_schema IN ('public', 'storage')
        AND g.grantee IN ('anon', 'authenticated', 'service_role')
    ), '[]'::JSONB),
    'functionGrants', COALESCE((
      SELECT jsonb_agg(
        g.routine_schema || '.' || g.routine_name || ':' || g.grantee || ':' || g.privilege_type
        ORDER BY g.routine_schema, g.routine_name, g.grantee, g.privilege_type
      )
      FROM information_schema.routine_privileges g
      WHERE g.routine_schema = 'public'
        AND g.grantee IN ('anon', 'authenticated', 'service_role')
    ), '[]'::JSONB),
    'constraints', COALESCE((
      SELECT jsonb_agg(
        n.nspname || '.' || c.relname || '.' || con.conname
        ORDER BY n.nspname, c.relname, con.conname
      )
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
    ), '[]'::JSONB),
    'triggers', COALESCE((
      SELECT jsonb_agg(
        n.nspname || '.' || c.relname || '.' || t.tgname
        ORDER BY n.nspname, c.relname, t.tgname
      )
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ), '[]'::JSONB),
    'buckets', COALESCE((
      SELECT jsonb_agg(b.id || ':' || CASE WHEN b.public THEN 'public' ELSE 'private' END ORDER BY b.id)
      FROM storage.buckets b
    ), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deployment_contract_snapshot()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deployment_contract_snapshot()
  TO service_role;
