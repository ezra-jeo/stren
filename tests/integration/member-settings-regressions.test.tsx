import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auth: { current: {} as Record<string, unknown> },
  from: vi.fn(),
  updateUser: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => h.auth.current }));
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: h.from,
    auth: { updateUser: h.updateUser },
    channel: h.channel,
    removeChannel: h.removeChannel,
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import SettingsPage from '@/app/member/settings/page';
import { MemberNotificationsPanel } from '@/components/member-notifications-panel';

const profile = {
  id: 'member-1',
  name: 'Bon Aquino',
  email: 'bon@example.com',
  gymId: 'gym-1',
  createdAt: '2026-04-01T00:00:00.000Z',
};

function preferenceTable(upsert: ReturnType<typeof vi.fn>) {
  const result = {
    data: {
      inactivity_nudges_enabled: true,
      streak_notifications_enabled: true,
    },
    error: null,
  };
  const secondEq = vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue(result) }));
  const firstEq = vi.fn(() => ({
    eq: secondEq,
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }));

  return {
    select: vi.fn(() => ({ eq: firstEq })),
    upsert,
    firstEq,
    secondEq,
  };
}

function notificationTable() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  return { select: vi.fn(() => builder) };
}

beforeEach(() => {
  h.from.mockReset();
  h.updateUser.mockReset();
  h.removeChannel.mockReset();
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  h.channel.mockReset().mockReturnValue(channel);
  h.auth.current = {
    profile,
    signOut: vi.fn().mockResolvedValue(undefined),
    isSigningOut: false,
    needsPasswordSetup: false,
    completePasswordSetup: vi.fn(),
    signIn: vi.fn(),
  };
});

describe('member notification preferences', () => {
  it('persists an opt-out against the per-gym unique key without resetting the other preference', async () => {
    const user = userEvent.setup();
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const table = preferenceTable(upsert);
    h.from.mockReturnValue(table);

    render(<SettingsPage />);

    const workoutReminders = await screen.findByRole('switch', { name: /workout reminders/i });
    await waitFor(() => expect(workoutReminders).not.toBeDisabled());
    await user.click(workoutReminders);

    await waitFor(() => expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        member_id: 'member-1',
        gym_id: 'gym-1',
        inactivity_nudges_enabled: false,
        streak_notifications_enabled: true,
      }),
      { onConflict: 'member_id,gym_id' },
    ));
    expect(table.firstEq).toHaveBeenCalledWith('member_id', 'member-1');
    expect(table.secondEq).toHaveBeenCalledWith('gym_id', 'gym-1');
    expect(workoutReminders).toHaveAttribute('aria-checked', 'false');
  });
});

describe('member viewport overlays', () => {
  it('renders the settings dialog outside route-transition containers', async () => {
    const user = userEvent.setup();
    h.from.mockReturnValue(preferenceTable(vi.fn().mockResolvedValue({ error: null })));

    render(
      <div data-testid="route-content">
        <SettingsPage />
      </div>,
    );

    await user.click(await screen.findByRole('button', { name: /change password/i }));
    const dialog = await screen.findByRole('dialog', { name: /change password/i });
    expect(dialog.closest('[data-testid="route-content"]')).toBeNull();
  });

  it('dims the whole viewport above the mobile navigation when notifications open', async () => {
    const user = userEvent.setup();
    h.auth.current = {
      activeScope: {
        accountId: 'member-1',
        profileId: 'member-1',
        gymId: 'gym-1',
        role: 'member',
      },
    };
    h.from.mockReturnValue(notificationTable());

    render(
      <div data-testid="route-content">
        <MemberNotificationsPanel />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /^notifications$/i }));
    const dialog = await screen.findByRole('dialog', { name: /^notifications$/i });
    expect(dialog.closest('[data-testid="route-content"]')).toBeNull();
  });
});
