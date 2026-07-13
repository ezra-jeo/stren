import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let currentSearch = 'mode=signin';
const pushMock = vi.fn();
const replaceMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: refreshMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const signInMock = vi.fn();
const resolveSignedInDestinationMock = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ signIn: signInMock, resolveSignedInDestination: resolveSignedInDestinationMock }),
}));

const signUpAccountMock = vi.fn();
const resolvePostAuthDestinationMock = vi.fn();
vi.mock('@/lib/auth-actions', () => ({
  signUpAccount: (...args: unknown[]) => signUpAccountMock(...args),
  resolvePostAuthDestination: (...args: unknown[]) => resolvePostAuthDestinationMock(...args),
}));

import AuthPage from '@/app/auth/page';

beforeEach(() => {
  currentSearch = 'mode=signin';
  pushMock.mockReset();
  replaceMock.mockReset();
  refreshMock.mockReset();
  signInMock.mockReset();
  resolveSignedInDestinationMock.mockReset();
  signUpAccountMock.mockReset();
  resolvePostAuthDestinationMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('/auth shared surface', () => {
  it('switches modes in place, hides the covered form, updates the URL, and preserves typed values', async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    const signInPane = screen.getByTestId('signin-pane');
    const signUpPane = screen.getByTestId('signup-pane');
    expect(signInPane).not.toHaveAttribute('inert');
    expect(signUpPane).toHaveAttribute('inert');

    const signInEmail = screen.getByLabelText('Email address', { selector: '#signin-email' });
    await user.type(signInEmail, 'alex@example.com');
    await user.click(screen.getAllByRole('button', { name: /create account/i })[0]);

    expect(pushMock).toHaveBeenCalledWith('/auth?mode=signup');
    expect(signInPane).toHaveAttribute('inert');
    expect(signUpPane).not.toHaveAttribute('inert');

    await user.type(screen.getByLabelText('Full name'), 'Alex Cruz');
    await user.click(screen.getAllByRole('button', { name: /^sign in$/i })[0]);

    expect(pushMock).toHaveBeenLastCalledWith('/auth?mode=signin');
    expect(signInEmail).toHaveValue('alex@example.com');
    expect(screen.getByLabelText('Full name')).toHaveValue('Alex Cruz');
  });

  it('shows an honest Google preview in both modes without starting authentication', async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    expect(screen.getAllByRole('button', { name: /continue with google.*coming soon/i, hidden: true })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /continue with google.*coming soon/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/google sign-in is coming soon/i);
    expect(signInMock).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('button', { name: /create account/i })[0]);
    await user.click(screen.getByRole('button', { name: /continue with google.*coming soon/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/google sign-in is coming soon/i);
    expect(signUpAccountMock).not.toHaveBeenCalled();
  });

  it('shows a generic accessible error for invalid credentials without clearing the email', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValue({ error: 'Invalid login credentials' });
    render(<AuthPage />);

    const email = screen.getByLabelText('Email address', { selector: '#signin-email' });
    await user.type(email, 'alex@example.com');
    await user.type(screen.getByLabelText('Password', { selector: '#signin-password' }), 'incorrect');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn’t sign you in. Check your email and password, then try again.");
    expect(email).toHaveValue('alex@example.com');
    expect(alert).toHaveFocus();
  });

  it('exits the setup state when post-auth destination resolution fails', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValue({ error: null, email: 'alex@example.com' });
    resolveSignedInDestinationMock.mockRejectedValue(new Error('destination unavailable'));
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email address', { selector: '#signin-email' }), 'alex@example.com');
    await user.type(screen.getByLabelText('Password', { selector: '#signin-password' }), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/signed in as alex@example.com.*couldn.t finish loading your account/i);
    expect(screen.queryByText(/setting things up for you/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });

  it('times out a stalled post-auth lookup instead of showing an infinite spinner', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    signInMock.mockResolvedValue({ error: null, email: 'alex@example.com' });
    resolveSignedInDestinationMock.mockImplementation(() => new Promise(() => {}));
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email address', { selector: '#signin-email' }), 'alex@example.com');
    await user.type(screen.getByLabelText('Password', { selector: '#signin-password' }), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/setting things up for you/i);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/signed in.*couldn.t finish loading your account/i);
    expect(screen.queryByText(/setting things up for you/i)).not.toBeInTheDocument();
  });

  it('recovers if the router does not complete after a destination is resolved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    signInMock.mockResolvedValue({ error: null, email: 'alex@example.com' });
    resolveSignedInDestinationMock.mockResolvedValue('/gyms');
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email address', { selector: '#signin-email' }), 'alex@example.com');
    await user.type(screen.getByLabelText('Password', { selector: '#signin-password' }), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(replaceMock).toHaveBeenCalledWith('/gyms');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });

    expect(screen.queryByText(/setting things up for you/i)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/navigation didn.t finish/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });

  it('returns a stalled credential exchange to an interactive form', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    signInMock.mockImplementation(() => new Promise(() => {}));
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email address', { selector: '#signin-email' }), 'alex@example.com');
    await user.type(screen.getByLabelText('Password', { selector: '#signin-password' }), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t sign you in/i);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
    expect(screen.queryByText(/setting things up for you/i)).not.toBeInTheDocument();
  });

  it('continues an authenticated registration directly to its resolved gym destination', async () => {
    const user = userEvent.setup();
    currentSearch = 'mode=signup';
    signUpAccountMock.mockResolvedValue({ error: null, status: 'authenticated' });
    resolvePostAuthDestinationMock.mockResolvedValue('/gyms');
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Full name'), 'Alex Cruz');
    await user.type(screen.getByLabelText('Email address', { selector: '#signup-email' }), 'alex@example.com');
    await user.type(screen.getByLabelText('Password', { selector: '#signup-password' }), 'hunter2!!');
    await user.type(screen.getByLabelText('Confirm password'), 'hunter2!!');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => expect(signUpAccountMock).toHaveBeenCalledWith({ name: 'Alex Cruz', email: 'alex@example.com', password: 'hunter2!!' }));
    await waitFor(() => expect(resolvePostAuthDestinationMock).toHaveBeenCalledWith(undefined));
    expect(replaceMock).toHaveBeenCalledWith('/gyms');
  });

  it('resolves a confirmed sign-in through the browser session and opens the owner surface', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValue({ error: null, email: 'owner@example.com' });
    resolveSignedInDestinationMock.mockResolvedValue('/admin');
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email address', { selector: '#signin-email' }), 'owner@example.com');
    await user.type(screen.getByLabelText('Password', { selector: '#signin-password' }), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(resolveSignedInDestinationMock).toHaveBeenCalledWith(undefined));
    expect(resolvePostAuthDestinationMock).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith('/admin');
  });

  it('shows an explicit verification state when the provider does not establish a session', async () => {
    const user = userEvent.setup();
    currentSearch = 'mode=signup';
    signUpAccountMock.mockResolvedValue({ error: null, status: 'verification_required' });
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Full name'), 'Alex Cruz');
    await user.type(screen.getByLabelText('Email address', { selector: '#signup-email' }), 'alex@example.com');
    await user.type(screen.getByLabelText('Password', { selector: '#signup-password' }), 'hunter2!!');
    await user.type(screen.getByLabelText('Confirm password'), 'hunter2!!');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/check your email/i);
    expect(resolvePostAuthDestinationMock).not.toHaveBeenCalled();
  });
});
