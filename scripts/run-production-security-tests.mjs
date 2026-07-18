#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { runPsql } from "./local-database.mjs";

try {
  const sqlOutput = runPsql({
    file: resolve(process.cwd(), "tests/database/production-security.sql"),
  });
  console.log(sqlOutput || "Production security database assertions passed.");

  const concurrency = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve(process.cwd(), "tests/database/run-attendance-concurrency.ps1"),
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (concurrency.status !== 0) {
    throw new Error(
      concurrency.stderr.trim()
        || concurrency.stdout.trim()
        || "Attendance concurrency assertions failed.",
    );
  }
  console.log(concurrency.stdout.trim());
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production security tests failed.");
  process.exitCode = 1;
}
