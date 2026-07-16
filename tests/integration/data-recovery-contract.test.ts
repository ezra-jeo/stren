import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Shot 2 data-recovery contract", () => {
  it("bootstraps migration 001 prerequisites without editing migration 001", () => {
    const bootstrap = read("supabase/migrations/000_bootstrap_prerequisites.sql");

    expect(bootstrap).toMatch(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp"/i);
    expect(bootstrap).toMatch(/CREATE TABLE IF NOT EXISTS public\.gyms/i);
    expect(bootstrap).toMatch(/CREATE TABLE IF NOT EXISTS public\.profiles/i);
    expect(bootstrap.indexOf("CREATE TABLE IF NOT EXISTS public.profiles")).toBeGreaterThan(-1);
    expect(bootstrap).toMatch(/REFERENCES auth\.users\(id\)/i);
  });

  it("uses the unified-account schema and refuses non-local seed execution", () => {
    const seed = read("supabase/seed.sql");

    expect(seed).toMatch(/development-only/i);
    expect(seed).toMatch(/app\.settings\.api_url/i);
    expect(seed).toMatch(/INSERT INTO public\.gym_users/i);
    expect(seed).toMatch(/active_gym_id/i);
    expect(seed).not.toMatch(/SET\s+gym_id\s*=/i);
    expect(seed).not.toMatch(/SET\s+role\s*=/i);
    expect(seed).not.toMatch(/primary_color/i);
  });

  it("installs a service-only full-schema snapshot and the required asset bucket", () => {
    const migration = read(
      "supabase/migrations/026_deployment_and_recovery_contract.sql",
    );

    expect(migration).toMatch(/INSERT INTO storage\.buckets/i);
    expect(migration).toMatch(/'gym-assets'/i);
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.deployment_contract_snapshot\(\)/i,
    );
    expect(migration).toMatch(/supabase_migrations\.schema_migrations/i);
    expect(migration).toMatch(/information_schema\.columns/i);
    expect(migration).toMatch(/pg_policies/i);
    expect(migration).toMatch(/role_table_grants/i);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/i);
    expect(migration).not.toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/i);
  });

  it("runs clean reset, generated-type parity, and database invariants in CI", () => {
    const workflow = read(".github/workflows/test-suite.yml");

    expect(workflow).toMatch(/Supabase CLI/i);
    expect(workflow).toMatch(/npm run db:reset:clean/i);
    expect(workflow).toMatch(/npm run db:types:check/i);
    expect(workflow).toMatch(/npm run db:invariants/i);
    expect(workflow).toMatch(/if:\s*always\(\)[\s\S]*npm run db:stop/i);
  });

  it("backs up durable database state and Storage separately with encrypted off-site monitoring", () => {
    const workflow = read(".github/workflows/backup-and-monitor.yml");

    expect(workflow).toMatch(/schedule:[\s\S]*cron:/i);
    expect(workflow).toMatch(/supabase db dump[\s\S]*--role-only/i);
    expect(workflow).toMatch(/--schema public[\s\S]*--schema auth[\s\S]*--schema storage[\s\S]*--schema supabase_migrations/i);
    expect(workflow).toMatch(/npm run backup:storage/i);
    expect(workflow).toMatch(/openssl enc -aes-256-cbc -pbkdf2/i);
    expect(workflow).toMatch(/collect-backup-status\.mjs/i);
    expect(workflow).toMatch(/verify-backup-freshness\.mjs/i);
  });

  it("keeps the isolated drill fail-closed and verifies restored Auth routing", () => {
    const drill = read("scripts/recovery/run-local-restore-drill.ps1");
    const authCheck = read("scripts/recovery/verify-local-recovery-auth-routing.mjs");

    expect(drill).toMatch(/RECOVERY_TARGET_CONFIRM.*ISOLATED_NON_PRODUCTION/i);
    expect(drill).toMatch(/--schema=public[\s\S]*--schema=auth[\s\S]*--schema=storage/i);
    expect(drill).toMatch(/--extension=pg_trgm[\s\S]*--extension=uuid-ossp[\s\S]*--extension=pgcrypto/i);
    expect(drill).toContain("verify-local-recovery-auth-routing.mjs");
    expect(authCheck).toMatch(/signInWithPassword/i);
    expect(authCheck).toMatch(/\/admin[\s\S]*\/member[\s\S]*\/gyms/i);
    expect(authCheck).toMatch(/127\\\.0\\\.0\\\.1|localhost/i);
  });

  it("catalogs one canonical executable backup and recovery runbook", () => {
    const catalog = read("AgentsContextKnowledgeBase/Catalog.md");
    const runbook = read("docs/operations/BACKUP_AND_RECOVERY.md");

    expect(catalog).toContain("docs/operations/BACKUP_AND_RECOVERY.md");
    expect(runbook).toMatch(/Recovery Point Objective|RPO/i);
    expect(runbook).toMatch(/Recovery Time Objective|RTO/i);
    expect(runbook).toMatch(/Storage/i);
    expect(runbook).toMatch(/isolated/i);
    expect(runbook).toMatch(/financial_reconciliation/i);
    expect(runbook).toMatch(/forward repair/i);
  });
});
