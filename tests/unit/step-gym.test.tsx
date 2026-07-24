import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardProvider } from '@/lib/onboarding/state';
import { StepGym } from '@/components/superadmin/steps/StepGym';

function renderStep(onContinue = vi.fn(), onSaveDraft = vi.fn()) {
  render(
    <WizardProvider>
      <StepGym onContinue={onContinue} onSaveDraft={onSaveDraft} />
    </WizardProvider>,
  );
  return { onContinue, onSaveDraft };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ available: true, normalized: 'iron-fitness' }) })));
});

describe('StepGym', () => {
  it('blocks Continue until required fields (name, address, valid slug) are filled', async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStep();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('auto-generates a slug from the gym name and lets it be edited', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.type(screen.getByLabelText('Gym name'), 'Iron Fitness Gym');
    const slugInput = screen.getByLabelText('Gym URL');
    await waitFor(() => expect(slugInput).toHaveValue('iron-fitness-gym'));

    await user.clear(slugInput);
    await user.type(slugInput, 'custom-url');
    expect(slugInput).toHaveValue('custom-url');
  });

  it('advances to the next step once all required fields are valid', async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStep();

    await user.type(screen.getByLabelText('Gym name'), 'Iron Fitness Gym');
    await user.type(screen.getByLabelText(/Full location/), 'Quezon City');
    await waitFor(() => expect(screen.getByLabelText('Gym URL')).toHaveValue('iron-fitness-gym'));

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it('calls onSaveDraft when Save draft is pressed', async () => {
    const user = userEvent.setup();
    const { onSaveDraft } = renderStep();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSaveDraft).toHaveBeenCalled();
  });

  it('shows the Stren logo fallback when no logo is uploaded', () => {
    renderStep();
    expect(screen.getByAltText('Gym logo preview')).toHaveAttribute('src', '/stren-logo.png');
  });
});

