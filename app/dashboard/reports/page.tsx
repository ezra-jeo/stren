'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';

const DashboardReportsCharts = dynamic(
  () => import('@/components/dashboard/DashboardReportsCharts').then((mod) => mod.DashboardReportsCharts),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="h-12 rounded-lg bg-muted" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 h-80" />
          <Card className="p-6 h-80" />
        </div>
      </div>
    ),
  }
)

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState('month');

  // Attendance data
  const attendanceData = [
    { date: 'Mon', checkins: 145, checkouts: 138 },
    { date: 'Tue', checkins: 168, checkouts: 162 },
    { date: 'Wed', checkins: 192, checkouts: 187 },
    { date: 'Thu', checkins: 175, checkouts: 169 },
    { date: 'Fri', checkins: 210, checkouts: 205 },
    { date: 'Sat', checkins: 128, checkouts: 125 },
    { date: 'Sun', checkins: 95, checkouts: 93 },
  ];

  // Revenue data
  const revenueData = [
    { month: 'January', revenue: 12450, target: 15000 },
    { month: 'February', revenue: 13200, target: 15000 },
    { month: 'March', revenue: 14500, target: 15000 },
    { month: 'April', revenue: 15800, target: 15000 },
    { month: 'May', revenue: 16200, target: 15000 },
    { month: 'June', revenue: 14900, target: 15000 },
  ];

  // Membership distribution
  const membershipData = [
    { name: 'Basic', value: 45, color: '#8884d8' },
    { name: 'Standard', value: 120, color: '#82ca9d' },
    { name: 'Premium', value: 83, color: '#ffc658' },
  ];

  // Peak hours
  const peakHoursData = [
    { hour: '6 AM', members: 45 },
    { hour: '7 AM', members: 120 },
    { hour: '8 AM', members: 95 },
    { hour: '12 PM', members: 160 },
    { hour: '1 PM', members: 140 },
    { hour: '5 PM', members: 210 },
    { hour: '6 PM', members: 240 },
    { hour: '7 PM', members: 180 },
  ];

  // Member status
  const memberStatusData = [
    { name: 'Active', value: 248, color: '#10b981' },
    { name: 'Inactive', value: 42, color: '#ef4444' },
    { name: 'Paused', value: 15, color: '#f59e0b' },
  ];

  const stats = [
    { label: 'Total Revenue (YTD)', value: '$91,050', change: '+12%' },
    { label: 'Avg Attendance Rate', value: '87.4%', change: '+3.2%' },
    { label: 'Member Retention', value: '94.2%', change: '+1.1%' },
    { label: 'New Members', value: '24', change: '+8' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p 
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            Analytics
          </p>
          <h1 
            className="text-5xl font-bold mt-2"
            style={{
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
            }}
          >
            Reports
          </h1>
          <p
            className="text-lg mt-3"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Track attendance, revenue, and membership trends
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="quarter">Last 90 days</SelectItem>
              <SelectItem value="year">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button className="gap-2 bg-primary hover:bg-primary/90 md:w-auto w-full">
            <Download size={18} />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {stat.label}
            </p>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {stat.value}
              </span>
              <span className="text-sm font-semibold text-emerald-600">{stat.change}</span>
            </div>
          </Card>
        ))}
      </div>

      <DashboardReportsCharts
        attendanceData={attendanceData}
        revenueData={revenueData}
        membershipData={membershipData}
        peakHoursData={peakHoursData}
        memberStatusData={memberStatusData}
      />
    </div>
  );
}
