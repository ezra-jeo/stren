'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { A, ACard } from '@/lib/admin-ui'

interface AdminDashboardChartsProps {
  attendanceData: { day: string; visits: number }[]
  revenueData: { day: string; revenue: number }[]
}

export function AdminDashboardCharts({
  attendanceData,
  revenueData,
}: AdminDashboardChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ACard className="p-4">
        <div className="pb-3" style={{ borderBottom: `1px solid ${A.border}` }}>
          <p className="text-base font-semibold" style={{ color: A.text }}>
            Daily Attendance (Last 7 Days)
          </p>
        </div>
        <div className="h-48 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="day" tick={{ fill: "var(--admin-text-muted)", fontSize: 12 }} />
              <YAxis tick={{ fill: "var(--admin-text-muted)", fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  color: '#111827',
                }}
                labelStyle={{ color: '#111827' }}
                itemStyle={{ color: '#111827' }}
                cursor={{ fill: '#f3f4f6' }}
              />
              <Bar dataKey="visits" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ACard>

      <ACard className="p-4">
        <div className="pb-3" style={{ borderBottom: `1px solid ${A.border}` }}>
          <p className="text-base font-semibold" style={{ color: A.text }}>
            Revenue (Last 7 Days)
          </p>
        </div>
        <div className="h-48 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="day" tick={{ fill: "var(--admin-text-muted)", fontSize: 12 }} />
              <YAxis tick={{ fill: "var(--admin-text-muted)", fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  color: '#111827',
                }}
                labelStyle={{ color: '#111827' }}
                itemStyle={{ color: '#111827' }}
                cursor={{ fill: '#f3f4f6' }}
                formatter={(value: number) => [`₱${value.toLocaleString()}`, 'Revenue']}
              />
              <Bar dataKey="revenue" fill="#2A9D8F" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ACard>
    </div>
  )
}
