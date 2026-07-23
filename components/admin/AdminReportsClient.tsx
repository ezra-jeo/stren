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

export interface FinancialReconciliation {
  from_date: string
  to_date: string
  payment_total: number
  refund_total: number
  void_total: number
  adjustment_total: number
  net_total: number
  transaction_count: number
  legacy_backfill_count: number
  legacy_backfill_total: number
  memberships_missing_transaction: number
  ledger_rows_missing_membership: number
  duplicate_idempotency_keys: number
  impossible_reversal_balances: number
}

export interface ReportsData {
  activeCount: number
  expiredCount: number
  monthRevenue?: number
  avgDailyVisits: string
  attendanceData: { date: string; visits: number }[]
  revenueData?: { date: string; revenue: number }[]
  peakHours: PeakHour[]
  revenueByDayOfMonth?: RevenueByDom[]
  methodBreakdown?: MethodBreakdown
  reconciliation?: FinancialReconciliation
  reconciliationUnavailable?: boolean
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
  const {
    activeCount,
    expiredCount,
    monthRevenue,
    avgDailyVisits,
    attendanceData,
    revenueData = [],
    peakHours,
    revenueByDayOfMonth = [],
    methodBreakdown,
    reconciliation,
    reconciliationUnavailable,
  } = data

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
          value={monthRevenue == null ? '—' : `₱${monthRevenue.toLocaleString()}`}
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

      {reconciliation && (
        <ACard className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold" style={{ color: A.text }}>Owner Financial Reconciliation</p>
              <p className="text-xs" style={{ color: A.muted }}>
                All-time signed ledger check · {reconciliation.transaction_count} events
              </p>
            </div>
            <p className="text-lg font-bold" style={{ color: A.text }}>₱{reconciliation.net_total.toLocaleString()}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Payments", reconciliation.payment_total],
              ["Refunds", reconciliation.refund_total],
              ["Voids", reconciliation.void_total],
              ["Adjustments", reconciliation.adjustment_total],
            ].map(([label, amount]) => (
              <div key={String(label)} className="rounded-lg p-3" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
                <p className="text-xs" style={{ color: A.muted }}>{label}</p>
                <p className="font-semibold" style={{ color: A.text }}>₱{Number(amount).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4" style={{ color: A.text2 }}>
            <p>Memberships missing ledger: <strong>{reconciliation.memberships_missing_transaction}</strong></p>
            <p>Ledger links missing: <strong>{reconciliation.ledger_rows_missing_membership}</strong></p>
            <p>Duplicate retry keys: <strong>{reconciliation.duplicate_idempotency_keys}</strong></p>
            <p>Impossible reversals: <strong>{reconciliation.impossible_reversal_balances}</strong></p>
          </div>
          <p className="mt-3 text-xs" style={{ color: A.muted }}>
            Reconstructed legacy: {reconciliation.legacy_backfill_count} events · ₱{reconciliation.legacy_backfill_total.toLocaleString()}
          </p>
        </ACard>
      )}

      {reconciliationUnavailable && (
        <ACard className="p-4" style={{ borderColor: '#F59E0B' }}>
          <p className="font-semibold" style={{ color: A.text }}>Financial reconciliation unavailable</p>
          <p className="mt-1 text-sm" style={{ color: A.text2 }}>
            No reconciliation total is shown until the ledger check succeeds.
          </p>
        </ACard>
      )}

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
                  {methodBreakdown ? `${methodBreakdown.cashCount} payments` : '—'}
                </span>
              </div>
              <p className="mt-1 text-lg font-bold" style={{ color: A.text }}>
                {methodBreakdown ? `₱${methodBreakdown.cashTotal.toLocaleString()}` : '—'}
              </p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: A.text2 }}>GCash</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(42,157,143,0.15)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.28)' }}
                >
                  {methodBreakdown ? `${methodBreakdown.gcashCount} payments` : '—'}
                </span>
              </div>
              <p className="mt-1 text-lg font-bold" style={{ color: A.text }}>
                {methodBreakdown ? `₱${methodBreakdown.gcashTotal.toLocaleString()}` : '—'}
              </p>
            </div>
          </div>
        </ACard>
      </div>
    </div>
  )
}
