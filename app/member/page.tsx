import { createServerSupabaseClient } from '@/lib/supabase-server'
import { MemberHomeClient } from '@/components/member/MemberHomeClient'
import type { MemberHomeData } from '@/components/member/MemberHomeClient'
import type { MemberStats } from '@/lib/types'

export default async function MemberHomePage() {
  const supabase = await createServerSupabaseClient()

  const [
    { data: statsData },
    { data: checkedInData },
    { data: { user } },
  ] = await Promise.all([
    supabase.rpc('member_home_stats'),
    supabase.rpc('kiosk_get_checked_in'),
    supabase.auth.getUser(),
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
  const peopleInGym = (checkedInData as unknown[])?.length ?? 0

  const data: MemberHomeData = { memberName, stats, visitedDates, peopleInGym }

  return <MemberHomeClient data={data} />
}
