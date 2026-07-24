#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateBackupFreshness } from "./backup-freshness.mjs";

const statusPath = resolve(
  process.cwd(),
  process.argv[2] ?? "backup-evidence/status.json",
);
const policyPath = resolve(
  process.cwd(),
  process.argv[3] ?? "config/backup-policy.json",
);

try {
  const [status, policy] = await Promise.all([
    readFile(statusPath, "utf8").then(JSON.parse),
    readFile(policyPath, "utf8").then(JSON.parse),
  ]);
  const result = evaluateBackupFreshness(status, policy);
  if (!result.ok) {
    console.error("Backup freshness contract failed:");
    for (const issue of result.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(
      "Backup freshness verified: database, Storage, retention, bucket coverage, and recovery point meet policy.",
    );
  }
} catch (error) {
  const code = error && typeof error === "object" ? error.code : undefined;
  console.error(
    code === "ENOENT"
      ? "Backup freshness evidence or policy file is missing."
      : "Backup freshness evidence could not be verified.",
  );
  process.exitCode = 1;
}
