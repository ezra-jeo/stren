import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

const refreshProfileMock = vi.fn();
const profile = {
  id: 'u1', name: 'Alex Cruz', email: 'alex@example.com', contactNumber: null,
};
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    profile,
    refreshProfile: refreshProfileMock,
  }),
}));

const eqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqMock }));
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ from: () => ({ update: updateMock }) }),
}));

import AccountProfilePage from '@/app/profile/page';

beforeEach(() => {
  refreshProfileMock.mockReset();
  updateMock.mockClear();
  eqMock.mockReset();
  eqMock.mockResolvedValue({ error: null });
});

it('lets a no-gym account update its own basic profile', async () => {
  const user = userEvent.setup();
  render(<AccountProfilePage />);
  expect(screen.getByRole('heading', { name: /your profile/i })).toBeInTheDocument();
  expect(screen.getByDisplayValue('alex@example.com')).toBeDisabled();
  await user.clear(screen.getByLabelText(/full name/i));
  await user.type(screen.getByLabelText(/full name/i), 'Alex Santos');
  await user.type(screen.getByLabelText(/mobile number/i), '09171234567');
  await user.click(screen.getByRole('button', { name: /save profile/i }));
  await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ name: 'Alex Santos', contact_number: '09171234567' }));
  expect(eqMock).toHaveBeenCalledWith('id', 'u1');
  expect(refreshProfileMock).toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent(/profile updated/i);
});
