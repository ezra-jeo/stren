import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuccessState, type ProvisionResult } from '@/components/superadmin/SuccessState';

const baseResult: ProvisionResult = {
  gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness', ownerEmail: 'jane@example.com',
  expiresAt: '2026-07-18T00:00:00.000Z', deliveryStatus: 'sent',
};

describe('SuccessState — secure delivery status', () => {
  it('shows the ready headline, pending-claim status, recipient, and expiry', () => {
    render(<SuccessState result={baseResult} onReturn={vi.fn()} />);
    expect(screen.getByText('Iron Fitness is ready')).toBeInTheDocument();
    expect(screen.getByText('Pending owner claim')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/not delivered/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy claim link/i })).not.toBeInTheDocument();
  });

  it('calls onReturn', async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    render(<SuccessState result={baseResult} onReturn={onReturn} />);
    await user.click(screen.getByRole('button', { name: 'Return to Assisted Onboarding' }));
    expect(onReturn).toHaveBeenCalled();
  });

  it('states delivery failure plainly and resends without exposing a claim link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ expiresAt: '2026-07-19T00:00:00.000Z', deliveryStatus: 'sent' }),
    })));
    const user = userEvent.setup();
    render(<SuccessState result={{ ...baseResult, deliveryStatus: 'failed' }} onReturn={vi.fn()} />);
    expect(screen.getByText(/invitation email was not delivered/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Resend invitation/ }));
    await waitFor(() => expect(screen.queryByText(/invitation email was not delivered/)).not.toBeInTheDocument());
    expect(screen.queryByText(/claim\/|token/i)).not.toBeInTheDocument();
  });
});
