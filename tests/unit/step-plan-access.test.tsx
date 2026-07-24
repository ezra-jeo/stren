import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardProvider } from '@/lib/onboarding/state';
import { StepPlanAccess } from '@/components/superadmin/steps/StepPlanAccess';

function renderStep(onContinue = vi.fn(), onBack = vi.fn(), onSaveDraft = vi.fn()) {
  render(
    <WizardProvider>
      <StepPlanAccess onContinue={onContinue} onBack={onBack} onSaveDraft={onSaveDraft} />
    </WizardProvider>,
  );
  return { onContinue, onBack, onSaveDraft };
}

describe('StepPlanAccess — membership plans', () => {
  it('starts with one prefilled default plan and advances on Continue', async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStep();
    expect(screen.getByText('Plan 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it('adds a second plan and allows removing the first', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('button', { name: /Add plan/ }));
    expect(screen.getByText('Plan 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove plan 1' }));
    expect(screen.queryByText('Plan 2')).not.toBeInTheDocument(); // renumbered to Plan 1
    expect(screen.getByText('Plan 1')).toBeInTheDocument();
  });

  it('refuses to remove the last remaining plan', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('button', { name: 'Remove plan 1' }));
    expect(screen.getByText('Plan 1')).toBeInTheDocument();
  });

  it('blocks Continue when the plan name is blank', async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStep();
    const nameInput = screen.getByLabelText('Plan name') as HTMLInputElement;
    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).not.toHaveBeenCalled();
  });
});

describe('StepPlanAccess — operating hours', () => {
  it('defaults every day to 05:00-22:00 and open', () => {
    renderStep();
    expect(screen.getByLabelText('Monday opening time')).toHaveValue('05:00');
    expect(screen.getByLabelText('Monday closing time')).toHaveValue('22:00');
  });

  it('blocks Continue when every day is marked closed', async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStep();
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      await user.click(screen.getByLabelText(`${day} open`));
    }
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("copies one day's hours to selected target days", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.clear(screen.getByLabelText('Monday opening time'));
    await user.type(screen.getByLabelText('Monday opening time'), '08:00');

    const tuesdayRow = screen.getByLabelText('Tuesday open').closest('div')!;
    await user.click(within(tuesdayRow).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Copy to selected days' }));

    expect(screen.getByLabelText('Tuesday opening time')).toHaveValue('08:00');
  });
});

describe('StepPlanAccess — access switches', () => {
  it('renders only the approved access switches with documented defaults', () => {
    renderStep();
    expect(screen.getByLabelText('Enable kiosk check-in')).toBeChecked();
    expect(screen.getByLabelText('Generate member invite QR')).toBeChecked();
    expect(screen.getByLabelText('Allow staff manual check-in')).toBeChecked();
    expect(screen.getByLabelText('Enable occupancy count')).toBeChecked();
    expect(screen.queryByLabelText(/Auto-approve/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/membership for check-in/)).not.toBeInTheDocument();
  });
});
