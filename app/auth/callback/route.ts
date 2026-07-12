import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { resolvePostAuthDestination } from "@/lib/auth-actions"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const tokenType = requestUrl.searchParams.get("type")?.toLowerCase() ?? null
  const next = requestUrl.searchParams.get("next")
  const gymCode = requestUrl.searchParams.get("gym")

  const supabase = await createServerSupabaseClient()
  let authError: string | null = null

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) authError = error.message
  } else if (tokenHash && tokenType) {
    const otpType = tokenType as "magiclink" | "recovery" | "invite" | "email" | "signup" | "email_change"
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    })
    if (error) authError = error.message
  } else {
    authError = "missing_code"
  }

  if (authError) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(authError)}`, requestUrl.origin))
  }

  // Password reset: forward to /reset-password so the user can set a new password.
  // The session is now established (code was exchanged above), so the reset page
  // will find a valid user via getUser() without needing to re-exchange anything.
  if (next === "/reset-password") {
    const resetParams = new URLSearchParams({ reset: "1" })
    if (gymCode) resetParams.set("gym", gymCode)
    return NextResponse.redirect(new URL(`/reset-password?${resetParams.toString()}`, requestUrl.origin))
  }

  const destination = await resolvePostAuthDestination(gymCode ?? undefined)
  const shouldPromptPasswordSetup = tokenType === "magiclink" || tokenType === "email" || tokenType === "invite" || tokenType === "signup"
  const target = shouldPromptPasswordSetup && destination.startsWith('/member')
    ? `${destination}${destination.includes('?') ? '&' : '?'}first_login=1`
    : destination
  return NextResponse.redirect(new URL(target, requestUrl.origin))
}
