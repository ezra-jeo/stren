'use client';

/**
 * Client access context (ImplementationPlan.md §8.4).
 *
 * `<AccessProvider>` fetches `fetchMyAccess` once auth-context resolves and
 * exposes it via `useAccess()`. Before the RPC lands or on failure it serves
 * exact active private scope, so UI hiding never falls back to stale profile
 * shims while account or gym access is unresolved.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { accessFromRoleDefaults, type MyAccess } from '@/lib/access';
import type { Role } from '@/lib/permissions';
import { fetchMyAccess } from '@/lib/access-data';

const VALID_ROLES = new Set<string>(['owner', 'admin', 'staff', 'member']);

function coerceRole(role: string | null | undefined): Role {
  return role && VALID_ROLES.has(role) ? (role as Role) : 'member';
}

const AccessContext = createContext<MyAccess | null>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { activeScope, isLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const role = coerceRole(activeScope?.role);
  const gymId = activeScope?.gymId ?? null;

  const [access, setAccess] = useState<MyAccess>(() => accessFromRoleDefaults(role, gymId));

  // Keep the safe default aligned with the resolved profile role/gym.
  useEffect(() => {
    setAccess((prev) =>
      prev.role === role && prev.gymId === gymId ? prev : accessFromRoleDefaults(role, gymId),
    );
  }, [role, gymId]);

  // Resolve real access (overrides + effective feature flags) once auth settles.
  useEffect(() => {
    if (isLoading || !activeScope) return;
    let active = true;
    const expectedGymId = activeScope.gymId;
    void fetchMyAccess(supabase).then((resolved) => {
      if (active && resolved.gymId === expectedGymId) setAccess(resolved);
    });
    return () => {
      active = false;
    };
  }, [activeScope, isLoading, supabase]);

  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccess(): MyAccess {
  const ctx = useContext(AccessContext);
  // Outside a provider (SSR, tests, pre-mount): permissionless safe default.
  return ctx ?? accessFromRoleDefaults('member', null);
}
