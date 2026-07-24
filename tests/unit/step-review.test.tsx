import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { WizardProvider, useWizard } from '@/lib/onboarding/state';
import { StepReview } from '@/components/superadmin/steps/StepReview';

function Seed() {
  const { dispatch } = useWizard();
  useEffect(() => {
    dispatch({ type: 'setGym', patch: { gymName: 'Iron Fitness', address: 'Quezon City', slug: 'iron-fitness' } });
    dispatch({ type: 'setOwner', patch: { name: 'Jane Owner', email: 'jane@example.com', mobile: '+639171234567', consentMethod: 'in_person' } });
  }, [dispatch]);
  return null;
}

function CurrentStepProbe() {
  const { state } = useWizard();
  return <span data-testid="current-step">{state.currentStep}</span>;
}

function renderStep(onBack = vi.fn(), onSaveDraft = vi.fn(), onFinished = vi.fn()) {
  render(
    <WizardProvider>
      <Seed />
      <StepReview onBack={onBack} onSaveDraft={onSaveDraft} onFinished={onFinished} />
      <CurrentStepProbe />
    </WizardProvider>,
  );
  return { onBack, onSaveDraft, onFinished };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ gymId: 'gym-1', gymName: 'Iron Fitness', gymCode: 'iron-fitness', ownerEmail: 'jane@example.com', expiresAt: '2026-07-18T00:00:00.000Z', deliveryStatus: 'sent' }),
  })));
});

describe('StepReview', () => {
  it('renders summaries for gym, owner, plans, hours, access, and import (skipped by default)', () => {
    renderStep();
    expect(screen.getByText('Iron Fitness')).toBeInTheDocument();
    expect(screen.getByText('Jane Owner')).toBeInTheDocument();
    expect(screen.getByText(/Skipped/)).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();
  });

  it('clicking a review row navigates back to its owning step', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByText('Owner & Staff').closest('button')!);
    expect(screen.getByTestId('current-step').textContent).toBe('ownerStaff');
  });

  it('Finish setup calls the provision API and reports success via onFinished', async () => {
    const user = userEvent.setup();
    const { onFinished } = renderStep();
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(expect.objectContaining({ gymId: 'gym-1', deliveryStatus: 'sent' })));
  });

  it('generates one idempotency key and reuses it on a retried submission', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const firstBody = JSON.parse((fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body as string);

    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const secondBody = JSON.parse((fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[1][1].body as string);

    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);
  });

  it('shows a plain-language error and does not call onFinished when provisioning fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'That gym code is already taken' }) })));
    const user = userEvent.setup();
    const { onFinished } = renderStep();
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That gym code is already taken');
    expect(onFinished).not.toHaveBeenCalled();
  });
});
