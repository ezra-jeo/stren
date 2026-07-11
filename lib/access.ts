/**
 * Combined access model (ImplementationPlan.md §8.3).
 *
 * `canUse` composes the two layered systems: a feature toggle answers "is this
 * capability enabled for this gym?" and is checked BEFORE the permission that
 * answers "can this user perform this action?".
 */

import type { Role, PermissionKey, PermissionOverride } from './permissions';
import { resolvePermissions } from './permissions';
import type { FeatureKey, FeatureFlags } from './features';
import { isFeatureEnabled, defaultFeatureFlags } from './features';

export interface MyAccess {
  role: Role;
  gymId: string | null;
  permissions: ReadonlySet<PermissionKey>;
  features: FeatureFlags;        // effective flags (server-resolved when available)
}

export function buildAccess(
  role: Role,
  gymId: string | null,
  overrides: readonly PermissionOverride[],
  features: FeatureFlags,
): MyAccess {
  return {
    role,
    gymId,
    permissions: resolvePermissions(role, overrides),
    features,
  };
}

/**
 * True only when both gates pass. `feature`/`permission` may be null to skip
 * that gate. False if the feature exists and is off, OR the permission exists
 * and is missing.
 */
export function canUse(
  access: MyAccess,
  feature: FeatureKey | null,
  permission: PermissionKey | null,
): boolean {
  if (feature !== null && !isFeatureEnabled(access.features, feature)) return false;
  if (permission !== null && !access.permissions.has(permission)) return false;
  return true;
}

/** Safe fallback: role defaults + catalog feature defaults, no overrides. */
export function accessFromRoleDefaults(role: Role, gymId: string | null): MyAccess {
  return {
    role,
    gymId,
    permissions: resolvePermissions(role, []),
    features: defaultFeatureFlags(),
  };
}
