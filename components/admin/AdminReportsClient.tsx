'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { A, ACard, PageHeader } from '@/lib/admin-ui'
import { CalendarDays, Users, DollarSign, ArrowUp } from 'lucide-react'

const AdminReportsCharts = dynamic(
  () => import('@/components/admin/AdminReportsCharts').then((mod) => mod.AdminReportsCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-6 lg:grid-cols-2">
        <ACard className="p-4 h-72" />
        <ACard className="p-4 h-72" />
      </div>
    ),
  }
)

interface PeakHour {
  hour: number
  label: string
  count: number
}

interface RevenueByDom {
  day: number
  amount: number
}

interface MethodBreakdown {
  cashTotal: number
  cashCount: number
  gcashTotal: number
  gcashCount: number
}

export interface ReportsData {
  activeCount: number
  expiredCount: number
  monthRevenue: number
  avgDailyVisits: string
  attendanceData: { date: string; visits: number }[]
  revenueData: { date: string; revenue: number }[]
  peakHours: PeakHour[]
  revenueByDayOfMonth: RevenueByDom[]
  methodBreakdown: MethodBreakdown
}

function StatCard({
  icon,
  label,
  value,
  iconBg,
  iconColor,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  iconBg: string
  iconColor: string
}) {
  return (
    <ACard className="p-4">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: iconBg }}>
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <div>
          <p className="text-xs" style={{ color: A.muted }}>{label}</p>
          <p className="text-xl font-bold" style={{ color: A.text }}>{value}</p>
        </div>
      </div>
    </ACard>
  )
}

export function AdminReportsClient({ data }: { data: ReportsData }) {
  const { activeCount, expiredCount, monthRevenue, avgDailyVisits, attendanceData, revenueData, peakHours, revenueByDayOfMonth, methodBreakdown } = data

  return (
    <div className="space-y-6" style={{ backgroundColor: A.bg }}>
      <PageHeader title="Reports" subtitle="Attendance, revenue, and membership trends" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Active Members"
          value={activeCount}
          iconBg="rgba(212,149,106,0.15)"
          iconColor="var(--color-primary)"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Expired"
          value={expiredCount}
          iconBg="var(--admin-expired-bg)"
          iconColor="var(--admin-expired-text)"
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Month Revenue"
          value={`₱${monthRevenue.toLocaleString()}`}
          iconBg="rgba(42,157,143,0.15)"
          iconColor="#2A9D8F"
        />
        <StatCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Avg Daily Visits"
          value={avgDailyVisits}
          iconBg="rgba(48,88,58,0.16)"
          iconColor="var(--admin-active-text)"
        />
      </div>

      <AdminReportsCharts attendanceData={attendanceData} revenueData={revenueData} />

      <div className="grid gap-6 lg:grid-cols-3">
        <ACard className="p-4">
          <p className="text-base font-semibold mb-3" style={{ color: A.text }}>Peak Hours</p>
          {peakHours.length === 0 ? (
            <p className="text-sm" style={{ color: A.muted }}>Not enough data yet.</p>
          ) : (
            <div className="space-y-2">
              {peakHours.map((h, i) => (
                <div key={h.hour} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {i === 0 && <ArrowUp className="h-3 w-3" style={{ color: 'var(--color-primary)' }} />}
                    <span className="text-sm" style={{ color: A.text }}>{h.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.max(20, (h.count / (peakHours[0]?.count || 1)) * 100)}px`,
                        backgroundColor: 'var(--color-primary)',
                      }}
                    />
                    <span className="text-xs" style={{ color: A.muted }}>{h.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ACard>

        <ACard className="p-4">
          <p className="text-base font-semibold mb-3" style={{ color: A.text }}>Best Revenue Days</p>
          {revenueByDayOfMonth.length === 0 ? (
            <p className="text-sm" style={{ color: A.muted }}>Not enough data yet.</p>
          ) : (
            <div className="space-y-2">
              {revenueByDayOfMonth.map((d) => (
                <div key={d.day} className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: A.text }}>{`Day ${d.day}`}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{`₱${d.amount.toLocaleString()}`}</span>
                </div>
              ))}
            </div>
          )}
        </ACard>

        <ACard className="p-4">
          <p className="text-base font-semibold mb-3" style={{ color: A.text }}>Payment Methods</p>
          <div className="space-y-4">
            <div className="rounded-xl p-3" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: A.text2 }}>Cash</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--admin-active-bg)', color: 'var(--admin-active-text)', border: '1px solid var(--admin-active-border)' }}
                >
                  {methodBreakdown.cashCount} payments
                </span>
              </div>
              <p className="mt-1 text-lg font-bold" style={{ color: A.text }}>{`₱${methodBreakdown.cashTotal.toLocaleString()}`}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: A.text2 }}>GCash</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(42,157,143,0.15)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.28)' }}
                >
                  {methodBreakdown.gcashCount} payments
                </span>
              </div>
              <p className="mt-1 text-lg font-bold" style={{ color: A.text }}>{`₱${methodBreakdown.gcashTotal.toLocaleString()}`}</p>
            </div>
          </div>
        </ACard>
      </div>
    </div>
  )
}
