'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { createGymAction } from '@/lib/auth-actions';
import { readableCreateGymError } from '@/lib/create-gym-error-copy';
import { AuthField } from '@/components/auth/auth-shell';

export default function NewGymPage() {
  const router = useRouter();
  const { refreshMyGyms } = useAuth();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    // Handler kept verbatim from the minimal C2 page: createGymAction → /admin.
    const result = await createGymAction({ name, code });
    if ('error' in result) {
      setError(readableCreateGymError(result.error));
      setSubmitting(false);
      return;
    }
    await refreshMyGyms();
    router.replace('/admin');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-8">
      <Link
        href="/gyms"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <ArrowLeft size={16} /> Your gyms
      </Link>

      <div className="rounded-2xl border p-6 shadow-sm" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
          Set up your gym
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          You&apos;ll be the owner. You can invite your team and members afterwards.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: 'var(--color-danger-bg)', borderColor: 'var(--color-danger)', color: 'var(--color-text-primary)' }}
          >
            {error}
          </p>
        )}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <AuthField
            label="Gym name"
            id="gym-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Iron House Fitness"
            disabled={submitting}
            required
          />
          <div>
            <AuthField
              label="Gym code"
              id="gym-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase())}
              placeholder="iron-house"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={submitting}
              required
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              This becomes your gym&apos;s web address: stren.app/gym/<strong>{code || 'your-code'}</strong>. Lowercase
              letters, numbers, and hyphens.
            </p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
          >
            {submitting ? 'Creating your gym…' : 'Create gym'}
          </button>
        </form>
      </div>
    </main>
  );
}
