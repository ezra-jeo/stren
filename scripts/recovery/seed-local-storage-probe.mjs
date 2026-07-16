#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  console.error("Synthetic Storage probe refused a non-local or uncredentialed target.");
  process.exitCode = 1;
} else {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.storage
    .from("gym-assets")
    .upload(
      "recovery-probe/manifest.txt",
      Buffer.from("stren-local-recovery-probe-v1", "utf8"),
      { contentType: "text/plain", upsert: true },
    );
  if (error) {
    console.error("Synthetic local Storage probe could not be created.");
    process.exitCode = 1;
  } else {
    console.log("Synthetic local Storage probe prepared.");
  }
}
