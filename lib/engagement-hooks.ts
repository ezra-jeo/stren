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
  const { data: memberProfile } = await supabase
    .from("profiles")
    .select("gym_id")
    .eq("id", memberId)
    .maybeSingle()

  const gymId = memberProfile?.gym_id ?? null

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
  const { data: openSession } = await supabase
    .from("attendance")
    .select("*")
    .eq("member_id", memberId)
    .is("check_out", null)
    .order("check_in", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!openSession) {
    // ── CHECK IN ──
    const { data: attendance, error } = await supabase
      .from("attendance")
      .insert({ member_id: memberId, gym_id: gymId })
      .select()
      .maybeSingle()

    if (error || !attendance) {
      throw new Error("Failed to check in: " + error?.message)
    }

    // Run engagement hooks in parallel
    const streakPromise = updateStreak(memberId)
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
      attendanceId: attendance.id,
      streak: streakResult,
      durationMin: null,
    }
  } else {
    // ── CHECK OUT ──
    const now = new Date().toISOString()
    const { data: updated, error } = await supabase
      .from("attendance")
      .update({ check_out: now })
      .eq("id", openSession.id)
      .select()
      .maybeSingle()

    if (error || !updated) {
      throw new Error("Failed to check out: " + error?.message)
    }

    const checkInTime = new Date(openSession.check_in ?? "").getTime()
    const checkOutTime = new Date(now).getTime()
    const durationMin = Math.round((checkOutTime - checkInTime) / 60000)

    return {
      status: "checked_out",
      attendanceId: openSession.id,
      streak: null,
      durationMin,
    }
  }
}

async function postCheckInFeedItem(memberId: string, gymId: string | null) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", memberId)
    .maybeSingle()

  const { data: streak } = await supabase
    .from("streaks")
    .select("current_streak")
    .eq("member_id", memberId)
    .maybeSingle()

  const streakText =
    streak && (streak.current_streak ?? 0) > 1 ? ` 🔥 ${streak.current_streak}-day streak!` : ""

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
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", memberId)
    .maybeSingle()

  await supabase.from("feed_items").insert({
    member_id: memberId,
    gym_id: gymId,
    type: "streak_milestone",
    title: `${profile?.name ?? "Someone"} hit a ${streak}-day streak! 🔥`,
    description: `${streak} consecutive days at the gym`,
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
