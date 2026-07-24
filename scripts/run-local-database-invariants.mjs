#!/usr/bin/env node

import { resolve } from "node:path";
import { runPsql } from "./local-database.mjs";
import { formatCaughtError } from "./process-utils.mjs";

try {
  const output = runPsql({
    file: resolve(process.cwd(), "tests/database/recovery-invariants.sql"),
  });
  console.log(output || "Local database recovery invariants passed.");
} catch (error) {
  console.error(formatCaughtError(error, "run-local-database-invariants.mjs"));
  process.exitCode = 1;
}
