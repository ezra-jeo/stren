#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const executable = resolve(
  process.cwd(),
  "node_modules",
  process.platform === "win32" ? "supabase/bin/supabase.exe" : ".bin/supabase",
);
const typeArguments = ["gen", "types", "typescript"];
if (process.env.DATABASE_TYPES_DB_URL) {
  const parsed = new URL(process.env.DATABASE_TYPES_DB_URL);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    console.error("Database type check refused a non-local direct database URL.");
    process.exit(1);
  }
  typeArguments.push("--db-url", process.env.DATABASE_TYPES_DB_URL);
} else {
  typeArguments.push("--local");
}
typeArguments.push("--schema", "public");

const generated = spawnSync(
  executable,
  typeArguments,
  {
    encoding: "utf8",
    windowsHide: true,
  },
);

if (generated.status !== 0) {
  console.error(
    generated.error?.message ||
      generated.stderr.trim() ||
      "Database types could not be generated from the clean local schema.",
  );
  process.exitCode = 1;
} else {
  const normalize = (value) =>
    value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trimEnd();
  const committed = readFileSync(
    resolve(process.cwd(), "lib/database.types.ts"),
    "utf8",
  );
  if (normalize(generated.stdout) !== normalize(committed)) {
    console.error(
      "Generated database types differ from lib/database.types.ts. Regenerate from the clean local database.",
    );
    process.exitCode = 1;
  } else {
    console.log("Generated database types match the clean local schema.");
  }
}
