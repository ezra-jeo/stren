'use client';

import Link from 'next/link';
import { Bookmark, BookmarkCheck, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  saveGymAction,
  setActiveGymAction,
  verifyMembershipAction,
} from '@/lib/auth-actions';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';

type PublicGym = { gymId: string; code: string; name: string };

export function GymProfileActions({ gym }: { gym: PublicGym }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { user, myGyms, isLoading, refreshMyGyms } = useAuth();
  const existing = myGyms.find((item) => item.gymId === gym.gymId);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void supabase.rpc('is_gym_saved', { p_gym_id: gym.gymId }).then(({ data, error }) => {
      if (live && !error) setSaved(Boolean(data));
    });
    return () => { live = false; };
  }, [gym.gymId, supabase, user]);

  async function toggleSaved() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      let result: { saved: boolean };
      try {
        result = await saveGymAction(gym.gymId, !saved);
      } catch {
        // The public page deliberately hydrates auth in the browser. If its
        // server cookie lags behind that confirmed browser session, execute the
        // same database-enforced RPC with the browser token instead.
        const { data, error } = await supabase.rpc(saved ? 'unsave_gym' : 'save_gym', { p_gym_id: gym.gymId });
        if (error) throw error;
        result = { saved: Boolean((data as { saved?: boolean } | null)?.saved) };
      }
      setSaved(result.saved);
      setMessage(result.saved ? `${gym.name} is saved for later.` : `${gym.name} was removed from saved gyms.`);
    } catch {
      setMessage('We could not update your saved gyms right now.');
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    if (verifying) return;
    setVerifying(true);
    setMessage(null);
    try {
      let result: { status: string; role: string; matched: boolean };
      try {
        result = await verifyMembershipAction(gym.gymId);
      } catch {
        const { data, error } = await supabase.rpc('verify_gym_membership', { p_gym_id: gym.gymId });
        if (error || !data) throw error ?? new Error('Membership verification did not return a result.');
        result = data as { status: string; role: string; matched: boolean };
      }
      await refreshMyGyms();
      if (result.status === 'active') {
        try {
          await setActiveGymAction(gym.gymId);
        } catch {
          const { error } = await supabase.rpc('set_active_gym', { p_gym_id: gym.gymId });
          if (error) throw error;
        }
        router.push(result.role === 'member' ? '/member' : '/admin');
        router.refresh();
        return;
      }
      setVerificationPending(true);
    } catch {
      setMessage('We could not start membership verification. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  if (isLoading) {
    return <div className="mx-auto h-20 w-full max-w-4xl animate-pulse rounded-2xl bg-(--color-surface)" aria-label="Loading membership options" />;
  }

  if (!user) {
    return (
      <div className="border-b border-(--color-surface) bg-(--color-background) px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 rounded-2xl border border-(--color-surface) bg-white p-4">
          <p className="text-sm leading-6 text-(--color-text-secondary)">Already a member, or want to save this gym?</p>
          <Link href={`/auth?mode=signin&gym=${encodeURIComponent(gym.code)}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-(--color-primary) px-4 text-sm font-bold text-white">Sign in to save or verify membership</Link>
        </div>
      </div>
    );
  }

  const pending = verificationPending || existing?.status === 'pending';

  return (
    <section aria-label="Your connection to this gym" className="border-b border-(--color-surface) bg-(--color-background) px-4 py-4">
      <div className="mx-auto max-w-4xl rounded-2xl border border-(--color-surface) bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <p className="font-semibold text-(--color-text-primary)">Your connection to {gym.name}</p>
          <p className="mt-1 text-sm leading-6 text-(--color-text-secondary)">
            {pending
              ? 'We’re waiting for the gym to confirm your membership.'
              : existing?.status === 'active'
                ? 'Your membership is connected.'
                : existing?.status === 'rejected'
                  ? 'The gym needs to check your member record.'
                  : 'Saving this gym keeps it handy. Membership access is verified separately.'}
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:mt-0 sm:min-w-56">
          <button type="button" onClick={() => void toggleSaved()} disabled={saving} aria-label={saved ? `Remove ${gym.name} from saved gyms` : `Save ${gym.name}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-(--color-primary) px-4 text-sm font-semibold text-(--color-primary-dark) disabled:opacity-50">
            {saved ? <BookmarkCheck size={17} aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save gym'}
          </button>
          {!existing && !verificationPending && <button type="button" onClick={() => void verify()} disabled={verifying} className="min-h-11 rounded-xl bg-(--color-primary) px-4 text-sm font-bold text-white disabled:opacity-50">{verifying ? 'Checking membership…' : 'I’m already a member'}</button>}
          {existing?.status === 'rejected' && <button type="button" onClick={() => void verify()} disabled={verifying} className="min-h-11 rounded-xl bg-(--color-primary) px-4 text-sm font-bold text-white disabled:opacity-50">{verifying ? 'Checking membership…' : 'Verify my membership'}</button>}
          {existing?.status === 'active' && <button type="button" onClick={() => void setActiveGymAction(gym.gymId).then(({ role }) => { router.push(role === 'member' ? '/member' : '/admin'); router.refresh(); })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-(--color-primary) px-4 text-sm font-bold text-white"><CheckCircle2 size={17} aria-hidden="true" />Open gym</button>}
        </div>
      </div>
      {message && <p role="status" className="mx-auto mt-2 max-w-4xl text-sm text-(--color-text-secondary) sm:not-sr-only">{message}</p>}
    </section>
  );
}
