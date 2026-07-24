#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
const apiPort = config.match(/^\[api\][\s\S]*?^port\s*=\s*(\d+)/m)?.[1];
const dbPort = config.match(/^\[db\][\s\S]*?^port\s*=\s*(\d+)/m)?.[1];

if (projectId !== "stren" || apiPort !== "54321" || dbPort !== "54322") {
  throw new Error(
    "Development seed refused: the local Supabase project identity or ports are not allowlisted.",
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ""} failed with exit code ${result.status}.`);
  }
}

const supabaseCommand =
  process.platform === "win32"
    ? resolve(root, "node_modules/supabase/bin/supabase.exe")
    : "npx";
const supabaseArgs =
  process.platform === "win32"
    ? ["db", "reset", "--local", "--no-seed"]
    : ["supabase", "db", "reset", "--local", "--no-seed"];
run(supabaseCommand, supabaseArgs);

run(
  "psql",
  [
    "-h", "127.0.0.1",
    "-p", dbPort,
    "-U", "postgres",
    "-d", "postgres",
    "-v", "ON_ERROR_STOP=1",
    "-f", resolve(root, "supabase/seed.sql"),
  ],
  {
    env: {
      ...process.env,
      PGPASSWORD: "postgres",
      PGOPTIONS: [
        "-c stren.development_seed_opt_in=stren-local-development",
        `-c stren.local_project_id=${projectId}`,
        `-c stren.local_api_url=http://127.0.0.1:${apiPort}`,
      ].join(" "),
    },
  },
);

console.log("Clean local database reset and guarded Stren seed completed.");
