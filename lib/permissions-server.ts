import { cache } from 'react';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FEATURE_CATALOG,
  isFeatureEnabled,
  type FeatureFlags,
  type FeatureKey,
} from '@/lib/features';
import type { MyAccess } from '@/lib/access';
import {
  PERMISSION_KEYS,
  type PermissionKey,
  type Role,
} from '@/lib/permissions';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const ROLES = new Set<string>(['owner', 'admin', 'staff', 'member']);
const PERMISSIONS = new Set<string>(PERMISSION_KEYS);
const FEATURES = new Set<string>(FEATURE_CATALOG.map(({ key }) => key));

function deniedAccess(): MyAccess {
  const features: FeatureFlags = {};
  for (const { key } of FEATURE_CATALOG) features[key] = false;
  return { role: 'member', gymId: null, permissions: new Set(), features };
}

async function fetchServerAccess(supabase: SupabaseClient): Promise<MyAccess> {
  try {
    const { data, error } = await supabase.rpc('get_my_access');
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) return deniedAccess();

    const payload = data as Record<string, unknown>;
    if (typeof payload.role !== 'string' || !ROLES.has(payload.role)) return deniedAccess();

    const permissions = new Set<PermissionKey>();
    if (Array.isArray(payload.permissions)) {
      for (const permission of payload.permissions) {
        if (typeof permission === 'string' && PERMISSIONS.has(permission)) {
          permissions.add(permission as PermissionKey);
        }
      }
    }

    const features = deniedAccess().features;
    if (payload.features && typeof payload.features === 'object' && !Array.isArray(payload.features)) {
      for (const [key, enabled] of Object.entries(payload.features as Record<string, unknown>)) {
        if (FEATURES.has(key) && typeof enabled === 'boolean') {
          features[key as FeatureKey] = enabled;
        }
      }
    }

    return {
      role: payload.role as Role,
      gymId: typeof payload.gym_id === 'string' ? payload.gym_id : null,
      permissions,
      features,
    };
  } catch {
    return deniedAccess();
  }
}

const getCachedMyAccess = cache(async (): Promise<MyAccess> => {
  const supabase = await createServerSupabaseClient();
  return fetchServerAccess(supabase as unknown as SupabaseClient);
});

/** Resolve effective permissions + features once per server request. */
export async function getMyAccess(supabase?: SupabaseClient): Promise<MyAccess> {
  return supabase ? fetchServerAccess(supabase) : getCachedMyAccess();
}

export async function requirePermission(key: PermissionKey): Promise<MyAccess> {
  const access = await getMyAccess();
  if (!access.permissions.has(key)) redirect('/admin');
  return access;
}

export async function requireFeature(
  key: FeatureKey,
  redirectTo = '/admin',
): Promise<MyAccess> {
  const access = await getMyAccess();
  if (!isFeatureEnabled(access.features, key)) redirect(redirectTo);
  return access;
}

/** Return null when allowed, otherwise the standard API 403 response. */
export async function apiRequirePermission(
  key: PermissionKey,
  access?: MyAccess,
): Promise<NextResponse | null> {
  const resolved = access ?? await getMyAccess();
  if (resolved.permissions.has(key)) return null;
  return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
}
