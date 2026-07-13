'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { resolvePostAuthDestination, signUpAccount } from '@/lib/auth-actions';
import { readableAuthError } from '@/lib/auth-error-copy';
import styles from './unified-auth.module.css';

type AuthMode = 'signin' | 'signup';

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
  const { signIn } = useAuth();
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
  const [submitting, setSubmitting] = useState<AuthMode | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const signInEmailRef = useRef<HTMLInputElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const signInErrorRef = useRef<HTMLDivElement>(null);
  const signUpErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(true);
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

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSignInError(null);
    setSubmitting('signin');
    const result = await signIn(signInEmail.trim(), signInPassword);
    if (result.error) {
      setSignInError('We couldn’t sign you in. Check your email and password, then try again.');
      setSubmitting(null);
      return;
    }
    setSettingUp(true);
    const destination = await resolvePostAuthDestination(gymCode);
    router.replace(destination);
    router.refresh();
  }

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSignUpError(null);
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
    setSettingUp(true);
    const destination = await resolvePostAuthDestination(gymCode);
    router.replace(destination);
    router.refresh();
  }

  function switchMode(next: AuthMode) {
    if (next === mode || transitioning) return;
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
              <div className={styles.fieldGroup}>
                <label htmlFor="signin-email">Email address</label>
                <input
                  ref={signInEmailRef}
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  value={signInEmail}
                  onChange={(event) => setSignInEmail(event.target.value)}
                  disabled={!hydrated || transitioning || submitting === 'signin'}
                  required
                />
              </div>
              <PasswordField
                id="signin-password"
                label="Password"
                value={signInPassword}
                onChange={setSignInPassword}
                autoComplete="current-password"
                disabled={!hydrated || transitioning || submitting === 'signin'}
              />
              <Link href="/reset-password" className={styles.textAction}>Forgot your password?</Link>
              {signInError && (
                <div ref={signInErrorRef} role="alert" tabIndex={-1} className={styles.errorBox}>
                  {signInError}
                </div>
              )}
              <button type="submit" className={styles.primaryButton} disabled={!hydrated || transitioning || submitting === 'signin'} aria-busy={submitting === 'signin'}>
                {submitting === 'signin' ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p className={styles.footerPrompt}>
              New to Stren?{' '}
              <button type="button" onClick={() => switchMode('signup')} disabled={!hydrated || transitioning}>Create an account</button>
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
            <p className={styles.supporting}>Your account lets you join and access your gym.</p>
            {verificationEmail ? (
              <div role="status" className={styles.verificationState}>
                <h2>Check your email</h2>
                <p>We sent a verification link to <strong>{verificationEmail}</strong>. Open it to finish creating your account.</p>
              </div>
            ) : (
            <form onSubmit={handleSignUp} className={styles.form} noValidate>
              <div className={styles.fieldGroup}>
                <label htmlFor="signup-name">Full name</label>
                <input
                  ref={fullNameRef}
                  id="signup-name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  disabled={!hydrated || transitioning || submitting === 'signup'}
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
                  disabled={!hydrated || transitioning || submitting === 'signup'}
                  required
                />
              </div>
              <PasswordField id="signup-password" label="Password" value={signUpPassword} onChange={setSignUpPassword} autoComplete="new-password" disabled={!hydrated || transitioning || submitting === 'signup'} />
              <PasswordField id="signup-confirm-password" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={!hydrated || transitioning || submitting === 'signup'} />
              {signUpError && (
                <div ref={signUpErrorRef} role="alert" tabIndex={-1} className={styles.errorBox}>
                  {signUpError}
                </div>
              )}
              <button type="submit" className={styles.primaryButton} disabled={!hydrated || transitioning || submitting === 'signup'} aria-busy={submitting === 'signup'}>
                {submitting === 'signup' ? 'Creating account…' : 'Create account'}
              </button>
            </form>
            )}
            <p className={styles.footerPrompt}>
              Already have an account?{' '}
              <button type="button" onClick={() => switchMode('signin')} disabled={!hydrated || transitioning}>Sign in</button>
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
                disabled={!hydrated || transitioning}
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
      {settingUp && (
        <div className={styles.settingUp} role="status" aria-live="polite">
          <Image src="/stren-logo.png" alt="" width={42} height={42} />
          <span>Setting things up for you…</span>
        </div>
      )}
    </main>
  );
}
