import { createClient } from "./supabase"
import { updateStreak } from "./streaks"
import { isFeatureEnabled, type FeatureFlags } from "./features"

const supabase = createClient()

export interface CheckInResult {
  status: "checked_in" | "checked_out"
  attendanceId: string
  streak: {
    currentStreak: number
    bestStreak: number
    isNewBest: boolean
  } | null
  durationMin: number | null
}

/**
 * Handle a QR scan / check-in toggle.
 * If no open session → check in + run engagement hooks.
 * If open session → check out.
 */
export async function handleScan(memberId: string): Promise<CheckInResult> {
  // Fetch member's gym_id — needed for RLS-compliant inserts
  const { data: access } = await supabase.rpc("get_my_access")
  const gymId = access && typeof access === "object" && !Array.isArray(access)
    ? ((access as { gym_id?: string | null }).gym_id ?? null)
    : null

  let memberFeedEnabled = true
  if (gymId) {
    try {
      const { data: featureSettings } = await supabase
        .from("gym_feature_settings")
        .select("flags")
        .eq("gym_id", gymId)
        .maybeSingle()
      memberFeedEnabled = isFeatureEnabled(
        featureSettings?.flags as FeatureFlags | null | undefined,
        "member_feed",
      )
    } catch {
      // Missing settings/table keeps the catalog default (on).
      memberFeedEnabled = true
    }
  }

  // Check for an open session (checked in but not out)
  if (!gymId) throw new Error("No active gym is available for check-in")
  const { data: toggle, error: toggleError } = await supabase.rpc("kiosk_checkin_by_member", {
    p_member_id: memberId,
    p_gym_id: gymId,
  })
  const toggleResult = toggle as {
    action?: string
    attendance_id?: string
    duration_min?: number | null
    message?: string
  } | null
  if (toggleError || !toggleResult?.attendance_id || !toggleResult.action) {
    throw new Error(toggleResult?.message ?? toggleError?.message ?? "Failed to record attendance")
  }

  if (toggleResult.action === "checked_in") {
    // ── CHECK IN ──
    // Run engagement hooks in parallel
    const streakPromise = updateStreak(memberId, gymId)
    const feedPromise = memberFeedEnabled
      ? ignoreFeedFailure(postCheckInFeedItem(memberId, gymId))
      : Promise.resolve()
    const [streakResult] = await Promise.all([streakPromise, feedPromise])

    // Post streak milestone feed items
    if (streakResult.currentStreak > 0 && streakResult.currentStreak % 7 === 0) {
      if (memberFeedEnabled) {
        await ignoreFeedFailure(
          postStreakMilestoneFeedItem(memberId, gymId, streakResult.currentStreak),
        )
      }
    }

    return {
      status: "checked_in",
      attendanceId: toggleResult.attendance_id,
      streak: streakResult,
      durationMin: null,
    }
  } else {
    // ── CHECK OUT ──
    return {
      status: "checked_out",
      attendanceId: toggleResult.attendance_id,
      streak: null,
      durationMin: toggleResult.duration_min ?? null,
    }
  }
}

async function postCheckInFeedItem(memberId: string, gymId: string | null) {
  if (!gymId) return
  const { data: directory } = await supabase.rpc("get_gym_directory")
  const profile = (directory as { user_id?: string; name?: string }[] | null)
    ?.find((entry) => entry.user_id === memberId)

  const { data: streak } = await supabase
    .from("streaks")
    .select("current_streak")
    .eq("member_id", memberId)
    .eq("gym_id", gymId)
    .maybeSingle()

  const streakText =
    streak && (streak.current_streak ?? 0) > 1 ? ` 🔥 ${streak.current_streak}-week streak!` : ""

  const hour = new Date().getHours()
  const timeOfDay =
    hour < 7
      ? "🌅 Early morning"
      : hour < 12
      ? "☀️ Morning"
      : hour < 17
      ? "🌤️ Afternoon"
      : "🌙 Evening"

  await supabase.from("feed_items").insert({
    member_id: memberId,
    gym_id: gymId,
    type: "check_in",
    title: `${profile?.name ?? "Someone"} checked in`,
    description: `${timeOfDay} workout${streakText}`,
  })
}

async function postStreakMilestoneFeedItem(
  memberId: string,
  gymId: string | null,
  streak: number
) {
  const { data: directory } = await supabase.rpc("get_gym_directory")
  const profile = (directory as { user_id?: string; name?: string }[] | null)
    ?.find((entry) => entry.user_id === memberId)

  await supabase.from("feed_items").insert({
    member_id: memberId,
    gym_id: gymId,
    type: "streak_milestone",
    title: `${profile?.name ?? "Someone"} hit a ${streak}-week streak! 🔥`,
    description: `${streak} consecutive weeks with a check-in`,
    metadata: { streak_count: streak },
  })
}

async function ignoreFeedFailure(task: Promise<unknown>): Promise<void> {
  try {
    await task
  } catch {
    // Engagement is best-effort; attendance is the source-of-truth action.
  }
}
