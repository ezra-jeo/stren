import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { resolvePostAuthDestinationForSession } from "@/lib/post-auth-session"
import {
  PASSWORD_RECOVERY_COOKIE,
  createPasswordRecoveryProof,
  passwordRecoveryCookieOptions,
} from "@/lib/password-recovery"
import { sanitizePostAuthReturn } from "@/lib/auth-return"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const tokenType = requestUrl.searchParams.get("type")?.toLowerCase() ?? null
  const next = requestUrl.searchParams.get("next")
  const gymCode = requestUrl.searchParams.get("gym")
  const googleFlow = requestUrl.searchParams.get("flow") === "google"
  const providerError = requestUrl.searchParams.get("error")

  const supabase = await createServerSupabaseClient()
  let authError: string | null = null
  let authenticatedUserId: string | null = null

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) authError = error.message
    else authenticatedUserId = data.user?.id ?? null
  } else if (tokenHash && tokenType) {
    const otpType = tokenType as "magiclink" | "recovery" | "invite" | "email" | "signup" | "email_change"
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    })
    if (error) authError = error.message
    else authenticatedUserId = data.user?.id ?? null
  } else if (googleFlow) {
    authError = providerError === "access_denied" ? "oauth_cancelled" : "oauth_failed"
  } else {
    authError = "missing_code"
  }

  if (authError) {
    if (next === "/reset-password" || tokenType === "recovery") {
      return NextResponse.redirect(new URL('/reset-password?error=invalid_or_expired', requestUrl.origin))
    }
    return NextResponse.redirect(new URL(`/auth?mode=signin&error=${encodeURIComponent(authError)}`, requestUrl.origin))
  }

  // Password reset: the provider exchange establishes the recovery session. A
  // short-lived signed HTTP-only proof then distinguishes it from an ordinary
  // signed-in session before the server accepts a new password.
  if (next === "/reset-password" || tokenType === "recovery") {
    if (!authenticatedUserId) {
      return NextResponse.redirect(new URL('/reset-password?error=invalid_or_expired', requestUrl.origin))
    }
    let recoveryProof: string
    try {
      recoveryProof = createPasswordRecoveryProof(authenticatedUserId)
    } catch {
      return NextResponse.redirect(new URL('/reset-password?error=recovery_not_configured', requestUrl.origin))
    }
    const resetParams = new URLSearchParams({ reset: "1" })
    if (gymCode) resetParams.set("gym", gymCode)
    const response = NextResponse.redirect(new URL(`/reset-password?${resetParams.toString()}`, requestUrl.origin))
    response.cookies.set(PASSWORD_RECOVERY_COOKIE, recoveryProof, passwordRecoveryCookieOptions)
    return response
  }

  let destination: string
  try {
    if (!authenticatedUserId) throw new Error('The verified account is missing.');
    const boundedReturn = sanitizePostAuthReturn(next);
    if (boundedReturn) {
      return NextResponse.redirect(new URL(boundedReturn, requestUrl.origin));
    }
    destination = await resolvePostAuthDestinationForSession(supabase, authenticatedUserId, gymCode ?? undefined)
  } catch {
    return NextResponse.redirect(new URL('/gyms?account_error=access', requestUrl.origin))
  }
  const shouldPromptPasswordSetup = tokenType === "magiclink" || tokenType === "email" || tokenType === "invite" || tokenType === "signup"
  const target = shouldPromptPasswordSetup && destination.startsWith('/member')
    ? `${destination}${destination.includes('?') ? '&' : '?'}first_login=1`
    : destination
  return NextResponse.redirect(new URL(target, requestUrl.origin))
}
