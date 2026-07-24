import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const PLATFORM_ADMIN_ROLE = 'platform_admin' as const;

export type ProvisioningStatus = 'auth_pending' | 'auth_ready' | 'failed' | 'provisioned';

/** A deliberately token-free record of Auth work completed before the DB call. */
export interface ProvisioningAuthResolution {
  ownerUserId?: string;
  staffUserIds?: string[];
  importedMemberUserIds?: string[];
  createdUserIds?: string[];
  unresolvedEmails?: string[];
}

/** The response shape permitted from the Phase 1 provisioning boundary. */
export interface PlatformProvisioningResult {
  gymId: string;
  gymName: string;
  gymCode: string;
  ownerEmail: string;
  expiresAt: string;
  deliveryStatus: 'pending' | 'sent' | 'failed';
}

export interface PlatformAdminApiContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  user: User;
}

export function isPlatformAdminUser(
  user: Pick<User, 'app_metadata'> | null | undefined,
): boolean {
  return user?.app_metadata?.platform_role === PLATFORM_ADMIN_ROLE;
}

/** Server-component guard used only as defense-in-depth behind middleware. */
export async function getPlatformAdminUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !isPlatformAdminUser(data.user)) return null;
  return data.user;
}

/** Return the standard API response while keeping the client user-bound. */
export async function requirePlatformAdminApi(): Promise<
  | { context: PlatformAdminApiContext; response: null }
  | { context: null; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      context: null,
      response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }),
    };
  }
  if (!isPlatformAdminUser(data.user)) {
    return {
      context: null,
      response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }),
    };
  }
  return { context: { supabase, user: data.user }, response: null };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

/** Hash a token-free intent; this is the fingerprint stored by migration 029. */
export function provisioningRequestFingerprint(intent: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(intent)))
    .digest('hex');
}
