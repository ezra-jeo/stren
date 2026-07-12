'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { resolvePostAuthDestination } from '@/lib/auth-actions';

function ResetPasswordContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const gymCode = searchParams.get('gym')?.trim() || null;
  const { completePasswordSetup, signIn, signOut } = useAuth();

  // Session bootstrap state
  const [verifying, setVerifying] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Single account login now; carry the gym flavor through as `?gym=CODE`.
  const loginHref = gymCode ? `/login?gym=${encodeURIComponent(gymCode)}` : '/login';

  // Exchange the PKCE ?code= (or legacy hash tokens) for a live session on mount.
  // updateUser() requires an active session — nothing works without this step.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      if (code) {
        // PKCE recovery flow: exchange the one-time code for a session.
        // Ignore "code already used" errors — detectSessionInUrl may have auto-exchanged it.
        await supabase.auth.exchangeCodeForSession(code);
        // Clean the code from the URL so a refresh doesn't re-attempt the exchange.
        const clean = new URL(window.location.href);
        clean.searchParams.delete('code');
        window.history.replaceState({}, '', clean.toString());
      } else if (window.location.hash.includes('access_token')) {
        // Legacy implicit/hash flow (kept for future config flexibility).
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hash.get('access_token') ?? '';
        const refreshToken = hash.get('refresh_token') ?? '';
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }

      // After the exchange (or if a session already existed), check for a user.
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (data.user) {
        setSessionReady(true);
      }
      setVerifying(false);
    }

    bootstrap();
    return () => { cancelled = true; };
  }, [supabase]);

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

    const isTransientPasswordRotationError = Boolean(
      updateError && 'status' in updateError && (updateError as { status?: number }).status === 406,
    );
    if (updateError && !isTransientPasswordRotationError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }

    const signInEmail = currentUserData.user?.email ?? data.user?.email ?? '';
    const signInResult = signInEmail
      ? await signIn(signInEmail, password)
      : { error: 'Missing user email.' };

    if (signInResult.error) {
      setError(signInResult.error);
      setIsSubmitting(false);
      return;
    }

    completePasswordSetup(data.user?.id ?? null);

    setSuccess(true);
    setIsSubmitting(false);

    const destination = await resolvePostAuthDestination(gymCode ?? undefined);

    setTimeout(() => {
      router.replace(destination);
    }, 1200);
  }

  // ── Loading state while exchanging the code ───────────────────────────────
  if (verifying) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6" style={{ backgroundColor: 'var(--color-background)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Verifying reset link…
        </p>
      </div>
    );
  }

  // ── Invalid / expired link ────────────────────────────────────────────────
  if (!sessionReady) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="w-full max-w-md rounded-2xl border p-6" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Invalid or Expired Link
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            This password reset link has expired or already been used. Please request a new one from the login page.
          </p>
          <div className="mt-5">
            <Link
              href={loginHref}
              className="inline-block rounded-lg px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Password form ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh flex items-center justify-center px-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md rounded-2xl border p-6" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Set Your Password
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Create a password so you can sign in with email + password next time.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
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
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
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
              Password updated. Redirecting you now…
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
          <Link href={loginHref} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
