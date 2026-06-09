import { createServerSupabaseClient } from '@/lib/supabase-server'
import { LeaderboardClient } from '@/components/member/LeaderboardClient'
import type { LeaderboardEntry } from '@/lib/types'

export default async function LeaderboardPage() {
  const supabase = await createServerSupabaseClient()

  const [{ data: rows }, { data: { user } }] = await Promise.all([
    (supabase as any).rpc('leaderboard_workouts', { p_limit: 50 }),
    supabase.auth.getUser(),
  ])

  type Row = { member_id: string; member_name: string; avatar_url: string | null; value: number }
  const initialEntries: LeaderboardEntry[] = ((rows ?? []) as Row[]).map((row, i) => ({
    memberId: row.member_id,
    memberName: row.member_name,
    avatarUrl: row.avatar_url,
    value: Number(row.value),
    rank: i + 1,
  }))

  return (
    <LeaderboardClient
      initialEntries={initialEntries}
      myMemberId={user?.id ?? null}
    />
  )
}
