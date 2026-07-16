#!/usr/bin/env node

import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { exportStorageBackup } from "./storage-backup.mjs";

try { process.loadEnvFile?.(".env"); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputDirectory = process.env.BACKUP_OUTPUT_DIR;

if (!supabaseUrl || !serviceKey || !outputDirectory) {
  console.error("Storage backup requires SUPABASE_URL, a server secret, and BACKUP_OUTPUT_DIR.");
  process.exitCode = 1;
} else {
  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { summary } = await exportStorageBackup({
      supabase,
      outputDirectory: resolve(outputDirectory),
    });
    console.log(
      `Storage backup complete: ${summary.bucketCount} buckets and ${summary.objectCount} objects hashed.`,
    );
  } catch (error) {
    const safeReasons = new Set([
      "Storage bucket listing failed",
      "Storage object listing failed",
      "Storage object download failed",
      "Storage object download returned no bytes",
    ]);
    const reason = safeReasons.has(error?.message)
      ? error.message
      : "Local backup output failed";
    console.error(
      `Storage backup failed at: ${reason}. No object names, contents, or credentials were logged.`,
    );
    process.exitCode = 1;
  }
}
