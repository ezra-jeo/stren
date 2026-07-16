#!/usr/bin/env node

import { resolve } from "node:path";
import { runPsql } from "./local-database.mjs";

try {
  const output = runPsql({
    file: resolve(process.cwd(), "tests/database/recovery-invariants.sql"),
  });
  console.log(output || "Local database recovery invariants passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database invariants failed.");
  process.exitCode = 1;
}
