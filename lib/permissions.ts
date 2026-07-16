/**
 * Permission model — pure, isomorphic source of truth (no supabase imports).
 *
 * Frozen contract: ImplementationPlan.md §8.1. The SQL side
 * (`gym_role_permission_defaults` seed, `has_gym_permission`) mirrors this;
 * `tests/fixtures/role-permission-defaults.json` + `permissions-parity.test.ts`
 * fail CI on drift. Never change these shapes without updating the plan.
 *
 * Owners never see these keys — the UI renders plain-language labels only
 * (see ACCESS_SWITCHES / FEATURE_CATALOG). Keys exist for enforcement, not display.
 */

export type Role = 'owner' | 'admin' | 'staff' | 'member';

export type PermissionKey =
  | 'dashboard:view' | 'dashboard:finance:view'
  | 'reports:attendance:view' | 'reports:finance:view'
  | 'members:view' | 'members:manage' | 'members:payment_history:view'
  | 'payments:view' | 'payments:create' | 'payments:discount' | 'payments:reverse'
  | 'plans:manage' | 'promos:manage' | 'announcements:manage'
  | 'gym_page:view' | 'gym_page:edit' | 'gym_page:publish'
  | 'features:manage' | 'roles:manage'
  | 'kiosk:use' | 'cache:revalidate';

/**
 * Every permission key, in canonical order. The defaults table seeds an owner
 * row for each of these — it is the canonical key registry.
 */
export const PERMISSION_KEYS: readonly PermissionKey[] = [
  'dashboard:view', 'dashboard:finance:view',
  'reports:attendance:view', 'reports:finance:view',
  'members:view', 'members:manage', 'members:payment_history:view',
  'payments:view', 'payments:create', 'payments:discount', 'payments:reverse',
  'plans:manage', 'promos:manage', 'announcements:manage',
  'gym_page:view', 'gym_page:edit', 'gym_page:publish',
  'features:manage', 'roles:manage',
  'kiosk:use', 'cache:revalidate',
];

/**
 * Role defaults — ImplementationPlan.md §3 exactly. Owner holds EVERY key.
 * The `(s)` switch-flippable cells default to their §3 checkmark here; the
 * per-admin override only exists once an owner flips a switch (§7.9).
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, readonly PermissionKey[]> = {
  owner: PERMISSION_KEYS,
  admin: [
    'dashboard:view', 'dashboard:finance:view',
    'reports:attendance:view', 'reports:finance:view',
    'members:view', 'members:manage', 'members:payment_history:view',
    'payments:view', 'payments:create', 'payments:discount',
    'plans:manage', 'promos:manage', 'announcements:manage',
    'kiosk:use', 'cache:revalidate',
  ],
  staff: ['members:view', 'kiosk:use'],
  member: [],
};

/**
 * The People & access UI (§7.9): one flat list of plain-language switches per
 * admin, both directions. Each switch writes one override row per mapped key.
 */
export interface AccessSwitch {
  id: string;                                 // stable slug
  label: string;                              // §7.9 table, verbatim
  permissions: readonly PermissionKey[];      // keys written together, same granted value
}

export const ACCESS_SWITCHES: readonly AccessSwitch[] = [
  { id: 'money-numbers', label: 'Can see money numbers (dashboard & reports)', permissions: ['dashboard:finance:view', 'reports:finance:view'] },
  { id: 'manage-members', label: 'Can manage members', permissions: ['members:manage'] },
  { id: 'record-payments', label: 'Can record payments', permissions: ['payments:create', 'payments:discount', 'payments:view'] },
  { id: 'manage-plans', label: 'Can manage plans', permissions: ['plans:manage'] },
  { id: 'manage-promos', label: 'Can manage promos', permissions: ['promos:manage'] },
  { id: 'post-announcements', label: 'Can post announcements', permissions: ['announcements:manage'] },
  { id: 'use-kiosk', label: 'Can use the kiosk', permissions: ['kiosk:use'] },
  { id: 'gym-studio', label: 'Can open & edit the Gym Page studio', permissions: ['gym_page:view', 'gym_page:edit'] },
];

export interface PermissionOverride { permission: PermissionKey; granted: boolean }

/**
 * Does this role hold this permission by default?
 * Owner ⇒ true for every key (including unknown/future ones — owners are never
 * locked out). `gym_page:edit` implies `gym_page:view`.
 */
export function roleHasPermission(role: Role, key: PermissionKey): boolean {
  if (role === 'owner') return true;
  const defaults = ROLE_DEFAULT_PERMISSIONS[role];
  if (defaults.includes(key)) return true;
  if (key === 'gym_page:view' && defaults.includes('gym_page:edit')) return true;
  return false;
}

/**
 * Effective permission set for a role + per-user overrides.
 * Overrides beat defaults (grant what's off, revoke what's on). `gym_page:edit`
 * always implies `gym_page:view`. Owner resolves to every known key.
 */
export function resolvePermissions(
  role: Role,
  overrides: readonly PermissionOverride[],
): ReadonlySet<PermissionKey> {
  if (role === 'owner') return new Set(PERMISSION_KEYS);

  const set = new Set<PermissionKey>(ROLE_DEFAULT_PERMISSIONS[role]);
  for (const { permission, granted } of overrides) {
    if (granted) set.add(permission);
    else set.delete(permission);
  }
  // Resolver treats edit ⊇ view.
  if (set.has('gym_page:edit')) set.add('gym_page:view');
  return set;
}

/**
 * Route → required permission. Longest-prefix match wins (middleware + admin nav).
 * Ordered longest-first so a naive first-match consumer is also correct.
 */
export const ROUTE_PERMISSIONS: readonly { prefix: string; permission: PermissionKey }[] = [
  { prefix: '/admin/gym-profile', permission: 'gym_page:view' },
  { prefix: '/admin/announcements', permission: 'announcements:manage' },
  { prefix: '/admin/access', permission: 'roles:manage' },
  { prefix: '/admin/reports', permission: 'reports:attendance:view' },
  { prefix: '/admin/members', permission: 'members:view' },
  { prefix: '/admin/payments', permission: 'payments:view' },
  { prefix: '/admin/plans', permission: 'plans:manage' },
  { prefix: '/admin/promos', permission: 'promos:manage' },
  { prefix: '/kiosk', permission: 'kiosk:use' },
  { prefix: '/admin', permission: 'dashboard:view' },
];

/** Longest-prefix lookup of the permission guarding a path, or null if unguarded. */
export function permissionForPath(pathname: string): PermissionKey | null {
  let best: { prefix: string; permission: PermissionKey } | null = null;
  for (const entry of ROUTE_PERMISSIONS) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best?.permission ?? null;
}
