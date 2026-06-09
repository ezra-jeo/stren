'use client'

import { useState, useMemo } from 'react'
import { Flame, TrendingUp, Clock, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import Link from 'next/link'
import type { MemberStats } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type CalendarView = 'weekly' | 'monthly' | 'yearly'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// ─── Attendance Calendar ──────────────────────────────────────────────────────

function AttendanceCalendar({ visitedDates }: { visitedDates: Set<string> }) {
  const today = new Date()
  const todayStr = toDateStr(today)

  const [view, setView] = useState<CalendarView>('monthly')
  const [anchor, setAnchor] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1))

  function canGoForward(): boolean {
    if (view === 'monthly') {
      return !(anchor.getFullYear() === today.getFullYear() && anchor.getMonth() === today.getMonth())
    }
    if (view === 'weekly') {
      const weekStart = startOfWeek(today)
      return anchor < weekStart
    }
    return anchor.getFullYear() < today.getFullYear()
  }

  function navigate(dir: -1 | 1) {
    if (view === 'monthly') {
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1))
    } else if (view === 'weekly') {
      setAnchor(addDays(anchor, dir * 7))
    } else {
      setAnchor(new Date(anchor.getFullYear() + dir, 0, 1))
    }
  }

  function switchView(v: CalendarView) {
    setView(v)
    if (v === 'monthly') setAnchor(new Date(today.getFullYear(), today.getMonth(), 1))
    else if (v === 'weekly') setAnchor(startOfWeek(today))
    else setAnchor(new Date(today.getFullYear(), 0, 1))
  }

  const rangeLabel = useMemo(() => {
    if (view === 'monthly') {
      return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    if (view === 'weekly') {
      const end = addDays(anchor, 6)
      const startFmt = anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const endFmt = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      return `${startFmt} – ${endFmt}`
    }
    return String(anchor.getFullYear())
  }, [view, anchor])

  const visitCount = useMemo(() => {
    if (view === 'monthly') {
      const y = anchor.getFullYear()
      const m = String(anchor.getMonth() + 1).padStart(2, '0')
      return Array.from(visitedDates).filter((d) => d.startsWith(`${y}-${m}`)).length
    }
    if (view === 'weekly') {
      let count = 0
      for (let i = 0; i < 7; i++) {
        if (visitedDates.has(toDateStr(addDays(anchor, i)))) count++
      }
      return count
    }
    const yearPrefix = `${anchor.getFullYear()}-`
    return Array.from(visitedDates).filter((d) => d.startsWith(yearPrefix)).length
  }, [view, anchor, visitedDates])

  function DayDot({ dateStr, size = 'md' }: { dateStr: string; size?: 'sm' | 'md' }) {
    const visited = visitedDates.has(dateStr)
    const isToday = dateStr === todayStr
    const isFuture = dateStr > todayStr
    const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'

    return (
      <div
        className={`${dim} flex items-center justify-center rounded-full font-medium transition-all`}
        style={{
          backgroundColor: visited ? 'var(--color-primary)' : isToday ? 'var(--color-primary-glow)' : 'transparent',
          color: visited ? 'white' : isToday ? 'var(--color-primary)' : isFuture ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
          opacity: isFuture ? 0.35 : 1,
          fontWeight: isToday ? 700 : undefined,
          border: isToday && !visited ? '1.5px solid var(--color-primary)' : 'none',
        }}
      >
        {new Date(dateStr + 'T00:00:00').getDate()}
      </div>
    )
  }

  function MonthlyGrid() {
    const year = anchor.getFullYear()
    const month = anchor.getMonth()
    const firstDow = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (string | null)[] = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) =>
        `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
      ),
    ]

    const weeks: (string | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7).concat(Array(7).fill(null)).slice(0, 7))
    }

    return (
      <>
        <div className="grid grid-cols-7 mb-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="text-center text-xs font-medium py-1" style={{ color: 'var(--color-text-muted)' }}>
              {d}
            </div>
          ))}
        </div>
        <div className="space-y-0.5">
          {weeks.map((week, weekIdx) => {
            const firstDate = week.find((d) => d !== null)
            return (
              <button
                key={weekIdx}
                onClick={() => {
                  if (!firstDate) return
                  setView('weekly')
                  setAnchor(startOfWeek(new Date(firstDate + 'T00:00:00')))
                }}
                className="grid grid-cols-7 w-full rounded-md transition-colors hover:bg-primary/5"
                title="View this week"
              >
                {week.map((dateStr, i) =>
                  dateStr === null ? (
                    <div key={`e-${weekIdx}-${i}`} className="aspect-square" />
                  ) : (
                    <div key={dateStr} className="flex items-center justify-center aspect-square">
                      <DayDot dateStr={dateStr} />
                    </div>
                  )
                )}
              </button>
            )
          })}
        </div>
      </>
    )
  }

  function WeeklyRow() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(anchor, i))
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-7">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-xs font-medium py-1" style={{ color: 'var(--color-text-muted)' }}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const ds = toDateStr(day)
            return (
              <div key={ds} className="flex flex-col items-center gap-1.5">
                <DayDot dateStr={ds} />
                {visitedDates.has(ds) && (
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function YearlyGrid() {
    const year = anchor.getFullYear()
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {monthNames.map((label, month) => {
          const firstDow = new Date(year, month, 1).getDay()
          const daysInMonth = new Date(year, month + 1, 0).getDate()
          const cells: (string | null)[] = [
            ...Array(firstDow).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) =>
              `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
            ),
          ]

          return (
            <button
              key={label}
              onClick={() => {
                setView('monthly')
                setAnchor(new Date(year, month, 1))
              }}
              className="rounded-lg border p-2 text-left w-full transition-all hover:border-primary"
              style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-white)' }}
            >
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((dateStr, idx) => {
                  if (dateStr === null) {
                    return <div key={`empty-${label}-${idx}`} className="w-2.5 h-2.5" />
                  }
                  const visited = visitedDates.has(dateStr)
                  const isToday = dateStr === todayStr
                  const isFuture = dateStr > todayStr

                  return (
                    <div
                      key={dateStr}
                      className="w-2.5 h-2.5 rounded-[3px]"
                      style={{
                        backgroundColor: visited ? 'var(--color-primary)' : 'var(--color-surface)',
                        border: isToday ? '1px solid var(--color-primary)' : '1px solid transparent',
                        opacity: isFuture && !isToday ? 0.35 : 1,
                      }}
                      title={new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    />
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="flex items-center gap-1 p-0.5 rounded-lg"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          {(['weekly', 'monthly', 'yearly'] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-all capitalize"
              style={{
                backgroundColor: view === v ? 'var(--color-white)' : 'transparent',
                color: view === v ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <span
          className="text-xs font-semibold px-2 py-1 rounded-full"
          style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
        >
          {visitCount} visit{visitCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded-md transition-colors hover:bg-gray-100"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Previous"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-center flex-1 px-2" style={{ color: 'var(--color-text-primary)' }}>
          {rangeLabel}
        </span>
        <button
          onClick={() => navigate(1)}
          disabled={!canGoForward()}
          className="p-1 rounded-md transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Next"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {view === 'monthly' && <MonthlyGrid />}
      {view === 'weekly' && <WeeklyRow />}
      {view === 'yearly' && <YearlyGrid />}

      <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid var(--color-surface)' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Visited</span>
        </div>
        {view === 'yearly' && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: 'var(--color-surface)' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No visit</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ border: '1.5px solid var(--color-primary)', backgroundColor: 'var(--color-primary-glow)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Today</span>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: number | string; unit: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
      <div className="flex items-center gap-1.5 mb-2" style={{ color: 'var(--color-primary)' }}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
        {unit && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{unit}</span>}
      </div>
    </div>
  )
}

function QuickLink({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-sm"
      style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
    >
      <div>
        <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
      </div>
      <ChevronRight size={20} style={{ color: 'var(--color-text-muted)' }} />
    </Link>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export interface MemberHomeData {
  memberName: string
  stats: MemberStats
  visitedDates: string[]
  peopleInGym: number
}

export function MemberHomeClient({ data }: { data: MemberHomeData }) {
  const { memberName, stats, visitedDates: visitedDatesArr, peopleInGym } = data
  const visitedDates = useMemo(() => new Set(visitedDatesArr), [visitedDatesArr])
  const greeting = getGreeting()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
          {greeting}, {memberName.split(' ')[0]}!
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Here&apos;s your gym activity overview
        </p>
      </div>

      {stats.currentStreak > 0 && (
        <div
          className="relative overflow-hidden rounded-xl p-5"
          style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)', color: 'var(--color-white)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Flame size={24} />
                <span className="text-3xl font-bold">{stats.currentStreak}</span>
                <span className="text-lg opacity-90">day streak!</span>
              </div>
              <p className="text-sm opacity-80">Personal best: {stats.bestStreak} days</p>
            </div>
            <div className="text-6xl opacity-20">🔥</div>
          </div>
        </div>
      )}

      {stats.currentStreak === 0 && (
        <div className="rounded-xl p-5 border" style={{ backgroundColor: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)' }}>
          <div className="flex items-center gap-3">
            <Flame size={24} style={{ color: 'var(--color-warning)' }} />
            <div>
              <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>No active streak</p>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Check in today to start a new streak!</p>
            </div>
          </div>
        </div>
      )}

      <AttendanceCalendar visitedDates={visitedDates} />

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<TrendingUp size={18} />} label="All Time"    value={stats.totalVisits}        unit="visits" />
        <StatCard icon={<Clock size={18} />}       label="Avg Session" value={stats.avgSessionMinutes} unit="min"    />
        <StatCard icon={<Flame size={18} />}       label="Best Streak" value={stats.bestStreak}         unit="days"   />
      </div>

      <div
        className="rounded-xl p-4 border"
        style={{
          backgroundColor: peopleInGym > 0 ? 'var(--color-success-bg)' : 'var(--color-white)',
          borderColor: peopleInGym > 0 ? 'var(--color-success)' : 'var(--color-surface)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: peopleInGym > 0 ? 'var(--color-success)' : 'var(--color-surface)',
                color: peopleInGym > 0 ? 'var(--color-white)' : 'var(--color-text-secondary)',
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                People In Gym
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {peopleInGym === 0
                  ? 'No one is at the gym right now'
                  : `${peopleInGym} ${peopleInGym === 1 ? 'person is' : 'people are'} at the gym right now`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {peopleInGym > 0 && (
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
            )}
            <span
              className="text-2xl font-bold"
              style={{ color: peopleInGym > 0 ? 'var(--color-success)' : 'var(--color-text-primary)' }}
            >
              {peopleInGym}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
          Quick Access
        </h2>
        <QuickLink href="/member/feed"        label="Activity Feed"  description="See what everyone's up to" />
        <QuickLink href="/member/leaderboard" label="Leaderboard"    description="Rankings" />
        <QuickLink href="/member/profile"     label="My QR Code"     description="Show at check-in" />
        <QuickLink href="/member/settings"    label="Settings"       description="Account & preferences" />
      </div>
    </div>
  )
}
