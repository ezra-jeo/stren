'use client';

/**
 * Gym hub — the account's home at `/gyms` (§2.3, §5 U2).
 *
 * Lists the account's gyms with role/status chips (tap an active one to enter
 * it), offers a **join a gym** panel and an **I run a gym** path, and — when the
 * account has no gyms yet — shows the two-choice empty state that is the
 * onboarding moment. Everything reads from the frozen auth-context interface
 * (`myGyms`, `refreshMyGyms`) and the frozen `setActiveGymAction`.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ChevronRight, PlusCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { setActiveGymAction } from '@/lib/auth-actions';
import type { MyGym } from '@/lib/types';
import { GymAvatar, RoleChip, StatusChip } from '@/components/gyms/gym-badges';
import { JoinGymPanel } from '@/components/gyms/JoinGymPanel';

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
              ? "We'll add this gym once staff approve your request."
              : 'This request was not approved.'}
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
  const { myGyms, activeGymId, refreshMyGyms, isLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const joinCode = params.get('join');

  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [enterError, setEnterError] = useState<string | null>(null);
  const [showJoin, setShowJoin] = useState<boolean>(!!joinCode);

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

  const hasGyms = myGyms.length > 0;

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
          Your gyms
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Pick a gym to enter, or add another.
        </p>
      </header>

      {isLoading && !hasGyms ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Loading your gyms…
        </p>
      ) : hasGyms ? (
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

          <Link
            href="/gyms/new"
            className="flex items-center gap-3 rounded-2xl border border-dashed p-4 transition-colors hover:border-(--color-primary)"
            style={{ borderColor: 'var(--color-surface)' }}
          >
            <PlusCircle size={22} style={{ color: 'var(--color-primary)' }} />
            <div>
              <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                I run a gym
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Create your own gym on Stren.
              </p>
            </div>
          </Link>
        </div>
      ) : (
        <EmptyState showJoin={showJoin} onChooseJoin={() => setShowJoin(true)} joinCode={joinCode} onJoined={() => void refreshMyGyms()} />
      )}
    </main>
  );
}

function EmptyState({
  showJoin,
  onChooseJoin,
  joinCode,
  onJoined,
}: {
  showJoin: boolean;
  onChooseJoin: () => void;
  joinCode: string | null;
  onJoined: () => void;
}) {
  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl border p-6 text-center"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
          Welcome to Stren
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          You&apos;re not part of a gym yet. What brings you here?
        </p>
      </div>

      {showJoin ? (
        <JoinGymPanel initialCode={joinCode} onJoined={onJoined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onChooseJoin}
            className="rounded-2xl border p-6 text-left transition-colors hover:border-(--color-primary)"
            style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
          >
            <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Join your gym
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Use the gym code your gym gave you, or search by name.
            </p>
          </button>

          <Link
            href="/gyms/new"
            className="rounded-2xl border p-6 text-left transition-colors hover:border-(--color-primary)"
            style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
          >
            <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              I run a gym
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Set up your own gym on Stren in a minute.
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}

export function GymHub() {
  return (
    <Suspense fallback={null}>
      <HubInner />
    </Suspense>
  );
}
