'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export function ClaimConfirmClient({ token, gymName, invitedEmail }: { token: string; gymName: string; invitedEmail: string }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/claim/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not claim this gym right now.');
      router.push('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim this gym right now.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return null;

  if (!user) {
    const claimReturn = encodeURIComponent(`/claim/${token}`);
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          This invitation was sent to <strong>{invitedEmail}</strong>. Sign in or create your account with that email, then
          come back to this link to finish claiming {gymName}.
        </p>
        <div className="flex gap-2">
          <Link href={`/auth?mode=signin&next=${claimReturn}`} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}>
            Sign in
          </Link>
          <Link href={`/auth?mode=signup&next=${claimReturn}`} className="rounded-md border px-4 py-2 text-sm font-medium" style={{ borderColor: 'var(--color-surface)' }}>
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {user.email?.toLowerCase() !== invitedEmail.toLowerCase() && (
        <p role="status" className="text-xs" style={{ color: 'hsl(38 92% 40%)' }}>
          You&rsquo;re signed in as {user.email}, but this invitation was sent to {invitedEmail}.
        </p>
      )}
      <button
        type="button"
        onClick={() => void handleClaim()}
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold"
        style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
      >
        <CheckCircle2 className="h-4 w-4" />
        {submitting ? 'Claiming…' : `Claim ownership of ${gymName}`}
      </button>
      {error && <p role="alert" className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    </div>
  );
}
