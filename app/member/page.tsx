import { createServerSupabaseClient } from '@/lib/supabase-server'
import { MemberHomeClient } from '@/components/member/MemberHomeClient'
import type { MemberHomeData } from '@/components/member/MemberHomeClient'
import type { MemberStats } from '@/lib/types'
import { getMyAccess } from '@/lib/permissions-server'

export default async function MemberHomePage() {
  const supabase = await createServerSupabaseClient()

  const [{ data: statsData }, { data: { user } }, access] = await Promise.all([
    supabase.rpc('member_home_stats'),
    supabase.auth.getUser(),
    getMyAccess(),
  ])

  let memberName = 'Member'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.name) memberName = profile.name
  }

  const raw = statsData as any
  const stats: MemberStats = raw
    ? {
        totalVisits: raw.total_visits ?? 0,
        monthlyVisits: raw.monthly_visits ?? 0,
        currentStreak: raw.streak?.current_streak ?? 0,
        bestStreak: raw.streak?.best_streak ?? 0,
        avgSessionMinutes: raw.avg_session_minutes ?? 0,
        leaderboardRank: null,
      }
    : {
        totalVisits: 0,
        monthlyVisits: 0,
        currentStreak: 0,
        bestStreak: 0,
        avgSessionMinutes: 0,
        leaderboardRank: null,
      }

  const visitedDates: string[] = raw?.calendar_dates ?? []
  const peopleInGym = raw?.people_in_gym ?? 0

  const data: MemberHomeData = {
    memberName,
    stats,
    visitedDates,
    peopleInGym,
    features: access.features,
    subscriptionStatus: raw?.subscription_status,
    lapsedSummary: raw?.lapsed_summary ?? null,
  }

  return <MemberHomeClient data={data} />
}
