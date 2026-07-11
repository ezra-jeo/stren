import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn(async (name: string) => name === 'get_my_access'
    ? { data: { features: { kiosk_checkin: false } }, error: null }
    : { data: [], error: null });
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  const client = {
    rpc,
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
  return { rpc, client };
});

vi.mock('@/lib/supabase', () => ({ createClient: () => mocks.client }));

import KioskPage, { KioskDisabledState } from '@/app/kiosk/page';

describe('disabled kiosk state', () => {
  it('explains that the owner turned check-ins off', () => {
    render(<KioskDisabledState />);
    expect(screen.getByRole('heading', { name: 'Check-ins are turned off' })).toBeInTheDocument();
    expect(screen.getByText('The owner has disabled kiosk check-ins for this gym.')).toBeInTheDocument();
  });

  it('does not poll protected kiosk data when access reports the feature off', async () => {
    render(<KioskPage />);

    await screen.findByRole('heading', { name: 'Check-ins are turned off' });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('get_my_access'));
    expect(mocks.rpc).not.toHaveBeenCalledWith('kiosk_get_checked_in');
  });
});
