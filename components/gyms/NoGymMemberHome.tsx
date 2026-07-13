'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  Bookmark,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Dumbbell,
  Eye,
  LockKeyhole,
  MessageCircle,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { JoinGymPanel } from '@/components/gyms/JoinGymPanel';
import { GymAvatar } from '@/components/gyms/gym-badges';
import { useAuth } from '@/lib/auth-context';
import {
  sendVerificationReminderAction,
  withdrawVerificationAction,
} from '@/lib/auth-actions';
import { createClient } from '@/lib/supabase';
import type { MembershipVerification, SavedGym } from '@/lib/types';

const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function friendlyDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function toSavedGym(row: Record<string, unknown>): SavedGym {
  return {
    gymId: String(row.gym_id),
    code: String(row.code),
    name: String(row.name),
    address: typeof row.address === 'string' ? row.address : null,
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : null,
    savedAt: String(row.saved_at),
  };
}

function toVerification(row: Record<string, unknown>): MembershipVerification {
  const lastRemindedAt = typeof row.last_reminded_at === 'string' ? row.last_reminded_at : null;
  const nextReminderAt = lastRemindedAt
    ? new Date(new Date(lastRemindedAt).getTime() + REMINDER_COOLDOWN_MS).toISOString()
    : null;
  return {
    gymId: String(row.gym_id),
    code: String(row.code),
    name: String(row.name),
    address: typeof row.address === 'string' ? row.address : null,
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : null,
    status: row.status === 'rejected' ? 'rejected' : 'pending',
    submittedAt: String(row.submitted_at),
    lastRemindedAt,
    nextReminderAt,
    canRemind: !nextReminderAt || Date.now() >= new Date(nextReminderAt).getTime(),
  };
}

function VerificationCard({
  verification,
  onWithdrawn,
}: {
  verification: MembershipVerification;
  onWithdrawn: (gymId: string) => void;
}) {
  const [working, setWorking] = useState<'remind' | 'withdraw' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canRemind, setCanRemind] = useState(verification.canRemind);

  async function remind() {
    if (!canRemind || working) return;
    setWorking('remind');
    setMessage(null);
    try {
      await sendVerificationReminderAction(verification.gymId);
      setCanRemind(false);
      setMessage('Reminder sent. Another reminder will be available in seven days.');
    } catch (error) {
      setMessage(/cooldown/i.test(error instanceof Error ? error.message : '')
        ? 'A reminder was sent recently. Another will be available after the cooldown.'
        : 'We could not send a reminder right now. Please try again later.');
    } finally {
      setWorking(null);
    }
  }

  async function withdraw() {
    if (working) return;
    setWorking('withdraw');
    setMessage(null);
    try {
      await withdrawVerificationAction(verification.gymId);
      onWithdrawn(verification.gymId);
    } catch {
      setMessage('We could not withdraw this verification right now.');
      setWorking(null);
    }
  }

  return (
    <article className="rounded-2xl border border-(--color-surface) bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <GymAvatar name={verification.name} logoUrl={verification.logoUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-(--color-text-primary)">{verification.name}</h3>
          {verification.address && <p className="mt-0.5 text-xs text-(--color-text-muted)">{verification.address}</p>}
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-(--color-primary-dark)">
            <Clock3 size={15} aria-hidden="true" />
            {verification.status === 'pending' ? 'Waiting for gym confirmation' : 'The gym needs to check your member record'}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-(--color-text-muted)">
        Sent {friendlyDate(verification.submittedAt) ?? 'recently'}. Most gyms respond after checking their member records.
        {verification.lastRemindedAt ? ` Last reminded ${friendlyDate(verification.lastRemindedAt) ?? 'recently'}.` : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/gym/${verification.code}`} className="inline-flex min-h-11 items-center rounded-xl border border-(--color-surface) px-4 text-sm font-semibold text-(--color-text-primary)">
          Contact gym
        </Link>
        {verification.status === 'pending' && (
          <button type="button" onClick={() => void remind()} disabled={!canRemind || !!working} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-(--color-primary) px-4 text-sm font-semibold text-(--color-primary-dark) disabled:cursor-not-allowed disabled:opacity-50">
            <RotateCcw size={15} aria-hidden="true" />
            {working === 'remind' ? 'Sending…' : canRemind ? 'Send reminder' : 'Reminder sent'}
          </button>
        )}
        <button type="button" onClick={() => void withdraw()} disabled={!!working} className="min-h-11 px-2 text-sm font-medium text-(--color-text-muted) underline-offset-4 hover:underline disabled:opacity-50">
          {working === 'withdraw' ? 'Withdrawing…' : 'Withdraw verification'}
        </button>
      </div>
      {message && <p role="status" className="mt-3 text-xs leading-5 text-(--color-text-secondary)">{message}</p>}
    </article>
  );
}

function DemoPreview({ onExit }: { onExit: () => void }) {
  return (
    <section aria-labelledby="demo-title" className="rounded-3xl border border-(--color-primary) bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full bg-(--color-primary-glow) px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-(--color-primary-dark)">Sample data</span>
          <h2 id="demo-title" className="mt-3 font-serif text-2xl font-semibold text-(--color-text-primary)">Demo member dashboard</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-(--color-text-secondary)">Explore what a connected member can see. Nothing here affects a real gym or your account.</p>
        </div>
        <button type="button" onClick={onExit} className="min-h-11 rounded-xl border border-(--color-surface) px-4 text-sm font-semibold text-(--color-text-primary)">Exit demo</button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {['Attendance history', 'Gym announcements', 'Classes', 'Leaderboard preview'].map((label) => (
          <div key={label} className="rounded-2xl bg-(--color-background) p-4">
            <p className="font-semibold text-(--color-text-primary)">{label}</p>
            <p className="mt-2 text-xs text-(--color-text-muted)">Preview only</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NoGymMemberHome({ initialCode }: { initialCode?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const { profile, refreshMyGyms } = useAuth();
  const [savedGyms, setSavedGyms] = useState<SavedGym[]>([]);
  const [verifications, setVerifications] = useState<MembershipVerification[]>([]);
  const [showDemo, setShowDemo] = useState(false);
  const [betaMessage, setBetaMessage] = useState<string | null>(null);
  const firstName = profile?.name?.trim().split(/\s+/)[0] || 'there';
  const savedGymIds = useMemo(() => new Set(savedGyms.map((gym) => gym.gymId)), [savedGyms]);

  const loadAccountGymState = useCallback(async () => {
    const [saved, pending] = await Promise.all([
      supabase.rpc('get_my_saved_gyms'),
      supabase.rpc('get_my_membership_verifications'),
    ]);
    if (!saved.error && Array.isArray(saved.data)) {
      setSavedGyms(saved.data.map((row) => toSavedGym(row as Record<string, unknown>)));
    }
    if (!pending.error && Array.isArray(pending.data)) {
      setVerifications(pending.data.map((row) => toVerification(row as Record<string, unknown>)));
    }
  }, [supabase]);

  useEffect(() => { void loadAccountGymState(); }, [loadAccountGymState]);

  if (showDemo) return <DemoPreview onExit={() => setShowDemo(false)} />;

  return (
    <div className="space-y-6 sm:space-y-8">
      <nav aria-label="Member account" className="flex min-h-14 items-center justify-between border-b border-(--color-surface) pb-4">
        <Link href="/gyms" className="inline-flex items-center gap-2">
          <Image src="/stren-logo.png" alt="" width={34} height={34} className="object-contain" priority />
          <span className="font-serif text-2xl font-semibold text-(--color-text-primary)">Stren</span>
        </Link>
        <Link href="/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-(--color-surface) bg-white px-3 text-sm font-semibold text-(--color-text-primary)">
          <CircleUserRound size={18} aria-hidden="true" />
          <span className="hidden sm:inline">Profile</span>
        </Link>
      </nav>
      <header className="pt-2 sm:pt-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-(--color-primary-dark)">Member home</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-(--color-text-primary) sm:text-5xl">Hi, {firstName}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-(--color-text-secondary)">Everything you need to connect with your gym, in one place.</p>
      </header>

      <section aria-label="Gym connection status" className="relative overflow-hidden rounded-3xl border border-(--color-primary) bg-(--color-primary-glow) p-5 sm:p-7">
        <Sparkles className="absolute -right-5 -top-5 opacity-10" size={112} aria-hidden="true" />
        <div className="relative max-w-2xl">
          <h2 className="font-serif text-2xl font-semibold text-(--color-text-primary)">You’re not connected to a gym yet.</h2>
          <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">Find your gym on Stren, verify your membership, or explore a clearly labeled preview of the member experience.</p>
        </div>
      </section>

      {verifications.length > 0 && (
        <section aria-labelledby="verification-title">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--color-primary-dark)">Memberships</p>
              <h2 id="verification-title" className="mt-1 font-serif text-2xl font-semibold text-(--color-text-primary)">Verification in progress</h2>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {verifications.map((verification) => (
              <VerificationCard key={verification.gymId} verification={verification} onWithdrawn={(gymId) => setVerifications((current) => current.filter((item) => item.gymId !== gymId))} />
            ))}
          </div>
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.75fr)]">
        <JoinGymPanel
          initialCode={initialCode}
          savedGymIds={savedGymIds}
          onJoined={() => { void refreshMyGyms(); void loadAccountGymState(); }}
          onSaved={() => { void loadAccountGymState(); }}
        />

        <aside className="space-y-4">
          <section className="rounded-3xl border border-(--color-surface) bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Eye size={20} className="text-(--color-primary-dark)" aria-hidden="true" />
              <h2 className="font-serif text-xl font-semibold text-(--color-text-primary)">Explore first</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-(--color-text-secondary)">See a sample of the connected member experience without changing real data.</p>
            <button type="button" onClick={() => setShowDemo(true)} className="mt-4 inline-flex min-h-12 w-full items-center justify-between rounded-xl bg-(--color-primary) px-4 font-bold text-white">
              Preview the demo <ChevronRight size={18} aria-hidden="true" />
            </button>
          </section>

          <section aria-labelledby="now-title" className="rounded-3xl border border-(--color-surface) bg-white p-5 sm:p-6">
            <h2 id="now-title" className="font-serif text-xl font-semibold text-(--color-text-primary)">What you can do now</h2>
            <ul className="mt-4 space-y-3 text-sm text-(--color-text-secondary)">
              {['Find or scan your gym', 'Track membership verification', 'Preview the demo', 'Complete your profile'].map((item) => (
                <li key={item} className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-(--color-primary-dark)" aria-hidden="true" />{item}</li>
              ))}
            </ul>
            <Link href="/profile" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-(--color-primary-dark)">
              <CircleUserRound size={17} aria-hidden="true" /> Complete your profile
            </Link>
          </section>
        </aside>
      </div>

      {savedGyms.length > 0 && (
        <section aria-labelledby="saved-title">
          <div className="flex items-center gap-2">
            <Bookmark size={20} className="text-(--color-primary-dark)" aria-hidden="true" />
            <h2 id="saved-title" className="font-serif text-2xl font-semibold text-(--color-text-primary)">Saved gyms</h2>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {savedGyms.map((gym) => (
              <Link key={gym.gymId} href={`/gym/${gym.code}`} className="flex min-h-24 items-center gap-3 rounded-2xl border border-(--color-surface) bg-white p-4 transition-colors hover:border-(--color-primary)">
                <GymAvatar name={gym.name} logoUrl={gym.logoUrl} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-(--color-text-primary)">{gym.name}</span>{gym.address && <span className="mt-1 block truncate text-xs text-(--color-text-muted)">{gym.address}</span>}</span>
                <ChevronRight size={18} className="text-(--color-text-muted)" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="tools-title" className="border-t border-(--color-surface) pt-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--color-primary-dark)">A look ahead</p>
          <h2 id="tools-title" className="mt-1 font-serif text-2xl font-semibold text-(--color-text-primary)">Member tools</h2>
          <p className="mt-1 text-sm text-(--color-text-secondary)">These tools are being tested with selected gyms.</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Workouts', icon: Dumbbell },
            { label: 'Progress', icon: TrendingUp },
            { label: 'Messages', icon: MessageCircle },
          ].map(({ label, icon: Icon }) => (
            <button key={label} type="button" onClick={() => setBetaMessage(`${label} is currently in beta. We’re testing this member feature with selected gyms.`)} aria-describedby="beta-status" className="flex min-h-20 items-center gap-3 rounded-2xl border border-(--color-surface) bg-white p-4 text-left opacity-65">
              <Icon size={20} aria-hidden="true" />
              <span className="flex-1 font-semibold text-(--color-text-primary)">{label}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-(--color-background) px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)"><LockKeyhole size={11} aria-hidden="true" />Beta</span>
            </button>
          ))}
        </div>
        <p id="beta-status" role="status" className="mt-3 min-h-5 text-sm text-(--color-text-secondary)">{betaMessage}</p>
      </section>
    </div>
  );
}
