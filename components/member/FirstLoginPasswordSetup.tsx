'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import { ViewportOverlay } from '@/components/ui/viewport-overlay';

export function FirstLoginPasswordSetup() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile, completePasswordSetup } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [choosingPassword, setChoosingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (searchParams.get('first_login') !== '1') return null;

  function finish() {
    router.replace('/member');
    router.refresh();
  }

  function skip() {
    if (profile?.id) completePasswordSetup(profile.id);
    finish();
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'We could not save your password. Please try again.');
        return;
      }
      if (profile?.id) completePasswordSetup(profile.id);
      finish();
    } catch {
      setError('We could not save your password. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ViewportOverlay
      onClose={skip}
      labelledBy="first-login-password-title"
      panelClassName="w-full max-w-md rounded-2xl p-6 sm:p-8"
      panelStyle={{ backgroundColor: 'var(--color-white)' }}
    >
      <h2 id="first-login-password-title" className="font-serif text-3xl font-semibold text-(--color-text-primary)">
        Secure your account
      </h2>
      {!choosingPassword ? (
        <>
          <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">
            You are signed in with a one-time link. Set a password now for future sign-ins, or skip and do it later in Settings.
          </p>
          <div className="mt-6 grid gap-3">
            <button type="button" onClick={() => setChoosingPassword(true)} className="min-h-12 rounded-xl bg-(--color-primary) px-5 font-semibold text-white">
              Set a password
            </button>
            <button type="button" onClick={skip} className="min-h-12 rounded-xl border px-5 font-semibold text-(--color-text-secondary)" style={{ borderColor: 'var(--color-surface)' }}>
              Skip for now
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={savePassword} className="mt-6 space-y-4">
          <div>
            <label htmlFor="first-login-password" className="mb-1.5 block text-sm font-medium text-(--color-text-primary)">New password</label>
            <input id="first-login-password" type="password" autoComplete="new-password" minLength={8} required disabled={saving} value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-xl border px-4 outline-none focus:border-(--color-primary)" style={{ borderColor: 'var(--color-surface)' }} />
          </div>
          <div>
            <label htmlFor="first-login-password-confirm" className="mb-1.5 block text-sm font-medium text-(--color-text-primary)">Confirm password</label>
            <input id="first-login-password-confirm" type="password" autoComplete="new-password" minLength={8} required disabled={saving} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="min-h-12 w-full rounded-xl border px-4 outline-none focus:border-(--color-primary)" style={{ borderColor: 'var(--color-surface)' }} />
          </div>
          {error && <p role="alert" className="rounded-xl border border-(--color-danger) bg-(--color-danger-bg) px-3 py-2 text-sm text-(--color-text-primary)">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setChoosingPassword(false)} disabled={saving} className="min-h-12 rounded-xl border px-5 font-semibold text-(--color-text-secondary)" style={{ borderColor: 'var(--color-surface)' }}>Back</button>
            <button type="submit" disabled={saving} className="min-h-12 rounded-xl bg-(--color-primary) px-5 font-semibold text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save password'}</button>
          </div>
        </form>
      )}
    </ViewportOverlay>
  );
}
