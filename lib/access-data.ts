/**
 * Client-side data access for the permission/feature model (ImplementationPlan.md §8.4).
 *
 * Agent A writes this against the SQL surface specified in §5; Agent B guarantees
 * the backend (`get_my_access`, `gym_feature_settings`, `gym_user_permission_overrides`)
 * matches. Until those land, every call degrades safely: `fetchMyAccess` falls back
 * to role defaults, list/save calls swallow the "relation does not exist" error.
 *
 * The parameter is a bare `SupabaseClient` (frozen contract) so these calls do not
 * depend on `lib/database.types.ts` types that Agent B regenerates later.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MyAccess } from './access';
import { accessFromRoleDefaults } from './access';
import type { PermissionKey, Role } from './permissions';
import { PERMISSION_KEYS } from './permissions';
import type { FeatureFlags, FeatureKey } from './features';
import { FEATURE_CATALOG } from './features';

const ROLES: readonly Role[] = ['owner', 'admin', 'staff', 'member'];
const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);
const FEATURE_KEY_SET = new Set<string>(FEATURE_CATALOG.map((f) => f.key));

function coerceRole(value: unknown): Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : 'member';
}

function coercePermissionSet(value: unknown): Set<PermissionKey> {
  const set = new Set<PermissionKey>();
  if (Array.isArray(value)) {
    for (const key of value) {
      if (typeof key === 'string' && PERMISSION_KEY_SET.has(key)) set.add(key as PermissionKey);
    }
  }
  return set;
}

function coerceFeatureFlags(value: unknown): FeatureFlags {
  const flags: FeatureFlags = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, enabled] of Object.entries(value as Record<string, unknown>)) {
      if (FEATURE_KEY_SET.has(key) && typeof enabled === 'boolean') {
        flags[key as FeatureKey] = enabled;
      }
    }
  }
  return flags;
}

/**
 * Resolve the caller's effective access. Prefers the single-round-trip
 * `get_my_access` RPC; on any error or a missing function, reads the profile
 * row and returns role + catalog defaults so the UI degrades to today's behavior.
 */
export async function fetchMyAccess(supabase: SupabaseClient): Promise<MyAccess> {
  try {
    const { data, error } = await supabase.rpc('get_my_access');
    if (!error && data && typeof data === 'object') {
      const payload = data as Record<string, unknown>;
      const role = coerceRole(payload.role);
      const gymId = typeof payload.gym_id === 'string' ? payload.gym_id : null;
      return {
        role,
        gymId,
        permissions: coercePermissionSet(payload.permissions),
        features: coerceFeatureFlags(payload.features),
      };
    }
  } catch {
    // Fall through to the profile-based default.
  }

  return fallbackAccess(supabase);
}

async function fallbackAccess(supabase: SupabaseClient): Promise<MyAccess> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return accessFromRoleDefaults('member', null);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, gym_id')
      .eq('id', userId)
      .maybeSingle();

    return accessFromRoleDefaults(
      coerceRole(profile?.role),
      typeof profile?.gym_id === 'string' ? profile.gym_id : null,
    );
  } catch {
    return accessFromRoleDefaults('member', null);
  }
}

/** Persist the gym's feature flags. Requires `features:manage` (enforced by RLS). */
export async function saveFeatureFlags(
  supabase: SupabaseClient,
  gymId: string,
  flags: FeatureFlags,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('gym_feature_settings')
    .upsert(
      {
        gym_id: gymId,
        flags,
        updated_by: userData?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'gym_id' },
    );
  if (error) throw new Error(error.message);
}

export interface AccessPerson {
  userId: string;
  name: string;
  email: string;
  role: Role;
  overrides: { permission: PermissionKey; granted: boolean }[];
}

/**
 * The gym's admin + staff, each with their stored overrides. Reads profiles and
 * overrides separately (no PostgREST join) so it degrades gracefully before the
 * overrides table exists.
 */
export async function listAccessPeople(supabase: SupabaseClient, gymId: string): Promise<AccessPerson[]> {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('gym_id', gymId)
    .in('role', ['admin', 'staff']);

  if (error || !profiles) return [];

  const overridesByUser = new Map<string, { permission: PermissionKey; granted: boolean }[]>();
  try {
    const { data: overrides } = await supabase
      .from('gym_user_permission_overrides')
      .select('user_id, permission, granted')
      .eq('gym_id', gymId);

    if (Array.isArray(overrides)) {
      for (const row of overrides as { user_id?: unknown; permission?: unknown; granted?: unknown }[]) {
        if (
          typeof row.user_id === 'string' &&
          typeof row.permission === 'string' &&
          PERMISSION_KEY_SET.has(row.permission) &&
          typeof row.granted === 'boolean'
        ) {
          const list = overridesByUser.get(row.user_id) ?? [];
          list.push({ permission: row.permission as PermissionKey, granted: row.granted });
          overridesByUser.set(row.user_id, list);
        }
      }
    }
  } catch {
    // Overrides table not present yet — treat everyone as role defaults.
  }

  return (profiles as { id: string; name: string | null; email: string | null; role: string }[]).map((p) => ({
    userId: p.id,
    name: p.name ?? '',
    email: p.email ?? '',
    role: coerceRole(p.role),
    overrides: overridesByUser.get(p.id) ?? [],
  }));
}

/**
 * Write or clear one override. `granted: null` deletes the row (back to the role
 * default); otherwise upserts a grant/revocation. Requires `roles:manage` (RLS).
 */
export async function saveOverride(
  supabase: SupabaseClient,
  args: { gymId: string; userId: string; permission: PermissionKey; granted: boolean | null },
): Promise<void> {
  const { gymId, userId, permission, granted } = args;

  if (granted === null) {
    const { error } = await supabase
      .from('gym_user_permission_overrides')
      .delete()
      .match({ gym_id: gymId, user_id: userId, permission });
    if (error) throw new Error(error.message);
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('gym_user_permission_overrides')
    .upsert(
      {
        gym_id: gymId,
        user_id: userId,
        permission,
        granted,
        granted_by: userData?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'gym_id,user_id,permission' },
    );
  if (error) throw new Error(error.message);
}

/**
 * Apply one Access switch atomically per side effect: a single array `upsert` for
 * the grant/revoke rows and a single `delete().in(...)` for the keys returning to
 * their role default. A switch maps to several permission keys (e.g. the money
 * switch = 2), so the per-key `saveOverride` loop could leave the DB half-flipped
 * on a mid-loop failure; batching removes that window (ImplementationPlan.md §7.9).
 */
export async function saveOverridesBatch(
  supabase: SupabaseClient,
  args: {
    gymId: string;
    userId: string;
    grants: { permission: PermissionKey; granted: boolean }[];
    clears: PermissionKey[];
  },
): Promise<void> {
  const { gymId, userId, grants, clears } = args;

  if (grants.length > 0) {
    const { data: userData } = await supabase.auth.getUser();
    const grantedBy = userData?.user?.id ?? null;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('gym_user_permission_overrides')
      .upsert(
        grants.map((g) => ({
          gym_id: gymId,
          user_id: userId,
          permission: g.permission,
          granted: g.granted,
          granted_by: grantedBy,
          updated_at: now,
        })),
        { onConflict: 'gym_id,user_id,permission' },
      );
    if (error) throw new Error(error.message);
  }

  if (clears.length > 0) {
    const { error } = await supabase
      .from('gym_user_permission_overrides')
      .delete()
      .eq('gym_id', gymId)
      .eq('user_id', userId)
      .in('permission', clears);
    if (error) throw new Error(error.message);
  }
}

/**
 * Re-read one person's stored overrides — used to resync the UI to the DB truth
 * after a batch write fails partway (never guess a half-applied state). Throws on
 * a real query error so the caller can fall back; missing rows resolve to `[]`.
 */
export async function fetchPersonOverrides(
  supabase: SupabaseClient,
  gymId: string,
  userId: string,
): Promise<{ permission: PermissionKey; granted: boolean }[]> {
  const { data, error } = await supabase
    .from('gym_user_permission_overrides')
    .select('permission, granted')
    .eq('gym_id', gymId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  const out: { permission: PermissionKey; granted: boolean }[] = [];
  if (Array.isArray(data)) {
    for (const row of data as { permission?: unknown; granted?: unknown }[]) {
      if (
        typeof row.permission === 'string' &&
        PERMISSION_KEY_SET.has(row.permission) &&
        typeof row.granted === 'boolean'
      ) {
        out.push({ permission: row.permission as PermissionKey, granted: row.granted });
      }
    }
  }
  return out;
}
