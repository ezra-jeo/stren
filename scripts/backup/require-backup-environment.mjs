#!/usr/bin/env node

const required = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_DB_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BACKUP_ENCRYPTION_PASSPHRASE",
  "OFFSITE_S3_BUCKET",
  "OFFSITE_S3_PREFIX",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_DEFAULT_REGION",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Backup job blocked; missing secure configuration: ${missing.join(", ")}.`);
  process.exitCode = 1;
} else {
  console.log("Backup job secure environment is configured.");
}
