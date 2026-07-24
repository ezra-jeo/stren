#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const targetUrl = process.env.RECOVERY_TARGET_SUPABASE_URL;
const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const anonKey = process.env.RECOVERY_TARGET_ANON_KEY;
const confirmed = process.env.RECOVERY_TARGET_CONFIRM === "ISOLATED_NON_PRODUCTION";

const accounts = [
  ["owner@ironworks.test", "/admin"],
  ["admin@ironworks.test", "/admin"],
  ["staff@ironworks.test", "/admin"],
  ["member@ironworks.test", "/member"],
  ["owner@pulsefit.test", "/admin"],
  ["member@pulsefit.test", "/member"],
  ["orphan@nogym.test", "/gyms"],
];

function expectedRoute(profile, gymUser) {
  if (!profile?.active_gym_id || !gymUser) return "/gyms";
  return gymUser.role === "member" ? "/member" : "/admin";
}

if (
  !confirmed ||
  !targetUrl ||
  !anonKey ||
  targetUrl === sourceUrl ||
  !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(targetUrl)
) {
  console.error("Local recovery sign-in verification refused an unconfirmed, non-local, or non-isolated target.");
  process.exitCode = 1;
} else {
  try {
    for (const [email, route] of accounts) {
      const client = createClient(targetUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: authData, error: authError } = await client.auth.signInWithPassword({
        email,
        password: "password123",
      });
      if (authError || !authData.user) throw new Error("recovery sign-in failed");

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("active_gym_id")
        .eq("id", authData.user.id)
        .single();
      if (profileError) throw new Error("recovery profile route lookup failed");

      let gymUser = null;
      if (profile.active_gym_id) {
        const { data, error } = await client
          .from("gym_users")
          .select("role,status")
          .eq("gym_id", profile.active_gym_id)
          .eq("user_id", authData.user.id)
          .eq("status", "active")
          .maybeSingle();
        if (error) throw new Error("recovery gym route lookup failed");
        gymUser = data;
      }
      if (expectedRoute(profile, gymUser) !== route) {
        throw new Error("recovery route contract differed");
      }
      await client.auth.signOut();
    }
    console.log(`Isolated Auth sign-in and routing verified for ${accounts.length} development-only identities.`);
  } catch {
    console.error("Isolated Auth sign-in/routing verification failed without logging identity data or credentials.");
    process.exitCode = 1;
  }
}
