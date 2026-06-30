'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isValidLoginOrigin } from '@/lib/login-origin';

const LOGIN_ORIGIN_STORAGE_KEY = 'stren.auth.loginOriginPath';

function getReadableAuthError(error: string): string {
  const normalized = error.trim().toLowerCase()
  if (!normalized) return 'Your login link could not be verified. Please request a new one.'
  if (normalized.includes('expired')) return 'Your login link has expired. Please request a new one.'
  if (normalized.includes('invalid') || normalized.includes('code')) {
    return 'Your login link is invalid or already used. Please request a new one.'
  }
  if (normalized.includes('missing_code')) return 'Login code is missing. Please open the full login link from your email.'
  if (normalized.includes('no_user')) return 'Login was completed, but your account could not be loaded. Please try again.'
  if (normalized.includes('profile_unavailable')) return 'Your member profile was not found or is inactive. Please contact gym staff.'
  if (normalized.includes('pending_approval')) return 'Your account is still pending approval.'
  return 'Your login link could not be verified. Please request a new one.'
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams.get('error')?.trim() ?? ''

  useEffect(() => {
    if (authError) {
      return;
    }

    const gym = searchParams.get('gym')?.trim();
    if (gym) {
      router.replace(`/gym/${encodeURIComponent(gym)}/login`);
      return;
    }

    // Prefer the cookie written by middleware (authoritative), fall back to localStorage.
    const cookieOrigin = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${LOGIN_ORIGIN_STORAGE_KEY}=`))
      ?.split('=')[1];

    const candidateOrigin = cookieOrigin
      ? decodeURIComponent(cookieOrigin)
      : (() => {
          try {
            return window.localStorage.getItem(LOGIN_ORIGIN_STORAGE_KEY);
          } catch {
            return null;
          }
        })();

    if (candidateOrigin && isValidLoginOrigin(candidateOrigin)) {
      router.replace(candidateOrigin);
      return;
    }

    router.replace('/gym-select');
  }, [authError, router, searchParams]);

  if (authError) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="w-full max-w-md rounded-xl border p-6" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Login Link Error
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {getReadableAuthError(authError)}
          </p>
          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Error code: {authError}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.replace('/gym-select')}
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
            >
              Go to Gym Login
            </button>
            <button
              type="button"
              onClick={() => router.replace('/landing')}
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
            >
              Back to Landing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Redirecting to gym login...
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
