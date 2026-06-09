'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts'
import { A, ACard } from '@/lib/admin-ui'

interface AdminReportsChartsProps {
  attendanceData: { date: string; visits: number }[]
  revenueData: { date: string; revenue: number }[]
}

export function AdminReportsCharts({
  attendanceData,
  revenueData,
}: AdminReportsChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ACard className="p-4">
        <p className="text-base font-semibold mb-3" style={{ color: A.text }}>
          Attendance (Last 14 Days)
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke={A.border} />
              <XAxis dataKey="date" tick={{ fill: A.muted, fontSize: 11 }} interval="preserveStartEnd" axisLine={{ stroke: A.border }} tickLine={{ stroke: A.border }} />
              <YAxis tick={{ fill: A.muted, fontSize: 11 }} allowDecimals={false} axisLine={{ stroke: A.border }} tickLine={{ stroke: A.border }} />
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
              <Line type="monotone" dataKey="visits" stroke="#D4956A" strokeWidth={2.5} dot={{ fill: "#D4956A", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ACard>

      <ACard className="p-4">
        <p className="text-base font-semibold mb-3" style={{ color: A.text }}>
          Revenue (Last 14 Days)
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke={A.border} />
              <XAxis dataKey="date" tick={{ fill: A.muted, fontSize: 11 }} interval="preserveStartEnd" axisLine={{ stroke: A.border }} tickLine={{ stroke: A.border }} />
              <YAxis tick={{ fill: A.muted, fontSize: 11 }} axisLine={{ stroke: A.border }} tickLine={{ stroke: A.border }} />
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
