'use client';

import { useAuth } from '@/lib/auth-context';
import { JoinQrPoster } from '@/components/admin/JoinQrPoster';

/**
 * Owner tool: the printable join-QR poster for the current gym (§5 U2).
 * Reads the active gym from the frozen auth-context — no server fetch.
 */
export default function JoinCodePage() {
  const { myGyms, activeGymId } = useAuth();
  const gym = myGyms.find((g) => g.gymId === activeGymId) ?? myGyms.find((g) => g.status === 'active') ?? null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
          Invite members
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Print this poster for your front desk. Anyone can scan it to create an account and request to join your gym.
        </p>
      </header>

      {gym ? (
        <JoinQrPoster gymName={gym.name} gymCode={gym.code} logoUrl={gym.logoUrl} />
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Loading your gym…
        </p>
      )}
    </div>
  );
}
