import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuccessState, type ProvisionResult } from '@/components/superadmin/SuccessState';

const baseResult: ProvisionResult = {
  gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness', ownerEmail: 'jane@example.com',
  expiresAt: '2026-07-18T00:00:00.000Z', claimLink: 'https://stren.app/claim/tok', emailDelivered: true,
};

// userEvent.setup() installs its own clipboard stub, so the mock must be
// (re)installed after setup() runs in each test, not in a shared beforeEach.
function mockClipboard() {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('SuccessState — delivered', () => {
  it('shows the ready headline, pending-claim status, recipient, and expiry', () => {
    render(<SuccessState result={baseResult} onReturn={vi.fn()} />);
    expect(screen.getByText('Iron Fitness is ready')).toBeInTheDocument();
    expect(screen.getByText('Pending owner claim')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/failed to send/)).not.toBeInTheDocument();
  });

  it('copies the claim link when pressed', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    render(<SuccessState result={baseResult} onReturn={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Copy claim link/ }));
    expect(writeText).toHaveBeenCalledWith('https://stren.app/claim/tok');
  });

  it('calls onReturn', async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    render(<SuccessState result={baseResult} onReturn={onReturn} />);
    await user.click(screen.getByRole('button', { name: 'Return to Assisted Onboarding' }));
    expect(onReturn).toHaveBeenCalled();
  });
});

describe('SuccessState — delivery failed', () => {
  it('still shows the gym as created and states delivery failed plainly, without falsely claiming success', () => {
    render(<SuccessState result={{ ...baseResult, emailDelivered: false }} onReturn={vi.fn()} />);
    expect(screen.getByText('Iron Fitness is ready')).toBeInTheDocument();
    expect(screen.getByText(/invitation email failed to send/)).toBeInTheDocument();
  });

  it('resend invitation updates the claim link, expiry, and delivered state on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ claimLink: 'https://stren.app/claim/new-tok', expiresAt: '2026-07-19T00:00:00.000Z', emailDelivered: true }),
    })));
    const user = userEvent.setup();
    const writeText = mockClipboard();
    render(<SuccessState result={{ ...baseResult, emailDelivered: false }} onReturn={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Resend invitation/ }));
    await waitFor(() => expect(screen.queryByText(/invitation email failed to send/)).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Copy claim link/ }));
    expect(writeText).toHaveBeenCalledWith('https://stren.app/claim/new-tok');
  });
});
