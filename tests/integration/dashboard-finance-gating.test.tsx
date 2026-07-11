import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminDashboardClient } from '@/components/admin/AdminDashboardClient';
import { AdminReportsClient } from '@/components/admin/AdminReportsClient';

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('revoked finance payloads', () => {
  it('renders quiet placeholders when dashboard and report money fields are omitted', () => {
    const { unmount } = render(
      <AdminDashboardClient initialData={{
        currently_in: [],
        today_visits: 2,
        total_members: 10,
        active_plans: 8,
        expired_plans: 1,
        frozen_plans: 1,
        attendance_7d: [],
      }} />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    unmount();

    render(
      <AdminReportsClient data={{
        activeCount: 8,
        expiredCount: 1,
        avgDailyVisits: '2.0',
        attendanceData: [],
        peakHours: [],
      }} />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
