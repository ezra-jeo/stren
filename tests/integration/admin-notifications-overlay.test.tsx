import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  auth: { current: {} as Record<string, unknown> },
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => h.auth.current }));
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ from: h.from, channel: h.channel, removeChannel: h.removeChannel }),
}));

import { NotificationsPanel } from '@/components/notifications-panel';

function notificationTable() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  return { select: vi.fn(() => builder) };
}

beforeEach(() => {
  h.auth.current = {
    activeScope: { accountId: 'owner-1', profileId: 'owner-1', gymId: 'gym-1', role: 'owner' },
  };
  h.from.mockReset().mockReturnValue(notificationTable());
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  h.channel.mockReset().mockReturnValue(channel);
  h.removeChannel.mockReset();
});

describe('admin notifications overlay', () => {
  it('portals the notification dialog above animated route content so its backdrop covers the viewport', async () => {
    const user = userEvent.setup();
    render(
      <div data-testid="route-content" className="route-content-enter">
        <NotificationsPanel />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /^notifications$/i }));

    const dialog = await screen.findByRole('dialog', { name: /^notifications$/i });
    expect(dialog.closest('[data-testid="route-content"]')).toBeNull();
    expect(document.querySelector('[data-viewport-overlay]')).not.toBeNull();
  });
});
