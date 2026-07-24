#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildBackupStatus } from "./backup-status.mjs";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;
const inventoryPathValue = process.env.OFFSITE_INVENTORY_PATH;
const storageStatusPathValue = process.env.STORAGE_EXPORT_STATUS_PATH;
const inventoryPath = inventoryPathValue ? resolve(inventoryPathValue) : undefined;
const storageStatusPath = storageStatusPathValue
  ? resolve(storageStatusPathValue)
  : undefined;
const outputPath = resolve(process.env.BACKUP_STATUS_OUTPUT ?? "backup-evidence/status.json");

if (!accessToken || !projectId || !inventoryPath || !storageStatusPath) {
  console.error("Backup status collection is missing required secure environment or evidence paths.");
  process.exitCode = 1;
} else {
  try {
    const [offsiteInventory, storageExportStatus, providerResponse] = await Promise.all([
      readFile(inventoryPath, "utf8").then(JSON.parse),
      readFile(storageStatusPath, "utf8").then(JSON.parse),
      fetch(`https://api.supabase.com/v1/projects/${projectId}/database/backups`, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      }),
    ]);
    if (!providerResponse.ok) throw new Error("provider backup inventory unavailable");
    const status = buildBackupStatus({
      offsiteInventory,
      storageExportStatus,
      providerBackups: await providerResponse.json(),
    });
    await writeFile(outputPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
    console.log("Non-sensitive database, Storage, retention, and PITR status collected.");
  } catch {
    console.error("Backup status collection failed without logging provider data or credentials.");
    process.exitCode = 1;
  }
}
