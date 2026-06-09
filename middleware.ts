import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { isValidLoginOrigin } from '@/lib/login-origin'

const LOGIN_ORIGIN_COOKIE_KEY = "stren.auth.loginOriginPath"
const GYM_LOGIN_PATH_REGEX = /^\/gym\/[^/]+\/login$/

function addSecurityHeaders(response: NextResponse, pathname: string): NextResponse {
  // In App Router client-side navigations, document-level policies may persist from
  // the initial page load. Keep camera available to same-origin so /kiosk can start
  // without requiring a hard refresh after navigating from /admin or /landing.
  const cameraPolicy = 'camera=(self)'

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    `${cameraPolicy}, microphone=(), geolocation=()`,
  )
  return response
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

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  const authCookies = request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))

  authCookies.forEach((cookie) => {
    response.cookies.set(cookie.name, "", {
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    })
  })
}

function getStoredLoginOriginPath(request: NextRequest): string | null {
  const candidate = request.cookies.get(LOGIN_ORIGIN_COOKIE_KEY)?.value
  if (!candidate) return null

  return isValidLoginOrigin(candidate) ? candidate : null
}

function resolveLoginPath(request: NextRequest, pathname: string): string {
  const storedOriginPath = getStoredLoginOriginPath(request)
  if (storedOriginPath) return storedOriginPath

  if (pathname.startsWith("/member")) return "/gym-select"

  return "/login"
}

function withLoginOriginCookie(response: NextResponse, pathWithSearch: string): NextResponse {
  // Normalize/decode any encoded input before storing so cookies never contain
  // percent-encoded query separators (e.g. "%3F"). This avoids mismatch between
  // stored origin and runtime routing behavior.
  let candidate = pathWithSearch
  try {
    candidate = decodeURIComponent(pathWithSearch)
  } catch {
    candidate = pathWithSearch
  }

  if (candidate === "/login") {
    response.cookies.set(LOGIN_ORIGIN_COOKIE_KEY, "/login", {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  }

  if (isValidLoginOrigin(candidate)) {
    response.cookies.set(LOGIN_ORIGIN_COOKIE_KEY, candidate, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    })
  }

  return response
}

export async function middleware(request: NextRequest) {
  const middlewareStart = performance.now()
  const timings: string[] = []
  const markTiming = (name: string, start: number) => {
    timings.push(`${name};dur=${(performance.now() - start).toFixed(1)}`)
  }

  let supabaseResponse = NextResponse.next({ request })

  const pathname = request.nextUrl.pathname
  const pathWithSearch = request.nextUrl.pathname + request.nextUrl.search

  const isApiRoute = pathname.startsWith("/api")
  const isGymOrKioskRoute = pathname.startsWith("/kiosk") || pathname.startsWith("/gym")
  const isMarketingRoute = pathname === "/" || pathname.startsWith("/landing")
  const isGymSelectRoute = pathname === "/gym-select" || pathname === "/qr-login"
  const isAuthCallbackRoute = pathname === "/auth/callback"
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/")

  const finalize = (response: NextResponse, includeLoginOrigin = true) => {
    const baseResponse = includeLoginOrigin ? withLoginOriginCookie(response, pathWithSearch) : response
    const securedResponse = addSecurityHeaders(baseResponse, pathname)
    const totalDuration = (performance.now() - middlewareStart).toFixed(1)
    const serverTiming = [...timings, `mw;dur=${totalDuration}`].join(', ')
    securedResponse.headers.set('Server-Timing', serverTiming)
    return securedResponse
  }

  // API routes should return API status codes (401/403/etc.), not login redirects.
  if (isApiRoute) {
    return finalize(supabaseResponse, false)
  }

  // Public pages should not pay Supabase auth/profile initialization cost.
  if (isGymOrKioskRoute || isMarketingRoute || isGymSelectRoute || isAuthCallbackRoute) {
    return finalize(supabaseResponse)
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  if (isAuthRoute) {
    let user = null
    try {
      const authStart = performance.now()
      const { data } = await supabase.auth.getUser()
      markTiming('auth', authStart)
      user = data.user
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        clearSupabaseAuthCookies(request, supabaseResponse)
        return finalize(supabaseResponse)
      }
      throw error
    }

    if (!user) return finalize(supabaseResponse)

    const profileStart = performance.now()
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, gym_id")
      .eq("id", user.id)
      .maybeSingle()
    markTiming('profile', profileStart)

    if (!profile || profile.status === "rejected") {
      return finalize(supabaseResponse)
    }

    const redirectTo = profile.role === "member" ? "/member" : "/admin"
    return finalize(NextResponse.redirect(new URL(redirectTo, request.url)))
  }

  let user = null
  try {
    const authStart = performance.now()
    const { data } = await supabase.auth.getUser()
    markTiming('auth', authStart)
    user = data.user
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      const url = request.nextUrl.clone()
      url.pathname = resolveLoginPath(request, pathname)
      const redirect = NextResponse.redirect(url)
      clearSupabaseAuthCookies(request, redirect)
      return finalize(redirect)
    }
    throw error
  }

  // All other routes require auth
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = resolveLoginPath(request, pathname)
    return finalize(NextResponse.redirect(url))
  }

  // Role-based access control
  // Use maybeSingle — avoids 406 if profile row doesn't exist yet
  const profileStart = performance.now()
  const { data: profile } = await  supabase
    .from("profiles")
    .select("role, status, gym_id")
    .eq("id", user.id)
    .maybeSingle()
  markTiming('profile', profileStart)

  // No profile yet (trigger delay) or rejected — send to login
  if (!profile || profile.status === "rejected") {
    return finalize(NextResponse.redirect(new URL(resolveLoginPath(request, pathname), request.url)))
  }

  // Admin routes — only admin/staff/owner
  if (pathname.startsWith("/admin")) {
    if (profile.role !== "admin" && profile.role !== "staff" && profile.role !== "owner") {
      return finalize(NextResponse.redirect(new URL("/member", request.url)))
    }
  }

  // Redirect stale /dashboard URLs to /admin
  if (pathname.startsWith("/dashboard")) {
    return finalize(NextResponse.redirect(new URL("/admin", request.url)))
  }

  if (profile.gym_id) supabaseResponse.headers.set("x-gym-id", profile.gym_id)
  supabaseResponse.headers.set("x-user-role", profile.role)

  return finalize(supabaseResponse)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)',
  ],
}