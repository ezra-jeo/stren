import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardProvider, useWizard } from '@/lib/onboarding/state';
import { MemberImportSection } from '@/components/superadmin/MemberImportSection';
import { CSV_TEMPLATE_HEADER } from '@/lib/onboarding/csv';

function Probe() {
  const { state } = useWizard();
  return <span data-testid="imported-count">{state.draft.importedMembers.length}</span>;
}

function renderSection() {
  render(
    <WizardProvider>
      <MemberImportSection />
      <Probe />
    </WizardProvider>,
  );
}

function csvFile(content: string, name = 'members.csv') {
  return new File([content], name, { type: 'text/csv' });
}

describe('MemberImportSection', () => {
  it('shows the optional upload prompt and template download by default', () => {
    renderSection();
    expect(screen.getByText(/Upload a CSV of members/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download template/ })).toBeInTheDocument();
  });

  it('imports all rows immediately when the file is fully valid', async () => {
    const user = userEvent.setup();
    renderSection();
    const file = csvFile(`${CSV_TEMPLATE_HEADER}\nJuan Dela Cruz,juan@example.com,09171234567`);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByTestId('imported-count').textContent).toBe('1'));
    expect(screen.getByText(/1 valid row/)).toBeInTheDocument();
  });

  it('blocks import and shows row-numbered errors when the file has invalid rows, until explicitly confirmed', async () => {
    const user = userEvent.setup();
    renderSection();
    const file = csvFile(`${CSV_TEMPLATE_HEADER}\n,bad-email,\nJuan Dela Cruz,juan@example.com,`);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByText(/1 invalid row/)).toBeInTheDocument());
    // Not imported yet — all-or-explicit-confirmation, no silent partial import.
    expect(screen.getByTestId('imported-count').textContent).toBe('0');
    expect(screen.getByText(/Row 2:/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Import 1 valid, skip 1 invalid/ }));
    await waitFor(() => expect(screen.getByTestId('imported-count').textContent).toBe('1'));
  });

  it('reports a clear error for a missing-column header without importing anything', async () => {
    const user = userEvent.setup();
    renderSection();
    const file = csvFile('full_name,contact\nJuan,09171234567');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByText(/Missing required column/)).toBeInTheDocument());
    expect(screen.getByTestId('imported-count').textContent).toBe('0');
  });
});

