'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from './supabase';
import { withTimeout } from './async-guard';
import type { AccountProfile, MyGym } from './types';

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
  isLoading: boolean;
  isSigningOut: boolean;
  needsPasswordSetup: boolean;
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  completePasswordSetup(userId?: string | null): void;
  refreshProfile(): Promise<void>;
  refreshMyGyms(): Promise<void>;
}

const fallback: AuthContextValue = {
  user: null, profile: null, myGyms: [], activeGymId: null,
  isLoading: false, isSigningOut: false, needsPasswordSetup: false,
  signIn: async () => ({ error: 'Authentication unavailable.' }),
  signOut: async () => {}, completePasswordSetup: () => {},
  refreshProfile: async () => {}, refreshMyGyms: async () => {},
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
  return pathname === '/' || pathname === '/auth' || pathname === '/reset-password';
}

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [myGyms, setMyGyms] = useState<MyGym[]>([]);
  const [activeGymId, setActiveGymId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const recovering = useRef(false);
  const router = useRouter(); const pathname = usePathname();
  const skipBootstrap = useMemo(() => shouldSkipAuthBootstrap(pathname), [pathname]);
  const supabase = useMemo(() => skipBootstrap ? null : createClient(), [skipBootstrap]);
  const client = useCallback(() => supabase ?? createClient(), [supabase]);

  const fetchProfile = useCallback(async (userId: string, db = client()) => {
    try {
      const { data, error } = await withTimeout(db.from('profiles').select('id,email,name,contact_number,avatar_url,avatar_updated_at,avatar_change_locked_until,avatar_change_count,qr_code,created_at,active_gym_id').eq('id', userId).maybeSingle(), 7000, 'Profile lookup timed out.');
      if (error || !data) { setProfile(null); setActiveGymId(null); return null; }
      const built: AuthProfile = { id: data.id, email: data.email, name: data.name, contactNumber: data.contact_number, avatarUrl: data.avatar_url, avatarUpdatedAt: data.avatar_updated_at, avatarChangeLockedUntil: data.avatar_change_locked_until, avatarChangeCount: data.avatar_change_count ?? 0, qrCode: data.qr_code ?? '', createdAt: data.created_at ?? new Date().toISOString(), gymId: data.active_gym_id ?? null, role: 'member' };
      setProfile(built); setActiveGymId(data.active_gym_id ?? null); writeCache(userId, built); return built;
    } catch {
      setProfile(null); setActiveGymId(null); return null;
    }
  }, [client]);

  const fetchGyms = useCallback(async (db = client()) => {
    try {
      const { data, error } = await withTimeout(
        db.rpc('get_my_gyms'),
        7000,
        'Gym access lookup timed out.',
      );
      if (error || !Array.isArray(data)) { setMyGyms([]); return; }
      setMyGyms(data.map((row: Record<string, unknown>) => ({ gymId: String(row.gym_id), code: String(row.code), name: String(row.name), logoUrl: typeof row.logo_url === 'string' ? row.logo_url : null, role: row.role as MyGym['role'], status: row.status as MyGym['status'] })));
    } catch {
      setMyGyms([]);
    }
  }, [client]);

  const recover = useCallback(async (db = client()) => {
    if (recovering.current) return; recovering.current = true;
    try { await db.auth.signOut({ scope: 'local' }); } catch {}
    setUser(null); setProfile(null); setMyGyms([]); setActiveGymId(null); setIsLoading(false); recovering.current = false;
    if (pathname !== '/auth') { router.replace('/auth?mode=signin'); router.refresh(); }
  }, [client, pathname, router]);

  useEffect(() => {
    const tokens = hashTokens(); if (!tokens) return;
    const db = createClient(); setIsLoading(true);
    void db.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken }).then(async ({ data, error }) => {
      history.replaceState({}, '', `${location.pathname}${location.search}`);
      if (error || !data.user) { router.replace(`/auth?mode=signin&error=${encodeURIComponent(error?.message ?? 'invalid_magic_link_session')}`); setIsLoading(false); return; }
      setUser(data.user); if (['recovery','magiclink','email','invite'].includes(tokens.type ?? '')) setStorageFlag(`${PASSWORD_SETUP_PENDING_PREFIX}${data.user.id}`, true);
      setNeedsPasswordSetup(needsSetup(data.user.id)); await Promise.all([fetchProfile(data.user.id, db), fetchGyms(db)]); setIsLoading(false);
      if (tokens.type === 'recovery' && pathname !== '/reset-password') router.replace('/reset-password');
    });
  }, [fetchGyms, fetchProfile, pathname, router]);

  useEffect(() => {
    if (skipBootstrap || !supabase) { setIsLoading(false); return; }
    let active = true; setIsLoading(true);
    const hydrate = async (current: User | null) => { if (!active) return; setUser(current); setNeedsPasswordSetup(needsSetup(current?.id ?? null)); if (!current) { setProfile(null); setMyGyms([]); setActiveGymId(null); setIsLoading(false); return; } const cached = readCache(current.id); if (cached) setProfile(cached); await Promise.all([fetchProfile(current.id, supabase), fetchGyms(supabase)]); if (active) setIsLoading(false); };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { void hydrate(session?.user ?? null); });
    void retry(() => supabase.auth.getUser()).then(({ data, error }) => error && invalidRefresh(error) ? recover(supabase) : hydrate(data.user ?? null)).catch((error) => invalidRefresh(error) ? recover(supabase) : hydrate(null));
    return () => { active = false; subscription.unsubscribe(); };
  }, [fetchGyms, fetchProfile, recover, skipBootstrap, supabase]);

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

      setUser(confirmed.user);
      setStorageFlag(`${PASSWORD_SETUP_DONE_PREFIX}${confirmed.user.id}`, true);
      setStorageFlag(`${PASSWORD_SETUP_PENDING_PREFIX}${confirmed.user.id}`, false);
      void Promise.allSettled([fetchProfile(confirmed.user.id, db), fetchGyms(db)]);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed.' };
    }
  }
  async function signOut() { if (isSigningOut) return; setIsSigningOut(true); const db = client(); try { await withTimeout(db.auth.signOut(), 10000, 'Sign-out timed out.'); } catch { await db.auth.signOut({ scope: 'local' }); } setUser(null); setProfile(null); setMyGyms([]); setActiveGymId(null); setIsSigningOut(false); router.replace('/auth?mode=signin'); router.refresh(); }
  async function refreshProfile() { if (user) await fetchProfile(user.id); }
  async function refreshMyGyms() { await fetchGyms(); }
  function completePasswordSetup(userId?: string | null) { const id = userId ?? user?.id; if (!id) return; setStorageFlag(`${PASSWORD_SETUP_DONE_PREFIX}${id}`, true); setStorageFlag(`${PASSWORD_SETUP_PENDING_PREFIX}${id}`, false); if (id === user?.id) setNeedsPasswordSetup(false); }

  return <AuthContext.Provider value={{ user, profile, myGyms, activeGymId, isLoading, isSigningOut, needsPasswordSetup, signIn, signOut, completePasswordSetup, refreshProfile, refreshMyGyms }}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) { return <AuthProviderInner>{children}</AuthProviderInner>; }
export function useAuth() { return useContext(AuthContext) ?? fallback; }
