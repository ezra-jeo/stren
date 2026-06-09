import { createServerSupabaseClient } from '@/lib/supabase-server'
import { AdminDashboardClient } from '@/components/admin/AdminDashboardClient'
import type { DashboardStats } from '@/components/admin/AdminDashboardClient'

export default async function AdminDashboard() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.rpc('admin_dashboard_stats')

  return <AdminDashboardClient initialData={(data as DashboardStats | null) ?? null} />
}
