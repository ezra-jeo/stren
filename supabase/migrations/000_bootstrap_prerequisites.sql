-- Fresh-database prerequisites for migration 001.
--
-- Migration 001 defines SQL-language helpers that reference public.profiles
-- before it creates that table. PostgreSQL resolves SQL-language bodies at
-- CREATE FUNCTION time, so a completely empty database fails there. This
-- earlier-sorting migration creates the exact two baseline tables and enum
-- types needed by those helpers. Every statement is additive/idempotent and
-- is therefore a no-op on an existing hosted schema.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('member', 'admin', 'staff', 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.profile_status AS ENUM ('pending', 'active', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.gyms (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  code             TEXT UNIQUE NOT NULL,
  address          TEXT,
  phone            TEXT,
  tagline          TEXT,
  description      TEXT,
  logo_url         TEXT,
  cover_url        TEXT,
  brand_color      TEXT DEFAULT '#D4956A',
  secondary_color  TEXT,
  operating_hours  JSONB,
  amenities        TEXT[],
  social_links     JSONB,
  logo_path        TEXT,
  cover_path       TEXT,
  team_members     JSONB,
  pricing_packages JSONB,
  map_embed_url    TEXT,
  directions       TEXT,
  is_published     BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id                         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                      TEXT UNIQUE NOT NULL,
  name                       TEXT NOT NULL,
  contact_number             TEXT,
  role                       public.user_role DEFAULT 'member',
  status                     public.profile_status DEFAULT 'active',
  gym_id                     UUID REFERENCES public.gyms(id),
  avatar_url                 TEXT,
  qr_code                    TEXT,
  avatar_updated_at          TIMESTAMPTZ,
  avatar_change_locked_until TIMESTAMPTZ,
  avatar_change_count        INTEGER NOT NULL DEFAULT 0,
  avatar_required            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 001 also drops the obsolete kudos table near its beginning, then
-- much later runs `DROP TRIGGER ... ON public.kudos`. PostgreSQL requires the
-- relation to exist even with IF EXISTS. This one-shot DDL guard creates an
-- empty view after that legacy table drop, removes the view after the stale
-- trigger cleanup, and removes its own event trigger. When 000 is applied to a
-- database where 001 is already recorded, the guard removes itself as soon as
-- migration 026 creates the deployment snapshot function. No application row
-- or hosted data is read, rewritten, or deleted.
CREATE OR REPLACE FUNCTION public.bootstrap_001_kudos_drop_guard()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_query TEXT := current_query();
BEGIN
  IF tg_tag = 'DROP TABLE'
     AND v_query ~* 'DROP[[:space:]]+TABLE[[:space:]]+IF[[:space:]]+EXISTS[[:space:]]+public\.kudos' THEN
    IF to_regclass('public.kudos') IS NULL THEN
      EXECUTE 'CREATE VIEW public.kudos AS SELECT NULL::UUID AS id WHERE FALSE';
    END IF;
  ELSIF tg_tag = 'DROP TRIGGER'
        AND v_query ~* 'on_kudos_given' THEN
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'kudos' AND c.relkind = 'v'
    ) THEN
      EXECUTE 'DROP VIEW public.kudos';
    END IF;
  ELSIF tg_tag = 'CREATE TRIGGER'
        AND v_query ~* 'CREATE[[:space:]]+TRIGGER[[:space:]]+on_streak_milestone' THEN
    -- 001 is a consolidated production capture that already contains the
    -- notification objects later created by historical migration 006. On a
    -- fresh database only, remove those still-empty captured objects so 006
    -- can replay its canonical definitions. Refuse if any row exists.
    IF EXISTS (SELECT 1 FROM public.member_notification_preferences LIMIT 1)
       OR EXISTS (SELECT 1 FROM public.notification_cooldowns LIMIT 1) THEN
      RAISE EXCEPTION 'bootstrap compatibility cleanup refused nonempty notification tables';
    END IF;
    EXECUTE 'DROP TABLE public.member_notification_preferences CASCADE';
    EXECUTE 'DROP TABLE public.notification_cooldowns CASCADE';
    EXECUTE 'DROP TYPE public.notification_type CASCADE';
    EXECUTE 'DROP EVENT TRIGGER bootstrap_001_kudos_drop_guard';
  ELSIF tg_tag = 'CREATE FUNCTION'
        AND v_query ~* 'deployment_contract_snapshot' THEN
    EXECUTE 'DROP EVENT TRIGGER bootstrap_001_kudos_drop_guard';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_001_kudos_drop_guard() FROM PUBLIC;

DROP EVENT TRIGGER IF EXISTS bootstrap_001_kudos_drop_guard;
CREATE EVENT TRIGGER bootstrap_001_kudos_drop_guard
  ON ddl_command_end
  WHEN TAG IN ('DROP TABLE', 'DROP TRIGGER', 'CREATE TRIGGER', 'CREATE FUNCTION')
  EXECUTE FUNCTION public.bootstrap_001_kudos_drop_guard();
