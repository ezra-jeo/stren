/**
 * app/api/admin/members/onboard/route.ts
 *
 * Changes from previous version:
 *  1. Fetches gym name so the email template can greet with the real gym name.
 *  2. Calls sendOnboardingEmail() after generating the magic link.
 *  3. Sets sent_via to 'email' on success, 'preview' on email failure.
 *  4. Email failure is non-fatal: member + membership are still created and
 *     the API returns 207 with an emailError field so the UI can show a warning.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { sendOnboardingEmail, type SendResult } from "@/lib/email"
import { rateLimit } from "@/lib/rate-limit"
import { apiRequirePermission, getMyAccess } from "@/lib/permissions-server"
import type { SupabaseClient } from "@supabase/supabase-js"

type ManagerRole = "owner" | "admin" | "staff"
const MANAGER_ROLES: ManagerRole[] = ["owner", "admin", "staff"]

const onboardSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  avatarUrl: z.string().trim().url(),
  planId: z.string().uuid(),
  paymentMethod: z.enum(["cash", "gcash"]),
  amountPaid: z.number().nonnegative().optional(),
  startDate: z.string().date().optional(),
})

function computeEndDate(startDate: string, durationDays: number): string {
  const dt = new Date(`${startDate}T00:00:00.000Z`)
  dt.setUTCDate(dt.getUTCDate() + durationDays)
  return dt.toISOString().slice(0, 10)
}

function getSiteUrl(request: Request): string {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envUrl) return envUrl.replace(/\/$/, "")

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host")
  const proto = request.headers.get("x-forwarded-proto") || "http"
  if (host) return `${proto}://${host}`.replace(/\/$/, "")

  return "http://localhost:3000"
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(fallback)
      })
  })
}

async function getCurrentUserWithRole() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { supabase, user: null, profile: null as null }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, gym_id")
    .eq("id", user.id)
    .maybeSingle()

  return { supabase, user, profile }
}

export async function POST(request: Request) {
  const { supabase, user, profile } = await getCurrentUserWithRole()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  if (
    !profile?.role ||
    !MANAGER_ROLES.includes(profile.role as ManagerRole) ||
    !profile.gym_id
  ) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 })
  }

  const access = await getMyAccess(supabase as unknown as SupabaseClient)
  const permissionError = await apiRequirePermission('members:manage', access)
  if (permissionError) return permissionError

  // Rate-limit: max 20 onboarding requests per gym per minute to prevent
  // accidental bulk-invite abuse or email spam.
  const rl = rateLimit(`onboard:${profile.gym_id}`, 20, 60_000)
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many onboarding requests. Please wait a moment and try again." },
      { status: 429 },
    )
  }

  let body: z.infer<typeof onboardSchema>
  try {
    const parsed = onboardSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", issues: parsed.error.issues },
        { status: 400 },
      )
    }
    body = parsed.data
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // Fetch plan and gym name in parallel.
  const [planResult, gymResult] = await Promise.all([
    supabase
      .from("membership_plans")
      .select("id, duration_days, price, is_active")
      .eq("id", body.planId)
      .eq("gym_id", profile.gym_id)
      .maybeSingle(),
    supabase
      .from("gyms")
      .select("name")
      .eq("id", profile.gym_id)
      .maybeSingle(),
  ])

  if (planResult.error || !planResult.data || !planResult.data.is_active) {
    return NextResponse.json(
      { error: "Membership plan is invalid or inactive." },
      { status: 400 },
    )
  }

  const plan = planResult.data
  // Fall back gracefully if gym name can't be fetched.
  const gymName = gymResult.data?.name ?? "Your Gym"

  // -------------------------------------------------------------------------
  // Resolve member identity — onboarding requires a new unique email.
  // Existing members should use the renew/status flows instead.
  // -------------------------------------------------------------------------

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, gym_id, name")
    .eq("email", body.email)
    .maybeSingle()

  if (existingProfile) {
    // Already belongs to a different gym — hard block
    if (existingProfile.gym_id && existingProfile.gym_id !== profile.gym_id) {
      return NextResponse.json(
        { error: "This email is already assigned to another gym." },
        { status: 409 },
      )
    }

    // Already a member of THIS gym — tell staff to use Renew
    if (existingProfile.gym_id === profile.gym_id) {
      return NextResponse.json(
        { error: `${existingProfile.name ?? "This person"} is already a member here. Use Renew instead.` },
        { status: 409 },
      )
    }
  }
  const { data: createdAuth, error: createAuthError } =
    await admin.auth.admin.createUser({
      email: body.email,
      email_confirm: true,
      user_metadata: {
        name: body.name,
        role: "member",
      },
    })

  if (createAuthError || !createdAuth.user) {
    return NextResponse.json(
      {
        error:
          createAuthError?.message ?? "Failed to create auth user.",
      },
      { status: 400 },
    )
  }

  const memberId: string = createdAuth.user.id

  // -------------------------------------------------------------------------
  // Upsert profile
  // -------------------------------------------------------------------------

  const qrPayload = `stren://checkin/${profile.gym_id}/${memberId}`

  const { error: profileUpsertError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: memberId,
        email: body.email,
        name: body.name,
        role: "member",
        status: "active",
        gym_id: profile.gym_id,
        avatar_url: body.avatarUrl,
        qr_code: qrPayload,
      },
      { onConflict: "id" },
    )

  if (profileUpsertError) {
    return NextResponse.json(
      {
        error: `Failed to upsert profile: ${profileUpsertError.message}`,
      },
      { status: 400 },
    )
  }

  // -------------------------------------------------------------------------
  // Expire old memberships and create new one
  // -------------------------------------------------------------------------

  const startDate = body.startDate ?? new Date().toISOString().slice(0, 10)
  const endDate = computeEndDate(startDate, plan.duration_days)

  const { error: expireError } = await supabase
    .from("memberships")
    .update({ status: "expired" })
    .eq("member_id", memberId)
    .eq("gym_id", profile.gym_id)
    .eq("status", "active")

  if (expireError) {
    return NextResponse.json(
      {
        error: `Failed to expire previous active memberships: ${expireError.message}`,
      },
      { status: 400 },
    )
  }

  const { data: createdMembership, error: membershipError } = await supabase
    .from("memberships")
    .insert({
      member_id: memberId,
      plan_id: plan.id,
      gym_id: profile.gym_id,
      start_date: startDate,
      end_date: endDate,
      status: "active",
      payment_method: body.paymentMethod,
      amount_paid: body.amountPaid ?? plan.price,
    })
    .select("id")
    .maybeSingle()

  if (membershipError || !createdMembership) {
    return NextResponse.json(
      {
        error:
          membershipError?.message ?? "Failed to create membership.",
      },
      { status: 400 },
    )
  }

  // -------------------------------------------------------------------------
  // Generate magic link
  // -------------------------------------------------------------------------

  const siteUrl = getSiteUrl(request)
  const redirectTo = `${siteUrl}/auth/callback`

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: body.email,
      options: {
        redirectTo,
        data: { role: "member" },
      },
    })

  if (linkError || !linkData.properties?.action_link) {
    // Member and membership exist — return partial success.
    await admin.from("member_onboarding_events").insert({
      member_id: memberId,
      gym_id: profile.gym_id,
      created_by: user.id,
      email: body.email,
      magic_link_url: null,
      qr_code: qrPayload,
      sent_via: "preview",
    })

    return NextResponse.json(
      {
        memberId,
        membershipId: createdMembership.id,
        qrCode: qrPayload,
        magicLink: null,
        redirectTo,
        emailError:
          linkError?.message ??
          "Magic link generation failed; member was created successfully.",
      },
      { status: 207 },
    )
  }

  const magicLink = linkData.properties.action_link

  // -------------------------------------------------------------------------
  // Send email
  // -------------------------------------------------------------------------

  const emailTimeoutResult: SendResult = {
    ok: false,
    error: "Email send timed out. Share the magic link manually.",
  }

  const emailResult = await withTimeout(
    sendOnboardingEmail({
      to: body.email,
      memberName: body.name,
      gymName,
      qrPayload,
      magicLink,
    }),
    15000,
    emailTimeoutResult,
  )

  // Log the onboarding event regardless of email outcome.
  await admin.from("member_onboarding_events").insert({
    member_id: memberId,
    gym_id: profile.gym_id,
    created_by: user.id,
    email: body.email,
    magic_link_url: magicLink,
    qr_code: qrPayload,
    // Record whether the email actually went out.
    sent_via: emailResult.ok ? "email" : "preview",
  })

  if (!emailResult.ok) {
    // Non-fatal: member is created, but staff should know to share the link manually.
    return NextResponse.json(
      {
        memberId,
        membershipId: createdMembership.id,
        qrCode: qrPayload,
        magicLink,
        redirectTo,
        emailError: `Member created but email failed to send: ${emailResult.error}. Share the magic link above manually.`,
      },
      { status: 207 },
    )
  }

  // -------------------------------------------------------------------------
  // Full success
  // -------------------------------------------------------------------------

  return NextResponse.json({
    memberId,
    membershipId: createdMembership.id,
    qrCode: qrPayload,
    magicLink,
    redirectTo,
    emailSent: true,
  })
}
