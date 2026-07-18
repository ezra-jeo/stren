#!/usr/bin/env node

import { verifyDeploymentContract } from "./deployment-contract.mjs";

try {
  process.loadEnvFile?.(".env");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const projectId = process.env.SUPABASE_PROJECT_ID?.trim();
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  (projectId ? `https://${projectId}.supabase.co` : undefined);
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const secretKey =
  process.env.SUPABASE_SECRET_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email =
  process.env.DEPLOYMENT_CHECK_EMAIL?.trim() ||
  process.env.E2E_MEMBER_EMAIL?.trim();
const password =
  process.env.DEPLOYMENT_CHECK_PASSWORD?.trim() ||
  process.env.E2E_MEMBER_PASSWORD?.trim();

const missing = [];
if (!supabaseUrl) missing.push("Supabase project URL or project ID");
if (!anonKey) missing.push("Supabase publishable/anon key");
if (!secretKey) missing.push("server secret for the full schema contract");

if (missing.length > 0) {
  console.error(
    `Deployment contract was not checked. Missing: ${missing.join(", ")}.`,
  );
  process.exitCode = 1;
} else {
  try {
    const result = await verifyDeploymentContract({
      supabaseUrl,
      anonKey,
      secretKey,
      email,
      password,
    });

    if (!result.ok) {
      console.error("Deployment contract failed:");
      for (const issue of result.issues) console.error(`- ${issue}`);
      process.exitCode = 1;
    } else {
      console.log(
        "Deployment contract verified: Auth configuration and the complete schema through migration 027 are live.",
      );
    }
  } catch {
    console.error(
      "Deployment contract could not be reached. No credentials or response payloads were logged.",
    );
    process.exitCode = 1;
  }
}
