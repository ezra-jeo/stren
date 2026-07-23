import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let authState: { user: { id: string; email?: string } | null; isLoading: boolean } = { user: null, isLoading: false };
const push = vi.fn();

vi.mock('@/lib/auth-context', () => ({ useAuth: () => authState }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { ClaimConfirmClient } from '@/components/superadmin/ClaimConfirmClient';

beforeEach(() => {
  push.mockClear();
  authState = { user: null, isLoading: false };
});

describe('ClaimConfirmClient — signed out', () => {
  it('offers sign-in and create-account paths instead of a claim button', () => {
    render(<ClaimConfirmClient token="tok" gymName="Iron Fitness" invitedEmail="ja***@example.com" />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth?mode=signin&next=%2Fclaim%2Ftok');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/auth?mode=signup&next=%2Fclaim%2Ftok');
    expect(screen.queryByRole('button', { name: /Claim ownership/ })).not.toBeInTheDocument();
  });
});

describe('ClaimConfirmClient — signed in, matching email', () => {
  it('shows the explicit claim confirmation and redirects to /admin on success', async () => {
    authState = { user: { id: 'u1', email: 'jane@example.com' }, isLoading: false };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ gymId: 'gym-1' }) })));
    const user = userEvent.setup();
    render(<ClaimConfirmClient token="tok" gymName="Iron Fitness" invitedEmail="jane@example.com" />);

    const button = screen.getByRole('button', { name: 'Claim ownership of Iron Fitness' });
    await user.click(button);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin'));
  });

  it('shows a plain-language error and does not redirect when the claim fails', async () => {
    authState = { user: { id: 'u1', email: 'jane@example.com' }, isLoading: false };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'This invitation has expired.' }) })));
    const user = userEvent.setup();
    render(<ClaimConfirmClient token="tok" gymName="Iron Fitness" invitedEmail="jane@example.com" />);

    await user.click(screen.getByRole('button', { name: 'Claim ownership of Iron Fitness' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This invitation has expired.');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('ClaimConfirmClient — signed in, different email', () => {
  it('warns which email the invite targets before allowing the claim', () => {
    authState = { user: { id: 'u1', email: 'someone-else@example.com' }, isLoading: false };
    render(<ClaimConfirmClient token="tok" gymName="Iron Fitness" invitedEmail="jane@example.com" />);
    expect(screen.getByText(/invitation was sent to jane@example.com/)).toBeInTheDocument();
  });
});
