'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { resolvePostAuthDestination } from '@/lib/auth-actions';
import { readableAuthError } from '@/lib/auth-error-copy';
import { AuthShell, AuthField, AuthSubmit, AuthErrorBanner, useGymFlavor } from '@/components/auth/auth-shell';

function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const gymCode = params.get('gym');
  const { flavor } = useGymFlavor(gymCode);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => readableAuthError(params.get('error')));
  const [submitting, setSubmitting] = useState(false);

  const signupHref = gymCode ? `/signup?gym=${encodeURIComponent(gymCode)}` : '/signup';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    // Handler kept verbatim from the minimal C2 page: signIn → resolve → route.
    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.replace(await resolvePostAuthDestination(gymCode ?? undefined));
    router.refresh();
  }

  return (
    <AuthShell
      title="Sign in to Stren"
      subtitle="One account for every gym you belong to."
      flavor={flavor}
      flavorLabel="Sign in to continue to"
      footer={
        <div className="space-y-2">
          <p style={{ color: 'var(--color-text-secondary)' }}>
            New to Stren?{' '}
            <Link href={signupHref} className="font-semibold" style={{ color: 'var(--color-primary)' }}>
              Create account
            </Link>
          </p>
        </div>
      }
    >
      {error && <AuthErrorBanner message={error} />}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <AuthField
          label="Email"
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          required
        />
        <AuthField
          label="Password"
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          required
        />
        <div className="text-right">
          <Link href="/reset-password" className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Forgot password?
          </Link>
        </div>
        <AuthSubmit loading={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</AuthSubmit>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
