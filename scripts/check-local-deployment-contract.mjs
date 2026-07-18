#!/usr/bin/env node

import { evaluateDeploymentSchemaSnapshot } from "./deployment-contract.mjs";
import { runPsql } from "./local-database.mjs";

try {
  const snapshot = JSON.parse(
    runPsql({ sql: "SELECT public.deployment_contract_snapshot()::TEXT" }),
  );
  const result = evaluateDeploymentSchemaSnapshot(snapshot);
  if (!result.ok) {
    console.error("Local deployment schema contract failed:");
    for (const issue of result.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log("Local deployment schema contract through migration 027 passed.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Deployment schema validation failed.");
  process.exitCode = 1;
}
