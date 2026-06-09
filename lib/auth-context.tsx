"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase"
import { withTimeout } from "@/lib/async-guard"
import { isValidLoginOrigin, normalizeLoginOrigin } from '@/lib/login-origin'
import { resolveSignOutTargetPath } from '@/lib/sign-out-routing'
import type { User } from "@supabase/supabase-js"
import type { Profile } from "@/lib/types"

const SIGN_OUT_TIMEOUT_MS = 10000
const NAVIGATION_FAILSAFE_MS = 2000
const PROFILE_FETCH_TIMEOUT_MS = 7000
const PROFILE_HYDRATION_DEDUPE_MS = 2500
const PROFILE_CACHE_TTL_MS = 2 * 60 * 1000
const PROFILE_CACHE_KEY = "stren.auth.profileCache"
const LOGIN_ORIGIN_STORAGE_KEY = "stren.auth.loginOriginPath"
const PASSWORD_SETUP_DONE_PREFIX = "stren.auth.passwordSetupDone:"
const PASSWORD_SETUP_PENDING_PREFIX = "stren.auth.passwordSetupPending:"

function getHashSessionTokens(): { accessToken: string; refreshToken: string; linkType: string | null } | null {
  if (typeof window === "undefined") return null
  if (!window.location.hash) return null

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
  const params = new URLSearchParams(hash)

  const accessToken = params.get("access_token")?.trim()
  const refreshToken = params.get("refresh_token")?.trim()
  const tokenType = params.get("token_type")?.trim().toLowerCase()
  const linkType = params.get("type")?.trim().toLowerCase() ?? null

  if (!accessToken || !refreshToken || tokenType !== "bearer") return null
  return { accessToken, refreshToken, linkType }
}

function clearUrlHash() {
  if (typeof window === "undefined") return
  const cleanUrl = `${window.location.pathname}${window.location.search}`
  window.history.replaceState({}, "", cleanUrl)
}

function resolvePostAuthPath(role?: string | null): string {
  if (role === "owner" || role === "admin" || role === "staff") return "/admin"
  return "/member"
}

function readLocalStorageFlag(key: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

function writeLocalStorageFlag(key: string, value: boolean) {
  if (typeof window === "undefined") return
  try {
    if (value) {
      window.localStorage.setItem(key, "1")
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage failures in restricted/private environments.
  }
}

function markPasswordSetupPending(userId: string, pending: boolean) {
  writeLocalStorageFlag(`${PASSWORD_SETUP_PENDING_PREFIX}${userId}`, pending)
}

function markPasswordSetupDone(userId: string, done: boolean) {
  writeLocalStorageFlag(`${PASSWORD_SETUP_DONE_PREFIX}${userId}`, done)
}

function computeNeedsPasswordSetup(userId: string | null): boolean {
  if (!userId) return false
  const pending = readLocalStorageFlag(`${PASSWORD_SETUP_PENDING_PREFIX}${userId}`)
  const done = readLocalStorageFlag(`${PASSWORD_SETUP_DONE_PREFIX}${userId}`)
  return pending && !done
}

function readProfileCache(userId: string | null): Profile | null {
  if (!userId || typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { userId: string; at: number; profile: Profile }
    if (parsed.userId !== userId) return null
    if (Date.now() - parsed.at > PROFILE_CACHE_TTL_MS) return null
    return parsed.profile
  } catch {
    return null
  }
}

function writeProfileCache(userId: string, profile: Profile) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({ userId, at: Date.now(), profile })
    )
  } catch {
    // Ignore storage failures in restricted/private environments.
  }
}

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  isSigningOut: boolean
  needsPasswordSetup: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null; user: User | null; profile: Profile | null }>
  signUp: (email: string, password: string, name: string, role?: "member" | "admin") => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  completePasswordSetup: (userId?: string | null) => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const FALLBACK_AUTH_CONTEXT: AuthContextValue = {
  user: null,
  profile: null,
  isLoading: false,
  isSigningOut: false,
  needsPasswordSetup: false,
  signIn: async () => ({ error: "Authentication unavailable.", user: null, profile: null }),
  signUp: async () => ({ error: "Authentication unavailable." }),
  signOut: async () => {},
  completePasswordSetup: () => {},
  refreshProfile: async () => {},
}

function getStoredLoginOriginPath(): string | null {
  if (typeof window === "undefined") return null

  let candidate: string | null = null
  try {
    candidate = window.localStorage.getItem(LOGIN_ORIGIN_STORAGE_KEY)
  } catch {
    return null
  }

  if (!candidate) return null
  return isValidLoginOrigin(candidate) ? candidate : null
}

function resolveLoginOriginPath(pathname?: string | null): string {
  const storedPath = getStoredLoginOriginPath()
  if (storedPath) return storedPath

  if (pathname?.startsWith("/member")) return "/gym-select"

  return "/login"
}

async function getMemberSignOutRedirectPath(
  client: ReturnType<typeof createClient>,
  gymId: string | null | undefined,
): Promise<string> {
  if (!gymId) return "/gym-select"

  const { data } = await client
    .from("gyms")
    .select("code")
    .eq("id", gymId)
    .maybeSingle()

  const gymCode = data?.code
  if (!gymCode) return "/gym-select"

  return `/gym/${encodeURIComponent(gymCode)}/login`
}

function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false

  const reason = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : ""

  const normalized = reason.toLowerCase()
  return (
    normalized.includes("invalid refresh token") ||
    normalized.includes("refresh token not found") ||
    normalized.includes("missing refresh token")
  )
}

function isBenignLockAbortError(error: unknown): boolean {
  if (!error) return false

  const message = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : ""

  const normalized = message.toLowerCase()
  return (
    normalized.includes("lock broken by another request") &&
    normalized.includes("steal")
  )
}

async function retryOnBenignLock<T>(operation: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isBenignLockAbortError(error) || attempt === retries) {
        throw error
      }
      await new Promise((resolve) => window.setTimeout(resolve, 180))
    }
  }

  throw lastError ?? new Error("Unknown lock error")
}

// Inner component — core auth state + bootstrap logic.
function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false)
  const isRecoveringAuthRef = useRef(false)
  const recentProfileHydrationRef = useRef<{ userId: string; at: number } | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  const shouldSkipAuthBootstrap = useMemo(() => {
    if (!pathname) return false

    if (pathname === "/") return true

    return (
      pathname.startsWith("/landing") ||
      pathname.startsWith("/gym") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/reset-password") ||
      pathname.startsWith("/signup")
    )
  }, [pathname])

  // On public routes, avoid creating an auth client unless an auth action is triggered.
  const supabase = useMemo(() => {
    if (shouldSkipAuthBootstrap) return null
    return createClient()
  }, [shouldSkipAuthBootstrap])

  const getClient = () => supabase ?? createClient()

  useEffect(() => {
    const hashTokens = getHashSessionTokens()
    if (!hashTokens) return

    let active = true
    const client = createClient()

    const applyHashSession = async () => {
      setIsLoading(true)

      const { data, error } = await client.auth.setSession({
        access_token: hashTokens.accessToken,
        refresh_token: hashTokens.refreshToken,
      })

      clearUrlHash()

      if (!active) return

      if (error || !data.session?.user) {
        setUser(null)
        setProfile(null)
        setNeedsPasswordSetup(false)
        setIsLoading(false)
        router.replace(`/login?error=${encodeURIComponent(error?.message ?? "invalid_magic_link_session")}`)
        return
      }

      setUser(data.session.user)
      const isRecoveryLink = hashTokens.linkType === "recovery"
      if (isRecoveryLink || hashTokens.linkType === "magiclink" || hashTokens.linkType === "email" || hashTokens.linkType === "invite") {
        markPasswordSetupPending(data.session.user.id, true)
      }
      setNeedsPasswordSetup(computeNeedsPasswordSetup(data.session.user.id))
      const hydratedProfile = await fetchProfile(data.session.user.id, client)
      if (!active) return

      if (isRecoveryLink) {
        if (!pathname?.startsWith("/reset-password")) {
          router.replace("/reset-password")
        }
        return
      }

      const target = resolvePostAuthPath(hydratedProfile?.role)
      if (pathname !== target) {
        router.replace(target)
      }
    }

    void applyHashSession()

    return () => {
      active = false
    }
  }, [pathname, router])


  const recoverFromInvalidRefreshToken = useCallback(async (client = supabase ?? createClient()) => {
    if (isRecoveringAuthRef.current) return
    isRecoveringAuthRef.current = true

    try {
      await client.auth.signOut({ scope: "local" })
    } catch {
      // Ignore local cleanup failures and still clear app state.
    } finally {
      setUser(null)
      setProfile(null)
      setNeedsPasswordSetup(false)
      setIsLoading(false)
      isRecoveringAuthRef.current = false
    }

    const isAuthRoute = pathname === "/login" || pathname === "/signup" || pathname?.startsWith("/signup/")
    if (!isAuthRoute) {
      router.replace(resolveLoginOriginPath(pathname))
      router.refresh()
    }
  }, [pathname, router, supabase])

  useEffect(() => {
    if (shouldSkipAuthBootstrap || !supabase) {
      // Keep any existing auth/profile state when navigating through public routes
      // (e.g. /gym previews) to avoid teardown/re-hydration races when returning to /admin.
      setIsLoading(false)
      return
    }

    // Set loading=true immediately so layouts don't see the transient
    // user=null state and incorrectly redirect to /login before
    // onAuthStateChange has a chance to fire with the existing session.
    setIsLoading(true)

    let isActive = true
    let hasResolved = false

    const bootstrapTimeout = setTimeout(() => {
      if (!isActive || hasResolved) return
      setUser(null)
      setProfile(null)
      setIsLoading(false)
    }, 5000) // reduced from 8000ms — if it hasn't resolved in 5s, something is wrong

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isActive) return

      hasResolved = true

      const currentUser = session?.user ?? null
      setUser(currentUser)
      setNeedsPasswordSetup(computeNeedsPasswordSetup(currentUser?.id ?? null))
      if (currentUser) {
        const cachedProfile = readProfileCache(currentUser.id)
        if (cachedProfile) {
          setProfile(cachedProfile)
          setIsLoading(false)
          // Refresh in the background to keep data fresh.
          void fetchProfile(currentUser.id, supabase)
          return
        }
        const recentHydration = recentProfileHydrationRef.current
        const now = Date.now()
        if (
          recentHydration &&
          recentHydration.userId === currentUser.id &&
          now - recentHydration.at < PROFILE_HYDRATION_DEDUPE_MS
        ) {
          setIsLoading(false)
          return
        }

        await fetchProfile(currentUser.id, supabase)
      } else {
        setProfile(null)
        setIsLoading(false)
      }
    })

    const bootstrapUser = async () => {
      try {
        const { data, error } = await retryOnBenignLock(() => supabase.auth.getUser(), 1)

        if (!isActive || hasResolved) return

        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            await recoverFromInvalidRefreshToken(supabase)
            return
          }

          setUser(null)
          setProfile(null)
          setIsLoading(false)
          return
        }

        hasResolved = true
        const currentUser = data.user ?? null
        setUser(currentUser)
        setNeedsPasswordSetup(computeNeedsPasswordSetup(currentUser?.id ?? null))

        if (currentUser) {
          const cachedProfile = readProfileCache(currentUser.id)
          if (cachedProfile) {
            setProfile(cachedProfile)
            setIsLoading(false)
            void fetchProfile(currentUser.id, supabase)
            return
          }

          await fetchProfile(currentUser.id, supabase)
        } else {
          setProfile(null)
          setIsLoading(false)
        }
      } catch {
        if (!isActive || hasResolved) return
        setUser(null)
        setProfile(null)
        setIsLoading(false)
      }
    }

    void bootstrapUser()

    return () => {
      isActive = false
      clearTimeout(bootstrapTimeout)
      subscription.unsubscribe()
    }
  }, [shouldSkipAuthBootstrap, supabase])

  useEffect(() => {
    if (shouldSkipAuthBootstrap || !supabase) return

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isBenignLockAbortError(event.reason)) {
        // Supabase may steal a lock across tabs during auth refresh; this abort is expected.
        event.preventDefault()
        return
      }

      if (!isInvalidRefreshTokenError(event.reason)) return

      event.preventDefault()
      void recoverFromInvalidRefreshToken(supabase)
    }

    window.addEventListener("unhandledrejection", handleUnhandledRejection)
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection)
  }, [recoverFromInvalidRefreshToken, shouldSkipAuthBootstrap, supabase])

  async function fetchProfile(userId: string, client = getClient()): Promise<Profile | null> {
    let built: Profile | null = null
    try {
      const startedAt = typeof performance !== "undefined" ? performance.now() : null
      const { data, error } = await retryOnBenignLock(
        () => withTimeout(
          client
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle(),
          PROFILE_FETCH_TIMEOUT_MS,
          "Profile lookup timed out.",
        ),
        2,
      )

      const profileData = data as (typeof data & {
        avatar_updated_at?: string | null
        avatar_change_locked_until?: string | null
        avatar_change_count?: number | null
      }) | null

      if (error) {
        if (isInvalidRefreshTokenError(error)) {
          await recoverFromInvalidRefreshToken(client)
          return null
        }

        setProfile(null)
        return null
      }

      if (profileData) {
        recentProfileHydrationRef.current = { userId, at: Date.now() }
        built = {
          id: profileData.id,
          email: profileData.email,
          name: profileData.name,
          contactNumber: profileData.contact_number,
          role: profileData.role ?? "member",
          status: profileData.status ?? "active",
          gymId: profileData.gym_id ?? null,
          avatarUrl: profileData.avatar_url,
          avatarUpdatedAt: profileData.avatar_updated_at ?? null,
          avatarChangeLockedUntil: profileData.avatar_change_locked_until ?? null,
          avatarChangeCount: profileData.avatar_change_count ?? 0,
          qrCode: profileData.qr_code ?? "",
          createdAt: profileData.created_at ?? new Date().toISOString(),
        }
        writeProfileCache(userId, built)
        setProfile(built)
      } else {
        setProfile(null)
      }
      if (startedAt !== null) {
        const elapsed = performance.now() - startedAt
        if (elapsed > 1000) {
          console.info(`[auth] profile fetch ${Math.round(elapsed)}ms`)
        }
      }
    } catch {
      setProfile(null)
    } finally {
      setIsLoading(false)
    }
    return built
  }

  async function signIn(email: string, password: string) {
    const client = getClient()
    const { data, error } = await client.auth.signInWithPassword({ email, password })

    let fetchedProfile: Profile | null = null
    if (data.user) {
      setIsLoading(true)
      setUser(data.user)
      markPasswordSetupDone(data.user.id, true)
      markPasswordSetupPending(data.user.id, false)
      setNeedsPasswordSetup(false)
      fetchedProfile = await fetchProfile(data.user.id, client)
    }

    return { error: error?.message ?? null, user: data.user ?? null, profile: fetchedProfile }
  }

  async function signUp(
    email: string,
    password: string,
    name: string,
    role: "member" | "admin" = "member",
  ) {
    const client = getClient()
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { data: { name, role } },
    })

    return { error: error?.message ?? null }
  }

  async function signOut() {
    if (isSigningOut) return

    setIsSigningOut(true)
    const client = getClient()
    const storedLoginOriginPath = getStoredLoginOriginPath()
    const normalizedStored = normalizeLoginOrigin(storedLoginOriginPath)

    const gymLoginPath = profile?.gymId
      ? await getMemberSignOutRedirectPath(client, profile?.gymId)
      : null
    const targetLoginPath = resolveSignOutTargetPath({
      storedLoginOriginPath: normalizedStored,
      gymLoginPath,
    })
    try {
      const { error } = await withTimeout(
        client.auth.signOut(),
        SIGN_OUT_TIMEOUT_MS,
        "Sign-out request timed out.",
      )
      if (error) throw error
    } catch {
      // Fallback: clear local session state even if remote signout fails.
      await withTimeout(
        client.auth.signOut({ scope: "local" }),
        SIGN_OUT_TIMEOUT_MS,
        "Local sign-out timed out.",
      )
    } finally {
      setUser(null)
      setProfile(null)
      setNeedsPasswordSetup(false)
      setIsLoading(false)
      setIsSigningOut(false)
      try {
        window.localStorage.removeItem(LOGIN_ORIGIN_STORAGE_KEY)
      } catch {
        // Storage can be unavailable in private/locked-down browser contexts.
      }
      router.replace(targetLoginPath)
      window.setTimeout(() => {
        const currentPath = `${window.location.pathname}${window.location.search}`
        if (currentPath !== targetLoginPath) {
          window.location.assign(targetLoginPath)
        }
      }, NAVIGATION_FAILSAFE_MS)
    }
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id, getClient())
  }

  function completePasswordSetup(userId?: string | null) {
    const targetUserId = userId ?? user?.id ?? null
    if (!targetUserId) return

    markPasswordSetupDone(targetUserId, true)
    markPasswordSetupPending(targetUserId, false)

    if (user?.id === targetUserId) {
      setNeedsPasswordSetup(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, isLoading, isSigningOut, needsPasswordSetup, signIn, signUp, signOut, completePasswordSetup, refreshProfile }}>
      {children}
      {!shouldSkipAuthBootstrap && (
        <Suspense fallback={null}>
          <FirstLoginWatcher
            userId={user?.id ?? null}
            role={profile?.role ?? null}
            pathname={pathname}
            onNeedsPasswordSetup={setNeedsPasswordSetup}
          />
        </Suspense>
      )}
    </AuthContext.Provider>
  )
}

function FirstLoginWatcher({
  userId,
  role,
  pathname,
  onNeedsPasswordSetup,
}: {
  userId: string | null
  role: string | null
  pathname: string | null
  onNeedsPasswordSetup: (needs: boolean) => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!userId) return
    if (searchParams?.get("first_login") !== "1") return

    markPasswordSetupPending(userId, true)
    onNeedsPasswordSetup(computeNeedsPasswordSetup(userId))

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete("first_login")
    const nextQuery = nextParams.toString()
    const targetPath = pathname ?? resolvePostAuthPath(role)
    router.replace(nextQuery ? `${targetPath}?${nextQuery}` : targetPath)
  }, [onNeedsPasswordSetup, pathname, role, router, searchParams, userId])

  return null
}

// AuthProvider stays mounted, but defers search-param work off public routes.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthProviderInner>{children}</AuthProviderInner>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  return ctx ?? FALLBACK_AUTH_CONTEXT
}