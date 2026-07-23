import { createServerSupabaseClient } from '@/lib/supabase-server'
import { AdminDashboardClient } from '@/components/admin/AdminDashboardClient'
import type { DashboardStats } from '@/components/admin/AdminDashboardClient'
import { ReportingUnavailable } from '@/components/admin/ReportingUnavailable'
import { requirePermission } from '@/lib/permissions-server'

export default async function AdminDashboard() {
  await requirePermission('dashboard:view')
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('admin_dashboard_stats')

  if (error || !data) {
    console.error('admin dashboard data unavailable', {
      code: typeof error?.code === 'string' ? error.code : 'missing_data',
    })
    return <ReportingUnavailable section="Dashboard" />
  }

  return <AdminDashboardClient initialData={data as unknown as DashboardStats} />
}
