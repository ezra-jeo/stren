'use client'

import React, { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { A, ACard, Avatar, EmptyState, PageHeader } from '@/lib/admin-ui'
import {
  Users,
  UserCheck,
  DollarSign,
  Activity,
  Clock,
  LogOut,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'

const AdminDashboardCharts = dynamic(
  () => import('@/components/admin/AdminDashboardCharts').then((mod) => mod.AdminDashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-6 lg:grid-cols-2">
        <ACard className="p-4 h-60" />
        <ACard className="p-4 h-60" />
      </div>
    ),
  }
)

interface CheckedInEntry {
  id: string
  member_id: string
  check_in: string
  name: string
}

export interface DashboardStats {
  currently_in: CheckedInEntry[]
  today_visits: number
  total_members: number
  active_plans: number
  expired_plans: number
  frozen_plans: number
  today_revenue?: number
  month_revenue?: number
  attendance_7d: { day: string; visits: number }[]
  revenue_7d?: { day: string; revenue: number }[]
}

export function AdminDashboardClient({ initialData }: { initialData: DashboardStats | null }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const checkedIn = (initialData?.currently_in ?? []).slice(0, 50)
  const checkedInCount = initialData?.currently_in?.length ?? 0
  const todayVisits = initialData?.today_visits ?? 0
  const totalMembers = initialData?.total_members ?? 0
  const activeCount = initialData?.active_plans ?? 0
  const expiredCount = initialData?.expired_plans ?? 0
  const frozenCount = initialData?.frozen_plans ?? 0
  const todayRevenue = initialData?.today_revenue
  const monthRevenue = initialData?.month_revenue
  const attendanceData = initialData?.attendance_7d ?? []
  const revenueData = initialData?.revenue_7d ?? []

  async function handleCheckOut(attendanceId: string) {
    const { error } = await supabase
      .from('attendance')
      .update({ check_out: new Date().toISOString() })
      .eq('id', attendanceId)
    if (error) {
      toast.error('Failed to check out')
      return
    }
    toast.success('Checked out!')
    router.refresh()
  }

  const stats = [
    { label: 'Currently In Gym', value: checkedInCount, icon: Activity, iconColor: '#16A34A', bg: '#ECFDF3' },
    { label: 'Visits Today', value: todayVisits, icon: UserCheck, iconColor: '#2563EB', bg: '#EFF6FF' },
    { label: 'Total Members', value: totalMembers, icon: Users, iconColor: 'var(--color-primary)', bg: 'var(--color-primary-glow)' },
    { label: 'Today Revenue', value: todayRevenue == null ? '—' : '₱' + todayRevenue.toLocaleString(), icon: DollarSign, iconColor: '#16A34A', bg: '#ECFDF3' },
    { label: 'Month Revenue', value: monthRevenue == null ? '—' : '₱' + monthRevenue.toLocaleString(), icon: TrendingUp, iconColor: 'var(--color-primary)', bg: 'var(--color-primary-glow)' },
  ]

  const breakdownRows = [
    { label: 'Active plans', count: activeCount, color: '#16A34A' },
    { label: 'Expired plans', count: expiredCount, color: '#DC2626' },
    { label: 'Frozen plans', count: frozenCount, color: '#D97706' },
  ]

  return (
    <div className="space-y-6" style={{ backgroundColor: A.bg }}>
      <PageHeader
        title="Dashboard"
        subtitle="Live operations, member status, and performance snapshots"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <ACard key={stat.label} className="p-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: stat.bg }}
              >
                <stat.icon className="h-5 w-5" style={{ color: stat.iconColor }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: A.text2 }}>{stat.label}</p>
                <p className="text-xl font-bold" style={{ color: A.text }}>{stat.value}</p>
              </div>
            </div>
          </ACard>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ACard className="p-4">
          <div className="flex items-center justify-between pb-3" style={{ borderBottom: `1px solid ${A.border}` }}>
            <p className="flex items-center gap-2 text-base font-semibold" style={{ color: A.text }}>
              <Clock className="h-4 w-4" style={{ color: A.primary }} />
              Live - Who&apos;s In The Gym
            </p>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: '#ECFDF3', color: '#16A34A', border: '1px solid #BBF7D0' }}
            >
              {checkedInCount} checked in
            </span>
          </div>
          <div className="pt-3">
            {checkedInCount === 0 ? (
              <EmptyState
                icon={<Clock size={28} />}
                title="No one currently checked in"
                subtitle="Members who scan in will appear here in real-time"
              />
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {checkedInCount > checkedIn.length && (
                  <p className="text-xs" style={{ color: A.muted }}>
                    Showing first {checkedIn.length} of {checkedInCount}
                  </p>
                )}
                {checkedIn.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg p-3"
                    style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} size={9} />
                      <div>
                        <p className="text-sm font-medium" style={{ color: A.text }}>{c.name}</p>
                        <p className="text-xs" style={{ color: A.muted }}>
                          In since{' '}
                          {new Date(c.check_in).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCheckOut(c.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
                      style={{ backgroundColor: 'var(--admin-expired-bg)', color: 'var(--admin-expired-text)', border: '1px solid var(--admin-expired-border)' }}
                    >
                      <LogOut className="h-3 w-3" />
                      Out
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ACard>

        <ACard className="p-4">
          <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${A.border}` }}>
            <Users className="h-4 w-4" style={{ color: A.primary }} />
            <p className="text-base font-semibold" style={{ color: A.text }}>
              Membership Breakdown
            </p>
          </div>
          <div className="space-y-4 pt-3">
            {breakdownRows.map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm" style={{ color: A.text2 }}>{label}</span>
                <div className="flex items-center gap-2">
                  <div style={{ width: 180, backgroundColor: '#F1EFEB', borderRadius: 9999, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, (count / Math.max(1, totalMembers)) * 100)}%`,
                        minWidth: count > 0 ? 10 : 0,
                        height: 8,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium w-6 text-right" style={{ color: A.text }}>{count}</span>
                </div>
              </div>
            ))}
            <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
              <p className="text-xs" style={{ color: A.muted }}>Total registered members</p>
              <p className="text-2xl font-bold" style={{ color: A.text }}>{totalMembers}</p>
            </div>
          </div>
        </ACard>
      </div>

      <AdminDashboardCharts attendanceData={attendanceData} revenueData={revenueData} />
    </div>
  )
}
