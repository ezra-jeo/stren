#!/usr/bin/env node

import { resolve } from "node:path";
import { runPsql } from "./local-database.mjs";

try {
  const output = runPsql({
    file: resolve(process.cwd(), "tests/database/assisted-onboarding.sql"),
  });
  console.log(output || "Platform admin database/Auth assertions passed.");
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Platform admin database/Auth assertions failed.",
  );
  process.exitCode = 1;
}
