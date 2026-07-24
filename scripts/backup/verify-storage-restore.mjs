#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { compareStorageManifest } from "./storage-backup.mjs";

const targetUrl = process.env.RECOVERY_TARGET_SUPABASE_URL;
const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const targetKey = process.env.RECOVERY_TARGET_SERVICE_ROLE_KEY;
const manifestPathValue = process.env.STORAGE_BACKUP_MANIFEST;
const manifestPath = manifestPathValue ? resolve(manifestPathValue) : undefined;
const confirmed = process.env.RECOVERY_TARGET_CONFIRM === "ISOLATED_NON_PRODUCTION";

if (!confirmed || !targetUrl || !targetKey || !manifestPath || targetUrl === sourceUrl) {
  console.error("Storage verification refused: target must be explicitly confirmed, isolated, and different from source.");
  process.exitCode = 1;
} else {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const supabase = createClient(targetUrl, targetKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await compareStorageManifest({ supabase, manifest });
    if (!result.ok) {
      console.error("Restored Storage verification failed:");
      for (const issue of result.issues) console.error(`- ${issue}`);
      process.exitCode = 1;
    } else {
      console.log(
        `Restored Storage verified: ${result.bucketCount} buckets, ${result.objectCount} objects, ${result.sampledObjectCount} sampled hashes.`,
      );
    }
  } catch {
    console.error("Restored Storage could not be verified without exposing object data.");
    process.exitCode = 1;
  }
}
