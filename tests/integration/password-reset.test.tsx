import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let currentSearch = '';
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const fetchMock = vi.fn();
const completePasswordSetupMock = vi.fn();

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ completePasswordSetup: completePasswordSetupMock }),
}));

import ResetPasswordPage from '@/app/reset-password/page';

beforeEach(() => {
  currentSearch = '';
  replaceMock.mockReset();
  completePasswordSetupMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('/reset-password', () => {
  it('starts with an email request instead of an unvalidated new-password form', async () => {
    render(<ResetPasswordPage />);

    expect(await screen.findByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('type', 'email');
    expect(screen.getByRole('button', { name: /send reset instructions/i })).toBeEnabled();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits the email and shows the same generic response for every account', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      message: 'If an account exists for this email, we’ve sent password-reset instructions.',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'alex@example.com');
    await user.click(screen.getByRole('button', { name: /send reset instructions/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/if an account exists.*sent password-reset instructions/i);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/password-reset', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'alex@example.com' }),
    }));
  });

  it('accepts a new password only after the server validates a recovery proof', async () => {
    const user = userEvent.setup();
    currentSearch = 'reset=1';
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, userId: 'user-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    render(<ResetPasswordPage />);

    expect(await screen.findByRole('heading', { name: /choose a new password/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'new-password-123');
    await user.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByRole('heading', { name: /password reset complete/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/password-reset/complete', {
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/password-reset/complete', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ password: 'new-password-123' }),
    }));
    expect(completePasswordSetupMock).toHaveBeenCalledWith('user-1');
    expect(screen.getByRole('link', { name: /sign in with your new password/i })).toHaveAttribute('href', '/auth?mode=signin');
  });

  it('does not unlock the reset form for an ordinary authenticated session without a recovery proof', async () => {
    currentSearch = 'reset=1';
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid recovery proof.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    render(<ResetPasswordPage />);

    expect(await screen.findByRole('heading', { name: /invalid or expired reset link/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument();
  });

  it('shows a safe recovery option for an invalid or expired link', async () => {
    currentSearch = 'error=invalid_or_expired';
    render(<ResetPasswordPage />);

    expect(await screen.findByRole('heading', { name: /invalid or expired reset link/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new reset link/i })).toHaveAttribute('href', '/reset-password');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
