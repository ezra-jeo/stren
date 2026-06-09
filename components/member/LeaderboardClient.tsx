'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { LeaderboardEntry } from '@/lib/types'
import { Trophy, Medal, Dumbbell, CalendarCheck } from 'lucide-react'
import { PageSkeleton } from '@/components/ui/loading-screen'

type LeaderboardCategory = 'workouts' | 'longest_member' | 'week_streak'

const categoryLabels: Record<LeaderboardCategory, { label: string; icon: React.ReactNode; unit: string; subtitle: string }> = {
  workouts: { label: 'Most Workouts', icon: <Dumbbell size={18} />, unit: 'check-in', subtitle: 'All-time total check-ins' },
  longest_member: { label: 'Longest Member', icon: <Medal size={18} />, unit: 'month', subtitle: 'Months as a gym member' },
  week_streak: { label: 'Active Weeks', icon: <CalendarCheck size={18} />, unit: 'week', subtitle: 'Consecutive weeks with a visit' },
}

export interface LeaderboardClientProps {
  initialEntries: LeaderboardEntry[]
  myMemberId: string | null
}

export function LeaderboardClient({ initialEntries, myMemberId }: LeaderboardClientProps) {
  const supabase = useMemo(() => createClient(), [])
  const cacheRef = useRef<Partial<Record<LeaderboardCategory, LeaderboardEntry[]>>>({ workouts: initialEntries })
  const [category, setCategory] = useState<LeaderboardCategory>('workouts')
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries)
  const [isLoading, setIsLoading] = useState(false)

  const myRank = entries.find((e) => e.memberId === myMemberId)?.rank ?? null

  useEffect(() => {
    if (category === 'workouts') return
    loadCategory(category)
  }, [category])

  async function loadCategory(cat: LeaderboardCategory) {
    const cached = cacheRef.current[cat]
    if (cached) {
      setEntries(cached)
      return
    }

    setIsLoading(true)

    type Row = { member_id: string; member_name: string; avatar_url: string | null; value: number }
    let rows: Row[] = []

    if (cat === 'longest_member') {
      const { data } = await (supabase as any).rpc('leaderboard_longest_member', { p_limit: 50 })
      rows = (data ?? []) as Row[]
    } else {
      const { data } = await (supabase as any).rpc('leaderboard_week_streak', { p_limit: 50 })
      rows = (data ?? []) as Row[]
    }

    const leaderboard: LeaderboardEntry[] = rows.map((row, i) => ({
      memberId: row.member_id,
      memberName: row.member_name,
      avatarUrl: row.avatar_url,
      value: Number(row.value),
      rank: i + 1,
    }))

    cacheRef.current[cat] = leaderboard
    setEntries(leaderboard)
    setIsLoading(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
        >
          Leaderboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {categoryLabels[category].subtitle}
        </p>
      </div>

      {myRank !== null && (
        <div
          className="rounded-xl p-4 border"
          style={{
            backgroundColor: 'var(--color-primary-glow)',
            borderColor: 'var(--color-primary)',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--color-primary-dark)' }}>
            Your rank: <span className="text-xl font-bold">#{myRank}</span> in {categoryLabels[category].label}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {(Object.keys(categoryLabels) as LeaderboardCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all"
            style={{
              backgroundColor: category === cat ? 'var(--color-primary)' : 'var(--color-white)',
              color: category === cat ? 'var(--color-white)' : 'var(--color-text-secondary)',
              border: `1px solid ${category === cat ? 'var(--color-primary)' : 'var(--color-surface)'}`,
            }}
          >
            {categoryLabels[cat].icon}
            {categoryLabels[cat].label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSkeleton rows={5} height={64} />
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <Trophy size={48} className="mx-auto mb-4" style={{ color: 'var(--color-text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>No entries yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Check in to appear on the leaderboard!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.memberId}
              className="flex items-center gap-3 p-3 rounded-xl border transition-all"
              style={{
                backgroundColor: entry.memberId === myMemberId ? 'var(--color-primary-glow)' : 'var(--color-white)',
                borderColor: entry.memberId === myMemberId ? 'var(--color-primary)' : 'var(--color-surface)',
              }}
            >
              <div className="w-8 text-center">
                {entry.rank <= 3 ? (
                  <span className="text-xl">{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}</span>
                ) : (
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    {entry.rank}
                  </span>
                )}
              </div>

              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{
                  backgroundColor: 'var(--color-primary-glow)',
                  color: 'var(--color-primary)',
                }}
              >
                {entry.memberName.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {entry.memberName}
                  {entry.memberId === myMemberId && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>
                      You
                    </span>
                  )}
                </p>
              </div>

              <div className="text-right">
                <span className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {entry.value}
                </span>
                <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>
                  {categoryLabels[category].unit + (entry.value > 1 ? 's' : '')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
