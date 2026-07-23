#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  REQUIRED_FINANCIAL_SUITES,
  evaluateFinancialSuiteEvidence,
} from "./financial-suite-contract.mjs";
import {
  assertIsolatedDatabaseUrl,
  DEFAULT_LOCAL_DATABASE_URL,
  runPsql,
} from "./local-database.mjs";

const root = process.cwd();
const databaseUrl =
  process.env.LOCAL_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
const parsedDatabaseUrl = assertIsolatedDatabaseUrl(databaseUrl);
const executed = [];

function runSql(name, relativePath) {
  const output = runPsql({
    databaseUrl,
    file: resolve(root, relativePath),
  });
  if (output) console.log(output);
  executed.push(name);
}

function runConcurrency(name, relativePath) {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve(root, relativePath),
      "-HostName",
      parsedDatabaseUrl.hostname,
      "-Port",
      parsedDatabaseUrl.port || "5432",
      "-Database",
      parsedDatabaseUrl.pathname.replace(/^\//, ""),
      "-UserName",
      decodeURIComponent(parsedDatabaseUrl.username),
      "-Password",
      decodeURIComponent(parsedDatabaseUrl.password),
    ],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || `${name} concurrency suite failed.`,
    );
  }
  executed.push(name);
}

try {
  runSql("fixture", "tests/database/financial-integrity-fixture.sql");
  runSql(
    "invalid-discount-and-tenant-constraints",
    "tests/database/financial-invalid-discount.sql",
  );
  runSql(
    "ledger-integrity-rollback-and-reconciliation",
    "tests/database/financial-integrity.sql",
  );
  runSql(
    "closure-idempotency-grants-and-date-semantics",
    "tests/database/financial-closure.sql",
  );
  runSql(
    "effective-membership-status",
    "tests/database/effective-membership-status.sql",
  );
  runSql(
    "monetary-constraints",
    "tests/database/financial-monetary-constraints.sql",
  );
  runSql("date-boundaries", "tests/database/financial-date-semantics.sql");
  runSql(
    "development-seed-guard",
    "tests/database/development-seed-guard.sql",
  );
  runConcurrency(
    "parallel-membership-payments",
    "tests/database/run-financial-concurrency.ps1",
  );
  runConcurrency(
    "parallel-reversal-limit",
    "tests/database/run-financial-reversal-concurrency.ps1",
  );
  runConcurrency(
    "parallel-direct-overlap",
    "tests/database/run-membership-overlap-concurrency.ps1",
  );

  const evidence = evaluateFinancialSuiteEvidence(executed);
  if (!evidence.ok) {
    throw new Error(
      `Financial suite omission sentinel failed (missing=${evidence.missing.join(",")}; unexpected=${evidence.unexpected.join(",")}).`,
    );
  }
  console.log(
    `All ${REQUIRED_FINANCIAL_SUITES.length} mandatory financial database suites passed.`,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Financial database suites failed.",
  );
  process.exitCode = 1;
}
