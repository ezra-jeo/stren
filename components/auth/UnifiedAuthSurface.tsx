'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { resolvePostAuthDestination, signUpAccount } from '@/lib/auth-actions';
import { readableAuthError } from '@/lib/auth-error-copy';
import { withTimeout } from '@/lib/async-guard';
import { createClient } from '@/lib/supabase';
import styles from './unified-auth.module.css';

type AuthMode = 'signin' | 'signup';
type Submission = AuthMode | 'google';

function GoogleButton({
  id,
  disabled,
  submitting,
  error,
  onGoogleSignIn,
}: {
  id: string;
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onGoogleSignIn: () => void;
}) {
  return (
    <div className={styles.googleGroup}>
      <button
        type="button"
        className={styles.googleButton}
        aria-label="Continue with Google"
        aria-describedby={error ? id : undefined}
        aria-busy={submitting}
        disabled={disabled}
        onClick={onGoogleSignIn}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h6a5.1 5.1 0 0 1-2.2 3.3v2.7h3.6c2.1-2 3.2-4.8 3.2-7.9Z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.9l-3.6-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.8A11.2 11.2 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.7 13.9a6.7 6.7 0 0 1 0-4.3V6.8H2A11 11 0 0 0 2 16.7l3.7-2.8Z" />
          <path fill="#EA4335" d="M12 5c1.7 0 3.2.6 4.4 1.7l3.2-3.1A10.7 10.7 0 0 0 2 6.8l3.7 2.8C6.6 7 9.1 5 12 5Z" />
        </svg>
        <span>{submitting ? 'Connecting to Google...' : 'Continue with Google'}</span>
      </button>
      {error && <p id={id} role="alert" className={styles.googleError}>{error}</p>}
      <div className={styles.emailDivider}><span>or continue with email</span></div>
    </div>
  );
}

function modeFrom(value: string | null): AuthMode {
  return value === 'signup' ? 'signup' : 'signin';
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.fieldGroup}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.passwordWrap}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={8}
          disabled={disabled}
          required
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          disabled={disabled}
          className={styles.visibilityButton}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export function UnifiedAuthSurface() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, resolveSignedInDestination } = useAuth();
  const queryMode = modeFrom(searchParams.get('mode'));
  const gymCode = searchParams.get('gym')?.trim() || undefined;
  const [mode, setMode] = useState<AuthMode>(queryMode);
  const [hydrated, setHydrated] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signInError, setSignInError] = useState<string | null>(() => readableAuthError(searchParams.get('error')));
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Submission | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [postAuthError, setPostAuthError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const signInEmailRef = useRef<HTMLInputElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const signInErrorRef = useRef<HTMLDivElement>(null);
  const signUpErrorRef = useRef<HTMLDivElement>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postAuthSourceRef = useRef<'browser' | 'server'>('browser');
  const authenticatedEmailRef = useRef<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    return () => {
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setMode(queryMode);
  }, [queryMode]);

  useEffect(() => {
    if (signInError) signInErrorRef.current?.focus();
  }, [signInError]);

  useEffect(() => {
    if (signUpError) signUpErrorRef.current?.focus();
  }, [signUpError]);

  async function finishAuthentication(source = postAuthSourceRef.current) {
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    setPostAuthError(null);
    setSettingUp(true);
    try {
      const destination = await withTimeout(
        source === 'browser' ? resolveSignedInDestination(gymCode) : resolvePostAuthDestination(gymCode),
        10_000,
        'Loading your account timed out.',
      );
      router.replace(destination);
      router.refresh();
      navigationTimerRef.current = setTimeout(() => {
        setSettingUp(false);
        setSubmitting(null);
        setPostAuthError(`${authenticatedEmailRef.current ? `You’re signed in as ${authenticatedEmailRef.current}, but` : 'You’re signed in, but'} navigation didn’t finish. Please try again.`);
      }, 10_000);
    } catch {
      setSettingUp(false);
      setSubmitting(null);
      setPostAuthError(`${authenticatedEmailRef.current ? `You’re signed in as ${authenticatedEmailRef.current}, but` : 'You’re signed in, but'} we couldn’t finish loading your account. Please try again.`);
    }
  }

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSignInError(null);
    setGoogleError(null);
    setSubmitting('signin');
    let result: { error: string | null; email?: string };
    try {
      result = await withTimeout(
        signIn(signInEmail.trim(), signInPassword),
        10_000,
        'Sign in timed out.',
      );
    } catch {
      setSignInError('We couldn’t sign you in. Please check your connection and try again.');
      setSubmitting(null);
      return;
    }
    if (result.error) {
      setSignInError('We couldn’t sign you in. Check your email and password, then try again.');
      setSubmitting(null);
      return;
    }
    const confirmedEmail = result.email ?? signInEmail.trim().toLowerCase();
    authenticatedEmailRef.current = confirmedEmail;
    postAuthSourceRef.current = 'browser';
    await finishAuthentication('browser');
  }

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSignUpError(null);
    setGoogleError(null);
    if (signUpPassword !== confirmPassword) {
      setSignUpError('Passwords do not match.');
      return;
    }
    setSubmitting('signup');
    const result = await signUpAccount({ name: fullName, email: signUpEmail, password: signUpPassword });
    if (result.error) {
      setSignUpError(result.error);
      setSubmitting(null);
      return;
    }
    if (result.status === 'verification_required') {
      setVerificationEmail(signUpEmail.trim());
      setSubmitting(null);
      return;
    }
    authenticatedEmailRef.current = signUpEmail.trim().toLowerCase();
    postAuthSourceRef.current = 'server';
    await finishAuthentication('server');
  }

  async function handleGoogleSignIn() {
    if (!hydrated || transitioning || submitting) return;
    setGoogleError(null);
    setSignInError(null);
    setSignUpError(null);
    setSubmitting('google');
    try {
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('flow', 'google');
      if (gymCode) callback.searchParams.set('gym', gymCode);
      const { data, error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback.toString() },
      });
      if (error || !data.url) throw error ?? new Error('Google sign-in could not start.');
    } catch {
      setGoogleError('We could not start Google sign-in. Please try again.');
      setSubmitting(null);
    }
  }

  function switchMode(next: AuthMode) {
    if (next === mode || transitioning || submitting) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const params = new URLSearchParams(searchParams.toString());
    params.set('mode', next);
    params.delete('error');
    setMode(next);
    router.push(`/auth?${params.toString()}`);

    const settle = () => {
      setTransitioning(false);
      (next === 'signin' ? signInEmailRef : fullNameRef).current?.focus();
    };
    if (reducedMotion) {
      settle();
      return;
    }
    setTransitioning(true);
    window.setTimeout(settle, 600);
  }

  return (
    <main className={styles.page}>
      <Link href="/landing" className={styles.backLink}>
        <Image src="/stren-logo.png" alt="" width={28} height={28} />
        <span>Stren</span>
      </Link>

      <div className={`${styles.card} ${mode === 'signup' ? styles.signupMode : ''}`} data-mode={mode}>
        <section
          data-testid="signin-pane"
          className={`${styles.formPane} ${styles.signinPane}`}
          aria-hidden={mode !== 'signin'}
          inert={mode !== 'signin'}
        >
          <div className={styles.formInner}>
            <h1>Welcome back</h1>
            <p className={styles.supporting}>Sign in to continue to your account.</p>
            <form onSubmit={handleSignIn} className={styles.form} noValidate>
              <GoogleButton
                id="signin-google-error"
                disabled={!hydrated || transitioning || submitting !== null}
                submitting={submitting === 'google'}
                error={googleError}
                onGoogleSignIn={() => void handleGoogleSignIn()}
              />
              <div className={styles.fieldGroup}>
                <label htmlFor="signin-email">Email address</label>
                <input
                  ref={signInEmailRef}
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  value={signInEmail}
                  onChange={(event) => setSignInEmail(event.target.value)}
                  disabled={!hydrated || transitioning || submitting !== null}
                  required
                />
              </div>
              <PasswordField
                id="signin-password"
                label="Password"
                value={signInPassword}
                onChange={setSignInPassword}
                autoComplete="current-password"
                disabled={!hydrated || transitioning || submitting !== null}
              />
              <Link href="/reset-password" className={styles.textAction}>Forgot your password?</Link>
              {signInError && (
                <div ref={signInErrorRef} role="alert" tabIndex={-1} className={styles.errorBox}>
                  {signInError}
                </div>
              )}
              <button type="submit" className={styles.primaryButton} disabled={!hydrated || transitioning || submitting !== null} aria-busy={submitting === 'signin'}>
                {submitting === 'signin' ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p className={styles.footerPrompt}>
              New to Stren?{' '}
              <button type="button" onClick={() => switchMode('signup')} disabled={!hydrated || transitioning || submitting !== null}>Create an account</button>
            </p>
          </div>
        </section>

        <section
          data-testid="signup-pane"
          className={`${styles.formPane} ${styles.signupPane}`}
          aria-hidden={mode !== 'signup'}
          inert={mode !== 'signup'}
        >
          <div className={styles.formInner}>
            <h1>Create your Stren account</h1>
            <p className={styles.supporting}>Your account lets you connect with and access your gym.</p>
            {verificationEmail ? (
              <div role="status" className={styles.verificationState}>
                <h2>Check your email</h2>
                <p>We sent a verification link to <strong>{verificationEmail}</strong>. Open it to finish creating your account.</p>
              </div>
            ) : (
            <form onSubmit={handleSignUp} className={styles.form} noValidate>
              <GoogleButton
                id="signup-google-error"
                disabled={!hydrated || transitioning || submitting !== null}
                submitting={submitting === 'google'}
                error={googleError}
                onGoogleSignIn={() => void handleGoogleSignIn()}
              />
              <div className={styles.fieldGroup}>
                <label htmlFor="signup-name">Full name</label>
                <input
                  ref={fullNameRef}
                  id="signup-name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  disabled={!hydrated || transitioning || submitting !== null}
                  required
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="signup-email">Email address</label>
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={signUpEmail}
                  onChange={(event) => setSignUpEmail(event.target.value)}
                  disabled={!hydrated || transitioning || submitting !== null}
                  required
                />
              </div>
              <PasswordField id="signup-password" label="Password" value={signUpPassword} onChange={setSignUpPassword} autoComplete="new-password" disabled={!hydrated || transitioning || submitting !== null} />
              <PasswordField id="signup-confirm-password" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={!hydrated || transitioning || submitting !== null} />
              {signUpError && (
                <div ref={signUpErrorRef} role="alert" tabIndex={-1} className={styles.errorBox}>
                  {signUpError}
                </div>
              )}
              <button type="submit" className={styles.primaryButton} disabled={!hydrated || transitioning || submitting !== null} aria-busy={submitting === 'signup'}>
                {submitting === 'signup' ? 'Creating account…' : 'Create account'}
              </button>
            </form>
            )}
            <p className={styles.footerPrompt}>
              Already have an account?{' '}
              <button type="button" onClick={() => switchMode('signin')} disabled={!hydrated || transitioning || submitting !== null}>Sign in</button>
            </p>
          </div>
        </section>

        <aside className={styles.brandPanel} aria-live="polite">
          <div className={styles.brandContent}>
            <Image src="/stren-logo.png" alt="Stren" width={62} height={62} priority />
            <p className={styles.wordmark}>stren</p>
            <div key={mode} className={styles.brandCopy}>
              <h2>{mode === 'signin' ? 'Hey there!' : 'Welcome back!'}</h2>
              <p>{mode === 'signin' ? 'Create an account to get started with Stren.' : 'Sign in to continue your Stren journey.'}</p>
              <button
                type="button"
                onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                disabled={!hydrated || transitioning || submitting !== null}
              >
                {mode === 'signin' ? 'Create account' : 'Sign in'}
              </button>
            </div>
            <div className={styles.pathArt} aria-hidden="true">
              <svg viewBox="0 0 420 190" role="presentation">
                <path d="M8 120 72 58l50 38 58-70 72 82 54-52 106 82" />
                <path d="M208 188c-78-43 50-50-12-82-42-22 48-34 18-70" />
                <circle cx="108" cy="38" r="14" />
              </svg>
            </div>
          </div>
        </aside>
      </div>
      {postAuthError && (
        <div role="alert" className={styles.postAuthRecovery}>
          <span>{postAuthError}</span>
          <button type="button" onClick={() => void finishAuthentication()}>
            Try again
          </button>
        </div>
      )}
      {settingUp && (
        <div className={styles.settingUp} role="status" aria-live="polite">
          <Image src="/stren-logo.png" alt="" width={42} height={42} />
          <span>Setting things up for you…</span>
        </div>
      )}
    </main>
  );
}
