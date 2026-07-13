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
import { ChevronRight } from 'lucide-react';
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
          {hasGyms ? 'Your gyms' : 'Join a gym'}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {hasGyms
            ? 'Choose a gym to enter, or request access to another.'
            : 'Scan the QR code provided by your gym or enter its gym code.'}
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

        </div>
      ) : (
        <JoinGymPanel initialCode={joinCode} onJoined={() => void refreshMyGyms()} />
      )}
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
