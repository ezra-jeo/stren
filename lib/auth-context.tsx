'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from './supabase';
import { withTimeout } from './async-guard';
import { choosePostAuthDestination } from './post-auth-destination';
import type { AccountProfile, MyGym } from './types';
import {
  clearPrivateCaches,
  derivePrivateDataScope,
  type PrivateDataScope,
} from './private-cache';
import { PrivacyCurtain } from '@/components/ui/loading-screen';

type AuthProfile = AccountProfile & {
  /** TODO(U3): remove after every shell/client reads active gym from access/auth context. */
  gymId: string | null;
  role: MyGym['role'];
};

const PROFILE_CACHE_KEY = 'stren.auth.profileCache';
const PROFILE_CACHE_TTL_MS = 120_000;
const PASSWORD_SETUP_DONE_PREFIX = 'stren.auth.passwordSetupDone:';
const PASSWORD_SETUP_PENDING_PREFIX = 'stren.auth.passwordSetupPending:';

export interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  myGyms: MyGym[];
  activeGymId: string | null;
  activeScope: PrivateDataScope | null;
  profileError: string | null;
  gymAccessError: string | null;
  isLoading: boolean;
  isSigningOut: boolean;
  needsPasswordSetup: boolean;
  signIn(email: string, password: string): Promise<{ error: string | null; email?: string }>;
  resolveSignedInDestination(gymCode?: string): Promise<string>;
  signOut(): Promise<void>;
  completePasswordSetup(userId?: string | null): void;
  refreshProfile(): Promise<void>;
  refreshMyGyms(): Promise<void>;
  beginPrivateScopeChange(): void;
}

const fallback: AuthContextValue = {
  user: null, profile: null, myGyms: [], activeGymId: null, activeScope: null, profileError: null, gymAccessError: null,
  isLoading: false, isSigningOut: false, needsPasswordSetup: false,
  signIn: async () => ({ error: 'Authentication unavailable.' }),
  resolveSignedInDestination: async () => '/auth?mode=signin',
  signOut: async () => {}, completePasswordSetup: () => {},
  refreshProfile: async () => {}, refreshMyGyms: async () => {}, beginPrivateScopeChange: () => {},
};
const AuthContext = createContext<AuthContextValue | null>(null);

function storageFlag(key: string) { try { return localStorage.getItem(key) === '1'; } catch { return false; } }
function setStorageFlag(key: string, value: boolean) { try { value ? localStorage.setItem(key, '1') : localStorage.removeItem(key); } catch {} }
function needsSetup(userId: string | null) { return !!userId && storageFlag(`${PASSWORD_SETUP_PENDING_PREFIX}${userId}`) && !storageFlag(`${PASSWORD_SETUP_DONE_PREFIX}${userId}`); }

function hashTokens() {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('access_token'); const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken || params.get('token_type')?.toLowerCase() !== 'bearer') return null;
  return { accessToken, refreshToken, type: params.get('type')?.toLowerCase() ?? null };
}
function invalidRefresh(error: unknown) { return /invalid refresh token|refresh token not found|missing refresh token/i.test(error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? '')); }
function benignLock(error: unknown) { return /lock broken by another request.*steal/i.test(error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? '')); }
async function retry<T>(operation: () => Promise<T>) { try { return await operation(); } catch (error) { if (!benignLock(error)) throw error; await new Promise((r) => setTimeout(r, 180)); return operation(); } }

function readCache(userId: string): AuthProfile | null {
  try { const value = JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) ?? 'null') as { userId: string; at: number; profile: AuthProfile } | null; return value?.userId === userId && Date.now() - value.at < PROFILE_CACHE_TTL_MS ? value.profile : null; } catch { return null; }
}
function writeCache(userId: string, profile: AuthProfile) { try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, at: Date.now(), profile })); } catch {} }

export function shouldSkipAuthBootstrap(pathname: string | null | undefined): boolean {
  return pathname === '/' || pathname === '/auth' || pathname === '/auth/confirm' || pathname === '/reset-password' || pathname === '/for-gym-owners';
}

export function shouldDeferAuthBootstrap(pathname: string | null | undefined): boolean {
  return pathname === '/landing' || Boolean(pathname?.startsWith('/gym/'));
}

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [myGyms, setMyGyms] = useState<MyGym[]>([]);
  const [activeGymId, setActiveGymId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [gymAccessError, setGymAccessError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const recovering = useRef(false);
  const privateRequestEpoch = useRef(0);
  const profileRequestSequence = useRef(0);
  const gymsRequestSequence = useRef(0);
  const authSnapshotGeneration = useRef(0);
  const currentUserId = useRef<string | null>(null);
  const router = useRouter(); const pathname = usePathname();
  const skipBootstrap = useMemo(() => shouldSkipAuthBootstrap(pathname), [pathname]);
  const deferBootstrap = useMemo(() => shouldDeferAuthBootstrap(pathname), [pathname]);
  const supabase = useMemo(() => skipBootstrap ? null : createClient(), [skipBootstrap]);
  const client = useCallback(() => supabase ?? createClient(), [supabase]);

  const beginPrivateScopeChange = useCallback(() => {
    privateRequestEpoch.current += 1;
    profileRequestSequence.current += 1;
    gymsRequestSequence.current += 1;
    try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
    setProfile(null);
    setMyGyms([]);
    setActiveGymId(null);
    setProfileError(null);
    setGymAccessError(null);
  }, []);

  const fetchProfile = useCallback(async (userId: string, db = client(), expectedEpoch = privateRequestEpoch.current) => {
    const requestSequence = ++profileRequestSequence.current;
    try {
      const { data, error } = await withTimeout(db.from('profiles').select('id,email,name,contact_number,avatar_url,avatar_updated_at,avatar_change_locked_until,avatar_change_count,qr_code,created_at,active_gym_id').eq('id', userId).maybeSingle(), 7000, 'Profile lookup timed out.');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('The authenticated account has no profile record.');
      const built: AuthProfile = { id: data.id, email: data.email, name: data.name, contactNumber: data.contact_number, avatarUrl: data.avatar_url, avatarUpdatedAt: data.avatar_updated_at, avatarChangeLockedUntil: data.avatar_change_locked_until, avatarChangeCount: data.avatar_change_count ?? 0, qrCode: data.qr_code ?? '', createdAt: data.created_at ?? new Date().toISOString(), gymId: data.active_gym_id ?? null, role: 'member' };
      if (
        privateRequestEpoch.current === expectedEpoch &&
        profileRequestSequence.current === requestSequence &&
        currentUserId.current === userId
      ) {
        setProfile(built); setActiveGymId(data.active_gym_id ?? null); setProfileError(null); writeCache(userId, built);
      }
      return built;
    } catch (error) {
      if (
        privateRequestEpoch.current === expectedEpoch &&
        profileRequestSequence.current === requestSequence &&
        currentUserId.current === userId
      ) {
        setProfileError('We could not load your account profile. Your signed-in session is still active.');
      }
      throw error;
    }
  }, [client]);

  const fetchGyms = useCallback(async (
    db = client(),
    expectedEpoch = privateRequestEpoch.current,
    expectedUserId = currentUserId.current,
  ) => {
    const requestSequence = ++gymsRequestSequence.current;
    try {
      const { data, error } = await withTimeout(
        db.rpc('get_my_gyms'),
        7000,
        'Gym access lookup timed out.',
      );
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error('Gym access lookup returned an invalid response.');
      const gyms = data.map((row: Record<string, unknown>) => ({ gymId: String(row.gym_id), code: String(row.code), name: String(row.name), logoUrl: typeof row.logo_url === 'string' ? row.logo_url : null, role: row.role as MyGym['role'], status: row.status as MyGym['status'] }));
      if (
        privateRequestEpoch.current === expectedEpoch &&
        gymsRequestSequence.current === requestSequence &&
        currentUserId.current === expectedUserId
      ) {
        setMyGyms(gyms); setGymAccessError(null);
      }
      return gyms;
    } catch (error) {
      if (
        privateRequestEpoch.current === expectedEpoch &&
        gymsRequestSequence.current === requestSequence &&
        currentUserId.current === expectedUserId
      ) {
        setGymAccessError('We could not load your gym access. Your account has not been treated as a new account.');
      }
      throw error;
    }
  }, [client]);

  const recover = useCallback(async (db = client()) => {
    if (recovering.current) return; recovering.current = true;
    beginPrivateScopeChange(); clearPrivateCaches(); currentUserId.current = null;
    authSnapshotGeneration.current += 1;
    try { await withTimeout(db.auth.signOut({ scope: 'local' }), 2500, 'Local sign-out timed out.'); } catch {}
    finally {
      setUser(null); setIsLoading(false); recovering.current = false;
      if (pathname !== '/auth') { router.replace('/auth?mode=signin'); router.refresh(); }
    }
  }, [beginPrivateScopeChange, client, pathname, router]);

  useEffect(() => {
    const tokens = hashTokens(); if (!tokens) return;
    const db = createClient(); setIsLoading(true);
    void db.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken }).then(async ({ data, error }) => {
      history.replaceState({}, '', `${location.pathname}${location.search}`);
      if (error || !data.user) { router.replace(`/auth?mode=signin&error=${encodeURIComponent(error?.message ?? 'invalid_magic_link_session')}`); setIsLoading(false); return; }
      beginPrivateScopeChange(); currentUserId.current = data.user.id; authSnapshotGeneration.current += 1; setUser(data.user); if (['recovery','magiclink','email','invite'].includes(tokens.type ?? '')) setStorageFlag(`${PASSWORD_SETUP_PENDING_PREFIX}${data.user.id}`, true);
      setNeedsPasswordSetup(needsSetup(data.user.id)); await Promise.allSettled([fetchProfile(data.user.id, db), fetchGyms(db)]); setIsLoading(false);
      if (tokens.type === 'recovery' && pathname !== '/reset-password') router.replace('/reset-password');
    });
  }, [beginPrivateScopeChange, fetchGyms, fetchProfile, pathname, router]);

  useEffect(() => {
    if (skipBootstrap || !supabase) { setIsLoading(false); return; }
    let active = true;
    let subscription: { unsubscribe(): void } | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    setIsLoading(!deferBootstrap);
    const hydrate = async (current: User | null, generation: number) => {
      if (!active || authSnapshotGeneration.current !== generation) return;
      const nextUserId = current?.id ?? null;
      if (currentUserId.current !== nextUserId) beginPrivateScopeChange();
      currentUserId.current = current?.id ?? null;
      setUser(current); setNeedsPasswordSetup(needsSetup(current?.id ?? null));
      if (!current) {
        clearPrivateCaches(); beginPrivateScopeChange(); setIsLoading(false); return;
      }
      const expectedEpoch = privateRequestEpoch.current;
      const cached = readCache(current.id); if (cached) setProfile(cached);
      await Promise.allSettled([fetchProfile(current.id, supabase, expectedEpoch), fetchGyms(supabase, expectedEpoch, current.id)]);
      if (
        active &&
        authSnapshotGeneration.current === generation &&
        privateRequestEpoch.current === expectedEpoch &&
        currentUserId.current === current.id
      ) setIsLoading(false);
    };
    const start = () => {
      if (!active) return;
      const initialGeneration = ++authSnapshotGeneration.current;
      subscription = supabase.auth.onAuthStateChange((_event, session) => {
        const generation = ++authSnapshotGeneration.current;
        void hydrate(session?.user ?? null, generation);
      }).data.subscription;
      void retry(() => supabase.auth.getUser())
        .then(({ data, error }) => {
          if (!active || authSnapshotGeneration.current !== initialGeneration) return;
          return error && invalidRefresh(error) ? recover(supabase) : hydrate(data.user ?? null, initialGeneration);
        })
        .catch((error) => {
          if (!active || authSnapshotGeneration.current !== initialGeneration) return;
          return invalidRefresh(error) ? recover(supabase) : hydrate(null, initialGeneration);
        });
    };

    if (deferBootstrap) {
      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (idleWindow.requestIdleCallback) idleId = idleWindow.requestIdleCallback(start, { timeout: 1_200 });
      else timerId = setTimeout(start, 180);
    } else {
      start();
    }

    return () => {
      active = false;
      authSnapshotGeneration.current += 1;
      subscription?.unsubscribe();
      if (timerId) clearTimeout(timerId);
      if (idleId !== null) (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
    };
  }, [beginPrivateScopeChange, deferBootstrap, fetchGyms, fetchProfile, recover, skipBootstrap, supabase]);

  async function signIn(email: string, password: string) {
    const db = client();
    try {
      const { data, error } = await withTimeout(
        db.auth.signInWithPassword({ email, password }),
        8000,
        'Sign in timed out.',
      );
      if (error || !data.user) return { error: error?.message ?? 'Sign in failed.' };

      const { data: confirmed, error: confirmationError } = await withTimeout(
        db.auth.getUser(),
        5000,
        'Session confirmation timed out.',
      );
      if (confirmationError || !confirmed.user || confirmed.user.id !== data.user.id) {
        return { error: confirmationError?.message ?? 'Session confirmation failed.' };
      }

      if (currentUserId.current !== confirmed.user.id) beginPrivateScopeChange();
      currentUserId.current = confirmed.user.id;
      setUser(confirmed.user);
      setStorageFlag(`${PASSWORD_SETUP_DONE_PREFIX}${confirmed.user.id}`, true);
      setStorageFlag(`${PASSWORD_SETUP_PENDING_PREFIX}${confirmed.user.id}`, false);
      return { error: null, email: confirmed.user.email ?? email.trim().toLowerCase() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed.' };
    }
  }
  async function resolveSignedInDestination(gymCode?: string) {
    const db = client();
    setIsLoading(true);
    try {
      const { data, error } = await withTimeout(db.auth.getUser(), 5000, 'Session confirmation timed out.');
      if (error || !data.user) throw new Error(error?.message ?? 'The signed-in session could not be confirmed.');
      if (currentUserId.current !== data.user.id) beginPrivateScopeChange();
      currentUserId.current = data.user.id;
      setUser(data.user);
      const expectedEpoch = privateRequestEpoch.current;
      const [gymsResult, profileResult] = await Promise.allSettled([fetchGyms(db, expectedEpoch), fetchProfile(data.user.id, db, expectedEpoch)]);
      if (gymsResult.status === 'rejected') throw new Error('Gym access lookup failed.');
      const resolvedActiveGymId = profileResult.status === 'fulfilled' ? profileResult.value.gymId : activeGymId;
      const destination = choosePostAuthDestination(gymsResult.value, resolvedActiveGymId, gymCode);
      if (destination.activateGymId) {
        const { error: activationError } = await withTimeout(
          db.rpc('set_active_gym', { p_gym_id: destination.activateGymId }),
          7000,
          'Gym selection timed out.',
        );
        if (activationError) throw new Error(activationError.message);
        setActiveGymId(destination.activateGymId);
        setProfile((current) => current ? { ...current, gymId: destination.activateGymId! } : current);
      }
      return destination.path;
    } finally {
      setIsLoading(false);
    }
  }
  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    beginPrivateScopeChange(); clearPrivateCaches(); currentUserId.current = null;
    setUser(null); setProfile(null); setMyGyms([]); setActiveGymId(null); setProfileError(null); setGymAccessError(null);
    const db = client();
    authSnapshotGeneration.current += 1;
    try {
      await withTimeout(db.auth.signOut(), 10000, 'Sign-out timed out.');
    } catch {
      try { await withTimeout(db.auth.signOut({ scope: 'local' }), 2500, 'Local sign-out timed out.'); } catch {}
    } finally {
      router.replace('/auth?mode=signin'); router.refresh();
    }
  }
  async function refreshProfile() { if (user) await fetchProfile(user.id); }
  async function refreshMyGyms() { await fetchGyms(); }
  function completePasswordSetup(userId?: string | null) { const id = userId ?? user?.id; if (!id) return; setStorageFlag(`${PASSWORD_SETUP_DONE_PREFIX}${id}`, true); setStorageFlag(`${PASSWORD_SETUP_PENDING_PREFIX}${id}`, false); if (id === user?.id) setNeedsPasswordSetup(false); }

  useEffect(() => {
    if (isSigningOut && pathname === '/auth') setIsSigningOut(false);
  }, [isSigningOut, pathname]);

  const activeScope = useMemo(() => derivePrivateDataScope({
    accountId: user?.id,
    profileId: profile?.id,
    activeGymId,
    gyms: myGyms,
  }), [activeGymId, myGyms, profile?.id, user?.id]);

  return (
    <AuthContext.Provider value={{ user, profile, myGyms, activeGymId, activeScope, profileError, gymAccessError, isLoading, isSigningOut, needsPasswordSetup, signIn, resolveSignedInDestination, signOut, completePasswordSetup, refreshProfile, refreshMyGyms, beginPrivateScopeChange }}>
      {children}
      {isSigningOut && <PrivacyCurtain message="Signing you out…" detail="Clearing private account data" />}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) { return <AuthProviderInner>{children}</AuthProviderInner>; }
export function useAuth() { return useContext(AuthContext) ?? fallback; }
