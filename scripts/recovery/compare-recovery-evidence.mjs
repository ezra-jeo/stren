#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const sourcePathValue = process.env.SOURCE_RECOVERY_EVIDENCE;
const targetPathValue = process.env.TARGET_RECOVERY_EVIDENCE;
const outputPathValue = process.env.RECOVERY_RESULT_OUTPUT;
const sourcePath = sourcePathValue ? resolve(sourcePathValue) : undefined;
const targetPath = targetPathValue ? resolve(targetPathValue) : undefined;
const outputPath = outputPathValue ? resolve(outputPathValue) : undefined;
const startedAt = Date.parse(process.env.RECOVERY_STARTED_AT ?? "");
const completedAt = Date.parse(process.env.RECOVERY_COMPLETED_AT ?? new Date().toISOString());

try {
  if (!sourcePath || !targetPath || !outputPath) {
    throw new Error("Recovery comparison evidence paths are required.");
  }
  const [source, target] = await Promise.all([
    readFile(sourcePath, "utf8").then(JSON.parse),
    readFile(targetPath, "utf8").then(JSON.parse),
  ]);
  const sourceNewest = Date.parse(source.snapshot.newestFinancialTransactionAt ?? "");
  const targetNewest = Date.parse(target.snapshot.newestFinancialTransactionAt ?? "");
  const result = {
    version: 1,
    passed: isDeepStrictEqual(source.snapshot, target.snapshot),
    actualRpoMinutes:
      Number.isFinite(sourceNewest) && Number.isFinite(targetNewest)
        ? Math.max(0, (sourceNewest - targetNewest) / 60_000)
        : null,
    actualRtoMinutes:
      Number.isFinite(startedAt) && Number.isFinite(completedAt)
        ? Math.max(0, (completedAt - startedAt) / 60_000)
        : null,
    newestSourceTransactionAt: source.snapshot.newestFinancialTransactionAt ?? null,
    newestRecoveredTransactionAt: target.snapshot.newestFinancialTransactionAt ?? null,
    completedAt: new Date(completedAt).toISOString(),
  };
  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  if (!result.passed) {
    console.error("Recovered aggregate counts or financial reconciliation evidence differs from source.");
    process.exitCode = 1;
  } else {
    console.log(
      `Recovery evidence matches: RPO ${result.actualRpoMinutes?.toFixed(2)} minutes; RTO ${result.actualRtoMinutes?.toFixed(2)} minutes.`,
    );
  }
} catch {
  console.error("Recovery evidence comparison failed without logging source or target data.");
  process.exitCode = 1;
}
