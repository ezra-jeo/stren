'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { LoadingScreen } from '@/components/ui/loading-screen';

type SessionState = 'verifying' | 'ready' | 'invalid';

function resolvePostResetPath(role: string | null | undefined): string {
  if (role === 'owner' || role === 'admin' || role === 'staff') return '/admin';
  return '/member/settings';
}

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { completePasswordSetup, signIn } = useAuth();

  const [sessionState, setSessionState] = useState<SessionState>('verifying');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Establish the Supabase session from the PKCE ?code= param (standard flow when
  // using createBrowserClient from @supabase/ssr) or from the implicit hash tokens
  // (#access_token=...&type=recovery) as a fallback for older Supabase configs.
  useEffect(() => {
    let active = true;

    async function bootstrap() {
      // 1. Try PKCE code (query param) first.
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      if (code) {
        // Strip the code from the URL so it can't be replayed on refresh.
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);

        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;

        if (exchangeError) {
          // exchangeCodeForSession can throw "code verifier not found" on a second
          // call (e.g. StrictMode double-mount). Check if we have a user anyway —
          // the SDK may have already set the session before the error was surfaced.
          const { data } = await supabase.auth.getUser();
          if (!active) return;
          setSessionState(data.user ? 'ready' : 'invalid');
          return;
        }

        setSessionState('ready');
        return;
      }

      // 2. Fallback: implicit hash flow (#access_token=...&type=recovery).
      // The auth-context hash handler also runs this path, but /reset-password is
      // in shouldSkipAuthBootstrap so auth-context won't bootstrap here — handle
      // the hash directly so this page is self-contained.
      const hash = window.location.hash;
      if (hash) {
        const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
        const accessToken = hashParams.get('access_token')?.trim();
        const refreshToken = hashParams.get('refresh_token')?.trim();
        const tokenType = hashParams.get('token_type')?.trim().toLowerCase();
        const linkType = hashParams.get('type')?.trim().toLowerCase();

        if (accessToken && refreshToken && tokenType === 'bearer' && linkType === 'recovery') {
          // Clear hash before async work to prevent replay on refresh.
          window.history.replaceState({}, '', window.location.pathname + window.location.search);

          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!active) return;
          setSessionState(sessionError ? 'invalid' : 'ready');
          return;
        }
      }

      // 3. No code or recovery hash — check if there's already a valid session
      // (e.g. user refreshed after the code was already exchanged).
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setSessionState(data.user ? 'ready' : 'invalid');
    }

    void bootstrap();
    return () => { active = false; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    const { data: currentUserData } = await supabase.auth.getUser();
    const { data, error: updateError } = await supabase.auth.updateUser({ password });

    // Supabase may return a 406 during password rotation (the password-change
    // confirmation email flow). The update still succeeds, so treat 406 as success.
    const isTransientRotationError =
      Boolean(updateError && 'status' in updateError && (updateError as { status?: number }).status === 406);

    if (updateError && !isTransientRotationError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }

    const signInEmail = currentUserData.user?.email ?? data.user?.email ?? '';
    const signInResult = signInEmail
      ? await signIn(signInEmail, password)
      : { error: 'Could not determine account email.', user: null, profile: null };

    if (signInResult.error) {
      setError(signInResult.error);
      setIsSubmitting(false);
      return;
    }

    const userId = signInResult.user?.id ?? data.user?.id ?? null;
    completePasswordSetup(userId);

    setSuccess(true);
    setIsSubmitting(false);

    const redirectPath = resolvePostResetPath(signInResult.profile?.role);
    setTimeout(() => {
      router.replace(redirectPath);
    }, 1200);
  }

  if (sessionState === 'verifying') {
    return <LoadingScreen />;
  }

  if (sessionState === 'invalid') {
    return (
      <div
        className="min-h-dvh flex items-center justify-center px-6"
        style={{ backgroundColor: 'var(--color-background)' }}
      >
        <div
          className="w-full max-w-md rounded-2xl border p-6 space-y-4"
          style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
        >
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Link expired or already used
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Password reset links can only be used once and expire after a short time.
            Please request a new reset link from your gym&apos;s login page.
          </p>
          <Link
            href="/gym-select"
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh flex items-center justify-center px-6"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Set Your Password
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Create a password so you can sign in with email + password next time.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              disabled={isSubmitting || success}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              disabled={isSubmitting || success}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}

          {success && (
            <p className="text-sm" style={{ color: '#16A34A' }}>
              Password updated! Redirecting...
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || success}
            className="w-full rounded-lg py-2.5 text-sm font-semibold"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
          >
            {isSubmitting ? 'Saving...' : 'Save Password'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/gym-select" className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
