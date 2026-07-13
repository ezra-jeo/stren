'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

function RecoveryPasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-(--color-text-primary)">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={8}
          required
          disabled={disabled}
          className="min-h-12 w-full rounded-xl border px-4 pr-20 outline-none focus:border-(--color-primary) focus:ring-3 focus:ring-(--color-primary-glow)"
          style={{ borderColor: 'var(--color-surface)' }}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          className="absolute inset-y-0 right-0 min-w-16 px-3 text-xs font-semibold text-(--color-text-secondary)"
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const gymCode = searchParams.get('gym')?.trim() || null;
  const recoveryError = searchParams.get('error');
  const recoveryRequested = searchParams.get('reset') === '1' || searchParams.has('code') || Boolean(recoveryError);
  const recoveryConfigurationError = recoveryError === 'recovery_not_configured';
  const { completePasswordSetup } = useAuth();

  const [resetEmail, setResetEmail] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [verifying, setVerifying] = useState(recoveryRequested);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const loginHref = gymCode
    ? `/auth?mode=signin&gym=${encodeURIComponent(gymCode)}`
    : '/auth?mode=signin';

  useEffect(() => {
    if (!recoveryRequested) return;
    let cancelled = false;

    async function bootstrap() {
      if (recoveryError) {
        setVerifying(false);
        return;
      }
      try {
        const response = await fetch('/api/auth/password-reset/complete', { cache: 'no-store' });
        if (!cancelled) setSessionReady(response.ok);
      } catch {
        if (!cancelled) setSessionReady(false);
      } finally {
        if (!cancelled) setVerifying(false);
      }
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [recoveryError, recoveryRequested]);

  async function handleResetRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestSubmitting) return;
    setRequestSubmitting(true);
    setRequestError('');
    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase() }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setRequestError(payload.error || 'We couldn’t request a password reset right now. Please try again.');
        return;
      }
      setRequestSent(true);
    } catch {
      setRequestError('We couldn’t request a password reset right now. Check your connection and try again.');
    } finally {
      setRequestSubmitting(false);
    }
  }

  async function handlePasswordUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/password-reset/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; userId?: string };
      if (!response.ok) {
        if (response.status === 401) setSessionReady(false);
        else setError(payload.error || 'We couldn’t update your password. Request a new reset link and try again.');
        return;
      }
      completePasswordSetup(payload.userId ?? null);
      setSuccess(true);
    } catch {
      setError('We couldn’t update your password. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!recoveryRequested) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-5 py-10" style={{ backgroundColor: 'var(--color-background)' }}>
        <section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: 'var(--color-surface)' }}>
          <h1 className="font-serif text-3xl font-semibold text-(--color-text-primary)">Reset your password</h1>
          <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">Enter the email address for your Stren account and we’ll send secure reset instructions.</p>
          {requestSent ? (
            <div role="status" className="mt-6 rounded-xl border p-4 text-sm leading-6 text-(--color-text-primary)" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-primary)' }}>
              If an account exists for this email, we’ve sent password-reset instructions.
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={handleResetRequest}>
              <div>
                <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-(--color-text-primary)">Email address</label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  disabled={requestSubmitting}
                  required
                  className="min-h-12 w-full rounded-xl border px-4 outline-none focus:border-(--color-primary) focus:ring-3 focus:ring-(--color-primary-glow)"
                  style={{ borderColor: 'var(--color-surface)' }}
                />
              </div>
              {requestError && <p role="alert" className="rounded-xl border border-(--color-danger) bg-(--color-danger-bg) px-3 py-2 text-sm text-(--color-text-primary)">{requestError}</p>}
              <button type="submit" disabled={requestSubmitting} aria-busy={requestSubmitting} className="min-h-12 w-full rounded-xl bg-(--color-primary) font-semibold text-white disabled:opacity-60">
                {requestSubmitting ? 'Sending instructions…' : 'Send reset instructions'}
              </button>
            </form>
          )}
          <Link href={loginHref} className="mt-5 block text-center text-sm font-medium text-(--color-primary-dark)">Back to sign in</Link>
        </section>
      </main>
    );
  }

  if (verifying) {
    return <main className="min-h-dvh grid place-items-center bg-(--color-background) px-5"><p role="status" className="text-sm text-(--color-text-secondary)">Verifying reset link…</p></main>;
  }

  if (recoveryConfigurationError) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-(--color-background) px-5 py-10">
        <section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: 'var(--color-surface)' }}>
          <h1 className="font-serif text-3xl font-semibold text-(--color-text-primary)">Password recovery is unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">Stren could not validate this recovery link because server-side recovery is not configured. Please contact Stren support.</p>
          <Link href={loginHref} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-(--color-primary) px-5 font-semibold text-white">Back to sign in</Link>
        </section>
      </main>
    );
  }

  if (!sessionReady) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-(--color-background) px-5 py-10">
        <section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: 'var(--color-surface)' }}>
          <h1 className="font-serif text-3xl font-semibold text-(--color-text-primary)">Invalid or expired reset link</h1>
          <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">This reset link has expired or already been used. Request a new link to continue.</p>
          <Link href="/reset-password" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-(--color-primary) px-5 font-semibold text-white">Request a new reset link</Link>
        </section>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-(--color-background) px-5 py-10">
        <section className="w-full max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm sm:p-8" style={{ borderColor: 'var(--color-surface)' }}>
          <h1 className="font-serif text-3xl font-semibold text-(--color-text-primary)">Password reset complete</h1>
          <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">Your reset link has been used. Sign in with your new password to continue.</p>
          <Link href={loginHref} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-(--color-primary) px-5 font-semibold text-white">Sign in with your new password</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-(--color-background) px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: 'var(--color-surface)' }}>
        <h1 className="font-serif text-3xl font-semibold text-(--color-text-primary)">Choose a new password</h1>
        <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">Use at least 8 characters. This reset link can be used only once.</p>
        <form onSubmit={handlePasswordUpdate} className="mt-6 space-y-4">
          <RecoveryPasswordField id="new-password" label="New password" value={password} onChange={setPassword} disabled={isSubmitting} />
          <RecoveryPasswordField id="confirm-password" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} disabled={isSubmitting} />
          {error && <p role="alert" className="rounded-xl border border-(--color-danger) bg-(--color-danger-bg) px-3 py-2 text-sm text-(--color-text-primary)">{error}</p>}
          <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="min-h-12 w-full rounded-xl bg-(--color-primary) font-semibold text-white disabled:opacity-60">
            {isSubmitting ? 'Saving new password…' : 'Save new password'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-(--color-background)" aria-label="Loading password reset" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
