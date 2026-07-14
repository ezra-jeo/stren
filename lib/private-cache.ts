import type { GymUserRole, MyGym } from './types';

export const PRIVATE_CACHE_SCHEMA_VERSION = 1;

export interface PrivateDataScope {
  accountId: string;
  profileId: string;
  gymId: string;
  role: GymUserRole;
  branchId: string | null;
}

export function derivePrivateDataScope(input: {
  accountId: string | null | undefined;
  profileId: string | null | undefined;
  activeGymId: string | null | undefined;
  gyms: MyGym[];
}): PrivateDataScope | null {
  if (
    !input.accountId ||
    !input.profileId ||
    input.accountId !== input.profileId ||
    !input.activeGymId
  ) return null;
  const activeGym = input.gyms.find(
    (gym) => gym.gymId === input.activeGymId && gym.status === 'active',
  );
  if (!activeGym) return null;

  return {
    accountId: input.accountId,
    profileId: input.profileId,
    gymId: activeGym.gymId,
    role: activeGym.role,
    branchId: null,
  };
}

interface CachePolicy {
  staleTimeMs: number;
  gcTimeMs: number;
}

interface PrivateCacheEntry<T> extends CachePolicy {
  value: T;
  updatedAt: number;
}

export interface PrivateCacheSnapshot<T> {
  value: T;
  updatedAt: number;
  isStale: boolean;
}

const memoryCache = new Map<string, PrivateCacheEntry<unknown>>();
const PRIVATE_SESSION_PREFIXES = [
  'stren.auth.profileCache',
  'stren.private.',
  'admin-members-cache:',
] as const;

function part(value: string | null): string {
  return encodeURIComponent(value ?? '-');
}

export function privateCacheKey(namespace: string, scope: PrivateDataScope): string {
  return [
    `stren.private.v${PRIVATE_CACHE_SCHEMA_VERSION}`,
    part(namespace),
    part(scope.accountId),
    part(scope.profileId),
    part(scope.role),
    part(scope.gymId),
    part(scope.branchId),
  ].join(':');
}

export function writePrivateCache<T>(
  namespace: string,
  scope: PrivateDataScope,
  value: T,
  policy: CachePolicy,
  now = Date.now(),
): void {
  const staleTimeMs = Number.isFinite(policy.staleTimeMs)
    ? Math.max(0, policy.staleTimeMs)
    : 0;
  const requestedGcTimeMs = Number.isFinite(policy.gcTimeMs)
    ? Math.max(0, policy.gcTimeMs)
    : 0;
  memoryCache.set(privateCacheKey(namespace, scope), {
    value,
    updatedAt: now,
    staleTimeMs,
    gcTimeMs: Math.max(staleTimeMs, requestedGcTimeMs),
  });
}

export function readPrivateCache<T>(
  namespace: string,
  scope: PrivateDataScope,
  now = Date.now(),
): PrivateCacheSnapshot<T> | null {
  const key = privateCacheKey(namespace, scope);
  const entry = memoryCache.get(key) as PrivateCacheEntry<T> | undefined;
  if (!entry) return null;

  const age = Math.max(0, now - entry.updatedAt);
  if (age > entry.gcTimeMs) {
    memoryCache.delete(key);
    return null;
  }

  return {
    value: entry.value,
    updatedAt: entry.updatedAt,
    isStale: age > entry.staleTimeMs,
  };
}

export function clearPrivateCaches(options: { storage?: Storage } = {}): void {
  memoryCache.clear();

  const storage = options.storage ?? (typeof window === 'undefined' ? undefined : window.sessionStorage);
  if (!storage) return;

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && PRIVATE_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable in private/restricted environments. The
    // in-memory cache is already gone, so navigation remains fail-closed.
  }
}
