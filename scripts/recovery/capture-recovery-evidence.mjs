#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const databaseUrl = process.env.RECOVERY_DATABASE_URL;
const outputPathValue = process.env.RECOVERY_EVIDENCE_OUTPUT;
const outputPath = outputPathValue ? resolve(outputPathValue) : undefined;
const confirmed = process.env.RECOVERY_CAPTURE_CONFIRM === "READ_ONLY_APPROVED";

if (!databaseUrl || !outputPath) {
  console.error("Recovery evidence capture requires a database URL and output path.");
  process.exitCode = 1;
} else {
  try {
    const parsed = new URL(databaseUrl);
    const isLocal = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
    if (!isLocal && !confirmed) {
      throw new Error("Remote read-only capture requires explicit approval confirmation.");
    }
    const sql = await readFile(
      resolve(process.cwd(), "scripts/recovery/recovery-evidence.sql"),
      "utf8",
    );
    const result = spawnSync(
      process.env.PSQL_BIN ?? "psql",
      [databaseUrl, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", `BEGIN TRANSACTION READ ONLY; ${sql} ROLLBACK;`],
      { encoding: "utf8", windowsHide: true },
    );
    if (result.status !== 0) throw new Error("Read-only recovery evidence query failed.");
    const line = result.stdout.split(/\r?\n/).find((value) => value.trim().startsWith("{"));
    if (!line) throw new Error("Recovery evidence query returned no aggregate snapshot.");
    const evidence = {
      version: 1,
      capturedAt: new Date().toISOString(),
      snapshot: JSON.parse(line),
    };
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log("Non-sensitive aggregate recovery evidence captured read-only.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Recovery evidence capture failed.");
    process.exitCode = 1;
  }
}
