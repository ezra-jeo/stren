import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/**
 * Platform-admin gate for Assisted Onboarding. Reuses the existing
 * server-controlled `app_metadata.platform_role` claim (migration 020,
 * ADR-0005) — no new database role, no client-visible allowlist.
 */
export function isPlatformAdminUser(user: Pick<User, 'app_metadata'> | null | undefined): boolean {
  return user?.app_metadata?.platform_role === 'platform_admin';
}

export async function getPlatformAdminUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return isPlatformAdminUser(user) ? user : null;
}

/** For API routes — middleware does not protect /api. */
export async function requirePlatformAdminApi(): Promise<
  { user: User } | { error: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) };
  }
  if (!isPlatformAdminUser(user)) {
    return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) };
  }
  return { user };
}
