'use client';

/**
 * Gym hub — the account's home at `/gyms` (§2.3, §5 U2).
 *
 * Lists the account's gyms with role/status chips (tap an active one to enter
 * it), and offers the authenticated **join a gym** QR/code flow. When the
 * account has no gyms yet — shows the two-choice empty state that is the
 * onboarding moment. Everything reads from the frozen auth-context interface
 * (`myGyms`, `refreshMyGyms`) and the frozen `setActiveGymAction`.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AlertCircle, ChevronRight, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { setActiveGymAction } from '@/lib/auth-actions';
import type { MyGym } from '@/lib/types';
import { GymAvatar, RoleChip, StatusChip } from '@/components/gyms/gym-badges';
import { JoinGymPanel } from '@/components/gyms/JoinGymPanel';
import { NoGymMemberHome } from '@/components/gyms/NoGymMemberHome';

function GymCard({
  gym,
  active,
  entering,
  onEnter,
}: {
  gym: MyGym;
  active: boolean;
  entering: boolean;
  onEnter: () => void;
}) {
  const isActive = gym.status === 'active';

  if (!isActive) {
    // Pending / rejected — a quiet, non-clickable row (§5 U2).
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)', opacity: gym.status === 'rejected' ? 0.7 : 1 }}
      >
        <GymAvatar name={gym.name} logoUrl={gym.logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {gym.name}
          </p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {gym.status === 'pending'
              ? "We’re waiting for the gym to confirm your membership."
              : 'The gym needs to check your member record.'}
          </p>
        </div>
        <StatusChip status={gym.status} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onEnter}
      disabled={entering}
      aria-label={`Enter ${gym.name}`}
      className="flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors hover:border-(--color-primary) disabled:opacity-60"
      style={{
        backgroundColor: 'var(--color-white)',
        borderColor: active ? 'var(--color-primary)' : 'var(--color-surface)',
      }}
    >
      <GymAvatar name={gym.name} logoUrl={gym.logoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {gym.name}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <RoleChip role={gym.role} />
          {active && (
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Current gym
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={20} style={{ color: 'var(--color-text-muted)' }} />
    </button>
  );
}

function HubInner() {
  const { user, myGyms, activeGymId, refreshMyGyms, gymAccessError, isLoading, signOut } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const joinCode = params.get('join');

  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [enterError, setEnterError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  async function enterGym(gym: MyGym) {
    setEnteringId(gym.gymId);
    setEnterError(null);
    try {
      const { role } = await setActiveGymAction(gym.gymId);
      router.push(role === 'member' ? '/member' : '/admin');
      router.refresh();
    } catch {
      setEnterError('We could not open that gym. Please try again.');
      setEnteringId(null);
    }
  }

  const hasActiveGyms = myGyms.some((gym) => gym.status === 'active');
  const routeAccessError = params.get('account_error') === 'access' && myGyms.length === 0;

  async function retryAccess() {
    if (retrying) return;
    setRetrying(true);
    try {
      await refreshMyGyms();
      router.replace('/gyms');
      router.refresh();
    } catch {
      // The context keeps the actionable error visible; the account is never
      // reclassified as a zero-gym account after a failed retry.
    } finally {
      setRetrying(false);
    }
  }

  if (!isLoading && (gymAccessError || routeAccessError)) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-4 py-10 sm:px-6">
        <section className="w-full rounded-3xl border border-(--color-primary) bg-white p-6 shadow-sm sm:p-8" aria-labelledby="gym-access-error-title">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--color-primary-glow) text-(--color-primary-dark)"><AlertCircle aria-hidden="true" /></span>
          <h1 id="gym-access-error-title" className="mt-5 font-serif text-3xl font-semibold text-(--color-text-primary)">We couldn’t load your gyms</h1>
          <p className="mt-3 leading-7 text-(--color-text-secondary)">Your sign-in worked, but Stren could not safely verify your gym access. We have not treated this account as a new account.</p>
          {user?.email && <p className="mt-3 rounded-xl bg-(--color-background) px-4 py-3 text-sm font-semibold text-(--color-text-primary)">Signed in as {user.email}</p>}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => void retryAccess()} disabled={retrying} aria-busy={retrying} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-(--color-primary) px-5 font-bold text-white disabled:opacity-60"><RefreshCw size={18} aria-hidden="true" />{retrying ? 'Checking again…' : 'Try again'}</button>
            <button type="button" onClick={() => void signOut()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-(--color-surface) px-5 font-semibold text-(--color-text-primary)"><LogOut size={18} aria-hidden="true" />Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  if (!isLoading && !hasActiveGyms) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <NoGymMemberHome initialCode={joinCode} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
          Your gyms
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Choose a gym to enter, or verify your membership with another.
        </p>
      </header>

      {isLoading && !hasActiveGyms ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Loading your gyms…
        </p>
      ) : hasActiveGyms ? (
        <div className="space-y-6">
          <div className="space-y-3">
            {myGyms.map((gym) => (
              <GymCard
                key={gym.gymId}
                gym={gym}
                active={gym.gymId === activeGymId}
                entering={enteringId === gym.gymId}
                onEnter={() => enterGym(gym)}
              />
            ))}
          </div>

          {enterError && (
            <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
              {enterError}
            </p>
          )}

          <JoinGymPanel initialCode={joinCode} onJoined={() => void refreshMyGyms()} />

        </div>
      ) : null}
    </main>
  );
}

export function GymHub() {
  return (
    <Suspense fallback={null}>
      <HubInner />
    </Suspense>
  );
}
