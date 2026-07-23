import { spawnSync } from "node:child_process";

export const DEFAULT_LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function assertIsolatedDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error(
      "Database validation refused a non-local target. Use the documented isolated hosted drill instead.",
    );
  }
  return parsed;
}

export function runPsql({
  databaseUrl = process.env.LOCAL_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
  file,
  sql,
}) {
  assertIsolatedDatabaseUrl(databaseUrl);
  const args = [databaseUrl, "-X", "-At", "-v", "ON_ERROR_STOP=1"];
  if (file) args.push("-f", file);
  if (sql) args.push("-c", sql);
  const result = spawnSync(process.env.PSQL_BIN ?? "psql", args, {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: undefined },
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Local database validation failed.");
  }
  return result.stdout.trim();
}
