'use client';

/**
 * Client access context (ImplementationPlan.md §8.4).
 *
 * `<AccessProvider>` fetches `fetchMyAccess` once auth-context resolves and
 * exposes it via `useAccess()`. Before the RPC lands or on failure it serves
 * `accessFromRoleDefaults` seeded from the auth profile, so UI hiding degrades
 * to today's role behavior and never crashes.
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
  const { profile, isLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const role = coerceRole(profile?.role);
  const gymId = profile?.gymId ?? null;

  const [access, setAccess] = useState<MyAccess>(() => accessFromRoleDefaults(role, gymId));

  // Keep the safe default aligned with the resolved profile role/gym.
  useEffect(() => {
    setAccess((prev) =>
      prev.role === role && prev.gymId === gymId ? prev : accessFromRoleDefaults(role, gymId),
    );
  }, [role, gymId]);

  // Resolve real access (overrides + effective feature flags) once auth settles.
  useEffect(() => {
    if (isLoading || !profile) return;
    let active = true;
    void fetchMyAccess(supabase).then((resolved) => {
      if (active) setAccess(resolved);
    });
    return () => {
      active = false;
    };
  }, [isLoading, profile, supabase]);

  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccess(): MyAccess {
  const ctx = useContext(AccessContext);
  // Outside a provider (SSR, tests, pre-mount): permissionless safe default.
  return ctx ?? accessFromRoleDefaults('member', null);
}
