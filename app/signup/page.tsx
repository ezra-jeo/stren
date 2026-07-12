'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signUpAccount } from '@/lib/auth-actions';
import { AuthShell, AuthField, AuthSubmit, AuthErrorBanner, useGymFlavor } from '@/components/auth/auth-shell';

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const gymCode = params.get('gym');
  const { flavor } = useGymFlavor(gymCode);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loginHref = gymCode ? `/login?gym=${encodeURIComponent(gymCode)}` : '/login';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    // Handler kept verbatim from the minimal C2 page: signUpAccount → login.
    const result = await signUpAccount({ name, email, password, joinGymCode: gymCode ?? undefined });
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.replace(loginHref);
  }

  return (
    <AuthShell
      title="Create your Stren account"
      subtitle="One account for every gym you belong to."
      flavor={flavor}
      flavorLabel="You're joining"
      footer={
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Already have an account?{' '}
          <Link href={loginHref} className="font-semibold" style={{ color: 'var(--color-primary)' }}>
            Sign in
          </Link>
        </p>
      }
    >
      {error && <AuthErrorBanner message={error} />}
      {flavor && (
        <p
          className="mb-4 rounded-lg border px-3 py-2 text-xs leading-relaxed"
          style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
        >
          After you create your account, we&apos;ll send your request to join <strong>{flavor.name}</strong>. Their staff
          approves you at the front desk — you&apos;ll see &ldquo;waiting for approval&rdquo; until then.
        </p>
      )}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <AuthField
          label="Name"
          id="signup-name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          required
        />
        <AuthField
          label="Email"
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          required
        />
        <AuthField
          label="Password"
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          disabled={submitting}
          required
        />
        <AuthSubmit loading={submitting}>{submitting ? 'Creating account…' : 'Create account'}</AuthSubmit>
      </form>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
