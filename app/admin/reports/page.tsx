import { createServerSupabaseClient } from '@/lib/supabase-server'
import { AdminReportsClient } from '@/components/admin/AdminReportsClient'
import type { FinancialReconciliation, ReportsData } from '@/components/admin/AdminReportsClient'
import { ReportingUnavailable } from '@/components/admin/ReportingUnavailable'
import { requirePermission } from '@/lib/permissions-server'

const MAX_DAYS = 14
const MAX_PEAK_HOURS = 8
const MAX_REVENUE_DAYS = 31

export default async function ReportsPage() {
  await requirePermission('reports:attendance:view')
  const supabase = await createServerSupabaseClient()
  const [reportsResult, reconciliationResult] = await Promise.all([
    supabase.rpc('admin_reports_data', { p_days: 14 }),
    supabase.rpc('financial_reconciliation', { p_from_date: '2000-01-01', p_to_date: '2100-01-01' }),
  ])

  const { data, error } = reportsResult
  const { data: reconciliation, error: reconciliationError } = reconciliationResult

  if (error || !data) {
    console.error('admin reports data unavailable', {
      code: typeof error?.code === 'string' ? error.code : 'missing_data',
    })
    return <ReportingUnavailable section="Reports" />
  }

  if (reconciliationError) {
    console.error('financial reconciliation unavailable', {
      code: typeof reconciliationError.code === 'string' ? reconciliationError.code : 'unknown',
    })
  }

  const attendanceRows = ((data as any).attendance_by_day ?? []).slice(0, MAX_DAYS) as { date: string; visits: number }[]
  const totalVisits = attendanceRows.reduce((s: number, d: { visits: number }) => s + d.visits, 0)
  const avgDailyVisits = (totalVisits / Math.max(1, attendanceRows.length)).toFixed(1)

  const raw = data as any
  const reportsData: ReportsData = {
    activeCount: raw.active_count,
    expiredCount: raw.expired_count,
    monthRevenue: typeof raw.month_revenue === 'number' ? raw.month_revenue : undefined,
    avgDailyVisits,
    attendanceData: attendanceRows,
    revenueData: Array.isArray(raw.revenue_by_day) ? raw.revenue_by_day.slice(0, MAX_DAYS) : undefined,
    peakHours: (raw.peak_hours ?? []).slice(0, MAX_PEAK_HOURS),
    revenueByDayOfMonth: Array.isArray(raw.revenue_by_dom)
      ? raw.revenue_by_dom.slice(0, MAX_REVENUE_DAYS)
      : undefined,
    methodBreakdown: raw.method_breakdown
      ? {
          cashTotal: raw.method_breakdown.cash_total,
          cashCount: raw.method_breakdown.cash_count,
          gcashTotal: raw.method_breakdown.gcash_total,
          gcashCount: raw.method_breakdown.gcash_count,
        }
      : undefined,
    reconciliation: reconciliation
      ? reconciliation as unknown as FinancialReconciliation
      : undefined,
    reconciliationUnavailable: Boolean(reconciliationError),
  }

  return <AdminReportsClient data={reportsData} />
}
