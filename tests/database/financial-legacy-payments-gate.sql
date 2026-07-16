\set ON_ERROR_STOP on

BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO public.payments(amount) VALUES (1.00);

-- This includes the real migration. Its first guard must abort before any DDL
-- when the legacy payments table contains data. Disconnect rollback removes
-- the synthetic row after the expected exception.
\ir ../../supabase/migrations/025_financial_integrity_and_reporting.sql

ROLLBACK;
