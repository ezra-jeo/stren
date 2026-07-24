import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboard from '@/app/admin/page';
import ReportsPage from '@/app/admin/reports/page';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/lib/permissions-server', () => ({
  requirePermission: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({ rpc: rpcMock }),
}));

vi.mock('@/lib/supabase', () => ({ createClient: () => ({ rpc: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('reporting query failures', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('renders an explicit dashboard-unavailable state instead of plausible zeroes', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '57014', message: 'statement timeout with private detail' },
    });

    render(await AdminDashboard());

    expect(screen.getByRole('heading', { name: /dashboard unavailable/i })).toBeInTheDocument();
    expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/statement timeout/i)).not.toBeInTheDocument();
  });

  it('renders an explicit reports-unavailable state when either report query fails', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'private report failure' } })
      .mockResolvedValueOnce({ data: null, error: null });

    render(await ReportsPage());

    expect(screen.getByRole('heading', { name: /reports unavailable/i })).toBeInTheDocument();
    expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/private report failure/i)).not.toBeInTheDocument();
  });

  it('keeps valid report data but marks reconciliation unavailable when only that query fails', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: {
          active_count: 0,
          expired_count: 0,
          attendance_by_day: [],
          peak_hours: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '57014', message: 'private reconciliation failure' },
      });

    render(await ReportsPage());

    expect(screen.getByText(/financial reconciliation unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/no reconciliation total is shown/i)).toBeInTheDocument();
    expect(screen.queryByText(/private reconciliation failure/i)).not.toBeInTheDocument();
  });
});
