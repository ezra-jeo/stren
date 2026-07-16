#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { restoreStorageBackup } from "./storage-backup.mjs";

const targetUrl = process.env.RECOVERY_TARGET_SUPABASE_URL;
const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const targetKey = process.env.RECOVERY_TARGET_SERVICE_ROLE_KEY;
const manifestPathValue = process.env.STORAGE_BACKUP_MANIFEST;
const manifestPath = manifestPathValue ? resolve(manifestPathValue) : undefined;
const confirmed = process.env.RECOVERY_TARGET_CONFIRM === "ISOLATED_NON_PRODUCTION";

if (!confirmed || !targetUrl || !targetKey || !manifestPath || targetUrl === sourceUrl) {
  console.error("Storage restore refused: target must be explicitly confirmed, isolated, and different from source.");
  process.exitCode = 1;
} else {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const supabase = createClient(targetUrl, targetKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await restoreStorageBackup({
      supabase,
      manifest,
      backupDirectory: dirname(manifestPath),
    });
    console.log("Storage restore completed in the explicitly confirmed isolated target.");
  } catch {
    console.error("Storage restore failed. No object names, contents, or credentials were logged.");
    process.exitCode = 1;
  }
}
