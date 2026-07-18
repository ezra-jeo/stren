import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardProvider } from '@/lib/onboarding/state';
import { StepOwnerStaff } from '@/components/superadmin/steps/StepOwnerStaff';

function renderStep(onContinue = vi.fn(), onBack = vi.fn(), onSaveDraft = vi.fn()) {
  render(
    <WizardProvider>
      <StepOwnerStaff onContinue={onContinue} onBack={onBack} onSaveDraft={onSaveDraft} />
    </WizardProvider>,
  );
  return { onContinue, onBack, onSaveDraft };
}

function mockEmailCheck(response: object) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => response })));
}

beforeEach(() => {
  mockEmailCheck({ exists: false, ownsOrManagesGymCount: 0, pendingInvite: null });
});

describe('StepOwnerStaff', () => {
  it('blocks Continue until owner name, email, PH mobile, and consent are valid', async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStep();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('rejects an invalid PH mobile number and accepts a valid one', async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStep();

    await user.type(screen.getByLabelText('Full name'), 'Jane Owner');
    await user.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await user.type(screen.getByLabelText('Philippine mobile number'), '12345');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).not.toHaveBeenCalled();
    expect(await screen.findByText(/Enter a valid PH mobile number/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Philippine mobile number'));
    await user.type(screen.getByLabelText('Philippine mobile number'), '09171234567');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it('surfaces a banner when the owner email already belongs to an existing account', async () => {
    mockEmailCheck({ exists: true, ownsOrManagesGymCount: 0, pendingInvite: null });
    const user = userEvent.setup();
    renderStep();
    await user.type(screen.getByLabelText('Email address'), 'existing@example.com');
    expect(await screen.findByText(/existing Stren account/)).toBeInTheDocument();
  });

  it('surfaces a banner when the owner email already manages other gyms', async () => {
    mockEmailCheck({ exists: true, ownsOrManagesGymCount: 2, pendingInvite: null });
    const user = userEvent.setup();
    renderStep();
    await user.type(screen.getByLabelText('Email address'), 'multi@example.com');
    expect(await screen.findByText(/already manages 2 other gyms/)).toBeInTheDocument();
  });

  it('surfaces a banner when a pending claim invite already exists for the email', async () => {
    mockEmailCheck({ exists: true, ownsOrManagesGymCount: 0, pendingInvite: { gymName: 'Iron Fitness', expiresAt: new Date().toISOString() } });
    const user = userEvent.setup();
    renderStep();
    await user.type(screen.getByLabelText('Email address'), 'pending@example.com');
    expect(await screen.findByText(/pending claim invitation for Iron Fitness/)).toBeInTheDocument();
  });

  it('adds and removes staff entries', async () => {
    const user = userEvent.setup();
    renderStep();
    expect(screen.queryByText('Staff member 1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add staff/ }));
    expect(screen.getByText('Staff member 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove staff member 1' }));
    expect(screen.queryByText('Staff member 1')).not.toBeInTheDocument();
  });

  it('rejects a staff email that duplicates the owner email', async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStep();

    await user.type(screen.getByLabelText('Full name'), 'Jane Owner');
    await user.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await user.type(screen.getByLabelText('Philippine mobile number'), '09171234567');

    await user.click(screen.getByRole('button', { name: /Add staff/ }));
    await user.type(screen.getByLabelText('Full name', { selector: '#staff-0-name' }), 'Staff One');
    await user.type(screen.getByLabelText('Email', { selector: '#staff-0-email' }), 'jane@example.com');

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('calls onBack and onSaveDraft', async () => {
    const user = userEvent.setup();
    const { onBack, onSaveDraft } = renderStep();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onBack).toHaveBeenCalled();
    expect(onSaveDraft).toHaveBeenCalled();
  });
});
