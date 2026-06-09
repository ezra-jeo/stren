import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/components/auth/LoginForm';
import { GymSignUpForm } from '@/components/auth/GymSignUpForm';

const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

const signInMock = vi.fn();
const signOutMock = vi.fn();
const signUpMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const upsertMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    signIn: signInMock,
    signOut: signOutMock,
  }),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      signUp: signUpMock,
      signInWithPassword: signInWithPasswordMock,
    },
    from: () => ({
      upsert: upsertMock,
    }),
  }),
}));

describe('Gym auth flows', () => {
  beforeEach(() => {
    routerMock.push.mockReset();
    routerMock.replace.mockReset();
    routerMock.refresh.mockReset();
    signInMock.mockReset();
    signOutMock.mockReset();
    signUpMock.mockReset();
    signInWithPasswordMock.mockReset();
    upsertMock.mockReset();
  });

  it('keeps the user on the gym login page and clears the password after invalid credentials', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValue({
      error: 'Invalid login credentials',
      user: null,
      profile: null,
    });

    render(<LoginForm gymCode="iron-house" />);

    await user.type(screen.getByLabelText(/email/i), 'member@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid login credentials/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/password/i)).toHaveValue('');
    });
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('navigates directly to member home after gym sign-up succeeds', async () => {
    const user = userEvent.setup();
    signUpMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    signInWithPasswordMock.mockResolvedValue({ error: null });
    upsertMock.mockResolvedValue({ error: null });

    render(<GymSignUpForm gymCode="iron-house" gymId="gym-1" />);

    await user.type(screen.getByPlaceholderText(/juan dela cruz/i), 'Juan Dela Cruz');
    await user.type(screen.getByPlaceholderText(/you@example.com/i), 'juan@example.com');
    await user.type(screen.getByPlaceholderText(/\*\*\*\*\*\*\*\*/i), 'strong-password');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith('/member');
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});