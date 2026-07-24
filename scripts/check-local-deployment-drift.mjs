#!/usr/bin/env node

import { resolve } from "node:path";
import { evaluateDeploymentSchemaSnapshot } from "./deployment-contract.mjs";
import { runPsql } from "./local-database.mjs";
import { formatCaughtError } from "./process-utils.mjs";

function snapshotFromSql(sql) {
  return JSON.parse(runPsql({ sql }));
}

try {
  const baseline = snapshotFromSql(
    "SELECT public.deployment_contract_snapshot()::TEXT",
  );
  const baselineResult = evaluateDeploymentSchemaSnapshot(baseline);
  if (!baselineResult.ok) {
    throw new Error(
      `Baseline deployment contract failed before drift probe: ${baselineResult.issues.join("; ")}`,
    );
  }

  const drifted = JSON.parse(
    runPsql({
      file: resolve(
        process.cwd(),
        "tests/database/deployment-definition-drift.sql",
      ),
    }),
  );
  const driftedResult = evaluateDeploymentSchemaSnapshot(drifted);
  const expectedIssue =
    "Protected database definition drifted: policy:public.financial_transactions.financial_transactions_select";
  if (driftedResult.ok || !driftedResult.issues.includes(expectedIssue)) {
    throw new Error("Intentional protected-policy drift was not detected.");
  }

  const restored = snapshotFromSql(
    "SELECT public.deployment_contract_snapshot()::TEXT",
  );
  const restoredResult = evaluateDeploymentSchemaSnapshot(restored);
  if (!restoredResult.ok) {
    throw new Error(
      `Deployment contract did not recover after transactional drift probe: ${restoredResult.issues.join("; ")}`,
    );
  }

  console.log(
    "Protected-definition drift was detected, rolled back, and the deployment contract passed again.",
  );
} catch (error) {
  console.error(formatCaughtError(error, "check-local-deployment-drift.mjs"));
  process.exitCode = 1;
}
