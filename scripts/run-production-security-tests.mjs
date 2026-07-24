#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { runPsql } from "./local-database.mjs";
import {
  formatCaughtError,
  formatChildProcessFailure,
  powershellExecutable,
} from "./process-utils.mjs";

try {
  const sqlOutput = runPsql({
    file: resolve(process.cwd(), "tests/database/production-security.sql"),
  });
  console.log(sqlOutput || "Production security database assertions passed.");

  const concurrency = spawnSync(
    powershellExecutable(),
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
    throw new Error(formatChildProcessFailure(concurrency, "Attendance concurrency assertions"));
  }
  if (typeof concurrency.stdout === "string" && concurrency.stdout.trim()) {
    console.log(concurrency.stdout.trim());
  }
} catch (error) {
  console.error(formatCaughtError(error, "run-production-security-tests.mjs"));
  process.exitCode = 1;
}
