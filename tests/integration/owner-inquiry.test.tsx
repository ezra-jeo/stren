import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OwnerInquiryPage from '@/app/for-gym-owners/page';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/for-gym-owners', () => {
  it('submits an assisted-onboarding inquiry and shows a clear success state', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<OwnerInquiryPage />);

    await user.type(screen.getByLabelText('Gym name'), 'Iron House');
    await user.type(screen.getByLabelText('Owner or manager name'), 'Alex Cruz');
    await user.type(screen.getByLabelText('Location'), 'Quezon City');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await user.type(screen.getByLabelText('Mobile number'), '+639171234567');
    await user.click(screen.getByRole('button', { name: /talk to our team/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/owner-inquiries', expect.objectContaining({ method: 'POST' })));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      gymName: 'Iron House',
      contactName: 'Alex Cruz',
      location: 'Quezon City',
      email: 'alex@example.com',
      mobile: '+639171234567',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/we’ll be in touch/i);
  });
});
