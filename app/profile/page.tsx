'use client';

import Link from 'next/link';
import { AlertCircle, ArrowLeft, LogOut, RefreshCw, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import { profileEditSchema } from '@/lib/validations';

export default function AccountProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, profileError, isLoading, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setMobile(profile.contactNumber ?? '');
  }, [profile]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;
    setError(null);
    setStatus(null);
    const parsed = profileEditSchema.safeParse({ name, contact_number: mobile });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your profile details.');
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ name: parsed.data.name.trim(), contact_number: parsed.data.contact_number?.trim() || null })
        .eq('id', profile.id);
      if (updateError) throw updateError;
      await refreshProfile();
      setStatus('Profile updated.');
    } catch {
      setError('We could not update your profile right now. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function retryProfile() {
    if (retrying) return;
    setRetrying(true);
    try { await refreshProfile(); } catch { /* Context keeps the recovery state visible. */ }
    finally { setRetrying(false); }
  }

  if (isLoading && !profile) {
    return <main className="mx-auto max-w-2xl px-4 py-10"><p className="text-sm text-(--color-text-muted)">Loading your profile…</p></main>;
  }

  if (!profile) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-4 py-10 sm:px-6">
        <section className="w-full rounded-3xl border border-(--color-primary) bg-white p-6 shadow-sm sm:p-8" aria-labelledby="profile-error-title">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--color-primary-glow) text-(--color-primary-dark)"><AlertCircle aria-hidden="true" /></span>
          <h1 id="profile-error-title" className="mt-5 font-serif text-3xl font-semibold text-(--color-text-primary)">Profile unavailable</h1>
          <p className="mt-3 leading-7 text-(--color-text-secondary)">{profileError ?? 'We could not find the profile data for this authenticated account.'}</p>
          {user?.email && <p className="mt-3 rounded-xl bg-(--color-background) px-4 py-3 text-sm font-semibold text-(--color-text-primary)">Signed in as {user.email}</p>}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => void retryProfile()} disabled={retrying} aria-busy={retrying} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-(--color-primary) px-5 font-bold text-white disabled:opacity-60"><RefreshCw size={18} aria-hidden="true" />{retrying ? 'Checking again…' : 'Try again'}</button>
            <button type="button" onClick={() => void signOut()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-(--color-surface) px-5 font-semibold text-(--color-text-primary)"><LogOut size={18} aria-hidden="true" />Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/gyms" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-(--color-text-secondary)"><ArrowLeft size={17} aria-hidden="true" />Member home</Link>
      <section className="mt-5 rounded-3xl border border-(--color-surface) bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--color-primary-glow) text-(--color-primary-dark)"><UserRound aria-hidden="true" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--color-primary-dark)">Account</p>
            <h1 className="font-serif text-3xl font-semibold text-(--color-text-primary)">Your profile</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-(--color-text-secondary)">Keep your details current so a gym can identify your member record. A mobile number is not treated as verified until phone verification is available.</p>

        <form onSubmit={save} className="mt-7 space-y-5" noValidate>
          <div>
            <label htmlFor="profile-name" className="text-sm font-semibold text-(--color-text-primary)">Full name</label>
            <input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" disabled={saving} className="mt-2 min-h-12 w-full rounded-xl border border-(--color-surface) px-4 outline-none focus:border-(--color-primary) focus:ring-3 focus:ring-(--color-primary-glow)" />
          </div>
          <div>
            <label htmlFor="profile-email" className="text-sm font-semibold text-(--color-text-primary)">Email address</label>
            <input id="profile-email" value={profile.email} disabled className="mt-2 min-h-12 w-full rounded-xl border border-(--color-surface) bg-(--color-background) px-4 text-(--color-text-muted)" />
            <p className="mt-1.5 text-xs text-(--color-text-muted)">Your sign-in email is managed by your Stren account.</p>
          </div>
          <div>
            <label htmlFor="profile-mobile" className="text-sm font-semibold text-(--color-text-primary)">Mobile number</label>
            <input id="profile-mobile" value={mobile} onChange={(event) => setMobile(event.target.value)} autoComplete="tel" inputMode="tel" disabled={saving} placeholder="Optional" className="mt-2 min-h-12 w-full rounded-xl border border-(--color-surface) px-4 outline-none focus:border-(--color-primary) focus:ring-3 focus:ring-(--color-primary-glow)" />
          </div>
          {error && <p role="alert" className="rounded-xl bg-(--color-danger-bg) px-4 py-3 text-sm text-(--color-text-primary)">{error}</p>}
          {status && <p role="status" className="rounded-xl bg-(--color-success-bg) px-4 py-3 text-sm text-(--color-text-primary)">{status}</p>}
          <button type="submit" disabled={saving} aria-busy={saving} className="min-h-12 w-full rounded-xl bg-(--color-primary) px-5 font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save profile'}</button>
        </form>
      </section>
    </main>
  );
}
