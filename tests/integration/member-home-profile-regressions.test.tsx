import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberStats } from '@/lib/types';

const h = vi.hoisted(() => ({
  auth: { current: {} as Record<string, unknown> },
  from: vi.fn(),
  refreshProfile: vi.fn(),
  router: { refresh: vi.fn() },
  toCanvas: vi.fn(),
  toDataURL: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => h.auth.current }));
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ from: h.from }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => h.router,
}));
vi.mock('qrcode', () => ({
  default: {
    toCanvas: h.toCanvas,
    toDataURL: h.toDataURL,
  },
}));

import { MemberHomeClient, type MemberHomeData } from '@/components/member/MemberHomeClient';
import ProfilePage from '@/app/member/profile/page';

const stats: MemberStats = {
  totalVisits: 0,
  monthlyVisits: 0,
  currentStreak: 0,
  bestStreak: 0,
  avgSessionMinutes: 0,
  leaderboardRank: null,
};

const profile = {
  id: 'member-1',
  name: 'Bon Aquino',
  email: 'bon@example.com',
  contactNumber: null,
  avatarUrl: null,
  avatarUpdatedAt: null,
  avatarChangeLockedUntil: null,
  avatarChangeCount: 0,
  qrCode: 'member-qr',
  createdAt: '2026-04-01T00:00:00.000Z',
  gymId: 'gym-1',
  role: 'member',
};

function membershipTable() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
  return { select: vi.fn(() => builder) };
}

beforeEach(() => {
  h.from.mockReset();
  h.refreshProfile.mockReset().mockResolvedValue(undefined);
  h.router.refresh.mockReset();
  h.toCanvas.mockReset().mockResolvedValue(undefined);
  h.toDataURL.mockReset().mockResolvedValue('data:image/png;base64,cached-member-qr');
  h.auth.current = {
    profile,
    signOut: vi.fn().mockResolvedValue(undefined),
    isSigningOut: false,
    refreshProfile: h.refreshProfile,
    myGyms: [{ gymId: 'gym-1', name: 'Curve Rush' }],
    activeGymId: 'gym-1',
  };
});

describe('member check-in QR', () => {
  it('prepares the QR on home load and opens it in a viewport overlay instead of navigating away', async () => {
    const user = userEvent.setup();
    const data: MemberHomeData = {
      memberName: 'Bon Aquino',
      stats,
      visitedDates: [],
      peopleInGym: null,
    };

    render(
      <div data-testid="route-content">
        <MemberHomeClient data={data} />
      </div>,
    );

    await waitFor(() => expect(h.toDataURL).toHaveBeenCalledWith('member-qr', expect.any(Object)));
    const checkIn = screen.getByRole('button', { name: /^check in$/i });
    await user.click(checkIn);

    const dialog = await screen.findByRole('dialog', { name: /member check-in/i });
    expect(dialog.closest('[data-testid="route-content"]')).toBeNull();
    expect(screen.getByRole('img', { name: /member qr code/i })).toHaveAttribute(
      'src',
      'data:image/png;base64,cached-member-qr',
    );
  });
});

describe('member profile editing', () => {
  it('refreshes the shared account profile immediately after saving basic fields', async () => {
    const user = userEvent.setup();
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    h.from.mockImplementation((table: string) => (
      table === 'memberships' ? membershipTable() : { update }
    ));

    render(<ProfilePage />);

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const name = screen.getByDisplayValue('Bon Aquino');
    await user.clear(name);
    await user.type(name, 'Bon Santos');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledWith({
      name: 'Bon Santos',
      contact_number: null,
    }));
    expect(updateEq).toHaveBeenCalledWith('id', 'member-1');
    await waitFor(() => expect(h.refreshProfile).toHaveBeenCalledTimes(1));
  });
});
