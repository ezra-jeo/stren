import { createServerSupabaseClient } from '@/lib/supabase-server'
import { AdminDashboardClient } from '@/components/admin/AdminDashboardClient'
import type { DashboardStats } from '@/components/admin/AdminDashboardClient'
import { requirePermission } from '@/lib/permissions-server'

export default async function AdminDashboard() {
  await requirePermission('dashboard:view')
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.rpc('admin_dashboard_stats')

  return <AdminDashboardClient initialData={(data as DashboardStats | null) ?? null} />
}
