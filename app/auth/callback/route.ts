import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=no_user", requestUrl.origin))
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || profile.status === "rejected") {
    return NextResponse.redirect(new URL("/login?error=profile_unavailable", requestUrl.origin))
  }

  if (profile.status === "pending") {
    return NextResponse.redirect(new URL("/login?error=pending_approval", requestUrl.origin))
  }

  if (profile.role === "owner" || profile.role === "admin" || profile.role === "staff") {
    return NextResponse.redirect(new URL("/admin", requestUrl.origin))
  }

  const shouldPromptPasswordSetup = tokenType === "magiclink" || tokenType === "email" || tokenType === "invite" || tokenType === "signup"
  const memberTarget = shouldPromptPasswordSetup ? "/member?first_login=1" : "/member"
  return NextResponse.redirect(new URL(memberTarget, requestUrl.origin))
}
